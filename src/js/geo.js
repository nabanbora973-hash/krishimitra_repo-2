// Live location — where the farmer actually is, and how to get to a mandi.
//
// Three jobs, all optional:
//   1. getPosition()      → the device's GPS coordinates (one shot, high accuracy)
//   2. reverseGeocode()   → turn those coordinates into a village / district name
//   3. directionsUrl()    → a Google Maps link "from here to that mandi"
//
// Everything degrades: no permission → the app keeps whatever the farmer typed;
// no network → coordinates are still usable; a mandi far from the demo region →
// we say so rather than pretending it is nearby.

const REVERSE_ENDPOINTS = [
  // BigDataCloud: free, no key, CORS-open, returns locality + principalSubdivision
  (lat, lng) => `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
  // Nominatim (OpenStreetMap): slower and rate-limited, used only as a fallback
  (lat, lng) => `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=12`
];

export function gpsSupported(){
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

// One-shot position with a timeout — never leaves the UI hanging.
export function getPosition({ timeoutMs = 12000, maxAgeMs = 60000 } = {}){
  return new Promise((resolve, reject) => {
    if (!gpsSupported()) return reject(new Error('This browser has no location support.'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude,
                       accuracyM: pos.coords.accuracy }),
      err => {
        // A sandboxed preview frame or an in-app browser refuses without ever
        // showing a prompt: code 1 with no user gesture. Marked so the caller
        // can put the town list in front of the farmer instead of a dead end.
        const e = new Error({
        1: 'Location permission was denied. Allow it in the browser, or type your village.',
        2: 'Location unavailable right now. Type your village instead.',
        3: 'Location lookup timed out. Pick your town instead.'
      }[err.code] || 'Could not read your location. Pick your town instead.');
        e.code = err.code;
        e.denied = err.code === 1;
        reject(e);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: maxAgeMs }
    );
  });
}

// Coordinates → a human place name. Resolves to
// { village, district, state } with whatever could be recovered.
export async function reverseGeocode(lat, lng){
  for (const make of REVERSE_ENDPOINTS){
    try {
      const r = await fetch(make(lat, lng), { headers: { 'Accept': 'application/json' } });
      if (!r.ok) continue;
      const j = await r.json();
      const out = normalize(j);
      if (out.village || out.district) return { ...out, lat, lng };
    } catch (e){ /* try the next endpoint */ }
  }
  return { village: '', district: '', state: '', lat, lng };
}

function normalize(j){
  // BigDataCloud shape
  if (j && (j.locality || j.city || j.principalSubdivision)){
    return {
      village:  j.locality || j.city || j.localityInfo?.administrative?.slice(-1)?.[0]?.name || '',
      district: j.localityInfo?.administrative?.slice(-2)?.[0]?.name || j.city || '',
      state:    j.principalSubdivision || ''
    };
  }
  // Nominatim shape
  if (j && j.address){
    const a = j.address;
    return {
      village:  a.village || a.town || a.hamlet || a.suburb || a.city || '',
      district: a.county || a.state_district || a.city || '',
      state:    a.state || ''
    };
  }
  return { village: '', district: '', state: '' };
}

// "Directions from where I am standing to that mandi." Opens Google Maps.
export function directionsUrl(from, to){
  const o = from && from.lat != null ? `${from.lat},${from.lng}` : '';
  const d = to && to.lat != null ? `${to.lat},${to.lng}` : '';
  if (!d) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(to?.name || 'mandi')}`;
  return `https://www.google.com/maps/dir/?api=1${o ? `&origin=${o}` : ''}&destination=${d}&travelmode=driving`;
}

// A mandi 300 km away is not "the mandi near you" — it is a different state.
export const FAR_KM = 300;


// Look a village/town name up and return real coordinates.
// Same free service the profile screen uses (Open-Meteo geocoding, no key).
// Throws a readable message when nothing matches, so the caller can keep the
// old coordinates instead of silently saving a location it cannot measure from.
export async function geocodePlace(name, { timeoutMs = 8000 } = {}){
  const q = String(name || '').trim();
  if (!q) throw new Error('Type a village or town name first.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`lookup answered HTTP ${r.status}`);
    const j = await r.json();
    if (!j.results || !j.results.length) throw new Error(`"${q}" not found — try the nearest town`);
    const g = j.results[0];
    return { lat: g.latitude, lng: g.longitude, name: g.name,
             district: g.admin2 || '', state: g.admin1 || '' };
  } finally { clearTimeout(timer); }
}


// ---------------------------------------------------------------------------
//  Real road distances
// ---------------------------------------------------------------------------
// Straight-line distance is an estimate; a farmer drives a road. OSRM is a
// free, keyless routing service (OpenStreetMap data) and its "table" endpoint
// returns every farm→mandi distance in ONE request.
//
// Returns an array of kilometres, one per point, or null where the router could
// not answer — the caller keeps its own estimate in that case.
export async function roadDistanceTable(farm, points, { timeoutMs = 7000 } = {}){
  if (!farm || farm.lat == null || points.length === 0) return null;
  const pts = [{ lat: farm.lat, lng: farm.lng },
               ...points.map(p => ({ lat: p.lat, lng: p.lng }))];
  if (pts.some(p => p.lat == null || p.lng == null)) return null;

  // OSRM wants lng,lat (not lat,lng) and at most ~25 waypoints on the demo server.
  const coords = pts.slice(0, 25).map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=distance`,
                          { signal: ctrl.signal });
    if (!r.ok) throw new Error(`router answered HTTP ${r.status}`);
    const j = await r.json();
    if (j.code !== 'Ok' || !j.distances || !j.distances[0]) throw new Error('router returned no table');
    return j.distances[0].slice(1).map(metres => (metres == null ? null : Math.max(1, Math.round(metres / 1000))));
  } finally { clearTimeout(timer); }
}
