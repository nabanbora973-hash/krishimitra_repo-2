// ============================================================================
//  LIVE government mandi prices — AGMARKNET via data.gov.in (OGD Platform India)
// ----------------------------------------------------------------------------
//  Source: "Current Daily Price of Various Commodities from Various Markets
//  (Mandi)" — Ministry of Agriculture & Farmers Welfare, GoI.
//  Resource: 9ef84268-d588-465a-a308-a864a43d0070 · licence: NDSAP (open data)
//
//  Why the API and not the agmarknet.gov.in website itself?
//   • the website has no public API and cannot be read by another page's
//     JavaScript (browser CORS blocks it);
//   • data.gov.in is the Government's official machine-readable release of the
//     SAME AGMARKNET figures, so the numbers shown are the real reported ones.
//
//  Honesty ladder — the app never invents a price:
//     1. LIVE     — fetched from the government feed just now (shown with the
//                   government's own arrival_date)
//     2. LAST KNOWN — our saved copy of the last successful fetch (+ its date)
//     3. DEMO      — the bundled prototype dataset, labelled DEMO everywhere
// ============================================================================
import { state } from "./state.js";

const API_BASE    = "https://api.data.gov.in/resource";
const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";

// data.gov.in's own documented sample key. It works, but it is shared and
// capped (~10 records/request). Register a free personal key for reliability:
// data.gov.in → Register → My Account → API Keys.  (2 minutes, instant.)
const SAMPLE_KEY = "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b";

const LIVE_CACHE_KEY = "km_live_cache_v2";     // last successful fetch, per crop
const HIST_KEY  = "km_live_history_v2";   // our own day-by-day price history

// Our crop keys → the commodity names AGMARKNET uses.
const COMMODITY = {
  paddy: "Paddy", tomato: "Tomato", mustard: "Mustard",
  potato: "Potato", brinjal: "Brinjal", cabbage: "Cabbage"
};

let CFG = {
  apiKey: "", enabled: true, maxAgeHours: 12,
  mandiDistances: {}          // filled from js/config.js at boot
};

export function setLiveConfig(cfg){
  CFG = Object.assign({}, CFG, cfg || {});
  if (!CFG.apiKey || /PASTE/i.test(CFG.apiKey)) CFG.usingSampleKey = true;
  else CFG.usingSampleKey = false;
}
export const liveConfig = () => CFG;
export const liveEnabled = () => !!(CFG.enabled && state.season?.crop);
const apiKey = () => CFG.usingSampleKey ? SAMPLE_KEY : CFG.apiKey;

// ---------------------------------------------------------------------------
//  helpers
// ---------------------------------------------------------------------------
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const num  = v => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return isFinite(n) ? n : null; };
const istDate = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

// Distance lookup: match on district, then market name, then market id.
// Values come from config.js → dataGov.mandiDistances (the farmer's own estimate).
function distanceFor(district, market){
  const table = CFG.mandiDistances || {};
  const keys = [norm(district), norm(market)];
  for (const k of keys){
    if (!k) continue;
    for (const [name, km] of Object.entries(table)){
      const n = norm(name);
      if (n === k || k.includes(n) || n.includes(k)) return { km: Number(km), matchedOn: name };
    }
  }
  return { km: null, matchedOn: null };
}

