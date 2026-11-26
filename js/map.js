// ============================================================================
//  MAP LINKS  —  how do I actually get there?
// ----------------------------------------------------------------------------
//  We deliberately do NOT embed a map. A tile layer means a network request to a
//  third party on every screen, an API key for most providers, and a blank grey
//  box the moment the farmer is offline — which is exactly when he is standing at
//  a gate deciding whether to drive.
//
//  What we do instead: hand the coordinates to the map app he already has
//  (OpenStreetMap for the browser, Google Maps/Never Lost on a phone). One tap,
//  works offline once the app has opened, no key, no tracking.
// ============================================================================
import { state } from './state.js';

export const hasCoords = m => !!(m && m.lat != null && m.lng != null);

// A pin for the mandi.
export const osmPin = m =>
  hasCoords(m) ? `https://www.openstreetmap.org/?mlat=${m.lat}&mlon=${m.lng}#map=14/${m.lat}/${m.lng}` : null;

// Turn-by-turn route from the farm to the mandi.
export const osmRoute = (farm, m) =>
  (hasCoords(farm) && hasCoords(m))
    ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${farm.lat},${farm.lng};${m.lat},${m.lng}`
    : null;

// The one most phones here actually open, in one tap.
export const geoUri = (farm, m) =>
  hasCoords(m)
    ? (hasCoords(farm)
        ? `https://www.google.com/maps/dir/?api=1&origin=${farm.lat},${farm.lng}&destination=${m.lat},${m.lng}&travelmode=driving`
        : `https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`)
    : null;

// Small inline pair of links for a table row.
export function mapLinks(m, { farm = state.profile, sheet = false } = {}){
  if (!hasCoords(m)) return '';
  const route = geoUri(farm, m);
  const pin = osmPin(m);
  // Drawn, not emoji: 🧭 and 📍 render as empty boxes on older Android builds,
  // which on a farmer's phone reads as "the app is broken here".
  const ICON_ROUTE = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 19l6-14h4l6 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg>`;
  const ICON_PIN = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.4" fill="currentColor"/></svg>`;
  // The pin opens the sheet INSIDE the app (map + every number). It used to
  // throw the farmer into Google Maps, losing the app and his own figures.
  const sheetPin = `<button type="button" class="maplink" data-ms="${String(m.name || '').replace(/"/g, '&quot;')}"
      title="Map aur poori detail — app ke andar">${ICON_PIN}</button>`;
  return `<span class="maplinks">
    ${route ? `<a class="maplink" target="_blank" rel="noopener" href="${route}" title="Gaadi ka raasta">${ICON_ROUTE}</a>` : ''}
    ${pin ? (sheet ? sheetPin : `<a class="maplink" target="_blank" rel="noopener" href="${pin}" title="Map par dekho">${ICON_PIN}</a>`) : ''}
  </span>`;
}

// "about 40 minutes" — the number a farmer plans with, not the kilometres.
export const driveTime = km => {
  if (km == null || !isFinite(km)) return null;
  const minutes = Math.round((km / 38) * 60);           // ~38 km/h on district roads
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60 ? (minutes % 60) + ' min' : ''}`.trim();
};

// Where every mandi we hold actually is — used by the desk, which has no farm.
export const mandiAt = (name, dataset) => {
  const rows = (dataset?.markets || state.marketDataset?.markets || []);
  const n = String(name || '').toLowerCase();
  return rows.find(m => String(m.name || '').toLowerCase() === n) || null;
};
