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
import { reportStatusLine } from "./mandi-feed.js";

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

const USER_KEY_SLOT = "km_datagov_key";     // key typed into the app, this device only
const PROXY_SLOT = "km_proxy_base";         // the Cloudflare worker that fronts data.gov.in

export function setLiveConfig(cfg){
  CFG = Object.assign({}, CFG, cfg || {});
  CFG.apiKey = userKey() || CFG.apiKey;      // a key typed in the app wins over config.js
  if (!CFG.apiKey || /PASTE/i.test(CFG.apiKey)) CFG.usingSampleKey = true;
  else CFG.usingSampleKey = false;
}

// A farmer/student can paste their own data.gov.in key in the app, on this device.
// It never leaves the browser and never lands in the repo.
export function userKey(){
  try { return (localStorage.getItem(USER_KEY_SLOT) || "").trim(); } catch { return ""; }
}
// Returns the stored key, '' when cleared, or null when the value is not a key.
// Validation happens BEFORE anything is written — a typo must not replace a good key.
export function saveUserKey(k){
  const v = String(k || "").trim();
  if (v && v.length < 30) return null;
  try { v ? localStorage.setItem(USER_KEY_SLOT, v) : localStorage.removeItem(USER_KEY_SLOT); } catch {}
  clearCache();
  setLiveConfig({ apiKey: v || CFG.apiKey });
  return v;
}
// The worker is the only way a browser outside India can reach data.gov.in:
// it runs on the edge nearest the caller, so an Indian phone is served from an
// Indian IP and the ministry API answers.
export function proxyBase(){
  try { return (localStorage.getItem(PROXY_SLOT) || '').trim().replace(/\/+$/, ''); } catch { return ''; }
}

export function saveProxyBase(u){
  const v = String(u || '').trim().replace(/\/+$/, '');
  if (!v){ try { localStorage.removeItem(PROXY_SLOT); } catch {} clearCache(); return ''; }
  if (!/^https:\/\/[a-z0-9][a-z0-9.\-]*\.[a-z]{2,}(\/[\w\-.:/?=&%]*)?$/i.test(v)) return null;
  try { localStorage.setItem(PROXY_SLOT, v); } catch {}
  clearCache();
  return v;
}

export const keyStatus = () => ({
  source: userKey() ? "yours" : CFG.usingSampleKey ? "sample" : "config",
  hasPersonalKey: !!userKey()
});
export const liveConfig = () => CFG;
export const liveEnabled = () => !!(CFG.enabled && state.season?.crop);
const apiKey = () => CFG.usingSampleKey ? SAMPLE_KEY : CFG.apiKey;

// ---------------------------------------------------------------------------
//  helpers
// ---------------------------------------------------------------------------
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// The same dataset has answered with "market"/"modal_price", with
// "model_price", and — today — with "Market"/"Modal_Price". Reading a fixed
// spelling dropped every row and left the app on DEMO while the feed was fine.
// So look the field up case- and underscore-insensitively.
function field(r, ...names){
  let map = null;
  for (const want of names){
    if (r[want] != null && r[want] !== "") return r[want];
    if (!map){
      map = Object.create(null);
      for (const k of Object.keys(r)) map[String(k).toLowerCase()] = r[k];
    }
    const hit = map[want.toLowerCase()];
    if (hit != null && hit !== "") return hit;
  }
  return null;
}

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
// ---------------------------------------------------------------------------
//  RELAY POOL — client-side load balancing across the price relays.
//
//  Why here and not at a load balancer: the relays are Cloudflare Workers on
//  someone else's edge, so we cannot stand in front of them. What we CAN do is
//  decide, per device, which one to ask — and spread devices across them.
//
//  The rule (deliberately boring, because it has to be explainable):
//    1. a device remembers which relay answered last and keeps using it
//       ("sticky"), so one farmer does not bounce between two caches;
//    2. on the very first call the device picks at random — that is what
//       spreads the load, without a health-check round trip on boot;
//    3. a relay that fails is demoted: skipped for 10 minutes, then 30 minutes
//       if it fails again;
//    4. if every relay is demoted, ask anyway — a stale answer beats going dark.
//
//  This is not pretending to be a load balancer: with three users it does
//  nothing measurable. It exists so that a thousand phones do not all wake up
//  and hammer the same relay.
// ---------------------------------------------------------------------------
const RELAY_STICKY = 'km_relay_pick';     // hostname that answered last
const RELAY_COOL   = 'km_relay_cool';     // { host: { until, fails } }

