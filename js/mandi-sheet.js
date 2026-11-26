// ============================================================================
//  MANDI SHEET — the map and the whole picture, inside the app
// ----------------------------------------------------------------------------
//  Before: tapping the pin threw the farmer out to Google Maps. He lost the app,
//  his numbers, and (on 3G) a few hundred kilobytes of maps he did not ask for.
//
//  Now a sheet slides up with two things side by side in one scroll:
//    1. a MAP drawn here, from coordinates we already hold — farm on one side,
//       mandi on the other, other mandis around it, distance rings, a scale bar.
//       No tile server, no API key, no grey box when the signal drops.
//    2. every number we know about that mandi: today's rate and the day it was
//       published, min–max, variety, net after transport, drive time, MSP
//       comparison, 30-day trend, and what the mandi itself reported.
//
//  The Google Maps link is still there — but as a choice at the bottom of the
//  sheet, not as the only way to see where the mandi is.
// ============================================================================
import { state } from './state.js';
import { geoUri, driveTime, hasCoords } from './map.js';
import { mspFor, mspGap } from './msp.js';
import { MAPS_EMBED_KEY } from './config.js';

const rupees = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KM_PER_DEG_LAT = 111.32;

// ---------------------------------------------------------------------------
//  the map
// ---------------------------------------------------------------------------
//  A real projection, not a doodle: longitude is squeezed by cos(latitude), so
//  Assam does not look stretched, and the scale bar is computed from the same
//  number the pins use. What it cannot show is roads — so it says so, once.
export function mapSVG({ farm, target, others: othersArg = [], w = 320, h = 210 }){
  let others = othersArg;
  const pts = [];
  if (hasCoords(farm)) pts.push({ lat: farm.lat, lng: farm.lng });
  if (hasCoords(target)) pts.push({ lat: target.lat, lng: target.lng });
  for (const o of others) if (hasCoords(o)) pts.push({ lat: o.lat, lng: o.lng });
  if (!pts.length) return '';

  // The box is fitted to whatever is on it. With every mandi in Assam the dots
  // 40 km from the farm collapse into one pixel — but dropping the far ones
  // leaves a map of one village. So: keep every dot, and fit the frame to the
  // 90th percentile of distances, clamping anything further to the edge.
  const kmBetween = (a, b) => {
    const dy = (a.lat - b.lat) * KM_PER_DEG_LAT;
    const dx = (a.lng - b.lng) * KM_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180);
    return Math.hypot(dx, dy);
  };
  const anchor = hasCoords(farm) ? farm : target;
  const dists = pts.map(p => kmBetween(anchor, p)).sort((a, b) => a - b);
  // Fit to the 6 nearest places — the ones a farmer might actually drive to —
  // and let anything beyond that clamp to the edge as a direction hint.
  const fitKm = Math.max(30, dists[Math.min(dists.length - 1, 5)] || 30);
  const near = pts.filter(p => kmBetween(anchor, p) <= fitKm * 1.15);

  const lats = near.map(p => p.lat), lngs = near.map(p => p.lng);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lng0 = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const cos = Math.cos(lat0 * Math.PI / 180) || 1;

  // degrees → px, fitted into the box with padding
  const pad = 26;
  const spanLat = Math.max(0.02, Math.max(...lats) - Math.min(...lats));
  const spanLng = Math.max(0.02, (Math.max(...lngs) - Math.min(...lngs)) * cos);
  const scale = Math.min((w - pad * 2) / spanLng, (h - pad * 2) / spanLat);
  // Clamped projection: a mandi past the fitted frame sticks to the border in
  // its true direction instead of vanishing or shrinking everything else.
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const px = p => ({
    x: clamp(w / 2 + (p.lng - lng0) * cos * scale, 10, w - 10),
    y: clamp(h / 2 - (p.lat - lat0) * scale, 10, h - 10),
  });

  const farmXY = hasCoords(farm) ? px(farm) : null;
  const mandiXY = px(target);
  const kmPerPx = 1 / (scale / KM_PER_DEG_LAT);
  const G = '#0B4A2F', MUTED = '#586A5F';

  // Rings and the scale bar are chosen from the zoom, not fixed. On a 48 km trip
  // a 25 km circle does not fit in a 320-px box, and a 1 km bar shrinks to six
  // pixels — so both are picked from a ladder that suits the current scale.
  const pxPerKm = scale / KM_PER_DEG_LAT;
  const ringLadder = [5, 10, 25, 50, 100].map(km => ({ km, r: km * pxPerKm }))
    .filter(o => o.r >= 16 && o.r <= Math.min(w, h) * 0.62);
  let rings = '';
  if (farmXY){
    ringLadder.forEach((o, i) => {
      rings += `<circle cx="${farmXY.x.toFixed(1)}" cy="${farmXY.y.toFixed(1)}" r="${o.r.toFixed(1)}"
        fill="none" stroke="${MUTED}" stroke-opacity="${i === 0 ? .34 : .18}" stroke-width="1"
        stroke-dasharray="${i === 0 ? '0' : '3 4'}"/>
        <text x="${(farmXY.x + o.r + 3).toFixed(1)}" y="${(farmXY.y - 3).toFixed(1)}"
          font-size="8" fill="${MUTED}" fill-opacity=".85">${o.km} km</text>`;
    });
  }

  // Every other mandi is a labelled pin, not an anonymous dot: "kaunsi mandi
  // kahan hai" is the question the map exists to answer. Pins are drawn in
  // rank order (cheapest first) and the first few carry their name.
  const shown = others.filter(hasCoords).slice(0, 24);
  // At most four names, and only where they do not sit on top of an earlier
  // one. The dots stay (they are what the map is for); the text is rationed.
  const placed = [];
  const showOrder = shown.slice()
    .map((o, i) => ({ o, i, d: o.distanceKm == null ? 1e9 : o.distanceKm }))
    .sort((a, b) => a.d - b.d);
  const named = new Set();
  // The farm pin and the target pin already own their corner of the canvas;
  // a name printed under either of them is unreadable, so keep clear of them.
  const reserved = [farmXY, mandiXY].filter(Boolean);
  for (const { o } of showOrder){
    if (named.size >= 3) break;
    const p = px(o);
    const label = String(o.name || '').replace(/\s+Mandi$/i, '').replace(/\s*\(.*$/, '');
    const text = label.length > 11 ? label.slice(0, 10) + '…' : label;
    const wpx = text.length * 4.6;
    // pick the side BEFORE testing for a clash: right if it fits, else left,
    // else this dot goes unnamed rather than printing over the edge
    const flip = p.x + 7 + wpx > w - 3;
    if (!flip && p.x + 7 + wpx > w - 3) continue;
    if (flip && p.x - 7 - wpx < 3) continue;
    if (reserved.some(r => Math.abs(r.y - p.y) < 15 && Math.abs(r.x - (flip ? p.x - wpx : p.x)) < wpx + 40)) continue;
    const clash = [...named].some(q => Math.abs(q.y - p.y) < 15 &&
      (flip ? q.x < p.x + 6 && q.x + q.w > p.x - 7 - wpx
            : q.x < p.x + 7 + wpx && q.x + q.w > p.x + 7));
    if (!clash) named.add(Object.assign(p, { w: wpx, text, o, flip }));
  }

  const dots = shown.map((o, i) => {
    const p = px(o);
    const label = String(o.name || '').replace(/\s+Mandi$/i, '').replace(/\s*\(.*$/, '');
    const text = label.length > 13 ? label.slice(0, 12) + '…' : label;
    const wpx = text.length * 4.4;
    const hit = [...named].find(q => q.o === o);
    const show = !!hit;
    const flip = hit ? hit.flip : false;
    return `<g class="msmp">
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${show ? 4.4 : 3.2}"
        fill="${o.reachable === false ? '#A80E1F' : G}" fill-opacity="${show ? .8 : .4}"/>
      ${show ? `<text x="${(flip ? p.x - 7 : p.x + 7).toFixed(1)}" y="${(p.y + 3).toFixed(1)}"
        text-anchor="${flip ? 'end' : 'start'}" font-size="8" fill="${G}" font-weight="700"
        paint-order="stroke" stroke="#FFFFFF" stroke-width="2.5" stroke-opacity=".85">${esc(hit.text)}</text>` : ''}
    </g>`;
  }).join('');

  // The route visits the ranked mandis in order — the same order the list shows.
  const routePts = [farmXY, ...shown.map(px), mandiXY].filter(Boolean);
  const route = routePts.length > 2
    ? `<polyline points="${routePts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"
        fill="none" stroke="${G}" stroke-opacity=".28" stroke-width="1.4" stroke-dasharray="2 5"/>`
    : '';

  const line = farmXY
    ? `<line x1="${farmXY.x.toFixed(1)}" y1="${farmXY.y.toFixed(1)}"
             x2="${mandiXY.x.toFixed(1)}" y2="${mandiXY.y.toFixed(1)}"
             stroke="${G}" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round"/>`
    : '';
  const mid = farmXY ? { x: (farmXY.x + mandiXY.x) / 2, y: (farmXY.y + mandiXY.y) / 2 } : null;

  // Scale bar: the biggest round distance that still fits in ~90 px. A bar you
  // can actually measure beats a token "1 km" that renders as a dot.
  const barKm = [100, 50, 25, 10, 5, 2, 1].find(k => k * pxPerKm <= 92 && k * pxPerKm >= 26);
  const barPx = barKm ? barKm * pxPerKm : 0;
  const bar = barKm
    ? `<g transform="translate(12,${h - 14})">
         <line x1="0" y1="0" x2="${barPx.toFixed(1)}" y2="0" stroke="${G}" stroke-width="2" stroke-linecap="round"/>
         <line x1="0" y1="-3" x2="0" y2="3" stroke="${G}" stroke-width="1.6"/>
         <line x1="${barPx.toFixed(1)}" y1="-3" x2="${barPx.toFixed(1)}" y2="3" stroke="${G}" stroke-width="1.6"/>
         <text x="${(barPx / 2).toFixed(1)}" y="-5" font-size="8" fill="${MUTED}" text-anchor="middle">${barKm} km</text>
       </g>` : '';

  const farmPin = farmXY ? `<g transform="translate(${farmXY.x.toFixed(1)},${farmXY.y.toFixed(1)})">
      <circle r="9" fill="#FFFFFF" stroke="${G}" stroke-width="2.4"/>
      <path d="M-4 2 L0 -3 L4 2 Z" fill="${G}"/>
      <text y="15" font-size="8.5" fill="${G}" text-anchor="middle" font-weight="700">Aapka khet</text>
    </g>` : '';

  const mandiPin = `<g transform="translate(${mandiXY.x.toFixed(1)},${mandiXY.y.toFixed(1)})">
      <circle r="12" fill="#6E3F0B" fill-opacity=".16"/>
      <circle r="6.5" fill="#6E3F0B" stroke="#FFFFFF" stroke-width="2"/>
      <text y="-11" font-size="9" fill="#6E3F0B" text-anchor="middle" font-weight="800">Mandi</text>
    </g>`;

  return `<svg class="msmap" viewBox="0 0 ${w} ${h}" role="img"
      aria-label="Map: aapka khet se ${esc(target.name)} tak ${target.distanceKm || '?'} km">
    <defs>
      <linearGradient id="msg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EDF4EF"/>
      </linearGradient>
      <pattern id="msgrid" width="26" height="26" patternUnits="userSpaceOnUse">
        <path d="M26 0 L0 0 0 26" fill="none" stroke="#DDEBE1" stroke-width="1" stroke-opacity=".55"/>
      </pattern>
      <clipPath id="msclip"><rect x="0" y="0" width="${w}" height="${h}" rx="14"/></clipPath>
    </defs>
    <g clip-path="url(#msclip)">
      <rect width="${w}" height="${h}" fill="url(#msg)"/>
      <rect width="${w}" height="${h}" fill="url(#msgrid)"/>
      ${rings}${route}${dots}${line}
      ${mid ? `<rect x="${(mid.x - 22).toFixed(1)}" y="${(mid.y - 9).toFixed(1)}" width="44" height="18" rx="9"
          fill="#FFFFFF" stroke="#DDEBE1"/>
        <text x="${mid.x.toFixed(1)}" y="${(mid.y + 3.5).toFixed(1)}" font-size="9.5" fill="${G}"
          text-anchor="middle" font-weight="700">${target.distanceKm != null ? target.distanceKm + ' km' : ''}</text>` : ''}
      ${farmPin}${mandiPin}${bar}
    </g>
  </svg>`;
}

// ---------------------------------------------------------------------------
//  the sheet
// ---------------------------------------------------------------------------
function trendSpark(hist, w = 128, h = 34){
  const pts = (hist || []).filter(v => typeof v === 'number' && isFinite(v)).slice(-30);
  if (pts.length < 2) return '';
  const min = Math.min(...pts), max = Math.max(...pts), span = (max - min) || 1;
  const xy = pts.map((v, i) => [
    (i / (pts.length - 1)) * w,
    h - ((v - min) / span) * (h - 6) - 3,
  ]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  const col = up ? '#0B4A2F' : '#A80E1F';
  return `<svg viewBox="0 0 ${w} ${h}" class="msspark" aria-hidden="true">
    <path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${xy[xy.length - 1][0].toFixed(1)}" cy="${xy[xy.length - 1][1].toFixed(1)}" r="2.6" fill="${col}"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
//  the real Google map — the Rapido experience, inside the app
// ---------------------------------------------------------------------------
//  Tap the pin → the actual Google map opens in a sheet inside the app: real
//  roads, village names, drag, pinch-zoom, and the route drawn with its travel
//  time. No new tab, no lost state.
//
//  How it is free: Google bills a map shown this way under the EMBED SKU, which
//  is ₹0 with no cap. Two ways in —
//    · with a key  → the official Maps Embed API (supported, guaranteed).
//    · without     → Google's classic `output=embed`, which needs no account at
//                    all. It is undocumented, so it can break one day; that is
//                    exactly why our own drawn map stays one tab away and comes
//                    back on its own if the frame never loads.
// One route through several mandis. Google's embed takes the stops as a
// `daddr` list joined by "to:" — one map, one route, every gate on it. Without
// a key we use the classic `output=embed` form (no account, no billing); with a
// key the Directions Embed API does the same and is the supported path.
export const googleMapMultiURL = ({ farm, stops = [], key = MAPS_EMBED_KEY } = {}) => {
  const pts = (stops || []).filter(hasCoords);
  if (!pts.length) return null;
  const from = hasCoords(farm) ? `${farm.lat},${farm.lng}` : null;

  if (key){
    const k = encodeURIComponent(key);
    if (!from) return `https://www.google.com/maps/embed/v1/place?key=${k}&q=${pts[0].lat},${pts[0].lng}&zoom=11`;
    // Embed API allows up to 3 waypoints; beyond that the extra stops still
    // appear as pins on the drawn map, so nothing is silently lost.
    const dest = pts[pts.length - 1];
    const mid  = pts.slice(0, -1).slice(0, 3).map(p => `${p.lat},${p.lng}`).join('|');
    return `https://www.google.com/maps/embed/v1/directions?key=${k}` +
      `&origin=${from}&destination=${dest.lat},${dest.lng}` +
      (mid ? `&waypoints=${encodeURIComponent(mid)}` : '') + `&mode=driving`;
  }
  const list = pts.map(p => `${p.lat},${p.lng}`).join('+to:');
  return from
    ? `https://maps.google.com/maps?saddr=${from}&daddr=${list}&z=10&output=embed`
    : `https://maps.google.com/maps?q=${pts[0].lat},${pts[0].lng}&z=11&output=embed`;
};

export const googleMapURL = ({ farm, target } = {}, key = MAPS_EMBED_KEY) => {
  if (!hasCoords(target)) return null;
  if (key){
    const k = encodeURIComponent(key);
    return hasCoords(farm)
      ? `https://www.google.com/maps/embed/v1/directions?key=${k}` +
        `&origin=${farm.lat},${farm.lng}&destination=${target.lat},${target.lng}` +
        `&mode=driving&zoom=9`
      : `https://www.google.com/maps/embed/v1/place?key=${k}&q=${target.lat},${target.lng}&zoom=12`;
  }
  const d = `${target.lat},${target.lng}`;
  return hasCoords(farm)
    ? `https://maps.google.com/maps?saddr=${farm.lat},${farm.lng}&daddr=${d}&z=10&output=embed`
    : `https://maps.google.com/maps?q=${d}&z=12&output=embed`;
};

const online = () => { try { return navigator.onLine !== false; } catch { return true; } };

function mapTabsHTML(farm, target){
  if (!googleMapURL({ farm, target })) return '';
  const can = online();
  // Google is the default — that is the screen he asked for. Our own map is the
  // quiet second tab that works with no signal.
  return `<div class="msmaptabs" role="tablist">
    <button type="button" class="msmaptab on" data-maptab="google" role="tab" aria-selected="true"
      ${can ? '' : 'disabled title="Internet nahi hai"'}>Google naksha${can ? '' : ' · offline'}</button>
    <button type="button" class="msmaptab" data-maptab="own" role="tab" aria-selected="false">Apna naksha</button>
  </div>`;
}

// The frame itself. Built on demand so a sheet that is never opened costs
// nothing, and so the offline build never touches google.com.
function googleFrame(src, target){
  return `<div class="msgframe"><div class="msgskel" aria-hidden="true">
      <span class="msgpin"></span><span class="msgbar"></span>
    </div>
    <iframe title="Google Maps — ${esc(target.name)}" loading="eager"
      referrerpolicy="no-referrer-when-downgrade" allowfullscreen src="${esc(src)}"></iframe>
    <div class="msgload">Google naksha khul raha hai…</div>
    <button type="button" class="msgbig" title="Bada karo" aria-label="Map bada karo">⤢</button>
  </div>`;
}

export function mandiSheetHTML(row){
  const m = row || {};
  const farm = state.profile || null;
  const others = (state.markets || []).filter(r => r !== m && hasCoords(r) && (r.distanceKm || 0) < 120);
  const msp = mspFor(state.season?.crop);
  const gap = msp ? mspGap(state.season?.crop, m.price) : null;

  // A mandi past MAX_TRIP_KM is not a plan, it is a day wasted on the road. The
  // table already says so; the sheet must not quietly show a positive net there
  // — that was the table masking a number the sheet then printed anyway.
  const far = m.reachable === false;

  // The rate itself is the section heading ("AAJ KA RATE · ₹2,240/qtl"), so the
  // table starts one line down. Printing it twice made the first two rows read
  // as a glitch, not as information.
  const rows = [
    ['Din ka bhav (min–max)', (m.min && m.max) ? `${rupees(m.min)} – ${rupees(m.max)}` : '—'],
    ['Variety', m.live?.variety || m.reported?.variety || '—'],
    ['Kis din ka rate', m.live?.day || m.reported?.at || (m.arrivalDate || '—')],
    ['Safar ka kharcha', m.pickup ? 'farm-gate · safar nahi' : (m.transport != null ? `${rupees(m.transport)}/qtl` : '—')],
    ['Net (safar ke baad)', far ? '<span class="msfar">—</span>'
      : (m.netPerQtl != null ? `<b class="pos">${rupees(m.netPerQtl)}</b>/qtl` : '—')],
    ['Poore maal par', far ? '—' : (m.earnings != null ? rupees(m.earnings) : '—')],
  ];
  if (msp) rows.push([`Sarkari MSP (${state.season?.crop})`, `${rupees(msp.price)}${gap != null ? ` · ${gap >= 0 ? '+' : '−'}${rupees(Math.abs(gap))} ${gap >= 0 ? 'upar' : 'neeche'}` : ''}`]);

  // -------------------------------------------------------------------------
  //  ONE SHEET, FOUR SECTIONS — not one 2.5-screen scroll.
  // -------------------------------------------------------------------------
  //  The old sheet printed everything at once: map, nine-row table, the far
  //  warning, the trend, the mandi's own post and the buttons. On a 390 px
  //  phone that is two and a half screens, and the farmer scrolled past his
  //  own rate to reach the map. Now:
  //
  //    Rate          always open — this is the number he came for
  //    Naksha        closed — summary already says "22 km · ~40 min"
  //    Trend         closed — summary already says "+3.2%"
  //    Mandi ka post closed — only when the mandi actually posted one
  //
  //  A closed section is not a hidden number: its one-line summary carries the
  //  headline, so nothing important needs a tap to be read.
  // -------------------------------------------------------------------------
  // "andaaza" is not decoration. Google says 59 min for the same trip because it
  // knows the road; we divide by 38 km/h. Two numbers on one screen with no
  // label is the fastest way to lose a farmer's trust, so the estimate says so.
  const distLine = m.distanceKm != null
    ? `${m.distanceKm} km${driveTime(m.distanceKm) ? ' · andaaza ' + driveTime(m.distanceKm) : ''}`
    : 'naksha';
  const trendTxt = m.trend == null ? '—' : (m.trend >= 0 ? '+' : '') + m.trend.toFixed(1) + '%';
  const hasHist = !!(m.hist && m.hist.length > 2);

  return `
  <div class="mssheet" role="dialog" aria-modal="true" aria-label="${esc(m.name)} ki details">
    <div class="mshead">
      <div>
        <h3>${esc(m.name)}</h3>
        <div class="statlabel">${esc(m.district || 'Assam')}${m.live ? ' · LIVE sarkari rate' : (m.reported ? ' · mandi ne khud bheja' : '')}</div>
      </div>
      <button class="msclose" aria-label="Band karo">✕</button>
    </div>

    <section class="mssec">
      <h4 class="mssecH">Aaj ka rate${m.price != null ? `<span>${rupees(m.price)}/qtl</span>` : ''}</h4>
      <table class="mstable">
        ${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
      </table>
      ${far ? `<div class="msnote msfarnote">
        <b>Itna door — jaana nahi.</b> Yeh mandi ${m.distanceKm} km hai; paddy 150 km se
        door le jaane ka kharcha rate se zyada ho jaata hai. Isliye net aur aay nahi dikhaye.
      </div>` : ''}
    </section>

    <details class="msacc" data-sec="map">
      <summary>
        <span class="msaccT">Naksha &amp; doori</span>
        <span class="msaccM">${distLine}</span>
        <span class="mschev" aria-hidden="true"></span>
      </summary>
      <div class="msaccBody">
        <div class="msmapwrap">
          ${mapTabsHTML(farm, m)}
          <div class="msown">${mapSVG({ farm, target: m, others }) || '<div class="statlabel">Map ke liye coordinates nahi hain.</div>'}</div>
          <div class="msmapnote">Seedha raasta dikhaya hai — sadak ka ghumav nahi.
            ${m.roadRouted ? 'Doori asli sadak se napi gayi hai.' : ''}</div>
        </div>
      </div>
    </details>

    ${hasHist ? `
    <details class="msacc" data-sec="trend">
      <summary>
        <span class="msaccT">30 din ka trend</span>
        <span class="msaccM">${trendTxt}</span>
        <span class="mschev" aria-hidden="true"></span>
      </summary>
      <div class="msaccBody">
        <div class="mstrend">
          <div>
            <div class="statlabel">30 din me badlav</div>
            <b>${trendTxt}</b>
          </div>
          ${trendSpark(m.hist)}
        </div>
      </div>
    </details>` : ''}

    ${m.reported ? `
    <details class="msacc" data-sec="post">
      <summary>
        <span class="msaccT">Mandi ka apna post</span>
        <span class="msaccM">${rupees(m.reported.modal)}/qtl</span>
        <span class="mschev" aria-hidden="true"></span>
      </summary>
      <div class="msaccBody">
        <div class="msnote">
          <b>Mandi ne khud bheja:</b> ${rupees(m.reported.modal)}/qtl
          ${m.reported.note ? `· “${esc(m.reported.note)}”` : ''}
          ${m.reported.photo ? `<img src="${esc(m.reported.photo)}" alt="mandi board" loading="lazy">` : ''}
        </div>
      </div>
    </details>` : ''}

    <div class="msactions">
      ${geoUri(farm, m) ? `<a class="btn" href="${geoUri(farm, m)}" target="_blank" rel="noopener">Google Maps me raasta</a>` : ''}
      <button class="btn ghost msclose2">Band karo</button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
//  ALL MANDIS ON ONE MAP
// ---------------------------------------------------------------------------
//  The mandi sheet answers "where is THIS gate". The question before it is
//  "inme se kaunsi kahan hai" — and answering that one tap at a time is how a
//  farmer picks the wrong gate. This sheet puts the farm and every mandi we can
//  place on one map, ranked, with the route that visits them in order of net
//  price. Google gets the same list as a multi-stop route when it is online.
export function multiMandiSheetHTML(rows = state.markets, farm = state.profile){
  const pts = (rows || []).filter(r => hasCoords(r) && r.reachable !== false).slice(0, 12);
  const all = (rows || []).filter(hasCoords).slice(0, 24);
  if (!all.length) return '';

  const best = pts[0];
  const farmTxt = hasCoords(farm) ? 'Aapka khet se' : 'Bina khet ke';
  // Only real drives become stops: a farm-gate trader (pickup / 0 km) is where
  // you already are, and VRP-ing it into the route put a pin on the farm itself.
  const routeStops = pts.filter(r => !r.pickup && (r.distanceKm || 0) >= 1 && (r.distanceKm || 0) <= 200);

  return `
  <div class="mssheet msmulti" role="dialog" aria-modal="true" aria-label="Saari mandiyaan ek naksha par">
    <div class="mshead">
      <div>
        <h3>Saari mandiyaan, ek naksha par</h3>
        <div class="statlabel">${farmTxt} · ${all.length} mandi · sabse pehle sabse zyada net</div>
      </div>
      <button class="msclose" aria-label="Band karo">✕</button>
    </div>

    <section class="mssec">
      <div class="msmapwrap">
        <div class="msmaptabs" role="tablist">
          <button type="button" class="msmaptab on" data-maptab="google" role="tab" aria-selected="true">Google naksha</button>
          <button type="button" class="msmaptab" data-maptab="own" role="tab" aria-selected="false">Apna naksha</button>
        </div>
        <div class="msown" style="display:none">${mapSVG({ farm, target: best || all[0], others: all.filter(r => r !== (best || all[0])), w: 340, h: 300 }) || ''}</div>
        <div class="msmapnote">Google par poora raasta ek hi map me — sabhi mandi numbered pins hain.
          Apna naksha bina internet chalta hai.</div>
      </div>
    </section>

    <details class="msacc" data-sec="list" open>
      <summary>
        <span class="msaccT">Ranked list</span>
        <span class="msaccM">net ke hisaab se</span>
        <span class="mschev" aria-hidden="true"></span>
      </summary>
      <div class="msaccBody">
        <ol class="msmlist">
          ${pts.map((r, i) => `<li>
            <span class="msmnum">${i + 1}</span>
            <span class="msmname">${esc(r.name)}<span class="statlabel">${esc(r.district || '')} · ${r.distanceKm != null ? r.distanceKm + ' km' : '—'}${driveTime(r.distanceKm) ? ' · ' + driveTime(r.distanceKm) : ''}</span></span>
            <span class="msmrate"><b>${rupees(r.netPerQtl)}</b><span class="statlabel">net /qtl</span></span>
          </li>`).join('')}
        </ol>
      </div>
    </details>

    <div class="msactions">
      ${googleMapMultiURL({ farm, stops: routeStops.length ? routeStops : pts }) ? `<a class="btn" target="_blank" rel="noopener"
         href="${esc(googleMapMultiURL({ farm, stops: routeStops.length ? routeStops : pts }))}">Google Maps me poora raasta</a>` : ''}
      <button class="btn ghost msclose2">Band karo</button>
    </div>
  </div>`;
}

export function openMultiMandiSheet(rows = state.markets){
  const html = multiMandiSheetHTML(rows);
  if (!html) return null;
  document.getElementById('mandiSheetHost')?.remove();

  const host = document.createElement('div');
  host.id = 'mandiSheetHost';
  host.className = 'mshost';
  host.innerHTML = `<div class="msback"></div>${html}`;
  document.body.appendChild(host);

  const close = () => { host.classList.add('out'); setTimeout(() => host.remove(), 180); };
  host.querySelectorAll('.msclose, .msclose2').forEach(b => b.onclick = close);
  host.querySelector('.msback').onclick = close;

  const wrap = host.querySelector('.msmapwrap');
  const own  = host.querySelector('.msown');
  const tabs = host.querySelectorAll('.msmaptab');
  const build = () => {
    const src = googleMapMultiURL({ farm: state.profile, stops: (rows || []).filter(hasCoords).slice(0, 10) });
    if (!src) return;
    if (wrap.querySelector('.msgframe')) return;
    const holder = document.createElement('div');
    holder.innerHTML = googleFrame(src, { name: 'saari mandiyaan' });
    wrap.insertBefore(holder.firstElementChild, wrap.querySelector('.msmapnote'));
    const box = wrap.querySelector('.msgframe');
    const skel = box.querySelector('.msgskel'), load = box.querySelector('.msgload');
    box.querySelector('iframe').addEventListener('load', () => { skel?.remove(); load?.remove(); });
    box.querySelector('.msgbig').onclick = () => {
      box.classList.toggle('big');
      box.querySelector('.msgbig').textContent = box.classList.contains('big') ? '⤡' : '⤢';
    };
  };
  tabs.forEach(t => t.onclick = () => {
    tabs.forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
    const frame = wrap.querySelector('.msgframe');
    if (t.dataset.maptab === 'google'){ own.style.display = 'none'; if (frame) frame.style.display = ''; build(); }
    else { own.style.display = ''; if (frame) frame.style.display = 'none'; }
  });
  if (online()) build(); else { own.style.display = ''; }

  requestAnimationFrame(() => host.classList.add('in'));
  return { close };
}

// ---------------------------------------------------------------------------
export function openMandiSheet(nameOrRow){
  const row = (typeof nameOrRow === 'string')
    ? (state.markets || []).find(r => r.name === nameOrRow)
    : nameOrRow;
  if (!row) return null;

  document.getElementById('mandiSheetHost')?.remove();

  const host = document.createElement('div');
  host.id = 'mandiSheetHost';
  host.className = 'mshost';
  host.innerHTML = `<div class="msback"></div>${mandiSheetHTML(row)}`;
  document.body.appendChild(host);

  const close = () => {
    host.classList.add('out');
    setTimeout(() => host.remove(), 180);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };

  // ---- the map: built only when its section is opened ----
  //  The sheet now opens with the rate section alone. Building the Google
  //  iframe while "Naksha" is shut would pull map tiles the farmer never asked
  //  for — on 3G that is the difference between the sheet appearing now and
  //  appearing four seconds from now. First tap builds it, once.
  const buildMap = () => {
  const wrap  = host.querySelector('.msmapwrap');
  const own   = wrap.querySelector('.msown');
  const tabs  = host.querySelectorAll('.msmaptab');
  const frames = { google: null };

  const showOwn = () => {
    own.style.display = '';
    const f = wrap.querySelector('.msgframe');
    if (f) f.style.display = 'none';
  };
  const showGoogle = () => {
    own.style.display = 'none';
    const f = wrap.querySelector('.msgframe');
    if (f) f.style.display = '';
    if (frames.google) return;
    const src = googleMapURL({ farm: state.profile, target: row });
    if (!src) { showOwn(); return; }
    const holder = document.createElement('div');
    holder.innerHTML = googleFrame(src, row);
    const box = holder.firstElementChild;
    wrap.insertBefore(box, wrap.querySelector('.msmapnote'));
    frames.google = box;

    const ifr = box.querySelector('iframe');
    const skel = box.querySelector('.msgskel');
    const load = box.querySelector('.msgload');
    let done = false;
    const landed = () => {
      if (done) return; done = true;
      skel?.remove(); load?.remove();
    };
    ifr.addEventListener('load', landed);
    // An iframe fires load even when the network ate the request, and a
    // cross-origin frame cannot tell us what it painted. So: if nothing has
    // reported back in 9 s on a slow phone, stop pretending — drop to the map
    // we drew ourselves, which is already sitting right underneath.
    setTimeout(() => {
      if (done) return;
      landed();
      const t = wrap.querySelector('[data-maptab="own"]');
      if (t) { tabs.forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t ? 'true' : 'false'); }); }
      box.remove(); frames.google = null; showOwn();
      const note = document.createElement('div');
      note.className = 'msfallback';
      note.textContent = 'Google naksha nahi khula (internet slow ya band). Neeche apna naksha hai — wahi doori aur raasta dikhata hai.';
      wrap.insertBefore(note, wrap.querySelector('.msmapnote'));
    }, 9000);

    box.querySelector('.msgbig').onclick = () => {
      box.classList.toggle('big');
      box.querySelector('.msgbig').textContent = box.classList.contains('big') ? '⤡' : '⤢';
      box.querySelector('.msgbig').setAttribute('aria-label',
        box.classList.contains('big') ? 'Map chhota karo' : 'Map bada karo');
    };
  };

  tabs.forEach(tab => {
    tab.onclick = () => {
      if (tab.disabled) return;
      tabs.forEach(t => { t.classList.toggle('on', t === tab); t.setAttribute('aria-selected', t === tab ? 'true' : 'false'); });
      tab.dataset.maptab === 'google' ? showGoogle() : showOwn();
    };
  });

  // Default view: the real map, because that is what was asked for. Offline, or
  // with no coordinates, the drawn map is what remains — and it always works.
  if (online() && googleMapURL({ farm: state.profile, target: row })) showGoogle();
  else showOwn();
  };

  // One section at a time — the whole point is a short sheet, not four open
  // panels. Opening one closes the rest; the rate section is never a section
  // that can close, so the headline number is always on screen.
  host.querySelectorAll('details.msacc').forEach(d => {
    d.addEventListener('toggle', () => {
      if (!d.open) return;
      host.querySelectorAll('details.msacc').forEach(o => { if (o !== d) o.open = false; });
      if (d.dataset.sec === 'map') buildMap();
    });
  });

  host.querySelectorAll('.msclose, .msclose2').forEach(b => b.onclick = close);
  host.querySelector('.msback').onclick = close;
  document.addEventListener('keydown', onKey);

  // slide in on the next frame so the transition is visible
  requestAnimationFrame(() => host.classList.add('in'));
  return { close };
}
