// Tests the /api/agmarknet serverless proxy: input validation, official fetch,
// honest errors, and that the API key is never exposed to the caller.
const assert = require('assert');
const path = require('path');

const FN = path.join(__dirname, '..', 'netlify', 'functions', 'agmarknet.js');
delete require.cache[require.resolve(FN)];
const { handler } = require(FN);

const out = [];
const check = (n, c, x) => out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  → ' + x : ''}`);

const ROWS = [
  { state: 'Assam', district: 'Jorhat', market: 'Jorhat', commodity: 'Paddy', variety: 'Common',
    grade: 'FAQ', arrival_date: '15/10/2026', min_price: '2250', max_price: '2380', modal_price: '2320' },
  { state: 'Assam', district: 'Dibrugarh', market: 'Dibrugarh', commodity: 'Paddy', variety: 'Common',
    grade: 'FAQ', arrival_date: '15/10/2026', min_price: '2100', max_price: '2260', modal_price: '2185' }
];

function captureFetch(payload, { ok = true, status = 200, text = null } = {}){
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return {
      ok, status,
      text: async () => text !== null ? text : JSON.stringify(payload),
      json: async () => payload
    };
  };
  return calls;
}

(async () => {
  // ---- 1) happy path ----
  let calls = captureFetch({ status: 'ok', total: 2, records: ROWS });
  process.env.DATA_GOV_KEY = 'test-key-123';
  let res = await handler({ queryStringParameters: { crop: 'paddy' } });
  let body = JSON.parse(res.body);

  check('returns HTTP 200', res.statusCode === 200);
  check('payload marked ok with ministry attribution',
        body.status === 'ok' && /AGMARKNET/.test(body.source) && /Ministry of Agriculture/.test(body.source));
  check('official rows passed through unchanged', body.count === 2 && body.records[0].modal_price === '2320', `${body.count} rows`);
  check('upstream called with the state + commodity filters',
        /filters%5Bstate.keyword%5D=Assam/.test(calls[0]) && /filters%5Bcommodity%5D=Paddy/.test(calls[0]));
  check('uses the deployer key from the environment', calls[0].includes('test-key-123'));
  check('caching headers set for the edge', /max-age=900/.test(res.headers['cache-control']), res.headers['cache-control']);
  check('API key NEVER appears in the response body', !res.body.includes('test-key-123'));
  check('usingSampleKey flag false when a real key is set', body.usingSampleKey === false);

  // ---- 2) sample-key fallback ----
  delete process.env.DATA_GOV_KEY;
  calls = captureFetch({ status: 'ok', total: 2, records: ROWS });
  res = await handler({ queryStringParameters: { crop: 'paddy' } });
  body = JSON.parse(res.body);
  check('falls back to the official sample key when unset', calls[0].includes('579b464db66ec23bdd') && body.usingSampleKey === true);

  // ---- 3) validation ----
  res = await handler({ queryStringParameters: { crop: 'dragonfruit' } });
  body = JSON.parse(res.body);
  check('rejects an unknown crop with a helpful message', res.statusCode === 400 && /Supported: paddy/.test(body.message), body.message);
  res = await handler({ queryStringParameters: { crop: '../../etc/passwd' } });
  check('rejects path-injection attempts', res.statusCode === 400);
  calls = captureFetch({ status: 'ok', total: 2, records: ROWS });
  res = await handler({ queryStringParameters: { crop: 'paddy', state: 'Assam', limit: '9999' } });
  check('clamps limit to 500', calls[0].includes('limit=500'), calls[0].match(/limit=\d+/)[0]);
  res = await handler({ queryStringParameters: {} });
  check('defaults to paddy / Assam', res.statusCode === 200);

  // ---- 4) upstream failures are reported honestly ----
  captureFetch(null, { ok: false, status: 403, text: 'Forbidden' });
  res = await handler({ queryStringParameters: { crop: 'paddy' } });
  body = JSON.parse(res.body);
  check('HTTP 403 → 502 with an honest hint', res.statusCode === 502 && /HTTP 403/.test(body.message) && /non-Indian|personal API key/.test(body.hint), body.message);

  captureFetch(null, { ok: true, status: 200, text: '<html>maintenance</html>' });
  res = await handler({ queryStringParameters: { crop: 'paddy' } });
  check('non-JSON upstream body → honest error', res.statusCode === 502 && /non-JSON/.test(JSON.parse(res.body).message));

  globalThis.fetch = async () => { const e = new Error('ENETUNREACH'); throw e; };
  res = await handler({ queryStringParameters: { crop: 'paddy' } });
  check('network failure → honest error, never a fake number',
        res.statusCode === 502 && !/modal_price/.test(res.body));

  // ---- 5) client prefers the server proxy ----
  const store = {};
  globalThis.window = globalThis.window || {};
  globalThis.window.__kmSafeLS = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  globalThis.localStorage = globalThis.window.__kmSafeLS;
  globalThis.location = { protocol: 'https:', origin: 'https://krishimitra.netlify.app' };

  const lp = await import('file://' + path.join(__dirname, '..', 'src', 'js', 'live-prices.js').replace(/\\/g, '/'));
  lp.setLiveConfig({ apiKey: 'k', enabled: true, maxAgeHours: 12, mandiDistances: { Dibrugarh: 45 } });
  lp.clearCache();

  let seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    return { ok: true, status: 200, json: async () => ({ status: 'ok', total: 2, records: ROWS }) };
  };
  let live = await lp.getLivePrices('paddy');
  check('site calls OUR server first (/api/agmarknet)', seen[0].startsWith('/api/agmarknet?crop=paddy'), seen[0]);
  check('reports via="server" so the UI can say the key never ships', live.via === 'server', String(live.via));

  // drag-and-drop deploy: the /api/ redirect doesn't exist → raw function path saves us
  lp.clearCache(); seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    if (String(url).startsWith('/api/')) return { ok: false, status: 404, text: async () => 'Not Found' };
    return { ok: true, status: 200, json: async () => ({ status: 'ok', total: 2, records: ROWS }) };
  };
  live = await lp.getLivePrices('paddy');
  check('no /api/ redirect (drag-drop) → raw netlify functions path works',
        live.via === 'server' && /\.netlify\/functions\/agmarknet/.test(seen[1] || ''), seen.map(u => u.split('?')[0]).join(' then '));

  // server fully down → falls back to the ministry directly
  lp.clearCache(); seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    if (String(url).startsWith('/api/') || String(url).startsWith('/.netlify/'))
      return { ok: false, status: 502, text: async () => JSON.stringify({ message: 'upstream down' }) };
    return { ok: true, status: 200, json: async () => ({ status: 'ok', total: 2, records: ROWS }) };
  };
  live = await lp.getLivePrices('paddy');
  check('server fails → tries api.data.gov.in directly',
        seen.length === 3 && /api\.data\.gov\.in/.test(seen[2]), seen.map(u => u.split('?')[0]).join(' then '));
  check('reports via="direct"', live.via === 'direct', String(live.via));

  // both down → honest error (no invented prices)
  lp.clearCache();
  globalThis.fetch = async () => { throw new Error('offline'); };
  live = await lp.getLivePrices('paddy');
  check('both routes down → no dataset (app falls back to DEMO, labelled)', live.dataset === null && /our server|api\.data\.gov\.in/.test(live.error), (live.error || '').slice(0, 90));

  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
