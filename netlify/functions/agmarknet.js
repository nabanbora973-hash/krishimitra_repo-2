// ============================================================================
//  /api/agmarknet — server-side proxy for the Government of India price feed
// ----------------------------------------------------------------------------
//  Why a proxy? Two reasons, both real:
//   1) CORS — a browser on our site is not guaranteed to be allowed to read
//      api.data.gov.in directly, and government servers also block/limit some
//      networks. A server-to-server call has no such restriction.
//   2) The API key — it stays here, as an environment variable. It is NEVER
//      sent to the browser.
//
//  Data source: AGMARKNET "Current Daily Price of Various Commodities from
//  Various Markets" published by the Ministry of Agriculture & Farmers Welfare
//  on the Government of India open-data platform (data.gov.in).
//
//  Deploy: Netlify Functions (free tier). Set the key in
//      Site settings → Environment variables →  DATA_GOV_KEY = <your free key>
//  Free key: data.gov.in → Register → My Account → API Keys.
//  Without it the official data.gov.in sample key is used (rate-limited).
// ============================================================================

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const API_BASE    = "https://api.data.gov.in/resource";
const SAMPLE_KEY  = "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b";

// our crop keys → the commodity names AGMARKNET uses
const COMMODITY = {
  paddy: "Paddy", tomato: "Tomato", mustard: "Mustard",
  potato: "Potato", brinjal: "Brinjal", cabbage: "Cabbage"
};

const OK_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // cache at the edge so one fetch serves many farmers, and be gentle on the API
  "cache-control": "public, max-age=900, s-maxage=1800, stale-while-revalidate=600"
};

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};

  // ---- validate inputs (never pass raw user text upstream) ----
  const crop = String(q.crop || "paddy").toLowerCase();
  let commodity = COMMODITY[crop] || null;
  if (!commodity && /^[A-Za-z][A-Za-z ()\-]{1,39}$/.test(String(q.commodity || ""))) {
    commodity = String(q.commodity);            // allow an explicit, sane commodity name
  }
  if (!commodity) {
    return reply(400, { status: "error", message: `Unknown crop "${crop}". Supported: ${Object.keys(COMMODITY).join(", ")}.` });
  }

  const state = /^[A-Za-z][A-Za-z \-]{1,39}$/.test(String(q.state || "")) ? String(q.state) : "Assam";
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 100, 1), 500);

  const key = process.env.DATA_GOV_KEY || SAMPLE_KEY;
  const usingSampleKey = !process.env.DATA_GOV_KEY;

  const params = new URLSearchParams();
  params.set("api-key", key);
  params.set("format", "json");
  params.set("limit", String(limit));
  params.set("filters[state.keyword]", state);
  params.set("filters[commodity]", commodity);

  const url = `${API_BASE}/${RESOURCE_ID}?${params.toString()}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    const text = await res.text();

    if (!res.ok) {
      return reply(502, {
        status: "error",
        message: `Government feed answered HTTP ${res.status}.`,
        hint: res.status === 403
          ? "data.gov.in can refuse non-Indian networks; a personal API key also helps."
          : "Try again shortly — the ministry publishes through the morning IST.",
        upstream: text.slice(0, 300)
      });
    }

    let json;
    try { json = JSON.parse(text); }
    catch { return reply(502, { status: "error", message: "Government feed returned a non-JSON body.", upstream: text.slice(0, 300) }); }

    const records = json.records || [];
    return reply(200, {
      status: "ok",
      source: "AGMARKNET · data.gov.in · Ministry of Agriculture & Farmers Welfare",
      licence: "Open Government Data Platform India (NDSAP)",
      commodity, state,
      count: records.length,
      total: Number(json.total ?? records.length),
      fetchedAt: new Date().toISOString(),
      usingSampleKey,                       // true → advise the deployer to add DATA_GOV_KEY
      records                             // raw ministry rows: state, district, market, commodity,
                                          // variety, grade, arrival_date, min/max/modal price
    });
  } catch (e) {
    return reply(502, {
      status: "error",
      message: e.name === "AbortError"
        ? "Government feed timed out (12s)."
        : `Could not reach the government feed: ${e.message}`,
      hint: "The app will keep using its last-known values and say so on screen."
    });
  } finally {
    clearTimeout(timer);
  }
};

function reply(statusCode, body) {
  return { statusCode, headers: OK_HEADERS, body: JSON.stringify(body) };
}