// Government dates arrive as DD/MM/YYYY.
function parseGovDate(d){
  const m = String(d || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return { display: String(d || "—"), iso: null };
  const [, dd, mm, yyyy] = m;
  return { display: `${dd.padStart(2,'0')}/${mm.padStart(2,'0')}/${yyyy}`, iso: `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}` };
}

const LS = () => window.__kmSafeLS || localStorage;   // safe storage (single-file mode uses a memory shim)
function readStore(key){ try { return JSON.parse(LS().getItem(key) || "null"); } catch { return null; } }
function writeStore(key, val){ try { LS().setItem(key, JSON.stringify(val)); } catch {} }

// ---------------------------------------------------------------------------
//  our own history: the government feed publishes a daily snapshot only.
//  KrishiMitra records each day it sees the feed, so trends build over time.
// ---------------------------------------------------------------------------
function recordHistory(cropKey, entries){
  const h = readStore(HIST_KEY) || {};
  h[cropKey] = h[cropKey] || {};
  const today = istDate();
  for (const e of entries){
    const rec = h[cropKey][e.key] = h[cropKey][e.key] || {};
    rec[today] = e.modal;
    // keep at most 90 daily points
    const days = Object.keys(rec).sort();
    if (days.length > 90) days.slice(0, days.length - 90).forEach(d => delete rec[d]);
  }
  writeStore(HIST_KEY, h);
}
function historyFor(cropKey, key){
  const h = readStore(HIST_KEY);
  const rec = h?.[cropKey]?.[key];
  if (!rec) return [];
  return Object.keys(rec).sort().map(d => rec[d]);
}
export function historyDays(cropKey){
  const h = readStore(HIST_KEY);
  const rec = h?.[cropKey] || {};
  const days = new Set();
  Object.values(rec).forEach(m => Object.keys(m).forEach(d => days.add(d)));
  return days.size;
}

// ---------------------------------------------------------------------------
//  the fetch
// ---------------------------------------------------------------------------
// Candidate endpoints, best first:
//   1) OUR OWN SERVER   /api/agmarknet  — the launched site proxies to the ministry
//      server-side. No CORS problem, and the API key never reaches the browser.
//   2) MINISTRY DIRECT  api.data.gov.in — used when the site is opened from a plain
//      file or has no server proxy (a browser may still refuse it; we handle that).
export function candidateUrls(cropKey){
  const commodity = COMMODITY[cropKey];
  if (!commodity) throw new Error(`No AGMARKNET commodity mapped for "${cropKey}"`);
  const urls = [];

  let sameOrigin = false;
  try { sameOrigin = typeof location !== "undefined" && location.protocol !== "file:"
        && !!location.origin && location.origin !== "null"; } catch {}
  const base = String(CFG.proxyBase || "").replace(/\/+$/, "");
  if (sameOrigin || base){
    const p = new URLSearchParams();
    p.set("crop", cropKey);          // the proxy maps crop → commodity server-side
    urls.push({ kind: "server", url: `${base}/api/agmarknet?${p.toString()}` });
    // Manual drag-and-drop deploys don't apply netlify.toml redirects, so the
    // function is also reachable at its raw path - try both before giving up.
    urls.push({ kind: "server", url: `${base}/.netlify/functions/agmarknet?${p.toString()}` });
  }

  const qs = new URLSearchParams();
  qs.set("api-key", apiKey());
  qs.set("format", "json");
  qs.set("limit", CFG.usingSampleKey ? "10" : "500");
  qs.set("filters[state.keyword]", "Assam");
  qs.set("filters[commodity]", commodity);
  urls.push({ kind: "direct", url: `${API_BASE}/${RESOURCE_ID}?${qs.toString()}` });
  return urls;
}

export async function fetchAgmarknet(cropKey, { timeoutMs = 12000 } = {}){
  const commodity = COMMODITY[cropKey];
  const attempts = candidateUrls(cropKey);
  const errors = [];

  for (const { kind, url } of attempts){
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      if (!res.ok){
        const body = await res.text().catch(() => "");
        let hint = "";
        try { hint = JSON.parse(body)?.hint || JSON.parse(body)?.message || ""; } catch {}
        throw new Error(`answered HTTP ${res.status}${hint ? " — " + hint : ""}`);
      }
      const json = await res.json();
      const records = json?.records || [];
      if (!records.length){
        throw new Error(json?.message || json?.status || "0 rows");
      }
      return {
        records,
        total: json.total ?? records.length,
        fetchedAt: Date.now(),
        via: kind,                                  // 'server' | 'direct'
        server: json.server || null
      };
    } catch (e){
      const msg = e.name === "AbortError"
        ? `timed out after ${Math.round(timeoutMs/1000)}s`
        : e.message;
      errors.push(`${kind === "server" ? "our server (/api/agmarknet)" : "api.data.gov.in"} ${msg}`);
    } finally { clearTimeout(timer); }
  }

  throw new Error(`Government price feed unreachable — ${errors.join(" · ")}`);
}

