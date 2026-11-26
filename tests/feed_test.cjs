// ============================================================================
//  tests/feed_test.cjs — the live-price feed client
// ----------------------------------------------------------------------------
//  Replaces the old proxy_test.cjs. That file tested retired-host/functions/agmarknet.js,
//  which no longer exists: the serverless function ran outside India and the
//  ministry feed refuses datacenter IPs, so it answered 502 for everyone.
//
//  What is tested here instead:
//    • endpoint order: relay (optional) → local /api → direct data.gov.in
//    • no retired hosting path is ever tried
//    • the direct call carries a key and a sane limit
//    • failures are honest — no invented prices, ever
//    • a personal key reaches the relay as ?key=
//    • ministry field-spelling drift still maps to a dataset
// ============================================================================

const path = require('path');

const out = [];
const check = (n, c, x) => out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  → ' + x : ''}`);

const ROWS = [
  { state: 'Assam', district: 'Jorhat', market: 'Jorhat', commodity: 'Paddy', variety: 'Common',
    grade: 'FAQ', arrival_date: '15/10/2026', min_price: '2250', max_price: '2380', modal_price: '2320' },
  { state: 'Assam', district: 'Dibrugarh', market: 'Dibrugarh', commodity: 'Paddy', variety: 'Common',
    grade: 'FAQ', arrival_date: '15/10/2026', min_price: '2100', max_price: '2260', modal_price: '2185' }
];

const okRows = (rows = ROWS) => ({ ok: true, status: 200, json: async () => ({ status: 'ok', total: rows.length, records: rows }) });
const httpErr = (status, body = 'nope') => ({ ok: false, status, text: async () => body });

const RELAY = 'https://relay.example.workers.dev';

