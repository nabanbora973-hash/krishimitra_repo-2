// Simulates the government feed and verifies the LIVE path end-to-end.
const store = {};
// the app prefers window.__kmSafeLS when present (single-file memory shim)
const lsShim = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
globalThis.window = globalThis.window || {};
globalThis.window.__kmSafeLS = lsShim;
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};

// fake AGMARKNET payload — exactly the documented field names
const RECORDS = [
  { state:'Assam', district:'Dibrugarh', market:'Dibrugarh', commodity:'Paddy', variety:'Common', grade:'FAQ',
    arrival_date:'14/10/2026', min_price:'2100', max_price:'2260', modal_price:'2185' },
  { state:'Assam', district:'Jorhat', market:'Jorhat', commodity:'Paddy', variety:'Common', grade:'FAQ',
    arrival_date:'14/10/2026', min_price:'2250', max_price:'2380', modal_price:'2320' },
  { state:'Assam', district:'Sivasagar', market:'Sivasagar', commodity:'Paddy', variety:'Common', grade:'FAQ',
    arrival_date:'14/10/2026', min_price:'2060', max_price:'2160', modal_price:'2115' },
  { state:'Assam', district:'Tinsukia', market:'Tinsukia', commodity:'Paddy', variety:'Common', grade:'FAQ',
    arrival_date:'14/10/2026', min_price:'2190', max_price:'2300', modal_price:'2250' },
  // a mandi NOT in the distance table → must be listed, never ranked
  { state:'Assam', district:'Nagaon', market:'Nagaon', commodity:'Paddy', variety:'Common', grade:'FAQ',
    arrival_date:'14/10/2026', min_price:'1900', max_price:'2000', modal_price:'1950' },
];

let calls = 0;
globalThis.fetch = async (url) => {
  calls++;
  const u = String(url);
  return { ok: true, status: 200, json: async () => ({
    status: 'ok', total: RECORDS.length, count: RECORDS.length, records: RECORDS
  }) };
};

const { state } = await import('../krishimitra_website/js/state.js');
const lp = await import('../krishimitra_website/js/live-prices.js');
const mk = await import('../krishimitra_website/js/markets.js');

const out = [];
const check = (n, c, x) => out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  → ' + x : ''}`);

lp.setLiveConfig({ apiKey: 'abc123', enabled: true, maxAgeHours: 12,
  mandiDistances: { Duliajan:3, Jorhat:90, Tinsukia:45, Sivasagar:60, Dibrugarh:45 } });

// ---- 1) fetch + map
const res = await lp.getLivePrices('paddy');
check('LIVE source returned', res.source === 'LIVE', res.source || res.error);
const ds = res.dataset;
check('gov arrival date captured', ds.govDate === '14/10/2026', ds.govDate);
check('5 markets mapped, 1 flagged unranked', ds.markets.length === 5 && ds.unknownDistance.length === 1, `${ds.markets.length} total, ${ds.unknownDistance.length} unranked`);
check('Nagaon (no distance) is separated, not ranked', ds.unknownDistance.some(m => m.name === 'Nagaon'));

// ---- 2) second call uses the cache (no extra network hit)
const res2 = await lp.getLivePrices('paddy');
check('cached call does not re-fetch', calls === 1, 'calls=' + calls);
check('cached call still LIVE + flagged fromCache', res2.source === 'LIVE' && res2.fromCache === true);

// ---- 3) ranking / net price with real figures
state.season = { crop: 'paddy', quantityQtl: 27.6 };
state.priceSource = { source: 'LIVE', govDate: ds.govDate, unknownDistance: ds.unknownDistance };
await mk.refreshMarkets();
const rows = state.markets;
const best = rows[0];
check('best market = Jorhat @ ₹2,320', best.name === 'Jorhat' && best.price === 2320, `${best.name} ₹${best.price}`);
check('net price = 2320 − 90 km transport = ₹2,230', best.netPerQtl === 2230, '₹' + best.netPerQtl);
check('earnings = 2230 × 27.6 = ₹61,548', best.earnings === 61548, '₹' + best.earnings);
check('unknown-distance market present but unranked',
  rows.some(r => r.name === 'Nagaon' && r.knownDistance === false && r.netPerQtl === null));
check('trend is null on day 1 (honest, not 0%)', rows.every(r => r.trend === null || r.trend === undefined));

// ---- 4) history accumulates for tomorrow
check('history recorded for today', lp.historyDays('paddy') === 1, 'days=' + lp.historyDays('paddy'));

// ---- 5) feed down → LAST KNOWN, then DEMO when nothing cached
globalThis.fetch = async () => { throw new Error('govt server unreachable'); };
lp.clearCache();
await new Promise(r => setTimeout(r, 5));
const res3 = await lp.getLivePrices('paddy');   // cache cleared → DEMO path
check('feed down + no cache → honest null (app falls back to DEMO)', res3.dataset === null && !!res3.error, res3.error);

// re-fetch to populate cache, then fail → LAST KNOWN
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status:'ok', total: RECORDS.length, records: RECORDS }) });
await lp.getLivePrices('paddy');
globalThis.fetch = async () => { throw new Error('govt server unreachable'); };
// force the cache to look stale
const raw = JSON.parse(store['km_live_cache_v2']); raw.paddy.savedAt = Date.now() - 99 * 3600e3;
store['km_live_cache_v2'] = JSON.stringify(raw);
const res4 = await lp.getLivePrices('paddy');
check('stale cache + feed down → LAST KNOWN', res4.source === 'LAST KNOWN' && !!res4.dataset, res4.source);

// ---- 6) error text surfaces for the UI
state.priceSource = { source: 'DEMO', error: 'Government feed answered HTTP 403' };
const line = lp.priceSourceLine();
check('source line labels DEMO honestly', line.includes('DEMO') && line.includes('403'), line.slice(0, 80));

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
