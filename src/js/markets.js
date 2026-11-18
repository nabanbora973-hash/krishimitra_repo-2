// Market comparison + earnings estimate.
// Data: prototype dataset (DEMO), structured like Agmarknet rows so the
// switch to a live feed is a data-source swap — not a rebuild.
import { state } from "./state.js";

// Farmer- and mandi-typed text must never be parsed as markup (live XSS test, 2026-11-08).
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A photo src is an attribute too: only http(s) and data:image may pass.
const safeSrc = u => /^(https?:|data:image\/)/i.test(String(u || '')) ? String(u) : '';

import { CROPS } from "./crops.js";
import { demoBadge, liveBadge, loadingHTML, errorHTML, rupees, rupees1, pct, toast } from "./ui.js";
import { getLivePrices, getMandiBoard, getPriceHistory, priceSourceLine, setLiveConfig } from "./live-prices.js";
import { directionsUrl, FAR_KM, roadDistanceTable } from "./geo.js";
import { reportFor, allReports, istToday } from "./mandi-feed.js";
import { mapLinks, driveTime } from "./map.js";
import { openMandiSheet, openMultiMandiSheet } from "./mandi-sheet.js";
import { loadOffer, saveOffer, clearOffer, compare as compareOffer, offerText,
         DEFAULT_OFFER } from "./wholesale.js";
import { shareText } from "./share.js";

// Last-resort per-km figure. It is only reached if costs.js cannot price the
// trip at all, and it is deliberately high enough to be noticed, not tuned to
// look good: a flat ₹1/km/qtl was a round number nobody could source and it
// understated a short trip badly (10 km on a Tata Ace is ₹75/qtl, not ₹10).
export const TRANSPORT_PER_KM_PER_QTL = 2;

// ONE place decides what a trip costs. Both the first render (straight-line
// distances) and the refined render (road distances) call this. They used to
// compute transport separately — compareMarkets priced a whole hired truck while
// refineWithRoadDistances kept setting transport = km — so the same row showed
// two different nets depending on whether the router had answered yet.
export function transportFor(km, quantityQtl, pickup = false){
  if (pickup) return 0;                                   // buyer comes to the farm
  if (km == null || !isFinite(km)) return null;           // unknown distance, no guess
  const fuelQtl = fuelPerQtl(km, quantityQtl);            // the farmer's own diesel, if given
  return fuelQtl ?? hirePerQtl(km, quantityQtl) ?? Math.round(km * TRANSPORT_PER_KM_PER_QTL);
}

// Fuel money for the trip — his pump rate × km there and back ÷ his km/l.
// Empty until he tells the app; no guessed diesel price is ever shown.
import { fuelLine, fuelStripHTML, wireFuelStrips, tripCost, getFuel, fuelPerQtl, fuelReady } from "./fuel.js";
import { orderRows } from "./order.js";
import { mspCardHTML, mspFor } from "./msp.js";
import { hirePerQtl, getCosts, transportBasisLabel, costsCardHTML, wireCostsCard } from "./costs.js";
import { animate } from "./motion.js";
import { speak, stopSpeaking, speakable } from "./voice.js";

// How far a smallholder will actually drive to sell. Beyond this the trip costs
// more in time and diesel than any price gap is worth — the farmer sells to the
// trader in the village instead. Anything past it stays visible in the table,
// but is never recommended as "the best market".
export const MAX_TRIP_KM = 150;

// A price is not a reason to drive. This is the gain, over the mandi next door,
// that has to be there before a longer trip makes sense — ₹60 a quintal is
// roughly the day's diesel and the risk of a lighter weighbridge reading.
// Inside CLOSE_KM the trip is short enough that the best price simply wins.
export const WORTH_GAIN_PER_QTL = 60;
export const CLOSE_KM = 25;
// …and the further it is, the more it has to pay: every extra kilometre has to
// bring at least this much per quintal, or the day is spent for nothing.
export const GAIN_PER_EXTRA_KM = 1.5;

export function tripIsWorthIt(row, nearest){
  if (!nearest || row.id === nearest.id) return true;
  const extraKm = Math.max(0, (row.distanceKm ?? 0) - (nearest.distanceKm ?? 0));
  if (row.distanceKm <= CLOSE_KM) return true;
  const need = Math.max(WORTH_GAIN_PER_QTL, extraKm * GAIN_PER_EXTRA_KM);
  return (row.netPerQtl - nearest.netPerQtl) >= need;
}

// The best market among the ones a farmer would realistically reach — and only
// if going past the nearest one actually pays for the extra distance.
export function bestMarket(rows){
  const ranked = (rows || []).filter(r => r.knownDistance && r.netPerQtl != null);
  if (!ranked.length) return null;
  const reachable = ranked.filter(r => r.distanceKm <= MAX_TRIP_KM);
  const pool = reachable.length ? reachable : ranked;

  const mandis = pool.filter(r => !r.pickup);
  const nearest = (mandis.length ? mandis : pool)
    .reduce((a, b) => (a.distanceKm <= b.distanceKm ? a : b));

  // Worth driving to: either it is one of the local options, or it beats the
  // nearest mandi by enough to pay for the road.
  const worthy = pool.filter(r => tripIsWorthIt(r, nearest));

  return worthy.reduce((a, b) => (b.netPerQtl > a.netPerQtl ? b : a));
}

// The mandi nearest to this farm — never the farm-gate row, which sits at 0 km
// by definition and would make every comparison flattering.
export function nearestMandi(rows){
  const m = (rows || []).filter(r => !r.pickup && r.knownDistance && r.distanceKm != null);
  return m.length ? m.reduce((a, b) => (a.distanceKm <= b.distanceKm ? a : b)) : null;
}

// Rupees per quintal that the recommended market earns over the one next door.
// This — not the gap against a village trader — is what justifies a drive.
export function tripGain(best, nearest){
  if (!best || !nearest || best.id === nearest.id) return 0;
  if (best.netPerQtl == null || nearest.netPerQtl == null) return 0;
  return Math.round(best.netPerQtl - nearest.netPerQtl);
}

let DATASET = null;

// ---------- distance from *this* farm, not from the demo farm ----------
// Each mandi carries coordinates. The dataset's distanceKm values were measured
// from Duliajan, so we calibrate a per-mandi road factor that reproduces those
// numbers exactly at Duliajan — and gives a different, honest answer anywhere else.
// Result: register a farm in Jorhat and the transport cost, net price, ranking and
// verdict all move. The demo farm's arithmetic stays byte-identical to the
// demo dataset — no value is tuned to look like a walkthrough video.
const REF = { lat: 27.3667, lng: 95.3167 };

