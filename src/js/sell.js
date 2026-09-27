// ============================================================================
//  SELL DECISION — the verdict screen.
//  Merge of the walkthrough video's screens + the best ideas from the hosted
//  landing page: a greeting hero, PARTIAL selling ("SELL 60% NOW"), a live
//  5-day weather strip, an earning-options comparison, and a benchmark against
//  the farmer's own last sale.
//  Every number is computed by explicit rules from live/DEMO price data,
//  live weather, and the farmer's own inputs. Nothing is invented.
// ============================================================================
import { state } from "./state.js";
import { CROPS } from "./crops.js";
import { toast, liveBadge, demoBadge, rupees } from "./ui.js";
import { trendChartHTML, confidenceRingHTML } from "./chart.js";
import { priceSourceLine } from "./live-prices.js";
import { loadSales } from "./sales.js";

// Assumption the farmer owns (shown on screen): storage cost for the held crop.
const STORAGE_PER_QTL_WEEK = 180;      // ₹ per quintal per week (matches the video)
const TRANSPORT_NOTE = "₹1/km/quintal";
const HELD_FRACTION = 0.4;             // partial sale keeps 40% back

let ACTIVE_RANGE = 30;                 // 90 | 30 | 7 days
let REFERENCE_MANDI = "";              // set from js/config.js (dataGov.referenceMandi)
let PERSONA_NAME = "Ramen";            // greeting name (dataGov.personaName)
export function setReferenceMandi(name){ REFERENCE_MANDI = String(name || "").trim(); }
export function setPersonaName(name){ if (name) PERSONA_NAME = String(name).trim(); }

// ---------------------------------------------------------------------------
//  helpers
// ---------------------------------------------------------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const food = (n, dp = 1) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: dp });