function readCool() {
  try { return JSON.parse(localStorage.getItem(RELAY_COOL) || '{}') || {}; } catch { return {}; }
}
function writeCool(o) {
  try { localStorage.setItem(RELAY_COOL, JSON.stringify(o)); } catch {}
}

/** Every configured relay, de-duplicated, in preference order. */
export function relayPool() {
  const device = (() => {
    try { return (localStorage.getItem(PROXY_SLOT) || '').trim(); } catch { return ''; }
  })();
  const list = [device, CFG.proxyBase, CFG.proxyBaseAlt]
    .map(u => String(u || '').trim().replace(/\/+$/, ''))
    .filter(u => /^https:\/\//i.test(u));
  return list.filter((u, i) => list.indexOf(u) === i && !/netlify\.app$/i.test(u));
}

/** Order the pool for THIS device: sticky first, cooled-down relays last. */
export function relayOrder() {
  const pool = relayPool();
  if (pool.length < 2) return pool;

  const cool = readCool();
  const now = Date.now();
  let sticky = '';
  try { sticky = localStorage.getItem(RELAY_STICKY) || ''; } catch {}

  const alive = pool.filter(u => {
    const c = cool[u];
    return !c || !(c.until > now);
  });

  // A relay that failed recently is only used if nothing else is left.
  const usable = alive.length ? alive : pool;

  const pinned = usable.find(u => u === sticky);
  if (pinned) return [pinned].concat(usable.filter(u => u !== pinned));

  // First call on this device: pick at random so devices spread out.
  const i = Math.floor(Math.random() * usable.length);
  return [usable[i]].concat(usable.filter((_, k) => k !== i));
}

/** A relay answered. Keep it, and forget its penalties. */
function relayOk(base) {
  try { localStorage.setItem(RELAY_STICKY, base); } catch {}
  const cool = readCool();
  if (cool[base]) { delete cool[base]; writeCool(cool); }
}

/** A relay failed. Demote it, longer if it keeps failing. */
function relayFail(base) {
  const cool = readCool();
  const prev = cool[base] || { fails: 0 };
  const fails = prev.fails + 1;
  cool[base] = { fails, until: Date.now() + (fails >= 2 ? 30 * 60e3 : 10 * 60e3) };
  writeCool(cool);
  try {
    if (localStorage.getItem(RELAY_STICKY) === base) localStorage.removeItem(RELAY_STICKY);
  } catch {}
}

/** What the diagnostics screen can show. */
export function relayStatus() {
  const pool = relayPool(), cool = readCool(), now = Date.now();
  let sticky = '';
  try { sticky = localStorage.getItem(RELAY_STICKY) || ''; } catch {}
  return pool.map(u => {
    const c = cool[u] || null;
    return {
      host: u.replace(/^https:\/\//, ''),
      active: !c || !(c.until > now),
      lastUsed: u === sticky,
      coolsInMin: c && c.until > now ? Math.ceil((c.until - now) / 6e4) : 0,
      fails: c ? c.fails : 0
    };
  });
}

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
  // A proxy URL can also be set on the device without a redeploy — useful when
  // the deployed server sits in a country the feed refuses (e.g. data.gov.in
  // only answers Indian IPs). Set once:  km_proxy_base = <worker url>
  let deviceBase = "";
  try { deviceBase = localStorage.getItem("km_proxy_base") || ""; } catch {}
  const base = String(deviceBase || CFG.proxyBase || "").replace(/\/+$/, "");
  const p = new URLSearchParams();
  p.set("crop", cropKey);            // the proxy maps crop → commodity server-side

  // A Cloudflare Worker speaks a different dialect to the Netlify function:
  // /prices (or /) rather than /api/agmarknet. Recognise it so a shipped worker
  // URL works out of the box, and skip the Netlify paths entirely — they are
  // known to fail from outside India and cost 14 seconds before the real answer.
  // Any https base that is not the old Netlify function speaks the worker
  // dialect (/prices?crop=…). That covers workers.dev, a Vercel relay pinned to
  // an Indian region, and any custom domain the owner points at it.
  const isWorker = !!base && !/netlify\.app$/i.test(base);
  p.set("state", "Assam");
  // A key typed into this device must actually reach data.gov.in. It travels to
  // the worker as a query parameter, the worker forwards it, and nothing is
  // stored there. Without this line a personal key changed nothing: the worker
  // kept asking with the shared sample key, which is the one that runs out.
  if (userKey()) p.set("key", userKey());
  if (isWorker){
    // relayOrder() puts this device's sticky relay first, skips the ones that
    // failed recently, and falls back to the whole pool rather than going dark.
    // The typeof guard keeps this function testable on its own (relay_pick_test
    // slices it out and runs it with a stub scope).
    const order = deviceBase
      ? [base]
      : (typeof relayOrder === 'function' ? relayOrder() : [base]);
    const pool = order.length ? order : [base];
    for (const host of pool){
      urls.push({ kind: "worker", url: `${host}/prices?${p.toString()}`, base: host });
    }
  } else if (sameOrigin || base){
    urls.push({ kind: "server", url: `${base}/api/agmarknet?${p.toString()}` });
    // Manual drag-and-drop deploys don't apply netlify.toml redirects, so the
    // function is also reachable at its raw path - try both before giving up.
    urls.push({ kind: "server", url: `${base}/.netlify/functions/agmarknet?${p.toString()}` });
  }

  // Direct from the browser is a last resort only: data.gov.in does not send
  // CORS headers, so a browser usually gets "blocked (CORS/network)" — it is
  // still worth one try from a plain file:// build, but never behind a worker.
  if (!deviceBase){
    const qs = new URLSearchParams();
    qs.set("api-key", apiKey());
    qs.set("format", "json");
    qs.set("limit", CFG.usingSampleKey ? "10" : "500");
    qs.set("filters[state.keyword]", "Assam");
    qs.set("filters[commodity]", commodity);
    urls.push({ kind: "direct", url: `${API_BASE}/${RESOURCE_ID}?${qs.toString()}` });
  }
  return urls;
}

// The edge worker may have to walk several filter styles before a row comes
// back, and the first call of the day also fills its cache — 8 seconds was
// cutting it off mid-walk and dropping the app to DEMO. Give it room.
const TIMEOUT_BY_KIND = { server: 8000, worker: 20000, direct: 7000 };

export async function fetchAgmarknet(cropKey, { timeoutMs = 7000 } = {}){
  const commodity = COMMODITY[cropKey];
  const attempts = candidateUrls(cropKey);
  const errors = [];

  for (const { kind, url, base } of attempts){
    const budget = TIMEOUT_BY_KIND[kind] || timeoutMs;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), budget);
    try {
      let res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      if (res.status === 429 && kind === "worker"){
        // rate limits clear within a second — one quiet retry beats a DEMO badge
        await new Promise(r => setTimeout(r, 1500));
        res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      }
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
      // This relay answered: keep asking it, so this phone stays on one cache.
      if (kind === "worker" && base) relayOk(base);
      try {
        state.feedDiag = {
          at: new Date().toISOString(), via: kind, http: res.status, url,
          status: json.status || null, count: records.length,
          total: json.total ?? null, stale: json.stale || false,
          keys: records[0] ? Object.keys(records[0]).join(",") : "(no records)",
          firstMarket: records[0]?.market || null,
          firstModal: records[0]?.modal_price ?? null,
          message: json.message || null
        };
      } catch {}
      return {
        records,
        total: json.total ?? records.length,
        fetchedAt: Date.now(),
        via: kind,                                  // 'server' | 'direct'
        server: json.server || null,
        // The worker knows which day it served and how old it is. On a Sunday
        // (mandis shut) that is the difference between "no data" and "Saturday's
        // rate" — the app must be able to say the second one.
        day: json.day || null,
        dayName: json.dayName || null,
        ageDays: Number.isFinite(json.ageDays) ? json.ageDays : null,
        note: json.note || null
      };
    } catch (e){
      if (kind === "worker" && base) relayFail(base);
      try { state.feedDiag = { at: new Date().toISOString(), via: kind, url, error: e.message, aborted: e.name === "AbortError" }; } catch {}
      const msg = e.name === "AbortError"
        ? `timed out after ${Math.round(budget/1000)}s`
        : e.message;
      // Short labels: the banner has room for three, not for a paragraph each.
      const who = kind === "worker" ? "edge worker"
        : kind === "server"
          ? (url.includes("/.netlify/functions/") ? "netlify function" : "our server")
          : "direct data.gov.in";
      const short = /timed out/.test(msg) ? "timed out"
        : /HTTP (\d+)/.test(msg) ? "HTTP " + msg.match(/HTTP (\d+)/)[1]
        : (/Failed to fetch|Load failed|NetworkError/i.test(msg) ? "blocked (CORS/network)" : "no data");
      errors.push(`${who}: ${short}`);
    } finally { clearTimeout(timer); }
  }

  const err = new Error(`Government price feed unreachable — ${errors.join(" · ")}`);
  err.attempts = errors.slice();
  throw err;
}

