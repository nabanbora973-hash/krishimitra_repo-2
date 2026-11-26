import { detailOpen } from "./polish.js";
// ============================================================================
//  SELL DECISION — the verdict screen.
//  Merge of the original prototype's screens + the best ideas from the hosted
//  landing page: a greeting hero, PARTIAL selling ("SELL 60% NOW"), a live
//  5-day weather strip, an earning-options comparison, and a benchmark against
//  the farmer's own last sale.
//  Every number is computed by explicit rules from live/DEMO price data,
//  live weather, and the farmer's own inputs. Nothing is invented.
// ============================================================================
import { state } from "./state.js";

// One escaper for every farmer-typed string that is printed back as HTML.
// Added after a live XSS test ran JavaScript from the profile name field.
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
import { currentVerdictText, shareText, copyText } from "./share.js";
import { speak, stopSpeaking, speakable, voiceOutputSupported } from "./voice.js";
import { CROPS } from "./crops.js";
import { priceBadge, toast, liveBadge, demoBadge, rupees } from "./ui.js";
import { trendChartHTML, confidenceRingHTML } from "./chart.js";
import { priceSourceLine } from "./live-prices.js";
import { loadSales } from "./sales.js";
import { geocodePlace, getPosition, reverseGeocode } from "./geo.js";
import { findTown } from "./places.js";
import { loadOffer, compare as compareOffer } from "./wholesale.js";
import { demandStripHTML } from "./demand-view.js";
import { bestMarket, MAX_TRIP_KM, tripIsWorthIt, nearestMandi, tripGain } from "./markets.js";
import { getCosts, transportBasisLabel } from "./costs.js";

// Storage is READ from costs.js on every render, so a number the farmer edits
// takes effect immediately. It used to be a hard-coded ₹180/qtl/week chosen to
// match a demo video — about 36× the sourced rate, which made every "hold and
// sell later" look like a loss.
const storageRate = () => getCosts().storagePerQtlWeek;
const HELD_FRACTION = 0.4;             // partial sale keeps 40% back

let ACTIVE_RANGE = 30;                 // 90 | 30 | 7 days
// Which market's series the trend card follows. '' = the nearest mandi to the
// farm (the default the verdict itself is based on). '__all__' = the average of
// every mandi we hold — the farmer's "is my mandi the odd one out" question.
let TREND_PICK = '';
let REFERENCE_MANDI = "";              // set from js/config.js (dataGov.referenceMandi)
let PERSONA_NAME = "";                // falls back to the registered farmer's name
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

