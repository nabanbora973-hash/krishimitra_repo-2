// Market comparison + earnings estimate.
// Data: prototype dataset (DEMO), structured like Agmarknet rows so the
// switch to a live feed is a data-source swap — not a rebuild.
import { state } from "./state.js";
import { demoBadge, liveBadge, loadingHTML, errorHTML, rupees, rupees1, pct } from "./ui.js";
import { getLivePrices, priceSourceLine, setLiveConfig } from "./live-prices.js";

// ₹ per km per quintal — the transport assumption in the deck's model (₹25 for 25 km).
export const TRANSPORT_PER_KM_PER_QTL = 1;

let DATASET = null;

export async function loadDataset(){
  if (DATASET) return DATASET;
  const r = await fetch("data/market-data.json");
  if (!r.ok) throw new Error('Could not load market dataset');
  DATASET = await r.json();
  return DATASET;
}

// Returns rows sorted by best NET realisation (price minus transport), per quintal.
export function compareMarkets(cropKey, quantityQtl){
  const rows = DATASET.markets
    .filter(m => m.crops && m.crops[cropKey])
    .map(m => {
      const c = m.crops[cropKey];
      const price = c.today;
      const hist = c.history || [];
      const trend = hist.length > 1 ? ((price - hist[0]) / hist[0]) * 100 : 0;  // null-rendered when <2 points
      // A mandi with no distance set cannot have a truthful transport cost —
      // keep it out of the net ranking instead of guessing.
      const known = m.distanceKm != null && isFinite(m.distanceKm);
      const pickup = !!m.pickup;                       // farm-gate sale → no trip
      const transport = known ? (pickup ? 0 : Math.round(m.distanceKm * TRANSPORT_PER_KM_PER_QTL)) : null;
      const netPerQtl = known ? price - transport : null;
      return {
        id: m.id, name: m.name, district: m.district, live: m.live || null,
        distanceKm: m.distanceKm, knownDistance: known, pickup,
        price, hist, trend: hist.length > 1 ? trend : null,
        min: c.min ?? null, max: c.max ?? null,
        transport, netPerQtl,
        earnings: known ? netPerQtl * quantityQtl : null
      };
    })
    .sort((a, b) => (b.netPerQtl ?? -1) - (a.netPerQtl ?? -1));
  return rows;
}

export async function refreshMarkets(){
  const crop = state.season?.crop;
  const qty = state.season?.quantityQtl || 10;

  // 1) try the government feed (AGMARKNET via data.gov.in)
  let live = null;
  if (crop){
    try { live = await getLivePrices(crop); }
    catch (e) { live = { dataset: null, source: null, error: e.message }; }
  }

  if (live?.dataset && live.dataset.markets.length){
    DATASET = live.dataset;
    state.priceSource = {
      source: live.source, govDate: live.dataset.govDate,
      fromCache: live.fromCache, via: live.via || null, error: live.error || null,
      unknownDistance: live.dataset.unknownDistance || []
    };
  } else {
    // 2) bundled prototype dataset — clearly labelled DEMO
    await loadDataset();
    state.priceSource = { source: "DEMO", error: live?.error || null, unknownDistance: [] };
  }

  state.markets = crop ? compareMarkets(crop, qty) : [];
  return state.markets;
}

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
  const extra = src.unknownDistance || [];

  if (!rows.length && !extra.length){
    v.innerHTML = `<h2>Market Comparison ${badge}</h2>${loadingHTML()}`;
    return;
  }

  const best    = ranked[0];
  const nearest = ranked.reduce((a, b) => (a.distanceKm < b.distanceKm ? a : b), ranked[0]);
  const gainPerQtl = best ? Math.round((best.price - nearest.price) - best.transport) : 0;
  const gainTotal  = gainPerQtl * qty;
  const maxPrice   = Math.max(...rows.map(r => r.price));

  v.innerHTML = `
    <h2>Market Comparison ${badge}</h2>
    <p class="sub">Which market pays you the most, after transport — for <b>${qty} quintals</b> this season.</p>
    <p class="sourcenote" style="margin:-6px 0 12px">${priceSourceLine()}</p>

    ${best ? `
    <div class="grid3">
      <div class="card"><div class="statlabel">Best net price</div>
        <div class="stat">${rupees(best.netPerQtl)}<span class="statlabel"> /q</span></div>
        <div class="chip demo" style="margin-left:0">${best.name} · ${best.distanceKm} km</div></div>
      <div class="card"><div class="statlabel">Extra vs nearest market</div>
        <div class="stat ${gainPerQtl >= 0 ? '' : 'orange'}">${gainPerQtl >= 0 ? '+' : ''}${rupees(gainPerQtl)}<span class="statlabel"> /q</span></div>
        <div class="statlabel">≈ <b>${rupees(gainTotal)}</b> on your harvest</div></div>
      <div class="card"><div class="statlabel">Estimated earnings (best net)</div>
        <div class="stat orange">${rupees(best.earnings)}</div>
        <div class="statlabel">at ${best.name}, after transport</div></div>
    </div>` : ''}

    <div class="card" style="margin-top:14px">
      <div class="tablewrap">
        <table>
          <tr><th>Market</th><th>Distance</th><th>Price ₹/qtl</th><th>Recent trend</th><th>Transport</th><th>Net ₹/qtl</th><th>Est. total</th></tr>
          ${ranked.map(r => `
            <tr class="${best && r.id === best.id ? 'best' : ''}">
              <td><b>${r.name}</b>${best && r.id === best.id ? ' ✅' : ''}${r.district ? `<div class="statlabel">${r.district}${r.live?.variety ? ' · ' + r.live.variety : ''}${r.live?.grade ? ' · ' + r.live.grade : ''}</div>` : ''}</td>
              <td>${r.distanceKm} km</td>
              <td>${rupees(r.price)}${r.min && r.max ? `<div class="statlabel">${rupees(r.min)}–${rupees(r.max)}</div>` : ''}</td>
              <td class="${r.trend == null ? 'dim' : (r.trend >= 0 ? 'pos' : 'neg')}">${r.trend == null ? '—' : pct(r.trend)}</td>
              <td>${r.pickup ? '<span class="dim">farm-gate</span>' : '− ' + rupees(r.transport)}</td>
              <td class="pos">${rupees(r.netPerQtl)}</td>
              <td>${rupees(r.earnings)}</td>
            </tr>`).join('')}
          ${unranked.map(r => `
            <tr>
              <td><b>${r.name}</b>${r.district ? `<div class="statlabel">${r.district}</div>` : ''}</td>
              <td class="dim">not set</td>
              <td>${rupees(r.price)}</td>
              <td class="${r.trend == null ? 'dim' : (r.trend >= 0 ? 'pos' : 'neg')}">${r.trend == null ? '—' : pct(r.trend)}</td>
              <td class="dim">—</td><td class="dim">—</td><td class="dim">—</td>
            </tr>`).join('')}
        </table>
      </div>
      <div class="bars" style="margin-top:16px">
        ${rows.map(r => `
          <div class="bar">
            <div class="val">₹${r.price}</div>
            <div class="fill ${best && r.id === best.id ? 'bestf' : ''}" style="height:${Math.round((r.price / maxPrice) * 92)}px"></div>
            <div class="lbl">${r.name.replace(/ (Mandi|Bazaar|Market|Weekly Haat)$/, '')}</div>
          </div>`).join('')}
      </div>

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
      <div class="sourcenote">Transport assumed at ₹1/km/quintal${qty ? ` · ${qty} quintals this season` : ''}.</div>
    </div>`;
}