(async () => {
  // ---- browser-ish globals ----
  const store = {};
  globalThis.window = globalThis.window || {};
  globalThis.window.__kmSafeLS = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  globalThis.localStorage = globalThis.window.__kmSafeLS;
  globalThis.location = { protocol: 'https:', origin: 'https://krishimitra.example.workers.dev' };

  const lp = await import('file://' + path.join(__dirname, '..', 'src', 'js', 'live-prices.js').replace(/\\/g, '/'));
  lp.setLiveConfig({ apiKey: '', enabled: true, maxAgeHours: 12, mandiDistances: { Dibrugarh: 45 } });

  // wipe cache + device state between cases
  const reset = () => {
    lp.clearCache();
    for (const k of Object.keys(store)) delete store[k];
  };

  // ── 1) no relay, local server absent → ministry direct ────────────────
  reset();
  const seen = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    seen.push(u);
    if (u.startsWith('/api/')) return httpErr(404, 'Not Found');
    return globalThis.__directRemoved ? httpErr(502) : okRows();
  };
  let live = await lp.getLivePrices('paddy');

  check('no relay → first attempt is same-origin /api/agmarknet', seen[0].startsWith('/api/agmarknet?crop=paddy'), seen[0]);
  check('local server 404 → falls through to api.data.gov.in',
        seen.length === 2 && /^https:\/\/api\.data\.gov\.in\/resource\/9ef84268/.test(seen[1]),
        seen.map(u => u.split('?')[0]).join(' then '));
  check('no retired-host path is ever tried', !seen.some(u => /retired-host/i.test(u)));
  check('reports source LIVE + via "direct"', live.source === 'LIVE' && live.via === 'direct', `${live.source}/${live.via}`);
  check('maps records to markets', !!live.dataset && live.dataset.markets.length === 2,
        live.dataset ? `${live.dataset.markets.length} markets` : 'null');

  // ── 2) the direct URL must carry a key and a bounded limit ────────────
  const directUrl = seen[1];
  const q = directUrl.split('?')[1] || '';
  check('direct URL carries api-key', /api-key=/.test(q), q.slice(0, 34) + '…');
  check('direct URL asks for 10 rows with the shared sample key', /(^|&)limit=10(&|$)/.test(q));
  check('direct URL filters by state + commodity',
        /filters%5Bstate\.keyword%5D=Assam/.test(q) && /filters%5Bcommodity%5D=Paddy/.test(q));

  // ── 3) relay configured → relay first, /prices dialect ────────────────
  reset();
  lp.saveProxyBase(RELAY);
  const rseen = [];
  globalThis.fetch = async (url) => { rseen.push(String(url)); return okRows(); };
  live = await lp.getLivePrices('paddy');
  check('relay → calls /prices?crop=paddy', /^https:\/\/relay\.example\.workers\.dev\/prices\?crop=paddy/.test(rseen[0]), rseen[0].split('?')[0]);
  check('relay → reports via "worker"', live.via === 'worker', String(live.via));
  check('relay → never touches a retired-host path', !rseen.some(u => /retired-host/i.test(u)));

  // ── 4) a personal key travels to the relay ───────────────────────────
  reset();
  lp.saveProxyBase(RELAY);
  lp.saveUserKey('4f3c8d9e1b2a7c6f5e4d3c2b1a0f9e8d7c6b5a4f');
  lp.setLiveConfig({ apiKey: '' });
  const kseen = [];
  globalThis.fetch = async (url) => { kseen.push(String(url)); return okRows(); };
  await lp.getLivePrices('paddy');
  check('personal key reaches the relay as ?key=', /[?&]key=4f3c8d9e/.test(kseen[0]), kseen[0].includes('key=') ? 'yes' : 'no');
  lp.saveUserKey('');
  lp.setLiveConfig({ apiKey: '' });

  // ── 5) relay 502 → direct still works ────────────────────────────────
  reset();
  lp.saveProxyBase(RELAY);
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('relay.example')) return httpErr(502, JSON.stringify({ message: 'relay down' }));
    if (u.startsWith('/api/')) return httpErr(404, 'Not Found');
    return okRows();
  };
  live = await lp.getLivePrices('paddy');
  check('relay 502 → falls back to the ministry', live.via === 'direct' && live.source === 'LIVE', `${live.via}/${live.source}`);

  // ── 6) relay 429 → one quiet retry, then success ─────────────────────
  reset();
  lp.saveProxyBase(RELAY);
  let relayHits = 0;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('relay.example')) {
      relayHits += 1;
      return relayHits === 1 ? httpErr(429, JSON.stringify({ message: 'slow down' })) : okRows();
    }
    return okRows();
  };
  live = await lp.getLivePrices('paddy');
  check('relay 429 → retried once instead of dropping to DEMO', relayHits === 2 && live.via === 'worker', `hits=${relayHits}, via=${live.via}`);

  // ── 7) an empty feed is a failure, not "0 prices ok" ─────────────────
  reset();
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith('/api/')) return httpErr(404, 'Not Found');
    return okRows([]);
  };
  live = await lp.getLivePrices('paddy');
  check('0 rows is treated as a failure', live.dataset === null, String(live.dataset));

  // ── 8) everything down → honest error, no invented number ────────────
  reset();
  globalThis.fetch = async () => { throw new Error('offline'); };
  live = await lp.getLivePrices('paddy');
  check('all routes down → dataset null + error text', live.dataset === null && !!live.error, (live.error || '').slice(0, 66));
  check('error names the routes that were tried', /local server|direct data\.gov\.in|edge relay/.test(live.error || ''), (live.error || '').slice(0, 88));
  check('no price leaks into a failed result', !JSON.stringify(live).includes('2320'));

  // ── 9) ministry column-spelling drift still maps ─────────────────────
  reset();
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith('/api/')) return httpErr(404, 'Not Found');
    return { ok: true, status: 200, json: async () => ({
      status: 'ok',
      records: [{ State: 'Assam', District: 'Jorhat', Market: 'Jorhat', Commodity: 'Paddy',
                  Arrival_Date: '15/10/2026', Min_Price: '2250', Max_Price: '2380', Modal_Price: '2320' }]
    }) };
  };
  live = await lp.getLivePrices('paddy');
  const m = live.dataset && live.dataset.markets && live.dataset.markets[0];
  check('CamelCase/Capitalised ministry columns still map', !!m && m.live && m.live.modal === 2320,
        m && m.live ? String(m.live.modal) : 'no market');

  // ── 10) unknown crop is refused loudly ───────────────────────────────
  let threw = '';
  try { lp.candidateUrls('dragonfruit'); } catch (e) { threw = e.message; }
  check('unknown crop → throws instead of asking upstream', /No AGMARKNET commodity/.test(threw), threw);

  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} checks passed   feed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