function greeting(){
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : (h < 17 ? "Good afternoon" : "Good evening");
}
function todayLine(){
  return new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function localMarket(rows){
  const ranked = (rows || []).filter(r => r.knownDistance);
  const pool = ranked.length ? ranked : (rows || []);
  if (!pool.length) return null;
  // The trend series follows the nearest official MANDI — traders/aggregators
  // that collect at the farm have their own prices in Compare markets.
  const mandis = pool.filter(r => !/trader|village/i.test(r.name));
  const use = mandis.length ? mandis : pool;
  // Optional: `referenceMandi` in js/config.js → dataGov names the mandi whose
  // price series this farm follows (set from app.js at boot).
  if (REFERENCE_MANDI){
    const hit = use.find(r => r.name.toLowerCase().includes(REFERENCE_MANDI.toLowerCase()));
    if (hit) return hit;
  }
  // Nearest mandi; ties broken by name so the choice is stable and explainable.
  return use.slice().sort((a, b) => (a.distanceKm - b.distanceKm) || a.name.localeCompare(b.name))[0];
}

export function priceSeries(rows, rangeDays = ACTIVE_RANGE){
  const m = localMarket(rows);
  if (!m) return { points: [], labels: [], avg: 0, market: null, source: null };
  const all = m.hist || [];
  const pts = all.slice(-rangeDays);
  return {
    points: pts,
    labels: pts.map((_, i) => `day ${i + 1}`),
    avg: mean(pts),
    market: m,
    source: state.priceSource?.source || "DEMO"
  };
}

// ---------------------------------------------------------------------------
//  live weather strip (Open-Meteo) + a plain-language drying advisory
// ---------------------------------------------------------------------------
function weatherStripHTML(){
  const daily = state.weather?.data?.daily;
  if (!daily || !daily.time?.length){
    return `<div class="wstrip"><div class="sourcenote">Live weather unavailable right now — the 5-day strip appears as soon as the connection returns. Everything else on this screen is unaffected.</div></div>`;
  }
  const days = daily.time.slice(0, 5);
  const tmax = daily.temperature_2m_max || [];
  const rain = daily.precipitation_probability_max || [];
  const cells = days.map((iso, i) => {
    const dt = new Date(iso + "T00:00:00");
    const label = i === 0 ? "Today" : dt.toLocaleDateString("en-IN", { weekday: "short" });
    const t = tmax[i] != null ? Math.round(tmax[i]) + "°" : "—";
    const r = rain[i] != null ? Math.round(rain[i]) + "%" : "–";
    const wet = (rain[i] ?? 0) >= 50;
    return `<div class="wcell ${wet ? "wet" : ""}"><div class="wd">${label}</div><div class="wt">${t}</div><div class="wr">💧${r}</div></div>`;
  }).join("");

  const next3 = rain.slice(0, 3).map(x => x ?? 0);
  const maxRain3 = next3.length ? Math.max(...next3) : 0;
  const advisory = maxRain3 >= 60
    ? `Rain is likely within 3 days (up to ${Math.round(maxRain3)}%) — plan harvest, transport and drying before it arrives.`
    : maxRain3 >= 40
      ? `Some rain possible (${Math.round(maxRain3)}%) — keep drying covers and tarps ready.`
      : `Good drying window: no significant rain expected in the next 3 days.`;

  return `
    <div class="wstrip">
      <div class="whead"><b>Field weather</b> <span class="chip live">LIVE</span>
        <span class="dim">Open-Meteo · ${state.profile?.village || "your location"}</span></div>
      <div class="wrow">${cells}</div>
      <div class="wadv">${advisory}</div>
    </div>`;
}

// ---------------------------------------------------------------------------
//  benchmark against the farmer's own sales log
// ---------------------------------------------------------------------------
function benchmarkHTML(bestNet){
  const sales = loadSales();
  if (!sales.length || !bestNet) return "";
  const last = sales.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
  const diff = bestNet - last.price;
  const pct = last.price ? (diff / last.price) * 100 : 0;
  const tot = sales.reduce((a, s) => {
    a.q += s.qty || 0; a.v += (s.qty || 0) * (s.price || 0); return a;
  }, { q: 0, v: 0 });
  const avg = tot.q ? Math.round(tot.v / tot.q) : 0;
  const fmtDate = iso => { const d = new Date(iso + "T00:00:00"); return isNaN(d) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }); };

  return `
    <div class="bench">
      <div>
        <div class="statlabel">Your last sale</div>
        <div class="bnum">${rupees(last.price)}<span class="dim">/qtl</span></div>
        <div class="statlabel">${fmtDate(last.date)} · ${last.market}</div>
      </div>
      <div class="bmid">
        <div class="statlabel">Today's best net</div>
        <div class="bnum ${diff >= 0 ? "pos" : "neg"}">${rupees(bestNet)}<span class="dim">/qtl</span></div>
        <div class="statlabel">${diff >= 0 ? "+" : ""}${rupees(Math.round(diff))} ${diff >= 0 ? "higher" : "lower"} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)</div>
      </div>
      <div class="bend">
        <div class="statlabel">This season</div>
        <div class="statlabel" style="margin-top:4px">${food(tot.q)} quintals sold · <b>${rupees(tot.v)}</b> total</div>
        <div class="statlabel">your average ${rupees(avg)}/qtl</div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
//  the decision engine — small, readable rules (defensible in the Q&A)
// ---------------------------------------------------------------------------
export function decide(){
  const rows = state.markets || [];
  const ranked = rows.filter(r => r.knownDistance && r.netPerQtl != null);
  const local = localMarket(rows);
  const season = state.season || {};
  const crop = CROPS?.[season.crop] || {};
  const qty = season.quantityQtl || 0;
  const { points, avg } = priceSeries(rows);

  const today = local?.price ?? 0;
  const abovePct = avg ? ((today - avg) / avg) * 100 : 0;
  const best = ranked[0] || null;
  const nearest = ranked.length ? ranked.reduce((a, b) => (a.distanceKm < b.distanceKm ? a : b)) : null;
  const spreadNet = (best && nearest) ? best.netPerQtl - nearest.netPerQtl : 0;

  // weather risk over the next 3 days
  const d = state.weather?.data?.daily;
  const rain3 = (d?.precipitation_probability_max || []).slice(0, 3).map(x => x ?? 0);
  const maxRain = rain3.length ? Math.max(...rain3) : 0;
  const rainSensitive = !!(crop.rainSensitiveStages && crop.rainSensitiveStages.includes(season.stage));
  const rainRisk = rainSensitive && maxRain >= 60;

  // storage option — only real if the crop keeps
  const storable = (crop.storageLifeDays || 0) > 21;
  const storageWeeks = storable ? Math.min(4, Math.floor((crop.storageLifeDays || 0) / 7)) : 0;
  const storageCost = Math.round(STORAGE_PER_QTL_WEEK * storageWeeks);

  // ---------- verdict ----------
  let verdict = "WAIT", verdictClass = "wait", headlines = [], split = null;

  if (!local || !best){
    verdict = "WAIT"; verdictClass = "wait";
    headlines = ["Add this season's crop and quantity — the decision needs a price series and a market list."];
  } else if (rainRisk){
    verdict = "SELL ALL NOW"; verdictClass = "sell";
    headlines = [
      `Up to <b>${Math.round(maxRain)}%</b> rain probability in the next 3 days while ${crop.label || "the crop"} is at <b>${season.stage}</b> — the stage most at risk.`,
      spreadNet > 0 ? `Best net market: <b>${best.name}</b> at ${rupees(best.netPerQtl)}/qtl after transport.` : `Nearest market pays <b>${rupees(local.price)}</b>/qtl today.`,
      `Price is <b>${Math.abs(abovePct).toFixed(1)}%</b> ${abovePct >= 0 ? "above" : "below"} your ${points.length}-day average of ${rupees(Math.round(avg))} — do not gamble the crop against the weather.`
    ];
  } else if (abovePct >= 1.5 && storable){
    // Good price + the crop keeps → lock in most of it, keep a slice for upside.
    const sellQty = Math.round(qty * (1 - HELD_FRACTION) * 10) / 10;
    const holdQty = Math.round(qty * HELD_FRACTION * 10) / 10;
    verdict = "SELL 60% NOW"; verdictClass = "sell";
    split = {
      sellQty, holdQty,
      sellValue: sellQty * best.netPerQtl,
      holdValueToday: holdQty * local.price,
      holdWeeks: storageWeeks
    };
    headlines = [
      `Price is <b>${abovePct.toFixed(1)}% above</b> your ${points.length}-day average — a good level to lock in.`,
      spreadNet > 0
        ? `<b>${best.name}</b> pays ${rupees(best.price)} vs ${rupees(nearest.price)} at ${nearest.name}, minus ${rupees(best.transport)}/qtl transport — net <b>+${rupees(spreadNet)}/qtl</b>.`
        : `Your nearest market already pays the best net price today.`,
      `The crop stores about <b>${crop.storageLifeDays} days</b>, so sell <b>${food(sellQty)} qtl</b> now (${rupees(split.sellValue)}) and hold <b>${food(holdQty)} qtl</b> worth ${rupees(split.holdValueToday)} at today's price — storage costs ${rupees(STORAGE_PER_QTL_WEEK)}/qtl/week.`
    ];
  } else if (abovePct >= 1.5){
    verdict = "SELL ALL NOW"; verdictClass = "sell";
    headlines = [
      `Price is <b>${abovePct.toFixed(1)}% above</b> your ${points.length}-day average — a good level to lock in.`,
      spreadNet > 0
        ? `<b>${best.name}</b> pays ${rupees(best.price)} vs ${rupees(nearest.price)} at ${nearest.name}, minus ${rupees(best.transport)}/qtl transport — net <b>+${rupees(spreadNet)}/qtl</b>.`
        : `Your nearest market already pays the best net price today.`,
      `${crop.label || "This crop"} keeps only ~${crop.storageLifeDays || "a few"} days, so taking today's price beats gambling on storage.`
    ];
  } else if (storable && abovePct < -1.5){
    verdict = "STORE"; verdictClass = "store";
    headlines = [
      `Price is <b>${Math.abs(abovePct).toFixed(1)}% below</b> your ${points.length}-day average of ${rupees(Math.round(avg))}.`,
      `The crop stores for about <b>${crop.storageLifeDays} days</b>, so holding is an option — at ${rupees(STORAGE_PER_QTL_WEEK)}/qtl/week storage.`,
      `Re-check when the price crosses <b>${rupees(Math.round(avg))}</b>.`
    ];
  } else {
    verdict = "WAIT"; verdictClass = "wait";
    headlines = [
      `Price is close to your ${points.length}-day average (${rupees(Math.round(avg))}) — no clear signal either way today.`,
      spreadNet > 0 ? `If you sell, <b>${best.name}</b> is best: ${rupees(best.netPerQtl)}/qtl net.` : `Your nearest market is competitive today.`,
      `Watch for the price to move ${rupees(Math.round(avg * 0.02))} either side of the average.`
    ];
  }

  // ---------- confidence: coverage + spread + freshness + weather ----------
  const coverage = clamp((points.length / 30) * 25, 0, 25);
  const spreadPts = best && nearest && nearest.price
    ? clamp(((best.price - nearest.price) / nearest.price) * 100 * 8, 0, 25) : 0;
  const fresh = { LIVE: 25, "LAST KNOWN": 12, DEMO: 15 }[state.priceSource?.source] ?? 10;
  const weatherPts = rainRisk ? 8 : 25;
  const confidence = Math.round(clamp(coverage + spreadPts + fresh + weatherPts, 40, 95));

  return {
    verdict, verdictClass, headlines, confidence, split,
    local, best, nearest, qty, crop, season,
    today, avg, points, abovePct, spreadNet,
    storable, storageWeeks, storageCost,
    rainRisk, maxRain,
    signals: {
      days: points.length,
      markets: ranked.length,
      stage: season.stage || "—",
      rainDays: rain3.length,
      storagePerQtlWeek: STORAGE_PER_QTL_WEEK
    }
  };
}