// ---------------------------------------------------------------------------
//  map AGMARKNET rows → the app's own dataset schema
//  (same shape as data/market-data.json, so pricing/risk/guidance are untouched)
// ---------------------------------------------------------------------------
export function mapToDataset(cropKey, records){
  const seen = new Map();
  for (const r of records){
    const market   = String(r.market || "").trim();
    const district = String(r.district || "").trim();
    const modal    = num(r.modal_price);
    if (!market || !modal) continue;
    const key = norm(market) || norm(district);
    const prev = seen.get(key);
    // a market can report several varieties/grades — keep the best-paying modal
    if (!prev || modal > prev.modal) {
      seen.set(key, {
        key, market, district,
        modal, min: num(r.min_price), max: num(r.max_price),
        variety: String(r.variety || "").trim(),
        grade:   String(r.grade || "").trim(),
        date:    parseGovDate(r.arrival_date)
      });
    }
  }

  const entries = [...seen.values()];
  recordHistory(cropKey, entries);

  const markets = [];
  const unknownDistance = [];
  for (const e of entries){
    const dist = distanceFor(e.district, e.market);
    const row = {
      id: norm(e.market).replace(/[^a-z0-9]+/g, "-"),
      name: e.market,
      district: e.district,
      distanceKm: dist.km,                     // null ⇒ not in the distance table
      live: {
        source: "AGMARKNET · data.gov.in",
        arrivalDate: e.date.display,
        variety: e.variety, grade: e.grade,
        min: e.min, max: e.max, modal: e.modal
      },
      crops: { [cropKey]: { today: e.modal, history: historyFor(cropKey, e.key), min: e.min, max: e.max } }
    };
    if (dist.km == null) unknownDistance.push(row);   // shown, but never ranked
    markets.push(row);                                 // every reported mandi stays visible
  }

  const dates = entries.map(e => e.date.display).filter(d => d && d !== "—");
  return {
    asOf: istDate(),
    note: "LIVE — AGMARKNET daily market prices, Ministry of Agriculture & Farmers Welfare, " +
          "via the Government of India open-data platform (data.gov.in).",
    govDate: dates.sort().pop() || null,
    markets, unknownDistance
  };
}

// ---------------------------------------------------------------------------
//  orchestrator: LIVE → LAST KNOWN → null (caller falls back to DEMO)
// ---------------------------------------------------------------------------
export async function getLivePrices(cropKey){
  const cache = readStore(LIVE_CACHE_KEY) || {};
  const cached = cache[cropKey];
  const maxAgeMs = (CFG.maxAgeHours || 12) * 3600e3;

  if (cached && Date.now() - cached.savedAt < maxAgeMs){
    return { dataset: cached.dataset, source: "LIVE", ageMs: Date.now() - cached.savedAt, fromCache: true, via: cached.via };
  }

  try {
    const { records, via } = await fetchAgmarknet(cropKey);
    const dataset = mapToDataset(cropKey, records);
    cache[cropKey] = { dataset, savedAt: Date.now(), via };
    writeStore(LIVE_CACHE_KEY, cache);
    return { dataset, source: "LIVE", ageMs: 0, fromCache: false, via };
  } catch (e){
    if (cached){
      return { dataset: cached.dataset, source: "LAST KNOWN", ageMs: Date.now() - cached.savedAt,
               error: e.message, fromCache: true };
    }
    return { dataset: null, source: null, error: e.message };
  }
}

export function clearCache(){
  try { LS().removeItem(LIVE_CACHE_KEY); } catch {}
}

