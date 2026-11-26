// ============================================================================
//  PLACES — where the farmer is, without asking the browser for permission.
// ----------------------------------------------------------------------------
//  GPS is the best answer and the app still asks for it first. But a denied
//  permission, a locked-down in-app browser or a sandboxed preview frame can
//  make the prompt impossible — the farmer then has no way to say "I am in
//  Duliajan". This table is every district of Assam with its market town, so
//  the answer is one tap, offline, with no prompt to refuse.
//
//  Coordinates are the market town of each district (same source the mandi
//  ranking uses: src/data/assam-places.json). A town is ~10-40 km from any
//  village in its district — good enough for a distance that is shown to the
//  farmer as an estimate, and honest about being one.
// ============================================================================

export const TOWNS = [
  { town:"Mushalpur", district:"Baksa", lat:26.55, lng:91.35 },
  { town:"Pathsala", district:"Bajali", lat:26.5, lng:91.18 },
  { town:"Barpeta", district:"Barpeta", lat:26.32, lng:91.0 },
  { town:"Biswanath Chariali", district:"Biswanath", lat:26.73, lng:93.15 },
  { town:"Bongaigaon", district:"Bongaigaon", lat:26.48, lng:90.56 },
  { town:"Silchar", district:"Cachar", lat:24.83, lng:92.78 },
  { town:"Sonari", district:"Charaideo", lat:27.05, lng:94.9 },
  { town:"Kajalgaon", district:"Chirang", lat:26.55, lng:90.35 },
  { town:"Mangaldoi", district:"Darrang", lat:26.44, lng:92.03 },
  { town:"Dhemaji", district:"Dhemaji", lat:27.48, lng:94.58 },
  { town:"Dhubri", district:"Dhubri", lat:26.02, lng:89.97 },
  { town:"Dibrugarh", district:"Dibrugarh", lat:27.47, lng:94.91 },
  { town:"Haflong", district:"Dima Hasao", lat:25.17, lng:93.02 },
  { town:"Goalpara", district:"Goalpara", lat:26.17, lng:90.62 },
  { town:"Golaghat", district:"Golaghat", lat:26.51, lng:93.96 },
  { town:"Hailakandi", district:"Hailakandi", lat:24.68, lng:92.56 },
  { town:"Hojai", district:"Hojai", lat:26.0, lng:92.86 },
  { town:"Jorhat", district:"Jorhat", lat:26.75, lng:94.2 },
  { town:"Amingaon", district:"Kamrup", lat:26.18, lng:91.68 },
  { town:"Guwahati", district:"Kamrup Metropolitan", lat:26.14, lng:91.74 },
  { town:"Diphu", district:"Karbi Anglong", lat:25.83, lng:93.43 },
  { town:"Karimganj", district:"Karimganj", lat:24.87, lng:92.36 },
  { town:"Kokrajhar", district:"Kokrajhar", lat:26.4, lng:90.27 },
  { town:"North Lakhimpur", district:"Lakhimpur", lat:27.24, lng:94.1 },
  { town:"Garamur", district:"Majuli", lat:26.95, lng:94.17 },
  { town:"Morigaon", district:"Morigaon", lat:26.25, lng:92.34 },
  { town:"Nagaon", district:"Nagaon", lat:26.35, lng:92.68 },
  { town:"Nalbari", district:"Nalbari", lat:26.44, lng:91.44 },
  { town:"Sivasagar", district:"Sivasagar", lat:26.98, lng:94.63 },
  { town:"Tezpur", district:"Sonitpur", lat:26.65, lng:92.79 },
  { town:"Mankachar", district:"South Salmara-Mankachar", lat:25.98, lng:89.85 },
  { town:"Tamulpur", district:"Tamulpur", lat:26.62, lng:91.55 },
  { town:"Tinsukia", district:"Tinsukia", lat:27.49, lng:95.36 },
  { town:"Udalguri", district:"Udalguri", lat:26.75, lng:92.1 },
  { town:"Hamren", district:"West Karbi Anglong", lat:25.9, lng:92.6 },
];

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Look a typed name up in the table: town first, then district, then a prefix
// or contains match. Returns null when the name is not an Assam district town —
// the caller can then fall back to a network geocode.
export function findTown(q){
  const n = norm(q);
  if (!n) return null;
  const exact = TOWNS.find(t => norm(t.town) === n);
  if (exact) return exact;
  const dist = TOWNS.find(t => norm(t.district) === n);
  if (dist) return dist;
  const alias = TOWNS.find(t => (t.aliases || []).some(a => norm(a) === n));
  if (alias) return alias;
  return TOWNS.find(t => norm(t.town).startsWith(n) || norm(t.town).includes(n)) || null;
}

// Which table town is closest to a pair of coordinates — used to label a GPS fix
// in words a farmer recognises ("Dibrugarh side") instead of decimals.
export function nearestTown(lat, lng){
  if (lat == null || lng == null) return null;
  let best = null, bestKm = Infinity;
  for (const t of TOWNS){
    const km = haversine(lat, lng, t.lat, t.lng);
    if (km < bestKm){ bestKm = km; best = t; }
  }
  return best ? { ...best, km: Math.round(bestKm) } : null;
}

export function haversine(lat1, lng1, lat2, lng2){
  const R = 6371, rad = d => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// A readable "I am here" line for a coordinate pair.
export function placeLine(lat, lng){
  const t = nearestTown(lat, lng);
  return t ? `~${t.km} km from ${t.town}` : `${(+lat).toFixed(2)}, ${(+lng).toFixed(2)}`;
}

// ------------------------------------------------------------------ the widget
// One <select> used by the registration form, the profile screen and the sell
// form. Grouped by district so a long list is still readable on a phone.
export function townPickerHTML(id, { selected = '', label = 'Or pick your town — works without GPS' } = {}){
  const sel = findTown(selected);
  const groups = [...new Set(TOWNS.map(t => t.district))].sort();
  const opt = t => `<option value="${t.town}" ${sel && sel.town === t.town ? 'selected' : ''}>${t.town}</option>`;
  return `<label class="townpick"><span>${label}</span>
    <select id="${id}">
      <option value="">— choose your town / district —</option>
      ${groups.map(g => `<optgroup label="${g}">${TOWNS.filter(t => t.district === g).map(opt).join('')}</optgroup>`).join('')}
    </select>
  </label>`;
}

// Wire the picker: on change the caller gets { town, district, lat, lng }.
export function wireTownPicker(id, onPick){
  const el = document.getElementById(id);
  if (!el) return;
  el.onchange = () => {
    const hit = findTown(el.value);
    if (hit && onPick) onPick(hit);
  };
}

// "Tinsukia, Tinsukia" reads like a bug — the district is dropped when it is
// the same word as the town.
export function placeLabel(t){
  if (!t) return '';
  return t.district && t.district !== t.town ? `${t.town}, ${t.district}` : t.town;
}

// Everything the location flow needs after a pick, in one object.
export function townPlace(t){
  return { lat: t.lat, lng: t.lng, village: t.town, district: t.district, state: 'Assam',
           source: 'town-table' };
}