// ---------------------------------------------------------------------------
//  rendering
// ---------------------------------------------------------------------------
export function renderSell(){
  const v = document.getElementById("view-sell");
  if (!v) return;

  if (!state.season){
    v.innerHTML = `<h2>Sell decision</h2>
      <div class="empty">Set your crop first — one screen, four fields.<br><br>
      <button class="btn" onclick="window.kmFocusSellForm && window.kmFocusSellForm()">Fill the form below</button></div>
      ${sellFormHTML()}`;
    wireSellForm();
    return;
  }

  const d = decide();
  const src = state.priceSource || {};
  const badge = src.source === "LIVE" ? liveBadge() : demoBadge();
  const cropLabel = d.crop.label || d.season.crop;

  v.innerHTML = `
    <div class="greet">
      <div class="gdate">${todayLine()}</div>
      <h1 class="ghello">${greeting()}, ${PERSONA_NAME}.</h1>
      <p class="gsub">Here's what the market is telling you about your <b>${cropLabel.toLowerCase()}</b> crop today${d.local ? ` · ${state.profile?.village || ""}` : ""}.</p>
    </div>

    <h2>Sell decision ${badge}</h2>
    <p class="sub">Combines prices, your harvest window, weather and storage into one call — change any field and it recalculates.</p>
    ${sellFormHTML()}

    <div class="card verdict ${d.verdictClass}" style="margin-top:14px">
      <div class="vrow">
        <div class="vleft">
          <div class="veyebrow">KRISHIMITRA RECOMMENDS</div>
          <div class="vcall">${d.verdict}</div>
          <div class="vbest">${d.best
            ? `Best market: <b>${d.best.name}</b> · ${rupees(d.best.price)} / quintal`
            : "Not enough market data yet"}</div>
        </div>
        <div class="vright">${confidenceRingHTML(d.confidence)}</div>
      </div>
      <ul class="vreasons">
        ${d.headlines.map(h => `<li>${h}</li>`).join("")}
      </ul>
      <div class="sourcenote">${priceSourceLine()}</div>
    </div>

    ${weatherStripHTML()}

    <div class="grid2" style="margin-top:14px">
      <div class="card">
        <div class="cardhead">
          <b>${ACTIVE_RANGE}-day price trend</b>
          <div class="pills">
            ${[90, 30, 7].map(r => `<button class="pill ${r === ACTIVE_RANGE ? "on" : ""}" data-range="${r}">${r} days</button>`).join("")}
          </div>
        </div>
        <div class="statlabel">${cropLabel}${d.season.variety ? ` (${d.season.variety})` : ""}, ${d.local ? d.local.name : "local market"}</div>
        ${trendChartHTML({ ...priceSeries(state.markets), activeRange: ACTIVE_RANGE })}
      </div>

      <div class="card">
        <b>What you would actually earn</b>
        <div class="earn">${d.best ? rupees(d.best.earnings) : "—"}</div>
        <div class="statlabel">${d.best
          ? `at ${d.best.name}, after transport — ${rupees(d.best.netPerQtl)}/qtl net × ${food(d.qty)} quintals`
          : "set your harvest quantity to see this"}</div>
        <table class="minitable">
          <tr><td>Gross @ ${d.best ? rupees(d.best.price) : "—"}/qtl</td><td>${d.best ? rupees(d.best.price * d.qty) : "—"}</td></tr>
          <tr><td>Transport (${d.best ? d.best.distanceKm + " km" : "—"})</td><td>− ${d.best ? rupees(d.best.transport * d.qty) : "—"}</td></tr>
          <tr class="tot"><td>Net to you</td><td>${d.best ? rupees(d.best.earnings) : "—"}</td></tr>
        </table>
        ${d.split ? `
        <div class="splitbox">
          <b>Sell ${food(d.split.sellQty)} qtl now</b> → ${rupees(d.split.sellValue)}<br>
          <span class="dim">Hold ${food(d.split.holdQty)} qtl (worth ${rupees(d.split.holdValueToday)} at today's price) · storage ${rupees(STORAGE_PER_QTL_WEEK)}/qtl/week</span>
        </div>` : ""}
        ${earningOptionsHTML(d)}
        <div class="sourcenote">Transport assumption ${TRANSPORT_NOTE} using the distances in <code>js/config.js</code>.</div>
      </div>
    </div>

    ${benchmarkHTML(d.best ? d.best.netPerQtl : 0)}

    <div class="signals">
      <b>Signals used:</b>
      ${d.signals.days} days of mandi prices ·
      ${d.signals.markets} nearby markets ·
      harvest window (${d.signals.stage}) ·
      ${d.signals.rainDays}-day live weather ·
      storage ${rupees(d.signals.storagePerQtlWeek)}/qtl/week
    </div>

    ${d.best && d.verdict.startsWith("SELL") ? `
      <div class="card cta" style="margin-top:12px">
        <b>Ready to sell?</b>
        <div class="dim" style="margin-top:4px">Log the sale in <b>My sales</b> so the trend and your benchmark build up.</div>
        <button class="btn orange small" style="margin-top:8px" onclick="document.querySelector('[data-view=sales]').click()">Go to My sales →</button>
      </div>` : ""}
  `;

  wireSellForm();
  v.querySelectorAll(".pill").forEach(b => b.onclick = () => {
    ACTIVE_RANGE = Number(b.dataset.range);
    renderSell();
  });
}

// same three destinations the video compares — best net, nearest mandi, farm-gate
function earningOptionsHTML(d){
  const rows = (state.markets || []).filter(r => r.knownDistance && r.netPerQtl != null);
  if (!rows.length) return "";
  const picks = [];
  if (d.best) picks.push({ label: `${d.best.name} · best net`, r: d.best });
  // The farmer's own reference market (the one whose price series they follow)
  // — for paddy that's Dibrugarh in the demo data, the video's "your market".
  const home = d.local;
  if (home && home.id !== d.best?.id) picks.push({ label: `${home.name} · your market`, r: home });
  const gate = rows.find(r => r.pickup);
  if (gate && !picks.some(p => p.r.id === gate.id)) picks.push({ label: `${gate.name} · farm-gate (no transport)`, r: gate });
  if (picks.length < 2) return "";
  return `
    <table class="minitable opttable">
      <tr><td colspan="2"><b>Compare earning options</b> <span class="dim">(your ${food(d.qty)} quintals, net)</span></td></tr>
      ${picks.map(p => `<tr><td>${p.label}</td><td>${rupees(p.r.netPerQtl * d.qty)}</td></tr>`).join("")}
    </table>`;
}

function sellFormHTML(){
  const s = state.season || {};
  const p = state.profile || {};
  const crops = Object.entries(CROPS || {}).map(([k, c]) =>
    `<option value="${k}" ${k === s.crop ? "selected" : ""}>${c.label}</option>`).join("");
  return `
    <div class="card sellform" id="sellForm">
      <div class="frow">
        <label>Crop
          <select id="sfCrop">${crops}</select>
        </label>
        <label>Location (village / town)
          <input id="sfLoc" type="text" value="${p.village || ""}" placeholder="e.g. Duliajan">
        </label>
        <label>Area (acres)
          <input id="sfArea" type="number" min="0.1" step="0.1" value="${p.acres ?? ""}">
        </label>
        <label>Expected harvest (quintals)
          <input id="sfQty" type="number" min="0.1" step="0.1" value="${s.quantityQtl ?? ""}" placeholder="e.g. 27.6">
        </label>
        <button class="btn" id="sfGo">Get my call</button>
      </div>
      <div class="sourcenote">Stored with your profile — set once, only the crop changes each season.</div>
    </div>`;
}

export function wireSellForm(){
  const go = document.getElementById("sfGo");
  if (!go) return;
  go.onclick = async () => {
    const crop = document.getElementById("sfCrop").value;
    const village = document.getElementById("sfLoc").value.trim();
    const area = Number(document.getElementById("sfArea").value) || 0;
    const qty = Number(document.getElementById("sfQty").value) || 0;

    state.profile = { ...(state.profile || {}), village: village || state.profile?.village,
                      acres: area || state.profile?.acres };
    state.season  = { ...(state.season || {}), crop, quantityQtl: qty || state.season?.quantityQtl };

    try {
      if (state.demo){
        localStorage.setItem("km_demo_profile", JSON.stringify(state.profile));
        localStorage.setItem("km_demo_season", JSON.stringify(state.season));
      } else {
        const store = await import("./store.js");
        await store.saveProfile(state.profile);
        await store.saveSeason(state.season);
      }
      toast("Saved — recalculating your call…");
      document.dispatchEvent(new CustomEvent("km:data-changed"));
    } catch (e) { toast("Could not save: " + e.message); }
  };
}

export function focusSellForm(){
  document.querySelector("[data-view=sell]")?.click();
  setTimeout(() => document.getElementById("sfQty")?.focus(), 80);
}