// ---------------------------------------------------------------------------
//  human-readable status line (used on the Dashboard + in Reports)
// ---------------------------------------------------------------------------
export function priceSourceLine(){
  const s = state.priceSource;
  if (!s) return "";
  if (s.source === "LIVE")
    return `<span class="chip live">LIVE</span> <b>AGMARKNET</b>, Govt of India` +
           (s.govDate ? ` — as reported <b>${s.govDate}</b>` : "") +
           (s.fromCache ? " (kept from this device's last check)" : (s.via === "server" ? " · fetched by our server, so the API key never reaches your browser" : "")) +
           (CFG.usingSampleKey ? ` · <span class="dim">shared sample key — add your own free key in js/config.js</span>` : "");
  if (s.source === "LAST KNOWN")
    return `<span class="chip demo">LAST KNOWN</span> Last government figure seen on this device` +
           (s.govDate ? ` (<b>${s.govDate}</b>)` : "") +
           ` · <span class="dim">${s.error ? String(s.error).slice(0, 120) : "feed unreachable"}</span>`;
  return `<span class="chip demo">DEMO</span> Prototype dataset (illustrative) — ` +
         `<span class="dim">${s.error ? String(s.error).slice(0, 140) : "government feed not connected"}</span>`;
}

// ---------------------------------------------------------------------------
//  Dashboard card: what is live, what is not + a one-click feed test
// ---------------------------------------------------------------------------
export function sourcesCardHTML(){
  const s = state.priceSource || {};
  const days = state.season?.crop ? historyDays(state.season.crop) : 0;
  return `
    <div class="card" style="margin-top:14px">
      <b style="color:var(--green)">Where these numbers come from</b>
      <div style="margin-top:10px" class="srclist">
        <div><span class="chip live">LIVE</span> Weather — Open-Meteo (hourly, no key needed)</div>
        <div>${priceSourceLine() || '<span class="chip demo">DEMO</span> Market prices — not loaded yet'}</div>
        <div><span class="chip demo">RULES</span> Risk &amp; guidance — KrishiMitra's own explainable rules</div>
        <div>${days > 1
              ? `<span class="chip live">HISTORY</span> Price history — <b>${days} days</b> collected on this device from the government feed`
              : `<span class="chip demo">HISTORY</span> Price history — building (day ${Math.max(days,1)}; trends need 2+ days)`}</div>
      </div>
      <button class="btn ghost small" style="margin-top:10px" id="testFeedBtn">Test the government price feed now</button>
      <div id="testFeedOut" class="sourcenote"></div>
      <div class="sourcenote">Market prices: AGMARKNET (Ministry of Agriculture &amp; Farmers Welfare) released on
      data.gov.in, the Government of India open-data platform. Transport cost uses the distances you set in
      <code>js/config.js</code>. Distances &amp; storage cost are your own inputs, not government figures.</div>
    </div>`;
}

export async function wireSourcesCard(){
  const btn = document.getElementById("testFeedBtn");
  const out = document.getElementById("testFeedOut");
  if (!btn || !out) return;
  btn.onclick = async () => {
    const crop = state.season?.crop;
    btn.disabled = true;
    out.textContent = "Contacting api.data.gov.in …";
    try {
      const { records, total } = await fetchAgmarknet(crop, { timeoutMs: 15000 });
      const ds = mapToDataset(crop, records);
      out.innerHTML = `✅ <b>Feed working.</b> ${records.length} of ${total} ${COMMODITY[crop]} rows for Assam received` +
        ` — newest arrival date <b>${ds.govDate || "—"}</b>, best modal price <b>₹${Math.max(...ds.markets.concat(ds.unknownDistance)
          .map(m => m.crops[crop].today)).toLocaleString("en-IN")}</b>/qtl.`;
      clearCache();
    } catch (e){
      out.innerHTML = `❌ <b>Feed not reachable from here.</b> <span class="dim">${String(e.message)}</span><br>` +
        `<span class="dim">If you are outside India, government servers often block the request; also check the API key in
        <code>js/config.js</code>. The app keeps working with LAST KNOWN / DEMO data either way.</span>`;
    } finally { btn.disabled = false; }
  };
}