function haversineKm(a, b){
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Road distance ≈ straight line + detours. In rural India the road is usually
// 20–30% longer than the crow-flies line; 1.25 is the conservative middle.
const ROAD_FACTOR = 1.25;

// Distance really travelled, measured from THIS farm to THIS mandi.
//
// Two earlier bugs lived here:
//   • the old code multiplied by `datasetDistance / straightLineFromDuliajan`,
//     so every market inherited Duliajan's numbers — a Nagaon farm and a
//     Duliajan farm read out identical distances.
//   • the seed distances themselves were impossible (Jorhat was listed as
//     30 km while the two towns are 130 km apart in a straight line).
// Coordinates are now the only source of truth; the dataset figure is a last
// resort for rows that carry no coordinates at all, and is never "calibrated".
export function distanceFromFarm(mandi, farm){
  // A farm-gate buyer collects in the farmer's own village: the distance is the
  // same wherever that village is. Anchoring it to a fixed point (Duliajan) is
  // what made a Nagaon farm read "Village trader · 3 km" — 300 km away.
  if (mandi.pickup) return FARM_GATE_KM;

  const hasCoords = mandi.lat != null && mandi.lng != null;
  if (!hasCoords) return mandi.distanceKm ?? null;
  if (!farm || farm.lat == null || farm.lng == null) return mandi.distanceKm ?? null;

  const road = Math.round(haversineKm(farm, mandi) * ROAD_FACTOR);
  return Math.max(1, road);   // a mandi in the same village still needs a figure
}



// The trader drives to the farm, so the farmer travels nowhere.
const FARM_GATE_KM = 0;

let BUNDLED = null;
export const __setDataset = d => { DATASET = d; };   // tests only                     // the bundled dataset never gets overwritten

// Government rows arrive with a mandi NAME and a district but no coordinates.
// The bundled dataset knows where each local mandi actually is, so we borrow
// the coordinates from there instead of dropping the market out of the ranking.
const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Every district of Assam with its main market town (src/data/assam-places.json).
let GAZETTEER = null;


export async function loadGazetteer(){
  if (GAZETTEER) return GAZETTEER;
  try {
    const r = await fetch('data/assam-places.json');
    GAZETTEER = r.ok ? (await r.json()).places || [] : [];
  } catch { GAZETTEER = []; }
  return GAZETTEER;
}

export function coordsFor(name, district){
  const n = norm(name), d = norm(district);
  // 1) a mandi we already know by name
  if (BUNDLED){
    const hit = BUNDLED.markets.find(m => {
      const mid = norm(m.id), mname = norm(m.name);
      if (mid === n || mname === n || (n && (n.includes(mid) || mid.includes(n)))) return true;
      return !!(d && norm(m.district) === d && n && (n.includes(mid) || mid.includes(n)));
    });
    if (hit && hit.lat != null) return { lat: hit.lat, lng: hit.lng, distanceKm: hit.distanceKm ?? null };
  }
  // 2) the district the government row reports — this is what makes a mandi
  //    anywhere in Assam placeable, even if we have never seen its name before
  if (GAZETTEER && d){
    const g = GAZETTEER.find(x => norm(x.district) === d || norm(x.town) === d || norm(x.town) === n);
    if (g) return { lat: g.lat, lng: g.lng, distanceKm: null, fromGazetteer: true };
  }
  return null;
}


// ---------------------------------------------------------------------------
//  BUNDLED + LIVE — merged, never replaced
// ---------------------------------------------------------------------------
//  Until now a live answer threw the bundled file away: DATASET = live.dataset.
//  The government feed carries only the mandis that reported THAT crop THAT day
//  (2 for cabbage, 15 vegetables in all), so a farmer comparing markets suddenly
//  saw two rows where the app holds forty — the other thirty-eight vanished
//  without a word. Now the bundled rows stay and the live rows win on top, and
//  every row that did not report today is marked `est` so nothing pretends to be
//  a government rate.
// The government feed and our bundled file spell the same mandi differently:
// "Tinsukia Market" there, "Tinsukia Mandi" here. Matching on the full string
// produced two rows for one gate — one wearing LIVE, one wearing "andaaza".
// So the comparison key drops the words that carry no identity, and a district
// has to agree when both sides have one.
const NAME_NOISE = new Set(['mandi', 'market', 'apmc', 'bazar', 'bazaar', 'daily', 'weekly',
                            'main', 'regulated', 'fancy', 'road', 'new', 'the']);
const stemOf = m => String(m && m.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  .trim().split(' ').filter(w => w && !NAME_NOISE.has(w)).join(' ');
const distOf = m => String(m && m.district || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function mergeDatasets(bundled, live, cropKey){
  if (!live || !Array.isArray(live.markets) || !live.markets.length) return bundled;
  if (!bundled || !Array.isArray(bundled.markets)) return live;

  const out = bundled.markets.map(m => ({ ...m }));
  const byStem = new Map();
  for (const m of out){
    const k = stemOf(m);
    if (!byStem.has(k)) byStem.set(k, []);
    byStem.get(k).push(m);
  }

  const used = new WeakSet();
  const added = [];
  for (const l of live.markets){
    const pool = byStem.get(stemOf(l)) || [];
    const hit = pool.find(b => !used.has(b) &&
      (!distOf(b) || !distOf(l) || distOf(b) === distOf(l)));
    if (hit){
      used.add(hit);
      // Read what we are about to overwrite BEFORE Object.assign does it — the
      // first version clobbered the bundled crop list with the live row's single
      // crop, so a merged mandi lost every crop except the one that reported.
      const keepName = hit.name, keepId = hit.id;
      const keepCrops = hit.crops || {};
      Object.assign(hit, l);
      hit.name = keepName || l.name;    // no second spelling for the same gate
      hit.id = keepId || l.id;
      hit.crops = { ...keepCrops, ...(l.crops || {}) };   // live wins per crop
      hit.live = l.live || null;
      hit.est = false;
    } else {
      added.push({ ...l, est: false });      // a mandi we did not know about
    }
  }

  for (const m of out){
    if (used.has(m)) continue;
    // Not in today's feed: keep it, but say so on the row itself.
    m.est = true;
    m.live = null;
  }

  return { ...live, markets: [...out, ...added] };
}

export async function loadDataset(){
  if (DATASET && BUNDLED) return DATASET;
  const r = await fetch("data/market-data.json");
  if (!r.ok) throw new Error('Could not load market dataset');
  const json = await r.json();
  if (!BUNDLED) BUNDLED = json;
  DATASET = DATASET && DATASET !== json ? DATASET : json;
  return DATASET;
}


// ---------------------------------------------------------------------------
//  WHOLESALE — the channel most smallholders actually use now
// ---------------------------------------------------------------------------
// Placed above the mandi table because that is the decision in front of the
// farmer: sack to the gate, or the trader's pickup at home. The card compares
// net rupees, not headline rupees, and prints the break-even rate to ask for.
function wholesaleCardHTML(cmp, cropLabel){
  const o = cmp.offer;
  const w = cmp.wholesale;
  const cash = (o.days || 0) > 0
    ? `Payment in <b>${o.days} days</b> — ₹${Math.round(w.creditCost).toLocaleString('en-IN')}/qtl is what waiting costs.`
    : 'Cash on the spot — no waiting cost.';
  return `
  <div class="card wsCard" id="wsCard">
    <div class="cardhead">
      <b>Selling wholesale instead?</b>
      <span class="chip demo">TRADER / BUYER</span>
    </div>
    <p class="sourcenote" style="margin:-4px 0 12px">
      A trader's rate is usually <b>lower</b> than the mandi board, but he picks up at your
      farm and cuts less. Type his offer — this works out what you actually keep.
    </p>

    <div class="wsform">
      <label>Buyer (optional)<input id="wsBuyer" type="text" value="${esc(o.buyer)}" placeholder="e.g. Rahman Traders, Nagaon"></label>
      <label>Rate offered ₹/quintal<input id="wsRate" type="number" inputmode="numeric" min="0" step="1" value="${o.rate || ''}" placeholder="e.g. 2000"></label>
      <label>Weighing cut (kaata) %<input id="wsKaata" type="number" min="0" step="0.1" value="${o.kaataPct}"></label>
      <label>Commission %<input id="wsComm" type="number" min="0" step="0.1" value="${o.commissionPct}"></label>
      <label>Hamali / loading ₹/qtl<input id="wsHamali" type="number" min="0" step="1" value="${o.hamaliPerQtl}"></label>
      <label>Payment after (days)<input id="wsDays" type="number" min="0" step="1" value="${o.days}"></label>
    </div>
    <label class="wscheck"><input id="wsPickup" type="checkbox" ${o.pickup ? 'checked' : ''}>
      Buyer picks up at my farm (no transport)</label>
    <label class="wscheck ${o.pickup ? 'hide' : ''}" id="wsKmWrap">Distance to buyer (km)
      <input id="wsKm" type="number" min="0" step="1" value="${o.km || ''}" placeholder="e.g. 8"></label>

    <div id="wsResult">${wholesaleResultHTML(cmp, cropLabel, cash)}</div>
  </div>`;
}

function wholesaleResultHTML(cmp, cropLabel, cash){
  const w = cmp.wholesale;
  if (!w.rate){
    return `<div class="wsEmpty">₹0 typed so far — the comparison appears as soon as you enter the buyer's rate.</div>`;
  }
  const ahead = cmp.verdict === 'wholesale';
  const same  = cmp.verdict === 'same';
  return `
    <div class="wscmp">
      <div class="wsbox">
        <div class="statlabel">Trader, net</div>
        <div class="stat ${ahead ? '' : 'orange'}">₹${Math.round(w.net).toLocaleString('en-IN')}<span class="statlabel"> /q</span></div>
        <div class="statlabel">${(cmp.qty ? Math.round(w.net * cmp.qty) : 0).toLocaleString('en-IN') ? `₹${Math.round(w.net * cmp.qty).toLocaleString('en-IN')} on ${cmp.qty} qtl` : ''}</div>
      </div>
      <div class="wsbox">
        <div class="statlabel">Best mandi, net</div>
        <div class="stat ${ahead || same ? 'orange' : ''}">₹${Math.round(cmp.mandiNet).toLocaleString('en-IN')}<span class="statlabel"> /q</span></div>
        <div class="statlabel">${cmp.mandiName || 'no mandi ranked'}</div>
      </div>
      <div class="wsbox wsverdict ${ahead ? 'win' : same ? 'tie' : 'lose'}">
        <div class="statlabel">${ahead ? 'BUYER WINS' : same ? 'TOO CLOSE TO CALL' : 'MANDI STILL PAYS MORE'}</div>
        <div class="wsdiff">${cmp.diffPerQtl >= 0 ? '+' : '−'}₹${Math.abs(Math.round(cmp.diffPerQtl)).toLocaleString('en-IN')}<span class="statlabel"> /q</span></div>
      </div>
    </div>

    <p class="wsline">${cmp.verdictText}</p>
    <p class="wsline wsbear"><b>${cmp.breakEvenText}</b></p>
    <table class="minitable wstable">
      <tr><td>Rate on the scale</td><td>₹${Math.round(w.rate).toLocaleString('en-IN')}</td></tr>
      <tr><td>− Weighing cut ${cmp.offer.kaataPct}%</td><td>−₹${Math.round(w.weighCut).toLocaleString('en-IN')}</td></tr>
      <tr><td>− Commission ${cmp.offer.commissionPct}%</td><td>−₹${Math.round(w.commissionCut).toLocaleString('en-IN')}</td></tr>
      <tr><td>− Hamali / loading</td><td>−₹${Math.round(w.hamali).toLocaleString('en-IN')}</td></tr>
      <tr><td>− Transport${cmp.offer.pickup ? ' (picked up)' : ''}</td><td>−₹${Math.round(w.freight).toLocaleString('en-IN')}</td></tr>
      <tr><td>− Cost of waiting ${cmp.offer.days || 0} days</td><td>−₹${Math.round(w.creditCost).toLocaleString('en-IN')}</td></tr>
      <tr class="wsnet"><td><b>You keep</b></td><td><b>₹${Math.round(w.net).toLocaleString('en-IN')}/qtl</b></td></tr>
    </table>
    <p class="statlabel" style="margin:6px 0 10px">${cash}</p>
    <div class="wsbtns">
      <button class="btn small" id="wsSave" type="button">Save this offer</button>
      <button class="btn ghost small" id="wsShare" type="button">📲 Send the numbers</button>
      <button class="btn ghost small" id="wsClear" type="button">Clear</button>
    </div>
    <p class="statlabel dim" style="margin-top:8px">Mandi side: the best net price in the table below — price minus transport. Nothing else is deducted, because in Assam the daily bazaar charges no commission.</p>`;
}

function currentOffer(){
  const num = id => { const el = document.getElementById(id); return el ? Number(el.value) || 0 : 0; };
  return {
    buyer: document.getElementById('wsBuyer')?.value.trim() || '',
    rate: num('wsRate'),
    kaataPct: num('wsKaata'),
    commissionPct: num('wsComm'),
    hamaliPerQtl: num('wsHamali'),
    days: num('wsDays'),
    pickup: !!document.getElementById('wsPickup')?.checked,
    km: num('wsKm')
  };
}

function wireWholesale(best, qty, cropLabel){
  const card = document.getElementById('wsCard');
  if (!card) return;
  const paint = () => {
    const offer = currentOffer();
    const kmWrap = document.getElementById('wsKmWrap');
    if (kmWrap) kmWrap.classList.toggle('hide', offer.pickup);
    const cmp = compareOffer(offer, { bestMarket: best, qty });
    const host = document.getElementById('wsResult');
    if (host) host.innerHTML = wholesaleResultHTML(cmp, cropLabel,
      (offer.days || 0) > 0
        ? `Payment in <b>${offer.days} days</b> — ₹${Math.round(cmp.wholesale.creditCost).toLocaleString('en-IN')}/qtl is what waiting costs.`
        : 'Cash on the spot — no waiting cost.');
    const save = document.getElementById('wsSave');
    if (save) save.onclick = () => {
      saveOffer(offer);
      toast('Wholesale offer saved — the verdict compares it on Sell decision');
      document.dispatchEvent(new CustomEvent('km:wholesale-changed'));
      save.textContent = 'Saved ✓';
    };
    const share = document.getElementById('wsShare');
    if (share) share.onclick = async () => {
      const text = offerText(cmp, { cropLabel, qty });
      if (!text) return toast('Type the rate first');
      const r = await shareText(text);
      if (r.how === 'cancelled') return;
    };
    const clear = document.getElementById('wsClear');
    if (clear) clear.onclick = () => {
      clearOffer();
      ['wsBuyer','wsRate','wsKaata','wsComm','wsHamali','wsDays','wsKm'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = id === 'wsKaata' ? 0.5 : '';
      });
      const pk = document.getElementById('wsPickup'); if (pk) pk.checked = true;
      paint();
      toast('Cleared');
    };
  };
  card.querySelectorAll('input').forEach(el => { el.oninput = paint; el.onchange = paint; });
  paint();
}

// Returns rows sorted by best NET realisation (price minus transport), per quintal.
state.mandiBoard = state.mandiBoard || null;

// The mandi board: what the markets around this farm are reporting right now —
// each market's own newest rate, whatever the crop. On a day when the chosen
// crop has one reporting mandi, this is the honest way to still show a farmer
// what his neighbourhood is doing, without inventing a single number.
export function mandiBoardHTML(){
  const rows = state.mandiBoard;
  const farm = state.profile || null;
  if (!Array.isArray(rows) || !rows.length) return '';
  const placed = rows.map(r => {
    const fix = coordsFor(r.market, r.district);
    const lat = fix ? fix.lat : null, lng = fix ? fix.lng : null;
    const km = (lat != null && lng != null) ? distanceFromFarm({ lat, lng }, farm) : null;
    return { ...r, km };
  }).filter(r => r.km != null).sort((a, b) => a.km - b.km);
  if (placed.length < 2) return '';

  // Show EVERY market the government feed published — not the six nearest. A
  // farmer who sees six and knows his district reports must not think the app is
  // broken. Six stay open, the rest are one tap away, and the header says how
  // many report at all against the 226 mandis Assam has on the register.
  const NEAR_KM = 150;
  const near = placed.filter(r => r.km <= NEAR_KM);
  // placed is already sorted by km, so the first six ARE the nearest six — even
  // when the 150 km ring holds only one or two of them. A board that opens with
  // a single row and 14 behind a button looks broken again.
  const first = placed.slice(0, 6);
  const rest  = placed.filter(r => !first.includes(r));

  const row = r => `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;
                  padding:10px 0;border-top:1px solid rgba(0,0,0,.07)">
        <div style="min-width:0">
          <b style="display:block;line-height:1.25">${r.market}</b>
          <div class="statlabel" style="margin-top:2px">${r.district || ''} · ${r.commodity}${r.variety && r.variety !== 'Other' && !String(r.commodity).toLowerCase().includes(String(r.variety).toLowerCase()) ? ' · ' + r.variety : ''}</div>
          <div class="statlabel">${r.arrival_date}${r.ageDays ? ` · ${r.ageDays} din purana` : ' · aaj'}</div>
        </div>
        <div style="text-align:right;white-space:nowrap">
          <b style="font-size:18px;color:var(--green)">${rupees(r.modal_price)}</b>
          <div class="statlabel">${r.km} km</div>
        </div>
      </div>`;

  return `<div class="card" style="margin-top:14px" id="mandiBoard">
    <div class="cardhead"><b>Aas-paas ka board</b>${liveBadge()}</div>
    <p class="sourcenote" style="margin:-4px 0 10px">
      Har mandi ka apna <b>sabse naya</b> rate — jo fasal wahan bik rahi hai wahi.
      Mahine ka purana rate nahi dikhaya jaata.</p>
    <!-- Two facts, stacked: a side-by-side strip wraps to three ragged lines on a
         390 px phone (measured), so the count gets the full width to itself. -->
    <div class="locstrip" style="margin-bottom:8px;padding:11px 14px;display:block">
      <div style="font-size:15.5px;line-height:1.35"><b>${placed.length} mandi</b>
        abhi rate bhej rahi hain</div>
      <div class="statlabel" style="margin-top:3px;font-size:13.5px">
        Assam me kul <b>226</b> registered mandi — sirf report karne wali dikhti hain</div>
    </div>
    ${first.map(row).join('')}
    <div id="boardRest" style="display:none">${rest.map(row).join('')}</div>
    ${rest.length ? `<button class="btn ghost small" id="boardMore" style="width:100%;margin-top:10px">
      Aur ${rest.length} mandi dekho →</button>` : ''}
    <div class="sourcenote" style="margin-top:10px">
      ${near.length >= 2
        ? 'Sabse nazdeek mandi pehle — 150 km ke andar.'
        : `Tumhare 150 km me sirf ${near.length || 'ek'} mandi hai, isliye poore Assam ka board dikha rahe hain — doori saath likhi hai.`}
      Sirf wahi mandi jinhone pichhle 3 hafte me rate bheja hai.</div>
  </div>`;
}

// market name (lower-case) → that mandi's own daily points from the relay
let RELAY_HIST = new Map();
function relayHistFor(name){
  const key = String(name || '').toLowerCase().trim();
  return RELAY_HIST.get(key) || [];
}

export function compareMarkets(cropKey, quantityQtl){
  RELAY_HIST = new Map();
  for (const m of (state.priceHistory?.markets || [])){
    const k = String(m.market || '').toLowerCase().trim();
    if (k && Array.isArray(m.points)) RELAY_HIST.set(k, m.points);
  }
  const farm = state.profile || null;      // the registered farm, not the demo farm
  const rows = DATASET.markets
    .filter(m => m.crops && m.crops[cropKey])
    .map(raw => {
      // Government rows carry no coordinates — get them from the bundled file.
      const fix = (raw.lat == null || raw.lng == null) ? coordsFor(raw.name, raw.district) : null;
      const m = fix ? { ...raw, lat: fix.lat, lng: fix.lng,
                        distanceKm: raw.distanceKm ?? fix.distanceKm } : raw;
      return m;
    })
    .map(m => {
      const c = m.crops[cropKey];
      // A rate posted by the mandi TODAY beats a bundled prototype figure and
      // is shown next to the government number, never disguised as it.
      const rep = m.pickup ? null : reportFor(m.name, cropKey, { mandiId: m.id });
      const price = rep ? rep.modal : c.today;
      // A real week from the government feed beats a device history that starts
      // the day the phone first opened the app.
      const relayPts = relayHistFor(m.name);
      const hist = relayPts.length > 1 ? relayPts.map(p => p.p) : (c.history || []);
      const trend = hist.length > 1 ? ((price - hist[hist.length - 1]) / hist[0]) * 100 : 0;
      // A mandi with no distance set cannot have a truthful transport cost —
      // keep it out of the net ranking instead of guessing.
      const km = distanceFromFarm(m, farm);
      const known = km != null && isFinite(km);
      const pickup = !!m.pickup;                       // farm-gate sale → no trip
      // Transport is one number, not two. If the farmer gave his diesel rate,
      // his own arithmetic wins over our flat per-km estimate.
      // Own diesel beats a hired truck (the farmer told us his pump price), so
      // fuel wins when it is known. Otherwise price the trip the way it is
      // actually paid: a whole truck, both ways, base fare included.
      const transport = known ? transportFor(km, quantityQtl, pickup) : null;
      const netPerQtl = known ? price - transport : null;
      return {
        id: m.id,
        // "Village trader · Kampur" — the buyer in THIS farmer's village, not a
        // fixed trader sitting in Duliajan regardless of where the farm is.
        name: pickup ? (state.coverage?.covered === false
                          ? `${m.name} (Assam only)`
                          : `${m.name} · ${state.profile?.village || 'your village'}`)
                     : m.name,
        district: m.district, live: m.live || null,
        // true ⇒ this mandi did not report today; the figure is the prototype
        // estimate, and the table says so on the row.
        est: !!m.est,
        reported: rep ? { modal: rep.modal, min: rep.min, max: rep.max,
                          mandiName: rep.mandiName, at: rep.at, note: rep.note,
                          reporter: rep.reporter, photo: rep.photo || null } : null,
        govPrice: rep ? c.today : null,
        distanceKm: km, knownDistance: known, pickup, lat: m.lat ?? null, lng: m.lng ?? null,
        reachable: pickup || (known && km != null && km <= MAX_TRIP_KM),
        price, hist, trend: hist.length > 1 ? trend : null,
        min: c.min ?? null, max: c.max ?? null,
        transport, netPerQtl,
        earnings: known ? netPerQtl * quantityQtl : null
      };
    })
    .sort((a, b) => (b.netPerQtl ?? -1) - (a.netPerQtl ?? -1));
  return rows;
}

// Nearest mandi in the dataset, straight from its coordinates. Used to decide
// coverage before anything is ranked, so the ranking can label itself correctly.
function nearestDatasetKm(cropKey, farm){
  if (!DATASET || !farm || farm.lat == null) return null;
  const kms = DATASET.markets
    .filter(m => !m.pickup && m.lat != null && m.crops && m.crops[cropKey])
    .map(m => distanceFromFarm(m, farm))
    .filter(km => km != null);
  return kms.length ? Math.min(...kms) : null;
}

const DEFAULT_CROP = "paddy";

export async function refreshMarkets(){
  try { delete state.marketsLoaded; } catch {}
  // A freshly created account has no season saved yet. Without a crop the feed
  // was never even called, and the banner said "government feed not connected"
  // as if the API were down. Fall back to the crop the app already shows, and
  // say so in the reason if there truly is nothing to ask for.
  const crop = state.season?.crop || state.profile?.crop || DEFAULT_CROP;
  const qty = state.season?.quantityQtl || 10;

  // The bundled file is also the coordinate table for government rows, so read
  // it first — even when the live feed ends up winning.
  try { await loadDataset(); } catch (e) { console.warn('Bundled dataset unavailable:', e.message); }
  await loadGazetteer();

  // 1) try the government feed (AGMARKNET via data.gov.in) — and in parallel
  //    ask what the mandis around this farm are reporting, so a crop with one
  //    reporting mandi still shows the neighbourhood board.
  let live = null;
  const boardP = getMandiBoard().catch(() => null);
  // Real multi-day series (the feed's own arrival dates) — fetched in parallel,
  // and harmless when it fails: the trend card simply does not appear.
  const histP = crop ? getPriceHistory(crop).catch(() => null) : Promise.resolve(null);
  if (crop){
    try { live = await getLivePrices(crop); }
    catch (e) { live = { dataset: null, source: null, error: e.message }; }
  }
  try {
    const b = await boardP;
    state.mandiBoard = (b && Array.isArray(b.records)) ? b.records : null;
  } catch { state.mandiBoard = null; }
  try {
    const h = await histP;
    state.priceHistory = (h && h.status === 'ok') ? h : null;
  } catch { state.priceHistory = null; }

  if (live?.dataset && live.dataset.markets.length){
    // Keep the bundled rows for mandis that did not report today, marked as
    // estimates — replacing them made 38 of 40 mandis disappear from the app.
    let bundled = null;
    try { bundled = await loadDataset(); } catch {}
    DATASET = mergeDatasets(bundled, live.dataset, crop);
    state.priceSource = {
      source: live.source, govDate: live.dataset.govDate,
      fromCache: live.fromCache, via: live.via || null, error: live.error || null,
      // Which day the board is reporting, and how old it is. On a Sunday this is
      // the whole story: mandis are shut, so the newest rate is Saturday's.
      day: live.day || null, dayName: live.dayName || null,
      ageDays: Number.isFinite(live.ageDays) ? live.ageDays : null,
      note: live.note || null,
      unknownDistance: live.dataset.unknownDistance || []
    };
  } else {
    // 2) bundled prototype dataset — clearly labelled DEMO
    await loadDataset();
    const reason = live?.error
      || (crop ? "the feed answered but no rows came back for this crop"
               : "no crop selected yet — set one under Season & Crop");
    state.priceSource = { source: "DEMO", error: reason, unknownDistance: [] };
  }

  // Is this farm anywhere near the prices we actually hold? Decide first —
  // the ranking below labels the farm-gate row from it.
  const nearestKm = crop ? nearestDatasetKm(crop, state.profile) : null;
  state.coverage = {
    nearestKm,
    // Unknown is not the same as far: if nothing could be measured (no crop yet,
    // no coordinates), say nothing rather than declare the farm out of coverage.
    covered: nearestKm == null ? true : nearestKm <= MAX_TRIP_KM
  };

  state.markets = crop ? compareMarkets(crop, qty) : [];
  // The ranking above uses straight-line × 1.25. Replace those estimates with
  // real road distances in the background — one routing request for every
  // mandi — and repaint when they land. Never awaited: the screen stays usable.
  refineWithRoadDistances(crop, qty).catch(() => {});
  // The feed has now answered, even if the answer was "nothing today". From here
  // an empty list is a fact to report, not a spinner to sit behind.
  state.marketsLoaded = true;
  return state.markets;
}

// ---------------------------------------------------------------------------
//  Real road distances (background refinement)
// ---------------------------------------------------------------------------
// A farmer in Nagaon and a farmer in Duliajan must not read the same numbers.
// When a farm has coordinates we ask a router for the actual driving distance
// to each mandi and swap the estimate out. Results are cached per farm so the
// demo is instant on every later tap, and a router failure changes nothing —
// the estimate stays and the screen keeps working.
const ROAD_CACHE_KEY = 'km_road_distances_v1';

export async function refineWithRoadDistances(crop, qty){
  const farm = state.profile;
  if (!crop || !farm || farm.lat == null || farm.lng == null) return;

  const rows = state.markets || [];
  const targets = rows.filter(r => !r.pickup && r.lat != null && r.lng != null);
  if (!targets.length) return;

  // Sorted ids: the rows get re-ranked after a refresh, and a cache key that
  // depends on display order would miss every time.
  const cacheKey = `${farm.lat.toFixed(2)},${farm.lng.toFixed(2)}|` +
                   targets.map(r => r.id).sort().join(',');
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(ROAD_CACHE_KEY) || '{}'); } catch {}

  let km = cache[cacheKey];
  if (!km){
    try {
      km = await roadDistanceTable(farm, targets.map(r => ({ lat: r.lat, lng: r.lng })));
    } catch (e) {
      km = null;                                 // router unavailable → keep estimates
    }
    if (!km) return;
    cache[cacheKey] = km;
    try { localStorage.setItem(ROAD_CACHE_KEY, JSON.stringify(cache)); } catch {}
  }

  let changed = false;
  targets.forEach((row, i) => {
    const real = km[i];
    if (real == null || real === row.distanceKm) return;
    row.distanceKm = real;
    row.transport  = transportFor(real, qty, row.pickup);
    row.netPerQtl  = row.price - row.transport;
    row.earnings   = row.netPerQtl * qty;
    row.roadRouted = true;
    changed = true;
  });
  if (!changed) return;

  state.markets = rows.slice().sort((a, b) => (b.netPerQtl ?? -1) - (a.netPerQtl ?? -1));
  document.dispatchEvent(new CustomEvent('km:distances'));
}