// Who are we greeting? The person who registered — full name, first name only.
// If nobody registered (offline demo), greet neutrally instead of inventing a name.
function farmerName(){
  const full = (state.profile?.name || PERSONA_NAME || '').trim();
  if (!full) return '';
  return ', ' + esc(full.split(' ')[0]);   // the name is typed text, not markup
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

/* ---------------------------------------------------------------------------
   WHERE THE TREND COMES FROM
   ---------------------------------------------------------------------------
   The Sell screen's 90/30/7 chart reads `r.hist` — a per-mandi series that
   NOTHING in this build ever fills. So the chart always had 0 points and told
   the farmer "Only 0 recorded day so far", while the D1 archive was holding
   real government days that the Compare-markets table was already using.

   Relay series is the honest source: one median per day, per mandi, exactly as
   /hist returns it. Local `r.hist` stays first (it wins if it ever exists), the
   relay is the fallback — never an invented line. */
function relaySeries(pick){
  const h = state.priceHistory;
  if (!h || h.status !== "ok") return null;

  if (pick === "__all__"){
    const s = h.state_series || [];
    return s.length > 1
      ? { points: s.map(p => p.p), labels: s.map(p => p.d), n: s.length }
      : null;
  }

  const want = String(pick || "").toLowerCase().trim();
  const m = (h.markets || []).find(x => String(x.market || "").toLowerCase().trim() === want);
  const pts = m && Array.isArray(m.points) ? m.points : null;
  return pts && pts.length > 1
    ? { points: pts.map(p => p.p), labels: pts.map(p => p.d), n: pts.length }
    : null;
}

export function priceSeries(rows, rangeDays = ACTIVE_RANGE, pick = ""){
  const withHist = (rows || []).filter(r => Array.isArray(r.hist) && r.hist.length > 1);

  // Every mandi at once: the day-by-day average across all of them. One series,
  // honest label, answers "are prices rising everywhere or only near me?".
  if (pick === "__all__"){
    const rel = relaySeries("__all__");
    if (rel){
      return {
        points: rel.points.slice(-rangeDays),
        labels: rel.labels.slice(-rangeDays),
        avg: mean(rel.points.slice(-rangeDays)),
        market: null, markets: (state.priceHistory?.markets || []).length,
        all: true, source: state.priceSource?.source || "RELAY"
      };
    }
    if (!withHist.length) return { points: [], labels: [], avg: 0, market: null, source: null, all: true, markets: 0 };
    const n = Math.min(...withHist.map(r => r.hist.length), rangeDays);
    const pts = Array.from({ length: n }, (_, i) =>
      mean(withHist.map(r => r.hist[r.hist.length - n + i])));
    return {
      points: pts,
      labels: pts.map((_, i) => `day ${i + 1}`),
      avg: mean(pts),
      market: null,
      markets: withHist.length,
      all: true,
      source: state.priceSource?.source || "DEMO"
    };
  }

  const m = (pick && (rows || []).find(r => r.name === pick)) || localMarket(rows);
  if (!m) return { points: [], labels: [], avg: 0, market: null, source: null };
  const all = m.hist || [];
  if (all.length > 1){
    const pts = all.slice(-rangeDays);
    return {
      points: pts,
      labels: pts.map((_, i) => `day ${i + 1}`),
      avg: mean(pts), market: m,
      source: state.priceSource?.source || "DEMO"
    };
  }
  // no local series for this mandi — use the government archive
  const rel = relaySeries(m.name);
  if (rel){
    const pts = rel.points.slice(-rangeDays);
    return {
      points: pts,
      labels: rel.labels.slice(-rangeDays),
      avg: mean(pts), market: m,
      source: state.priceSource?.source || "RELAY"
    };
  }
  return { points: [], labels: [], avg: 0, market: m, source: state.priceSource?.source || "DEMO" };
}

// The markets the trend card can follow, nearest first, with their price today.
export function trendChoices(rows){
  return (rows || [])
    .filter(r => Array.isArray(r.hist) && r.hist.length > 1)
    .slice()
    .sort((a, b) => (a.distanceKm ?? 9e9) - (b.distanceKm ?? 9e9) || a.name.localeCompare(b.name));
}

// Compare markets calls this through window.kmOpenTrend — the two modules
// already import each other's neighbours, so the hook keeps the graph acyclic.
if (typeof window !== 'undefined') window.kmOpenTrend = name => setTrendMarket(name);

// Called from Compare markets ("📈 trend") and from the picker itself.
export function setTrendMarket(name){
  TREND_PICK = name || "";
  renderSell();
  document.querySelector('[data-view="sell"]')?.click();
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
        <span class="dim">Open-Meteo · ${esc(state.profile?.village) || "your location"}</span></div>
      <details class="km-details weather-details" data-km-detail="weather" ${detailOpen('weather')}>
        <summary><span><span data-i18n="ui.todayWeather">Today’s weather</span><strong class="weather-now">${tmax[0] != null ? Math.round(tmax[0]) + '°' : '—'}</strong><span class="weather-rain">💧 ${rain[0] != null ? Math.round(rain[0]) + '%' : '—'}</span></span><span class="km-details-action" data-i18n="ui.forecast">5-day forecast</span></summary>
        <div class="wrow">${cells}</div>
      </details>
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
        <div class="statlabel">${fmtDate(last.date)} · ${esc(last.market)}</div>
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
  // Never recommend a mandi the farmer would not realistically drive to.
  // bestMarket() already prefers markets inside MAX_TRIP_KM — but when NOTHING is
  // within that ring it falls back to every market, and a 500 km mandi got crowned
  // "Best market: Tinsukia ₹3,000" for a Guwahati cabbage farmer. Nobody trucks
  // cabbage 500 km. So the recommendation is now hard-capped: beyond the ring we
  // name the market as a fact, never as a recommendation.
  const rawBest = bestMarket(ranked) || null;
  const bestTooFar = !!(rawBest && !rawBest.pickup && rawBest.distanceKm > MAX_TRIP_KM);
  const best = bestTooFar ? null : rawBest;
  const nearest = nearestMandi(ranked);
  const spreadNet = best ? tripGain(best, nearest) : 0;

  // ---------- 2) how much evidence is behind this call? ----------
  const histDays = points.length;                     // days of price history we actually hold
  const srcLabel = state.priceSource?.source || null; // LIVE | LAST KNOWN | DEMO | null
  const priceStale = srcLabel !== 'LIVE';

  // weather risk over the next 3 days
  const d = state.weather?.data?.daily;
  const rain3 = (d?.precipitation_probability_max || []).slice(0, 3).map(x => x ?? 0);
  const maxRain = rain3.length ? Math.max(...rain3) : 0;
  const rainSensitive = !!(crop.rainSensitiveStages && crop.rainSensitiveStages.includes(season.stage));
  const rainRisk = rainSensitive && maxRain >= 60;

  // storage option — only real if the crop keeps
  const storable = (crop.storageLifeDays || 0) > 21;
  const storageWeeks = storable ? Math.min(4, Math.floor((crop.storageLifeDays || 0) / 7)) : 0;
  const storageCost = Math.round(storageRate() * storageWeeks);

  // ---------- verdict ----------
  let verdict = "WAIT", verdictClass = "wait", headlines = [], split = null;

  if (state.coverage && state.coverage.covered === false){
    // Honest answer for a farm the data cannot serve: no made-up numbers.
    verdict = "NO LOCAL PRICE";
    verdictClass = "wait";
    headlines = [
      `Your farm is <b>outside the area KrishiMitra covers</b> — our prices are for 40 mandis across Assam, and the nearest is <b>${state.coverage.nearestKm} km</b> away.`,
      `No farmer drives that far for a difference of a few rupees a quintal, so there is no market to recommend.`,
      `Sell to a buyer in your own area — a local trader or commission agent costs you nothing in transport. Ask them for today's rate.`
    ];
  } else if (!rows.length){
    // Nothing to compare: either no crop is set, or the market list is empty.
    verdict = "WAIT"; verdictClass = "wait";
    headlines = [season.crop
      ? "No market prices for <b>" + (crop.label || season.crop) + "</b> yet — the price list is empty, so there is nothing to compare. Retrying the government feed."
      : "Add this season's crop and quantity — the decision needs a price series and a market list."];
  } else if (!local){
    // Prices exist but none of the markets has a distance, so no net price can be computed.
    verdict = "WAIT"; verdictClass = "wait";
    headlines = [
      "Prices are here, but <b>distance to each mandi is not set</b> — without it transport cannot be subtracted, so no market can be ranked.",
      "Open <b>Farm Profile</b> and set the farm location (or use 📍 Use my location). Net price = mandi price − safar ka kharcha (Tel tab me badal sakte ho)."
    ];
  } else if (histDays < 3 && !rainRisk){
    // ONE day of prices is not an average, and a "1-day average" is not a signal.
    // The card used to say "Price is close to your 1-day average (₹2,100)" — while
    // printing a ₹3,000 market right above it. With no series there is one honest
    // answer: here is today's number, wait for a week of them.
    verdict = "WAIT"; verdictClass = "wait";
    headlines = [
      `Only <b>${histDays} day${histDays === 1 ? '' : 's'}</b> of price history so far — too short for an average or a trend, so today's call is simply <b>${rupees(today)}/qtl</b> at ${local.name}.`,
      priceStale
        ? `And that figure is <b>${srcLabel === 'LAST KNOWN' ? 'the last known government rate' : 'DEMO data'}</b>, not today's — the feed is not answering.`
        : `Give it a few more days and the app can tell you whether the rate is rising or falling.`,
      best
        ? `Meanwhile the best net market is <b>${best.name}</b> at ${rupees(best.netPerQtl)}/qtl after transport.`
        : (bestTooFar
            ? `The highest price today is <b>${rawBest.name}</b>, ${rawBest.distanceKm} km away — too far to be worth the trip for ${crop.label || 'this crop'}.`
            : `Sell locally if you must sell now — no short trip beats your nearest market.`)
    ];
  } else if (rainRisk){
    verdict = "SELL ALL NOW"; verdictClass = "sell";
    headlines = [
      `Up to <b>${Math.round(maxRain)}%</b> rain probability in the next 3 days while ${crop.label || "the crop"} is at <b>${season.stage}</b> — the stage most at risk.`,
      best && spreadNet > 0 ? `Best net market: <b>${best.name}</b> at ${rupees(best.netPerQtl)}/qtl after transport.` : `Nearest market pays <b>${rupees(local.price)}</b>/qtl today.`,
      `Price is <b>${Math.abs(abovePct).toFixed(1)}%</b> ${abovePct >= 0 ? "above" : "below"} your ${points.length}-day average of ${rupees(Math.round(avg))} — do not gamble the crop against the weather.`
    ];
  } else if (!best){
    // Something is reporting, but nothing inside a realistic drive. Saying "SELL"
    // here would mean "truck your crop 400 km", which no farmer does.
    verdict = "SELL LOCALLY"; verdictClass = "wait";
    headlines = [
      `No mandi within <b>${MAX_TRIP_KM} km</b> is reporting ${crop.label || 'this crop'} today.`,
      bestTooFar
        ? `The highest price is <b>${rawBest.name}</b>, ${rawBest.distanceKm} km away — the trip costs more than the price difference.`
        : `Pick a nearby market in Farm Profile to see a net price.`,
      `Sell to a buyer in your village this week, or pool with other farmers to fill one truck — a shared load is what makes a longer trip pay.`
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
      `The crop stores about <b>${crop.storageLifeDays} days</b>, so sell <b>${food(sellQty)} qtl</b> now (${rupees(split.sellValue)}) and hold <b>${food(holdQty)} qtl</b> worth ${rupees(split.holdValueToday)} at today's price — storage costs ${rupees(storageRate())}/qtl/week.`
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
      `The crop stores for about <b>${crop.storageLifeDays} days</b>, so holding is an option — at ${rupees(storageRate())}/qtl/week storage.`,
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
  // A confidence number is a promise. With one day of prices, or a two-day-old
  // government figure, the app cannot honestly promise 63% of anything.
  const capByEvidence = histDays < 3 ? 45 : histDays < 7 ? 65 : 95;
  const capBySource = { LIVE: 95, 'LAST KNOWN': 55, DEMO: 48 }[srcLabel] ?? 45;
  const confidence = Math.round(clamp(coverage + spreadPts + fresh + weatherPts,
    40, Math.min(capByEvidence, capBySource)));

  return {
    verdict, verdictClass, headlines, confidence, split,
    local, best, nearest, qty, crop, season,
    today, avg, points, abovePct, spreadNet,
    storable, storageWeeks, storageCost,
    rainRisk, maxRain,
    // shown under the confidence ring, so the number never travels alone
    evidence: {
      days: histDays,
      source: srcLabel,
      stale: priceStale,
      asOf: state.priceSource?.asOf || state.priceSource?.date || null,
      tooFar: bestTooFar ? { name: rawBest?.name, km: rawBest?.distanceKm } : null
    },
    signals: {
      days: points.length,
      markets: ranked.length,
      stage: season.stage || "—",
      rainDays: rain3.length,
      storagePerQtlWeek: storageRate()
    }
  };
}

// A trader's offer saved from Compare markets belongs next to the mandi number —
// otherwise the farmer reads "you would earn ₹61,327" and forgets the sack he
// already agreed to sell at home.
function wholesaleHintHTML(d){
  const offer = loadOffer();
  if (!offer || !offer.rate) return "";
  const cmp = compareOffer(offer, { bestMarket: d.best, qty: d.qty });
  const ahead = cmp.verdict === 'wholesale';
  const tie = cmp.verdict === 'same';
  return `<div class="wshint ${ahead ? 'win' : ''}">
    <b>${ahead ? 'Trader pays more' : tie ? 'Too close to call' : 'Mandi still pays more'}</b>
    <span>${offer.buyer ? offer.buyer + ' · ' : ''}₹${Math.round(cmp.wholesale.rate).toLocaleString('en-IN')}/qtl offer
      → ₹${Math.round(cmp.wholesale.net).toLocaleString('en-IN')}/qtl net
      ${ahead ? `(+₹${Math.round(cmp.diffPerQtl)}/qtl vs mandi)`
              : tie ? '(within ₹10/qtl of the mandi)'
              : `(₹${Math.round(-cmp.diffPerQtl)}/qtl below mandi)`}</span>
    <button class="btn ghost small" type="button"
      onclick="document.querySelector('[data-view=markets]').click()">Change →</button>
  </div>`;
}

// What the trend card is describing, in one honest line.
function trendSubtitle(cropLabel, variety){
  const crop = `${cropLabel}${variety ? ` (${variety})` : ""}`;
  if (TREND_PICK === "__all__"){
    const n = trendChoices(state.markets).length;
    return `${crop} · average of ${n} mandis`;
  }
  const m = state.markets?.find(r => r.name === TREND_PICK) || localMarket(state.markets);
  if (!m) return `${crop} · no market picked yet`;
  const where = m.knownDistance && m.distanceKm != null ? `${m.distanceKm} km` : "distance unknown";
  const today = m.price != null ? ` · ₹${Math.round(m.price).toLocaleString("en-IN")}/qtl today` : "";
  return `${crop} · ${m.name} (${where})${today}`;
}

// Every mandi with a series, plus the all-mandis average, as one compact select.
function trendMarketSelectHTML(){
  const rows = trendChoices(state.markets);
  if (rows.length < 2) return "";
  // A mandi that did not report today still has a series worth seeing, but its
  // number must wear the same mark as the table row: "~" for an estimate. Silent
  // mixing is how a prototype figure starts reading like a government rate.
  const opt = r => {
    const mark = r.est ? "~ " : "";
    const tail = r.est ? " (andaaza)" : "";
    return `<option value="${esc(r.name)}" ${TREND_PICK === r.name ? "selected" : ""}>${mark}${esc(r.name)} — ₹${Math.round(r.price).toLocaleString("en-IN")}${tail}</option>`;
  };
  return `<label class="trendpick"><span>Market</span>
    <select id="trendMarket">
      <option value="" ${TREND_PICK === "" ? "selected" : ""}>Nearest to my farm</option>
      <option value="__all__" ${TREND_PICK === "__all__" ? "selected" : ""}>All ${rows.length} mandis — average</option>
      ${rows.map(opt).join("")}
    </select>
  </label>`;
}

// ---------------------------------------------------------------------------
//  rendering
// ---------------------------------------------------------------------------
// Drawn icons, not emoji: a "📲" or "🔊" shows up as an empty box on older
// Android builds and on Linux/Chrome — on a farmer's phone that reads as broken.
const ICON_WA = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
  style="vertical-align:-2px;margin-right:5px">
  <path d="M4 20l1.6-4.1A8 8 0 1112 20a8 8 0 01-4-1.1z" fill="none" stroke="currentColor"
        stroke-width="1.7" stroke-linejoin="round"/>
  <path d="M9.2 9.6c.3-.6.9-.6 1.2 0l.5 1.1c.1.3 0 .5-.2.7l-.4.4c.5.9 1.2 1.6 2.1 2.1l.4-.4c.2-.2.4-.3.7-.2l1.1.5c.6.3.6.9 0 1.2-1 .6-2.2.6-3.3 0a6.4 6.4 0 01-2.9-2.9c-.5-1.1-.5-2.2.1-3.1z" fill="currentColor"/>
</svg>`;
const ICON_SPEAK_SM = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
  style="vertical-align:-2px;margin-right:5px">
  <path d="M4 9.5h3l4-3.2v11.4L7 14.5H4z" fill="currentColor"/>
  <path d="M15.5 8.5a4.6 4.6 0 010 7M18 6a7.5 7.5 0 010 12" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

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
  // While the first price request is still in flight there is no verdict to
  // give. Saying "WAIT — no market data" and then flipping to "SELL" ten
  // seconds later looks like the app changed its mind; say it is still asking.
  const stillLoading = !state.marketsLoaded && !(state.markets || []).length;
  const badge = priceBadge(src);
  const cropLabel = d.crop.label || d.season.crop;

  // A farm outside coverage gets one honest screen: its own position, the form
  // to correct it, and no Assam prices to tempt it into a 1,700 km drive.
  if (state.coverage && state.coverage.covered === false){
    v.innerHTML = `
      <div class="greet">
        <div class="gdate">${todayLine()}</div>
        <h1 class="ghello">${greeting()}${farmerName()}.</h1>
        <p class="gsub">Your farm at <b>${esc(state.profile?.village) || "your location"}</b> is outside
           the mandis we hold prices for.</p>
      </div>
      <h2>Sell decision ${badge}</h2>
      ${sellFormHTML()}
      <div class="card verdict wait" style="margin-top:14px">
        <div class="vcall">${d.verdict}</div>
        <ul class="vreasons">${d.headlines.map(h => `<li>${h}</li>`).join("")}</ul>
        <div class="sourcenote">${priceSourceLine()}</div>
      </div>
      <div class="card" style="margin-top:14px">
        <b style="color:var(--green)">Why there is no number here</b>
        <p style="margin:8px 0 0">Every figure KrishiMitra shows is built from a mandi price
        <i>minus</i> what it costs you to get there. There is no price that survives a
        ${state.coverage.nearestKm} km journey, so inventing one would only mislead you.</p>
        <p class="dim" style="margin:8px 0 0">Move the location back into Assam — or register a farm
        there — and the full comparison returns immediately.</p>
      </div>`;
    wireSellForm();
    return;
  }

  v.innerHTML = `
    <div class="greet">
      <div class="gdate">${todayLine()}</div>
      <h1 class="ghello">${greeting()}${farmerName()}.</h1>
      <p class="gsub">Here's what the market is telling you about your <b>${cropLabel.toLowerCase()}</b> crop today${d.local ? ` · ${esc(state.profile?.village)}` : ""}.</p>
    </div>

    <div class="km-context-row">
      <span class="km-context-chip">${esc(cropLabel)}</span>
      <span class="km-context-chip">${esc(state.profile?.village || 'Your farm')}</span>
    </div>
    <div class="km-primary-source">${badge}</div>

    ${stillLoading ? `
    <div class="card verdict wait" style="margin-top:6px">
      <div class="veyebrow">KRISHIMITRA IS CHECKING</div>
      <div class="vcall" style="font-size:28px">Aaj ka rate aa raha hai…</div>
      <div class="vbest">Mandi board se pooch rahe hain. Aapka data safe hai.</div>
      <div class="skel" style="margin-top:12px"><div class="skelrow" style="height:16px"></div></div>
    </div>` : `
    <div class="card verdict ${d.verdictClass}" style="margin-top:6px">
      <div class="vrow">
        <div class="vleft">
          <div class="veyebrow">KRISHIMITRA RECOMMENDS</div>
          <div class="vcall">${d.verdict}</div>
          <div class="vbest">${d.best
            ? `Best market: <b>${d.best.name}</b> · ${rupees(d.best.price)} / quintal`
            : d.evidence?.tooFar
              ? `Highest price is <b>${d.evidence.tooFar.name}</b> · ${d.evidence.tooFar.km} km away — too far to recommend`
              : "Not enough market data yet"}</div>
        </div>
        ${d.best ? `<div class="vright">${confidenceRingHTML(d.confidence)}</div>` : ''}
      </div>
      ${d.evidence ? `<div class="statlabel" style="margin:-2px 0 2px">
        ${d.evidence.days} day${d.evidence.days === 1 ? '' : 's'} of prices ·
        ${d.evidence.stale ? `figure from ${d.evidence.asOf || 'the last known day'}` : 'live government feed'}
      </div>` : ''}
      <ul class="vreasons">
        ${d.headlines.map(h => `<li>${h}</li>`).join("")}
      </ul>
      <div class="sourcenote">${priceSourceLine()}</div>
    </div>`}

    ${(src.ageDays > 0 && src.note) ? `
    <div class="daynote">
      <b>${src.dayName || src.day}</b> ka rate · ${src.note}
    </div>` : ''}

    <div class="vpbar">
      <button class="btn small" id="btnShareVerdict">${ICON_WA}WhatsApp par bhejo</button>
      <button class="btn ghost small" id="btnListenVerdict"${voiceOutputSupported() ? '' : ' disabled title="Is browser me awaaz nahi chalti"'}>🔊 Sunao</button>
    </div>

    <h2 style="margin-top:18px">Sell decision ${badge}</h2>
    <p class="sub">Combines prices, your harvest window, weather and storage into one call — change any field and it recalculates.</p>
    ${sellFormHTML()}

    ${demandStripHTML()}
    ${weatherStripHTML()}

    <div class="grid2 km-decision-grid" style="margin-top:14px">
      <details class="card km-details km-trend-card" data-km-detail="trend" ${detailOpen('trend', true)}>
        <summary><span data-i18n="ui.priceHistory">Price history & market trends</span><span class="km-summary-icon" aria-hidden="true"></span></summary>
        <div class="km-details-content">
        <div class="cardhead">
          <b>${ACTIVE_RANGE}-day price trend</b>
          <div class="pills">
            ${[90, 30, 7].map(r => `<button class="pill ${r === ACTIVE_RANGE ? "on" : ""}" data-range="${r}">${r} days</button>`).join("")}
          </div>
        </div>
        <div class="statlabel trendsub">${trendSubtitle(cropLabel, d.season.variety)}</div>
        ${trendMarketSelectHTML()}
        ${trendChartHTML({ ...priceSeries(state.markets, ACTIVE_RANGE, TREND_PICK), activeRange: ACTIVE_RANGE })}
        ${TREND_PICK === "__all__" ? `<div class="sourcenote">Each mandi's own series, averaged day by day — a trend that is not an artefact of one gate's price.</div>` : ""}
        </div>
      </details>

      <div class="card km-earnings-card">
        <div class="km-section-kicker" data-i18n="ui.takeHome">YOUR HARVEST · THE ESTIMATE</div>
        <b>What you would actually earn</b>
        <div class="earn">${d.best ? rupees(d.best.earnings) : "—"}</div>
        <div class="statlabel">${d.best
          ? `at ${d.best.name}, after transport — ${rupees(d.best.netPerQtl)}/qtl net × ${food(d.qty)} quintals`
          : "set your harvest quantity to see this"}</div>
        ${wholesaleHintHTML(d)}
        <details class="km-details km-cost-details" data-km-detail="cost" ${detailOpen('cost')}>
          <summary><span data-i18n="ui.breakdown">View earnings breakdown</span><span class="km-summary-icon" aria-hidden="true"></span></summary>
        <table class="minitable">
          <tr><td>Gross @ ${d.best ? rupees(d.best.price) : "—"}/qtl</td><td>${d.best ? rupees(d.best.price * d.qty) : "—"}</td></tr>
          <tr><td>Transport (${d.best ? d.best.distanceKm + " km" : "—"})</td><td>− ${d.best ? rupees(d.best.transport * d.qty) : "—"}</td></tr>
          <tr class="tot"><td>Net to you</td><td>${d.best ? rupees(d.best.earnings) : "—"}</td></tr>
        </table>
        </details>
        <div class="km-estimate-note" data-i18n="ui.estimateNote">Estimate, not a guaranteed selling price. Check the reporting date and confirm with the market.</div>
        ${d.split ? `
        <div class="splitbox">
          <b>Sell ${food(d.split.sellQty)} qtl now</b> → ${rupees(d.split.sellValue)}<br>
          <span class="dim">Hold ${food(d.split.holdQty)} qtl (worth ${rupees(d.split.holdValueToday)} at today's price) · storage ${rupees(storageRate())}/qtl/week</span>
        </div>` : ""}
        ${earningOptionsHTML(d)}
        ${rejectedTripHTML()}
        <div class="sourcenote">Safar ka hisaab: ${transportBasisLabel()} · doori aapke bataye km se.</div>
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

  // Any market, not just the nearest one: the whole point of a trend is to
  // compare, and a farmer selling in Nagaon cares about Nagaon's line.
  const trendSel = v.querySelector("#trendMarket");
  if (trendSel) trendSel.onchange = () => {
    TREND_PICK = trendSel.value;
    renderSell();
  };

  // ---- share the verdict ----
  const shareBtn = v.querySelector("#btnShareVerdict");
  if (shareBtn) shareBtn.onclick = async () => {
    const text = currentVerdictText();
    const r = await shareText(text);
    if (r.how === 'cancelled') return;
    if (!r.ok) { await copyText(text); }
  };

  // ---- read the verdict aloud ----
  const listenBtn = v.querySelector("#btnListenVerdict");
  if (listenBtn && voiceOutputSupported()){
    listenBtn.onclick = () => {
      const speaking = listenBtn.dataset.on === '1';
      if (speaking){ stopSpeaking(); listenBtn.dataset.on = '0'; listenBtn.textContent = '🔊 Sunao'; return; }
      const d2 = decide();
      const top = d2.best;
      const line = `Aaj ka faisla: ${d2.verdict}. ` +
        (top ? `Sabse behtar ${top.name} — ${Math.round(top.price)} rupaye kilo bhav, ` +
               `dhulai ke baad ${Math.round(top.netPerQtl)} rupaye kilo. ` : '') +
        `Kul milakar ${Math.round(d2.best ? d2.best.earnings : 0)} rupaye.`;
      const r = speak(speakable(line));
      if (r.ok){ listenBtn.dataset.on = '1'; listenBtn.textContent = '⏹ Roko'; }
    };
  }
}

// A mandi that pays more but is not worth the drive is worth one sentence —
// it is the question every farmer asks about the market he did not go to.
function rejectedTripHTML(){
  const rows = (state.markets || []).filter(r => !r.pickup && r.knownDistance && r.netPerQtl != null);
  if (!rows.length) return "";
  const nearest = nearestMandi(rows) || rows.reduce((a, b) => (a.distanceKm <= b.distanceKm ? a : b));
  const far = rows.filter(r => r.id !== nearest.id && r.reachable)
                  .sort((a, b) => b.netPerQtl - a.netPerQtl)[0];
  if (!far) return "";
  const gain = Math.round(far.netPerQtl - nearest.netPerQtl);
  if (gain <= 0 || tripIsWorthIt(far, nearest)) return "";
  return `<div class="sourcenote" style="margin-top:10px">Why not <b>${esc(far.name)}</b>?
    It pays ${rupees(far.price)}/qtl — ${rupees(gain)} more than ${esc(nearest.name)} — but it is
    <b>${far.distanceKm} km</b> away, and the drive eats that difference.</div>`;
}

// the three destinations worth comparing — best net, nearest mandi, farm-gate
function earningOptionsHTML(d){
  const rows = (state.markets || []).filter(r => r.knownDistance && r.netPerQtl != null);
  if (!rows.length) return "";
  const picks = [];
  if (d.best) picks.push({ label: `${d.best.name} · best net`, r: d.best });
  // The farmer's own reference market (the one whose price series they follow)
  // — for paddy that's Dibrugarh in the demo data, the farmer's "your market".
  const home = d.local;
  if (home && home.id !== d.best?.id) picks.push({ label: `${home.name} · your market`, r: home });
  const gate = rows.find(r => r.pickup);
  if (gate && !picks.some(p => p.r.id === gate.id)) picks.push({ label: `${gate.name} · farm-gate (no transport)`, r: gate });
  if (picks.length < 2) return "";
  return `
    <table class="minitable opttable">
      <tr><td colspan="2"><b>Compare earning options</b> <span class="dim">(your ${food(d.qty)} quintals, net)</span></td></tr>
      ${picks.map(p => `<tr><td>${esc(p.label)}</td><td>${rupees(p.r.netPerQtl * d.qty)}</td></tr>`).join("")}
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
          <input id="sfLoc" type="text" value="${esc(p.village)}" placeholder="e.g. Duliajan">
          <button class="btn ghost small" id="sfGps" type="button"
                  title="Measure every distance from where you are standing">📡 Use my location</button>
        </label>
        <label>Area (acres)
          <input id="sfArea" type="number" min="0.1" step="0.1" value="${esc(p.acres ?? "")}">
        </label>
        <label>Expected harvest (quintals)
          <input id="sfQty" type="number" min="0.1" step="0.1" value="${esc(s.quantityQtl ?? "")}" placeholder="e.g. 27.6">
        </label>
        <button class="btn" id="sfGo">Get my call</button>
      </div>
      <div class="sourcenote">Distances are measured from <b>your farm</b> to each mandi — change the location and every number moves with it.
      Stored with your profile; only the crop changes each season.</div>
    </div>`;
}

export function wireSellForm(){
  const go = document.getElementById("sfGo");
  if (!go) return;
  const gpsBtn = document.getElementById("sfGps");
  if (gpsBtn) gpsBtn.onclick = () => locateFromSellForm();
  go.onclick = async () => {
    const crop = document.getElementById("sfCrop").value;
    const village = document.getElementById("sfLoc").value.trim();
    const area = Number(document.getElementById("sfArea").value) || 0;
    const qty = Number(document.getElementById("sfQty").value) || 0;

    // A new village name is meaningless without new coordinates — every mandi
    // distance is measured from the farm, so keeping the old lat/lng would show
    // Duliajan's distances no matter which village was typed.
    const previousVillage = state.profile?.village || '';
    const moved = village && village.toLowerCase() !== String(previousVillage).toLowerCase();
    let located = null;
    if (moved){
      // Offline first: an Assam district town resolves straight from the table,
      // so a blocked GPS, a dead network or a sandboxed preview still moves the
      // farm. The network geocode only runs when the name is not in the table.
      const local = findTown(village);
      if (local){
        located = { lat: local.lat, lng: local.lng, name: local.town,
                    district: local.district, state: 'Assam' };
        try {
          state.profile = { ...(state.profile || {}), village: located.name,
                            lat: located.lat, lng: located.lng,
                            district: located.district, state: 'Assam',
                            acres: area || state.profile?.acres };
        } catch (e){ console.warn(e.message); }
      }
    }
    if (moved && !located){
      try {
        located = await geocodePlace(village);
        state.profile = { ...(state.profile || {}), village: located.name || village,
                          lat: located.lat, lng: located.lng,
                          district: located.district || state.profile?.district,
                          state: located.state || state.profile?.state,
                          acres: area || state.profile?.acres };
        toast(`📍 ${located.name} — distances now measured from here`);
      } catch (e) {
        // Never quietly pretend: say the lookup failed and keep the old farm,
        // because a wrong distance is worse than an honest "could not move".
        toast(`Location not changed — ${e.message}. Distances still start from ${previousVillage}.`);
        state.profile = { ...(state.profile || {}), acres: area || state.profile?.acres };
      }
    } else {
      state.profile = { ...(state.profile || {}), village: village || previousVillage,
                        acres: area || state.profile?.acres };
    }
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

// One tap: GPS → village name → coordinates. A farmer can be anywhere.
async function locateFromSellForm(){
  const btn = document.getElementById('sfGps');
  const field = document.getElementById('sfLoc');
  if (!btn) return;
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Finding you…';
  try {
    const pos = await getPosition();
    const place = await reverseGeocode(pos.lat, pos.lng).catch(() => null);
    const village = place?.village || place?.town || place?.district || 'My location';
    if (field) field.value = village;
    state.profile = { ...(state.profile || {}), village,
                      lat: pos.lat, lng: pos.lng,
                      district: place?.district || state.profile?.district,
                      state: place?.state || state.profile?.state,
                      locationSource: 'gps' };
    if (state.demo){
      try { localStorage.setItem('km_demo_profile', JSON.stringify(state.profile)); } catch {}
    }
    toast(`📍 ${village} — distances will be measured from here`);
    document.dispatchEvent(new CustomEvent('km:data-changed'));
  } catch (e) {
    toast(e.denied
      ? 'GPS band hai — type your town in “Location” and press Go. No permission needed.'
      : `Location unavailable — ${e.message} Type the town and press Go.`);
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

export function focusSellForm(){
  document.querySelector("[data-view=sell]")?.click();
  setTimeout(() => document.getElementById("sfQty")?.focus(), 80);
}