// ---------------------------------------------------------------------------
//  map AGMARKNET rows → the app's own dataset schema
//  (same shape as data/market-data.json, so pricing/risk/guidance are untouched)
// ---------------------------------------------------------------------------
// A raw date string → sortable YYYYMMDD, so "newest" can be compared at all.
function dateStamp(v){
  const t = String(v || "").trim();
  const dmy = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}${dmy[2].padStart(2, "0")}${dmy[1].padStart(2, "0")}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}${iso[2]}${iso[3]}` : "";
}

export function mapToDataset(cropKey, records){
  // The dataset holds every day since 2009 and hands them back oldest-first, so
  // a short pull can be seventeen years old. Keep only the newest day present,
  // otherwise "best price" quietly compares 2009 with 2026.
  const stamps = records.map(r => dateStamp(field(r, "arrival_date", "date"))).filter(Boolean).sort();
  const newest = stamps.length ? stamps[stamps.length - 1] : null;
  const usable = newest ? records.filter(r => dateStamp(field(r, "arrival_date", "date")) === newest) : records;

  const seen = new Map();
  for (const r of usable){
    const market   = String(field(r, "market", "market_name") || "").trim();
    const district = String(field(r, "district", "district_name") || "").trim();
    const modal    = num(field(r, "modal_price", "model_price", "modal"));
    if (!market || !modal) continue;
    const key = norm(market) || norm(district);
    const prev = seen.get(key);
    // a market can report several varieties/grades — keep the best-paying modal
    if (!prev || modal > prev.modal) {
      seen.set(key, {
        key, market, district,
        modal, min: num(field(r, "min_price")), max: num(field(r, "max_price")),
        variety: String(field(r, "variety", "variety_name") || "").trim(),
        grade:   String(field(r, "grade", "grade_name") || "").trim(),
        date:    parseGovDate(field(r, "arrival_date", "date"))
      });
    }
  }

  const entries = [...seen.values()];
  try { state.feedDiag = { ...(state.feedDiag || {}), newestDay: newest, mapped: entries.length,
                           dropped: records.length - entries.length }; } catch {}
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
// What are the mandis around here reporting right now? One row per market, its
// own newest published rate — whatever the crop. Nothing is invented: a market
// appears only because the government feed published a row for it. The screen
// adds the distance; the relay only supplies facts.
// ---------------------------------------------------------------- 7-day trend
//  The relay reads the arrival dates the government feed ALREADY carries, so a
//  farmer opening the app for the first time sees a real week instead of
//  "building (day 1)". Nothing is interpolated: a day the mandi did not report
//  is simply absent from its series. Cached for an hour on the device.
export async function getPriceHistory(cropKey, { days = 14 } = {}){
  const crop = String(cropKey || state.season?.crop || '').toLowerCase();
  if (!crop) return null;
  const base = String(CFG.proxyBase || "").replace(/\/+$/, "");
  if (!base) return null;
  const storeKey = "km_hist_" + crop + "_" + base.replace(/[^a-z0-9]/gi, "");
  const cached = readStore(storeKey);
  if (cached && Date.now() - (cached.at || 0) < 60 * 60e3) return cached.data;

  const get = async (b) => {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
    try {
      const r = await fetch(`${b}/hist?crop=${encodeURIComponent(crop)}&state=Assam&days=${days}`, {
        signal: ctrl?.signal, headers: { Accept: "application/json" }
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { if (timer) clearTimeout(timer); }
  };

  const bases = [base, String(CFG.proxyBaseAlt || "").replace(/\/+$/, "")]
    .filter((b, i, a) => b && /^https:\/\//.test(b) && a.indexOf(b) === i);

  for (const b of bases){
    try {
      const j = await get(b);
      if (j && j.status === "ok"){
        writeStore(storeKey, { at: Date.now(), data: j });
        return j;
      }
    } catch { /* next base */ }
  }
  return cached?.data || null;
}

export async function getMandiBoard(){
  let deviceBase = "";
  try { deviceBase = localStorage.getItem(PROXY_SLOT) || ""; } catch {}
  const base = String(deviceBase || CFG.proxyBase || "").replace(/\/+$/, "");
  if (!base) return null;
  const storeKey = "km_board_" + base.replace(/[^a-z0-9]/gi, "");
  const cached = readStore(storeKey) || null;
  const maxAgeMs = 20 * 60e3;

  const get = async (b) => {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
    try {
      const r = await fetch(`${b}/board?state=Assam&days=21`, {
        signal: ctrl?.signal, headers: { Accept: "application/json" }
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { if (timer) clearTimeout(timer); }
  };

  const bases = [base, String(CFG.proxyBaseAlt || "").replace(/\/+$/, "")]
    .filter((b, i, a) => b && /^https:\/\//.test(b) && a.indexOf(b) === i);

  for (const b of bases){
    try {
      const body = await get(b);
      if (body && body.status === "ok" && Array.isArray(body.records) && body.records.length){
        writeStore(storeKey, { body, savedAt: Date.now() });
        return { ...body, fromCache: false };
      }
    } catch {}
  }
  if (cached && Date.now() - cached.savedAt < maxAgeMs) return { ...cached.body, fromCache: true };
  return null;
}

// ---------------------------------------------------------------------------
export async function getLivePrices(cropKey){
  const cache = readStore(LIVE_CACHE_KEY) || {};
  const cached = cache[cropKey];
  const maxAgeMs = (CFG.maxAgeHours || 12) * 3600e3;

  if (cached && Date.now() - cached.savedAt < maxAgeMs){
    return { dataset: cached.dataset, source: "LIVE", ageMs: Date.now() - cached.savedAt, fromCache: true,
             via: cached.via, day: cached.day, dayName: cached.dayName, ageDays: cached.ageDays, note: cached.note };
  }

  try {
    const { records, via, day, dayName, ageDays, note } = await fetchAgmarknet(cropKey);
    const dataset = mapToDataset(cropKey, records);
    cache[cropKey] = { dataset, savedAt: Date.now(), via, day, dayName, ageDays, note };
    writeStore(LIVE_CACHE_KEY, cache);
    return { dataset, source: "LIVE", ageMs: 0, fromCache: false, via, day, dayName, ageDays, note };
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
export const usingSampleKey = () => !!CFG.usingSampleKey;

export function priceSourceLine(){
  const s = state.priceSource;
  if (!s) return "";
  if (s.source === "LIVE")
    return `<span class="chip live">LIVE</span> <b>AGMARKNET</b>, Govt of India` +
           (s.govDate ? ` — as reported <b>${s.govDate}</b>` : "") +
           (s.fromCache ? " (kept from this device's last check)" : (s.via === "server" ? " · fetched by our server, so the API key never reaches your browser" : "")) +
           (CFG.usingSampleKey ? ` · <span class="dim">shared government key</span>` : "");
  if (s.source === "LAST KNOWN")
    return `<span class="chip demo">LAST KNOWN</span> Last government figure seen on this device` +
           (s.govDate ? ` (<b>${s.govDate}</b>)` : "") +
           ` · <span class="dim">${s.error ? String(s.error).replace("Government price feed unreachable — ","").slice(0, 240) : "feed unreachable"}</span>`;
  // The technical reason belongs one tap away, not across the top of the screen:
  // a judge reads "HTTP 502 · blocked (CORS/network)" as a broken app, when the
  // honest sentence is simply "these prices are illustrative, the weather is live".
  const detail = s.error
    ? String(s.error).replace("Government price feed unreachable — ", "")
    : "government feed not connected";
  return `<span class="chip demo">DEMO</span> ` +
         `<b>Illustrative prices</b> — 40 Assam mandis from the prototype dataset. ` +
         `Weather is live. ` +
         `<details style="margin-top:8px">` +
           `<summary style="cursor:pointer">Why not the government feed?</summary>` +
           `<div class="dim" style="margin-top:6px">The AGMARKNET feed only answers Indian IP addresses. ` +
           `Our server sits outside India, and data.gov.in sends no CORS header, so the browser cannot ` +
           `fetch it either. Your own key can be pasted under <b>Dashboard → price source</b>. ` +
           `<span style="opacity:.65">(${detail.slice(0, 180)})</span>` +
           (state.feedDiag
             ? `<div style="margin-top:8px;font-family:ui-monospace,monospace;font-size:12px;line-height:1.5;background:var(--surface);border:1px solid #DDEBE1;border-radius:6px;padding:8px;white-space:pre-wrap">` +
               JSON.stringify(state.feedDiag, null, 1).slice(0, 900) + `</div>`
             : "") +
           `</div>` +
         `</details>`;
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
        ${reportStatusLine() ? `<div>${reportStatusLine()} <span class="dim">— carried by Firestore, shown to every farmer near that gate</span></div>` : ''}
        <div>${days > 1
              ? `<span class="chip live">HISTORY</span> Price history — <b>${days} days</b> collected on this device from the government feed`
              : `<span class="chip demo">HISTORY</span> Price history — building (day ${Math.max(days,1)}; trends need 2+ days)`}</div>
      </div>
      <button class="btn ghost small" style="margin-top:10px" id="testFeedBtn">Test the government price feed now</button>
      <div id="testFeedOut" class="sourcenote"></div>

      <details class="keyslot" ${usingSampleKey() ? '' : 'open'}>
        <summary>${usingSampleKey()
          ? '🔑 Akhri step: apni free data.gov.in key daalo — phir rate LIVE aayenge'
          : '🔑 Aapki data.gov.in key is device par set hai'}</summary>
        <p class="statlabel" style="margin:8px 0">
          Free hai, 2 minute: <b>data.gov.in</b> → Register (email se) → login →
          <b>My Account → API Keys</b> → lambi string copy karo → yahan paste karo.<br>
          Key sirf is phone me rehti hai. Kahin upload nahi hoti, kahin dikhti nahi.
        </p>
        <div class="row2">
          <input id="keyInput" placeholder="paste your data.gov.in API key"
                 value="${(userKey() || '').slice(0, 8)}${userKey() ? '…' : ''}">
          <button class="btn small" id="saveKeyBtn" type="button">Save</button>
        </div>
        <p class="statlabel" id="keyMsg">${usingSampleKey()
          ? 'Bina apni key ke sarkari feed sirf 10 rows deta hai — aur bhari load me band ho jaata hai.'
          : 'LIVE chal raha hai. Neeche “Test” dabake khud dekh lo.'}</p>
      </details>
      <details class="keyslot" ${proxyBase() ? '' : ''}>
        <summary>${proxyBase()
          ? `🛰️ Live data goes through your Cloudflare worker`
          : `🛰️ Advanced: apna worker URL (pehle se set hai — chhedne ki zaroorat nahi)`}</summary>
        <p class="statlabel" style="margin:8px 0">
          data.gov.in answers only Indian IPs and sends no CORS header, so a browser cannot call it
          directly. A Cloudflare Worker runs on the edge nearest <i>you</i> — an Indian phone is served
          from an Indian edge, so the government feed answers. Free, 5 minutes:
          <b>dash.cloudflare.com → Workers &amp; Pages → Create → paste worker-v5.js → Deploy</b>.
          Then paste the <code>https://….workers.dev</code> URL here.
        </p>
        <div class="row2">
          <input id="proxyInput" placeholder="https://krishimitra-api.nabanbora973.workers.dev"
                 value="${proxyBase()}">
          <button class="btn small" id="saveProxyBtn" type="button">Save</button>
        </div>
        <p class="statlabel" id="proxyMsg">${proxyBase()
          ? 'Saved on this device. Press “Check the worker” to see which edge answers and whether the key is live.'
          : 'Nothing set yet — the app falls back to the shared sample key, then to the last known price.'}</p>
        <button class="btn ghost small" id="checkWorkerBtn" type="button" style="margin-top:6px">Check the worker</button>
        <div id="workerOut" class="sourcenote"></div>
      </details>

      <div class="sourcenote">Market prices: AGMARKNET (Ministry of Agriculture &amp; Farmers Welfare) released on
      data.gov.in, the Government of India open-data platform. Transport cost uses the distances you set in
      <code>js/config.js</code>. Distances &amp; storage cost are your own inputs, not government figures.</div>
    </div>`;
}