// The page a farm outside Assam gets: its own state, the real distance to the
// nearest market we do hold, and what to actually do instead.
function outOfAreaHTML(badge){
  const c = state.coverage || {};
  const km = c.nearestKm;
  return `
    <h2>Market Comparison ${badge}</h2>
    <div class="caveat" style="border-color:var(--red-50)">
      <b>Your farm is outside the area KrishiMitra covers.</b><br>
      We hold prices for <b>40 mandis across Assam</b> — and the nearest of them is <b>${km} km</b>
      away${km ? `, about ${Math.round(km / 45)} hours by road` : ''}. No farmer drives that far for a
      price difference, so there is nothing here worth recommending — not even the highest price.
    </div>
    <div class="card" style="margin-top:12px">
      <b style="color:var(--green)">What to do instead</b>
      <ul style="margin:10px 0 0 18px;padding:0;line-height:1.7">
        <li><b>Sell to a buyer in your own area.</b> A commission agent or trader who collects from
            your village costs you nothing in transport, and that is what KrishiMitra would compare
            against — if it had your state's prices.</li>
        <li><b>Check your local APMC / eNAM rate.</b> Ask for the rate at your nearest mandi gate;
            the decision rule is the same: <span class="dim">price − (distance × ₹1/qtl) − handling</span>.</li>
        <li><b>No Assam mandi is listed here.</b> You are not driving there, so putting it on screen
            would only waste your time.</li>
      </ul>
      <div class="dim" style="margin-top:10px">Adding another state is one data file — the ranking
        engine, the transport maths and the verdict do not change.</div>
    </div>
  `;
}

// What this row is worth as a drive, in the farmer's terms: rupees per quintal
// gained against the mandi next door. A row that pays ₹12 more for 94 km is
// labelled as exactly that, so nobody spends ₹100 of diesel on ₹3 of rice.
// Nothing to say until the farmer told us his pump's rate — then say the rupees.
// And nothing for a mandi he would never drive to: "Rs 11,160 aana-jaana" against
// a 480 km trip is noise, not information.
function fuelLineHTML(row, qty){
  if (row.pickup || row.reachable === false) return '';
  const km = row.distanceKm;
  if (km == null || km > MAX_TRIP_KM) return '';
  const line = fuelLine(km, qty);
  if (!line) return '';
  return `<div class="statlabel" style="color:var(--green-900);font-weight:600">${line}</div>`;
}

// ---------------------------------------------------------------- trend card
//  "Kab bechu?" is answered by direction, not by a single number. This draws the
//  government's own daily series: median price of the state's mandis per day.
//  When the series is one day long it says exactly that — no line is drawn.
function trendSpark(points, w = 320, h = 54){
  if (!points || points.length < 2) return '';
  const vals = points.map(p => p.p);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const xy = points.map((p, i) => [Math.round(i * step), Math.round(h - ((p.p - min) / span) * (h - 8) - 4)]);
  const line = xy.map(([x, y], i) => (i ? 'L' : 'M') + x + ' ' + y).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  const col = up ? '#0B4A2F' : '#A80E1F';
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${area}" fill="${col}" opacity=".08"/>
    <path class="spark-path" pathLength="1" d="${line}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>
    ${xy.map(([x, y], i) => i === xy.length - 1
      ? `<circle cx="${x}" cy="${y}" r="3.5" fill="${col}"/>` : '').join('')}
  </svg>`;
}

const ICON_SPEAK = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"
  style="vertical-align:-2px;margin-right:5px">
  <path d="M4 9.5h3l4-3.2v11.4L7 14.5H4z" fill="currentColor"/>
  <path d="M15.5 8.5a4.6 4.6 0 010 7M18 6a7.5 7.5 0 010 12" fill="none"
        stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;
const ICON_TICK = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"
  style="vertical-align:-2px;color:var(--green)"><path d="M4 12.5l5 5L20 6.5"
  fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_ROUTE = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"
  style="vertical-align:-2px;margin-right:4px"><path d="M4 19l6-14h4l6 14" fill="none"
  stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="19"
  r="1.6" fill="currentColor"/></svg>`;

const ICON_TREND = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
  style="vertical-align:-2px"><path d="M3 17l5-6 4 3 6-8" fill="none" stroke="currentColor"
  stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 6h4v4"
  fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;

const ICON_STOP = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
  style="vertical-align:-2px;margin-right:5px"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>`;

const ICON_CHART = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="vertical-align:-2px">
  <path d="M3 17l5-5 4 3 6-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M15 8h4v4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function trendCardHTML(){
  const h = state.priceHistory;
  const cropLabel = CROPS?.[state.season?.crop]?.label || state.season?.crop || 'fasal';
  if (!h) return '';
  const pts = h.state_series || [];
  if (pts.length < 2){
    return `<div class="card" style="margin-top:14px">
      <b style="color:var(--green)">${ICON_CHART} ${cropLabel} ka trend</b>
      <div class="statlabel" style="margin-top:6px">
        Abhi sirf <b>${pts.length || 0} tareekh</b> ka government data hai.
        Do din se trend banega — tab tak app jhooth nahi banayega.</div>
    </div>`;
  }
  const ch = h.change;
  const flat = ch && ch.abs === 0;
  const up = ch && ch.abs > 0;
  const col = flat ? '#586A5F' : (up ? '#0B4A2F' : '#A80E1F');
  const arrow = flat ? '→' : (up ? '▲' : '▼');
  return `<div class="card" style="margin-top:14px" id="trendCard">
    <b style="color:var(--green)">${ICON_CHART} ${cropLabel} ka trend</b>
    <div class="statlabel" style="margin-top:2px">${pts.length} tareekh · ${h.from} → ${h.to}</div>
    ${ch ? `<div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;margin-top:10px">
      <span style="font-size:28px;font-weight:800;color:${col};line-height:1.1">${arrow} ₹${Math.abs(ch.abs).toLocaleString('en-IN')}</span>
      <span style="font-size:15.5px;font-weight:800;color:${col}">${ch.pct > 0 ? '+' : ''}${ch.pct}%</span>
      <span class="statlabel">₹${ch.from.toLocaleString('en-IN')} → ₹${ch.to.toLocaleString('en-IN')} /qtl</span>
    </div>` : ''}
    <div style="margin-top:10px">${trendSpark(pts)}</div>
    <div class="statlabel" style="margin-top:8px">
      Har din ka <b>median</b> — jitni mandiyan us din report kar rahi thin. AGMARKNET (Govt of India).
    </div>
  </div>`;
}

// The table read aloud, in one breath. Same numbers, same order — only spoken.
export function boardSpeech(rows, qty){
  const top = (rows || []).filter(r => r.knownDistance && r.price).slice(0, 3);
  if (!top.length) return '';
  const f = getFuel();
  const bits = top.map((r, i) => {
    const where = i === 0 ? 'Sabse zyada' : 'Phir';
    const cost = f.rate ? tripCost(r.distanceKm, f) : null;
    return `${where} ${r.name}: ${Math.round(r.price)} rupaye quintal, ${Math.round(r.distanceKm)} kilometer` +
           (cost != null ? `, safar ${cost} rupaye` : '');
  });
  return speakable(`${bits.join('. ')}. ` + (qty ? `Aapke ${qty} quintal par hisaab dekho table me.` : ''));
}

function tripNote(r, nearest){
  if (r.pickup || !nearest || r.id === nearest.id) return '';
  if (r.reachable === false)
    return '<div class="statlabel" style="color:var(--red)">too far to be worth the trip</div>';
  const gain = Math.round(r.netPerQtl - nearest.netPerQtl);
  if (r.distanceKm <= CLOSE_KM)
    return `<div class="statlabel" style="color:var(--green)">close by · +${rupees(gain)}/qtl vs nearest</div>`;
  const extraKm = Math.max(0, r.distanceKm - (nearest.distanceKm ?? 0));
  const need = Math.max(WORTH_GAIN_PER_QTL, extraKm * GAIN_PER_EXTRA_KM);
  if (gain < need)
    return `<div class="statlabel" style="color:var(--red)">only +${rupees(gain)}/qtl for ${r.distanceKm} km — not worth the drive</div>`;
  return `<div class="statlabel" style="color:var(--green)">+${rupees(gain)}/qtl over your nearest mandi</div>`;
}


// Which panel is open. Remembered across renders (a posted rate must not throw
// the farmer back to the first tab), reset to the price panel on a fresh visit
// only when it has never been touched.
let MKT_SEC = 'rate';
const MKT_TABS = [
  { id: 'rate',  label: 'Rate & hisaab' },
  { id: 'board', label: 'Board', count: '' },   // count filled at render time
  { id: 'trend', label: 'Trend' },
  { id: 'msp',   label: 'MSP' },
  { id: 'tel',   label: 'Tel' },
];

// Draw our own icon: 🗺 renders as an empty box on several Android builds.
const ICON_ALLMAP = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="vertical-align:-2px;margin-right:5px">
  <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
  <path d="M9 4v13.5M15 6.5V20" stroke="currentColor" stroke-width="1.2" stroke-opacity=".6"/></svg>`;

export function renderMarkets(){
  const v = document.getElementById('view-markets');
  if (!state.season){
    v.innerHTML = `<h2>Market Comparison</h2>
      <div class="empty">Set this season's crop first — then markets will be compared for it.<br><br>
      <span class="caveat" style="display:inline-block">Go to <b>Season &amp; Crop</b> to add it.</span></div>`;
    return;
  }

  const src = state.priceSource || {};
  const isLive = src.source === 'LIVE' || src.source === 'LAST KNOWN';
  const badge  = src.source === 'LIVE' ? liveBadge() : demoBadge();
  const qty  = state.season?.quantityQtl || 10;
  const rows = state.markets || [];
  const ranked = rows.filter(r => r.knownDistance);
  const unranked = rows.filter(r => !r.knownDistance);
  // The relay lists markets it could not place on the map, but this app often
  // finds coordinates for them anyway (bundled table / same name, other district).
  // Warning about a mandi that IS ranked (21 km, 33 min) reads like a bug — so
  // only keep the ones that truly ended up unranked.
  const extra = (src.unknownDistance || []).filter(m =>
    !state.markets.some(r => r.knownDistance && String(r.name).toLowerCase().startsWith(String(m.name).toLowerCase())));

  if (!rows.length && !extra.length){
    // "Loading…" used to stay on screen forever when the feed answered with
    // nothing (quota spent, no signal, a slow mandi server). A farmer reading a
    // permanent spinner cannot tell "wait" from "gone", so after the first
    // attempt this becomes a real empty state with something to press.
    const busy = !state.marketsLoaded;
    v.innerHTML = `<h2>Market Comparison ${badge}</h2>` + (busy
      ? `<div class="skel"><div class="skelrow"></div><div class="skelrow"></div><div class="skelrow"></div></div>`
      : `<div class="empty">
           <b style="display:block;font-size:18px;color:var(--green);margin-bottom:6px">Aaj ka rate nahi mila</b>
           Mandi ka rate abhi server se nahi aaya. Aapka apna data safe hai — bas rate list
           khali hai.<br><br>
           <button class="btn small" id="btnRetryMarkets">Dobara try karo</button>
         </div>`);
    const btn = document.getElementById('btnRetryMarkets');
    if (btn) btn.onclick = () => {
      state.marketsLoaded = false;
      renderMarkets();
      refreshMarkets().then(() => renderMarkets()).catch(() => renderMarkets());
    };
    return;
  }

  // A farmer in Jaipur is not driving to Jorhat, so do not put 40 Assam mandis
  // in front of him. One honest page, with the list folded away at the bottom.
  if (state.coverage && state.coverage.covered === false){
    v.innerHTML = outOfAreaHTML(badge);
    return;
  }

  const best    = bestMarket(ranked);
  // One order only: biggest take-home first. The "Nearest first / Best net first"
  // pair is gone — on a normal day this table holds one or two mandis (only they
  // report THIS crop), so two buttons could never visibly do anything, and a
  // control that looks broken is worse than no control. Distance is printed on
  // every row, and a far mandi sinks on its own because the trip eats the price.
  const ordered = orderRows(ranked, 'net');
  // "Closest mandi" must be an actual mandi. The farm-gate trader sits at 0 km
  // by definition, so including it here would hide how far the nearest real
  // market is — and would silence the "these markets are not local" warning.
  const mandis  = ranked.filter(r => !r.pickup);
  const nearest = (mandis.length ? mandis : ranked)
                    .reduce((a, b) => (a.distanceKm < b.distanceKm ? a : b));
  const from    = state.profile?.lat != null ? { lat: state.profile.lat, lng: state.profile.lng } : null;
  const reachableCount = ranked.filter(r => r.reachable).length;
  const tooFar  = nearest && nearest.distanceKm > MAX_TRIP_KM;
  // Extra = take-home at the best mandi MINUS take-home next door. The old line
  // subtracted only the best mandi's freight, so when the best mandi was also
  // the nearest one it printed minus its own transport (that -64 in the screenshot).
  const gainPerQtl = best ? Math.round((best.price - (best.transport || 0)) -
                                       (nearest.price - (nearest.transport || 0))) : 0;
  const gainTotal  = gainPerQtl * qty;
  const maxPrice   = Math.max(...rows.map(r => r.price));
  // 40 bars with 40 labels on a phone is a smear, not a chart. Show the twelve
  // mandis a farmer could actually reach today, and say so.
  const chartRows  = rows.slice()
    .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9)).slice(0, 12);

  v.innerHTML = `
    <h2>Market Comparison ${badge}</h2>
    <p class="sub">Which market pays you the most, after transport — for <b>${qty} quintals</b> this season.</p>
    <button class="btn ghost small" id="speakBoard" style="margin:-6px 0 12px">${ICON_SPEAK}Suno — board padho</button>
    <!-- div, not p: priceSourceLine() contains a <details>, and a block element
         inside <p> makes the browser close the paragraph early — which dropped
         the line below it on top of this one. -->
    <div class="sourcenote" style="margin:-6px 0 12px">${priceSourceLine()}</div>

    <div class="mktabs" role="tablist">
      ${MKT_TABS.map(t => {
        const n = t.id === 'board' ? (state.mandiBoard || []).length : null;
        return `<button class="mktab ${MKT_SEC === t.id ? 'on' : ''}" role="tab"
        aria-selected="${MKT_SEC === t.id}" data-sec="${t.id}">${t.label}${n ? ` <span class="tabcount">${n}</span>` : ''}</button>`;
      }).join('')}
    </div>

    <section class="msec" data-sec="rate" ${MKT_SEC === 'rate' ? '' : 'hidden'}>
    ${nearest ? `<div class="locstrip">
      <div><span class="statlabel">Closest mandi</span><br>
        <b>${nearest.name}</b> · ${nearest.distanceKm} km</div>
      <div><span class="statlabel">Best price here</span><br>
        <b>${rupees(nearest.price)}</b></div>
      <div><span class="statlabel">Best net price</span><br>
        <b>${best.name}</b> · ${rupees(best.netPerQtl)}/qtl</div>
      ${from ? `<a class="btn ghost small" target="_blank" rel="noopener"
         href="${directionsUrl(from, nearest)}">${ICON_ROUTE} Directions to ${nearest.name}</a>` : ''}
      <button class="btn small" type="button" data-allmap>${ICON_ALLMAP} Saari mandiyaan ek naksha par</button>
    </div>` : ''}


    ${best ? `
    <!-- A mandi 480 km away is still "the best net price" arithmetically, but
         printing it as a headline reads like advice to drive there. When the
         winner is past MAX_TRIP_KM the cards say so instead of cheerleading. -->
    <div class="grid3">
      <div class="card"><div class="statlabel">Best net price${best.distanceKm > MAX_TRIP_KM ? ' — par door hai' : ''}</div>
        <div class="stat">${rupees(best.netPerQtl)}<span class="statlabel"> /q</span></div>
        <div class="chip demo" style="margin-left:0">${best.name} · ${best.distanceKm} km</div>
        ${best.distanceKm > MAX_TRIP_KM ? `<div class="statlabel" style="color:var(--red);margin-top:4px">${best.distanceKm} km — itni door jaana theek nahi. Nikat ki mandi ka rate dekho.</div>` : ''}</div>
      <div class="card"><div class="statlabel">Extra vs nearest market</div>
        <div class="stat ${gainPerQtl >= 0 ? '' : 'orange'}">${gainPerQtl >= 0 ? '+' : ''}${rupees(gainPerQtl)}<span class="statlabel"> /q</span></div>
        <div class="statlabel">≈ <b>${rupees(gainTotal)}</b> on your harvest</div></div>
      <div class="card"><div class="statlabel">Estimated earnings (best net)</div>
        ${best.distanceKm > MAX_TRIP_KM
          ? `<div class="stat dim">—</div><div class="statlabel">safar ke baad kuch nahi bachta</div>`
          : `<div class="stat orange">${rupees(best.earnings)}</div>
             <div class="statlabel">at ${best.name}, after transport</div>`}</div>
    </div>` : ''}

    <div class="card" style="margin-top:14px">
      <div class="cardhead">
        <b>${ranked.length > 1 ? `All ${ranked.length} mandis`
              : ranked.length === 1 ? '1 mandi is fasal ka rate de rahi hai'
              : 'No mandi with a distance yet'}</b>

      </div>
      <p class="sourcenote" style="margin:-4px 0 10px">
        Sabse zyada haath me aane wale daam se — <b>rate me se safar ka kharcha nikaal ke</b>,
        ${qty} quintal ke hisaab se. Door ki mandi neeche apne aap chali jaati hai, kyunki
        uska kiraya daam kha jaata hai.
      </p>
      ${(() => {
          const t = ordered.length, e = ordered.filter(r => r.est).length;
          if (!e) return '';
          return t > e
            ? `<div class="sourcenote estnote">Inme <b>${t - e}</b> mandi ne aaj rate report kiya.
                 Baaki <b>${e}</b> par <span class="chip est">aaj report nahi</span> likha hai —
                 unka number prototype andaaza hai, sarkari rate nahi.</div>`
            : `<div class="sourcenote estnote">Aaj kisi bhi mandi ne is fasal ka rate report nahi kiya —
                 saare number prototype andaaze hain.</div>`;
        })()}
      <div class="tablewrap">
        <table>
          <tr><th>Market</th><th>Distance</th><th>Price ₹/qtl</th><th>Recent trend</th><th>Net ₹/qtl <span class="statlabel">(rate − safar)</span></th><th>Est. total</th></tr>
          ${ordered.map(r => `
            <tr class="${best && r.id === best.id ? 'best' : ''}">
              <td><b><button type="button" class="mandiname" data-ms="${r.name.replace(/"/g, '&quot;')}"
                  title="Map aur poori detail kholo">${esc(r.name)}</button></b>${best && r.id === best.id ? ' ' + ICON_TICK : ''}
                ${r.reported ? '<span class="chip reported">REPORTED</span>' : ''}
                ${r.est ? '<span class="chip est" title="Aaj is mandi ne rate report nahi kiya — ye andaaza hai">aaj report nahi</span>' : ''}
                ${r.district ? `<div class="statlabel">${esc(r.district)}${r.live?.variety ? ' · ' + esc(r.live.variety) : ''}${r.live?.grade ? ' · ' + esc(r.live.grade) : ''}</div>` : ''}
                ${r.reported ? `<div class="statlabel dim">posted by the mandi${r.reported.note ? ' · “' + esc(r.reported.note) + '”' : ''}</div>` : ''}
                ${r.reported?.photo ? `<img class="proofthumb" src="${esc(safeSrc(r.reported.photo))}" alt="mandi board photo" loading="lazy">` : ''}
                ${r.reported && r.govPrice && r.govPrice !== r.reported.modal
                  ? `<div class="statlabel dim">government figure ${rupees(r.govPrice)}</div>` : ''}</td>
              <td data-l="Doori">${r.distanceKm} km
                <span class="dim" style="font-size:12px">· ${driveTime(r.distanceKm) || ''}</span>
                ${fuelLineHTML(r, qty)}
                ${mapLinks(r, { farm: from, sheet: true })}
                ${best && r.id === best.id ? '' : tripNote(r, nearest)}
              </td>
              <td data-l="Rate ₹/qtl">${rupees(r.price)}${r.reported && r.reported.min && r.reported.max
                    ? `<div class="statlabel">${rupees(r.reported.min)}–${rupees(r.reported.max)}</div>`
                    : (r.min && r.max ? `<div class="statlabel">${rupees(r.min)}–${rupees(r.max)}</div>` : '')}</td>
              <td data-l="Trend" class="${r.trend == null ? 'dim' : (r.trend >= 0 ? 'pos' : 'neg')}">${r.trend == null ? '—' : pct(r.trend)}
                <button type="button" class="trendlink" data-trend="${r.name.replace(/"/g, '&quot;')}"
                        title="Open this mandi's price trend">${ICON_TREND}</button></td>
              <!-- No separate "Transport" column: on a phone it was a bare "− ₹64"
                   that read like a loss. The trip cost sits inside the sum it
                   belongs to, and a mandi too far to drive shows no fake net. -->
              <td data-l="Net ₹/qtl" class="pos">${r.reachable === false
                ? `<span class="dim">—</span><div class="statlabel" style="color:var(--red)">itna door — jaana nahi</div>`
                : `${rupees(r.netPerQtl)}
                   <div class="statlabel" style="color:${fuelReady() ? '#0B4A2F' : '#6E3F0B'};white-space:nowrap">
                     ${r.pickup ? 'farm-gate · safar nahi'
                                : `${rupees(r.price)} − ${rupees(r.transport)} ${fuelReady() ? 'tel' : 'andaaza'}`}
                   </div>
                   ${!r.pickup && !fuelReady() ? '<div class="statlabel" style="font-size:12px">apna diesel rate daalo — asli kharcha</div>' : ''}`}
              </td>
              <td data-l="Aay (₹)">${r.reachable === false ? '<span class="dim">—</span>' : rupees(r.earnings)}</td>
            </tr>`).join('')}
          ${unranked.map(r => `
            <tr>
              <td><b>${r.name}</b>${r.district ? `<div class="statlabel">${r.district}</div>` : ''}</td>
              <td data-l="Doori" class="dim">not set</td>
              <td data-l="Rate ₹/qtl">${rupees(r.price)}</td>
              <td class="${r.trend == null ? 'dim' : (r.trend >= 0 ? 'pos' : 'neg')}">${r.trend == null ? '—' : pct(r.trend)}
                <button type="button" class="trendlink" data-trend="${r.name.replace(/"/g, '&quot;')}"
                        title="Open this mandi's price trend">${ICON_TREND}</button></td>
              <td class="dim">—</td><td class="dim">—</td>
            </tr>`).join('')}
        </table>
      </div>
    ${wholesaleCardHTML(compareOffer(loadOffer() || DEFAULT_OFFER,
        { bestMarket: best, qty: state.season?.quantityQtl || 0 }),
        CROPS?.[state.season?.crop]?.label || state.season?.crop || 'your crop')}

    ${tooFar ? `<div class="caveat" style="border-color:var(--red-50)">
      <b>No mandi in our data is within ${MAX_TRIP_KM} km of this farm.</b>
      The nearest known mandi is <b>${nearest.distanceKm} km</b> away — that is not a trip worth making
      for a price difference, and we will not recommend it. Your realistic option is the buyer
      who comes to the village.<br>
      <span class="dim">Our price data covers Assam; a farm outside Assam will see distances like this.</span>
    </div>` : ''}

    ${!reachableCount && !best ? `<div class="caveat" style="border-color:var(--red-50)">
      Nothing is close enough to rank — sell at the farm gate, or open
      <b>Farm Profile</b> and set the correct location.
    </div>` : ''}

      ${extra.length ? `<div class="caveat">⚠️ <b>${extra.length}</b> reporting mandi${extra.length > 1 ? 's' : ''}
        (${extra.map(m => m.name).join(', ')}) ${extra.length > 1 ? 'have' : 'has'} no distance set, so
        ${extra.length > 1 ? 'they are' : 'it is'} shown but not ranked. Add the distance in
        <code>js/config.js → mandiDistances</code> to compare net of transport — the app will not guess a cost.</div>` : ''}

      <div class="caveat">${isLive
        ? `Prices: <b>AGMARKNET</b> daily market prices (Ministry of Agriculture &amp; Farmers Welfare, Govt of India)
           released on data.gov.in — modal (most-traded) price per quintal, as reported
           <b>${src.govDate || '—'}</b>. ${src.source === 'LAST KNOWN' ? 'The feed was unreachable just now, so this is the last figure this device saw. ' : ''}
           Transport uses the distances you set in <code>js/config.js</code>; storage cost is an estimate.
           Trends build as KrishiMitra records the government price each day.`
        : `Prototype dataset — <b>illustrative figures, not live market data</b>. The app switches to real
           AGMARKNET prices from data.gov.in as soon as the government feed is reachable (see the
           "Where these numbers come from" card on the Dashboard).`}</div>
      <div class="sourcenote">Safar ka hisaab: ${transportBasisLabel()}${qty ? ` · ${qty} quintals is season` : ''}.
        Number badalna ho to <b>Tel</b> tab kholo.</div>

    </section>

    <section class="msec" data-sec="board" ${MKT_SEC === 'board' ? '' : 'hidden'}>
      ${mandiBoardHTML()}

    </section>

    <section class="msec" data-sec="trend" ${MKT_SEC === 'trend' ? '' : 'hidden'}>
    ${trendCardHTML()}

      ${chartRows.length < 2 ? `<div class="caveat" style="margin-top:14px">
        Is waqt sirf <b>${chartRows.length || 'koi'} mandi</b> is fasal ka rate report kar rahi hai.
        Comparison tab banta hai jab do ya zyada mandi rate bhejein — isliye chart nahi dikha rahe.</div>`
      : `<div class="statlabel" style="margin-top:16px">Quote at your ${chartRows.length} nearest mandis</div>
      <div class="bars">
        ${chartRows.map(r => `
          <div class="bar">
            <div class="val">₹${r.price}</div>
            <div class="fill ${best && r.id === best.id ? 'bestf' : ''}" style="height:${Math.round((r.price / maxPrice) * 92)}px"></div>
            <div class="lbl" title="${esc(r.name)}">${esc(r.name.replace(/ (Mandi|Bazaar|Market|Weekly Haat)$/, ''))}</div>
          </div>`).join('')}
      </div>`}

    </section>

    <section class="msec" data-sec="msp" ${MKT_SEC === 'msp' ? '' : 'hidden'}>
    ${mspCardHTML(state.season?.crop, best, rupees)}

    </section>

    <section class="msec" data-sec="tel" ${MKT_SEC === 'tel' ? '' : 'hidden'}>
    ${fuelStripHTML()}

    <p class="sourcenote" style="margin:-10px 0 12px">Distances measured from
      <b>${esc(state.profile?.village || 'Duliajan')}</b>${state.profile?.lat != null
        ? (state.profile.locationSource === 'gps' ? ' (your GPS position)' : ' (your registered farm)')
        : ' (demo farm — register yours, or tap 📡 Use GPS)'}.</p>

    ${costsCardHTML(rupees)}
    </section>`;

  // One tab at a time. The panels are already in the DOM, so this only flips a
  // hidden attribute — no re-render, no refetch, nothing to wait for.
  v.querySelectorAll('.mktab[data-sec]').forEach(btn => {
    btn.onclick = () => {
      MKT_SEC = btn.dataset.sec;
      v.querySelectorAll('.mktab[data-sec]').forEach(b => {
        const on = b.dataset.sec === MKT_SEC;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', String(on));
      });
      v.querySelectorAll('.msec').forEach(sec => { sec.hidden = sec.dataset.sec !== MKT_SEC; });
      // The panel lands instead of blinking in: 8 px slide + fade, 220 ms.
      const opened = v.querySelector('.msec:not([hidden])');
      if (opened) animate(opened.querySelectorAll('.card, table tr'), {
        from: { opacity: 0, translateY: 8 }, opacity: 1, translateY: 0,
        duration: 220, easing: 'outCubic', stagger: 18,
      });
      // A tab is a fresh screen: start it at the top, under the tab strip.
      const bar = v.querySelector('.mktabs');
      if (bar) window.scrollTo({ top: bar.getBoundingClientRect().top + window.scrollY - 8, behavior: 'smooth' });
    };
  });

  // The board lists every market; the extra ones open on one tap.
  const more = document.getElementById('boardMore');
  if (more) more.onclick = () => {
    const restEl = document.getElementById('boardRest');
    if (!restEl) return;
    const open = restEl.style.display !== 'none';
    restEl.style.display = open ? 'none' : 'block';
    if (open) more.textContent = more.dataset.label || 'Aur mandi dekho →';
    else more.textContent = 'Chhupao −';
  };

  // Speech: one tap reads the top three markets. Tap again to stop.
  const spk = document.getElementById('speakBoard');
  if (spk) spk.onclick = () => {
    const text = boardSpeech(ranked, qty);
    if (!text) return;
    if (spk.dataset.on === '1'){ stopSpeaking(); spk.dataset.on = '0'; spk.innerHTML = ICON_SPEAK + 'Suno — board padho'; return; }
    const r = speak(text);
    if (r.ok){ spk.dataset.on = '1'; spk.innerHTML = ICON_STOP + 'Roko'; }
  };

  // Fuel: the moment he picks a rate or a mileage, every row repaints with the
  // rupees it costs to drive there.
  // Fuel: picking a pump rate must re-ADD every row, not just re-label it.
  // renderMarkets() paints from state.markets, which was built with whatever
  // diesel rate existed at load time — so without this recompute the row said
  // "tel" while still showing the flat ₹1/km guess. That was the farmer's exact
  // complaint: "petrol price daala, phir bhi kuch nahi badla".
  // Costs the farmer edits (kiraya, storage) repaint exactly like the diesel box:
  // recompute every row, then render. A number typed here must move the rupee
  // on screen before the farmer leaves the card.
  wireCostsCard(() => {
    const crop = state.season?.crop || state.profile?.crop || DEFAULT_CROP;
    const qty  = state.season?.quantityQtl || 10;
    if (crop) state.markets = compareMarkets(crop, qty);
    renderMarkets();
  });

  wireFuelStrips(() => {
    const crop = state.season?.crop || state.profile?.crop || DEFAULT_CROP;
    const qty  = state.season?.quantityQtl || 10;
    if (crop) state.markets = compareMarkets(crop, qty);
    renderMarkets();
  });

  // Straight from a row into that mandi's own 30-day line.
  wireWholesale(best, qty, CROPS?.[state.season?.crop]?.label || state.season?.crop || 'your crop');

  // One tap on a mandi name or its pin opens the sheet — map and every number,
  // without leaving the app.
  v.querySelectorAll('[data-ms]').forEach(b => {
    b.onclick = () => openMandiSheet(b.dataset.ms);
  });

  // All mandis at once: one map, ranked pins, one multi-stop route.
  v.querySelectorAll('[data-allmap]').forEach(b => {
    b.onclick = () => openMultiMandiSheet(state.markets);
  });

  v.querySelectorAll('.trendlink').forEach(b => {
    b.onclick = () => {
      if (window.kmOpenTrend) return window.kmOpenTrend(b.dataset.trend);
      document.querySelector('[data-view="sell"]')?.click();
    };
  });
}