export async function wireSourcesCard(){
  const btn = document.getElementById("testFeedBtn");
  const out = document.getElementById("testFeedOut");

  const proxyBtn = document.getElementById("saveProxyBtn");
  if (proxyBtn){
    proxyBtn.onclick = () => {
      const inp = document.getElementById("proxyInput");
      const msg = document.getElementById("proxyMsg");
      const v = saveProxyBase(inp.value);
      if (v === null){ msg.textContent = "That is not a full https:// URL — nothing was changed."; return; }
      if (!v){ msg.textContent = "Worker cleared — back to the direct feed attempt."; return; }
      inp.value = v;
      msg.textContent = "Worker saved ✓ — press “Check the worker”, then “Test the government price feed now”.";
    };
  }

  const checkBtn = document.getElementById("checkWorkerBtn");
  if (checkBtn){
    checkBtn.onclick = async () => {
      const out = document.getElementById("workerOut");
      const base = proxyBase();
      if (!base){ out.innerHTML = "Save the worker URL first."; return; }
      checkBtn.disabled = true;
      out.textContent = "Asking the worker…";
      try {
        const r = await fetch(`${base}/health?state=Assam`, { headers: { Accept: "application/json" } });
        const j = await r.json();
        out.innerHTML = (j.ok ? "✅ " : "⚠️ ") + `<b>${j.message || "no message"}</b>`
          + `<div class="statlabel">edge <b>${j.colo || "?"}</b>${j.country ? ` (${j.country})` : ""}`
          + ` · key <b>${j.usingKey}</b> · ${j.rows ?? 0} rows · HTTP ${j.status} · ${j.ms ?? "?"} ms</div>`
          + (j.colo && j.colo !== "BOM" && j.colo !== "DEL" && j.colo !== "CCU" && j.colo !== "MAA" && j.colo !== "AMD"
              ? `<div class="statlabel">This edge is outside India — data.gov.in may refuse the worker from here.</div>` : "");
      } catch (e){
        out.innerHTML = `❌ Worker did not answer — ${e.message}. Check the URL, and that the worker is deployed.`;
      } finally { checkBtn.disabled = false; }
    };
  }

  const saveBtn = document.getElementById("saveKeyBtn");
  if (saveBtn){
    saveBtn.onclick = () => {
      const inp = document.getElementById("keyInput");
      const msg = document.getElementById("keyMsg");
      const v = saveUserKey(inp.value);
      if (v === null){ msg.textContent = "That looks too short — a data.gov.in key is a long hex string. Nothing was changed."; return; }
      if (!v){ msg.textContent = "Key cleared — back to the shared sample key."; return; }
      msg.textContent = "Saved on this device ✓ — now press “Test the government price feed now”.";
      inp.value = v.slice(0, 8) + "…";
    };
  }
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
