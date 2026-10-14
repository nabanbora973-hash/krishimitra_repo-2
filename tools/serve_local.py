#!/usr/bin/env python3
"""
KrishiMitra local server — serves the app AND the official-data proxy.

    python3 serve_local.py            # opens http://localhost:8000/?demo=1
    DATA_GOV_KEY=yourkey python3 serve_local.py

This mirrors the deployed Netlify Function (/api/agmarknet), so you can test the
real government price path on your laptop before deploying.

• Static files: served from this folder (index.html, js/, data/, media/ …)
• /api/agmarknet: proxies to AGMARKNET via data.gov.in (Ministry of Agriculture)
  The API key stays here — it is never sent to the browser.

Free key: data.gov.in → Register → My Account → API Keys.  Without one, the
official data.gov.in sample key is used (rate-limited).
"""
import json, os, sys, urllib.request, urllib.error, urllib.parse, webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "8000"))

RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070"
API_BASE    = "https://api.data.gov.in/resource"
SAMPLE_KEY  = "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b"

COMMODITY = {"paddy": "Paddy", "tomato": "Tomato", "mustard": "Mustard",
             "potato": "Potato", "brinjal": "Brinjal", "cabbage": "Cabbage"}


def fetch_agmarknet(crop, state="Assam", limit=100):
    """Server-side call to the Government of India price feed."""
    commodity = COMMODITY.get(crop.lower())
    if not commodity:
        return 400, {"status": "error",
                     "message": f'Unknown crop "{crop}". Supported: {", ".join(COMMODITY)}.'}
    key = os.environ.get("DATA_GOV_KEY") or SAMPLE_KEY
    using_sample = not os.environ.get("DATA_GOV_KEY")

    qs = urllib.parse.urlencode({
        "api-key": key, "format": "json", "limit": min(max(limit, 1), 500),
        "filters[state.keyword]": state, "filters[commodity]": commodity,
    })
    url = f"{API_BASE}/{RESOURCE_ID}?{qs}"

    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=12) as r:
            raw = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return 502, {"status": "error", "message": f"Government feed answered HTTP {e.code}.",
                     "hint": ("data.gov.in can refuse non-Indian networks; a personal API key helps."
                              if e.code == 403 else "Try again shortly — the ministry publishes through the morning IST.")}
    except Exception as e:
        return 502, {"status": "error", "message": f"Could not reach the government feed: {e}",
                     "hint": "The app keeps its last-known values and says so on screen."}

    try:
        data = json.loads(raw)
    except ValueError:
        return 502, {"status": "error", "message": "Government feed returned a non-JSON body.",
                     "upstream": raw[:300]}

    records = data.get("records", [])
    return 200, {
        "status": "ok",
        "source": "AGMARKNET · data.gov.in · Ministry of Agriculture & Farmers Welfare",
        "licence": "Open Government Data Platform India (NDSAP)",
        "commodity": commodity, "state": state,
        "count": len(records), "total": data.get("total", len(records)),
        "usingSampleKey": using_sample,
        "records": records,
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.rstrip("/") == "/api/agmarknet":
            q = urllib.parse.parse_qs(parsed.query)
            code, body = fetch_agmarknet(
                crop=(q.get("crop", ["paddy"])[0] or "paddy"),
                state=(q.get("state", ["Assam"])[0] or "Assam"),
                limit=int(q.get("limit", ["100"])[0] or 100),
            )
            self._json(code, body)
            return
        if parsed.path == "/":
            self.path = "/?demo=1" if "demo" not in parsed.query else self.path
        super().do_GET()

    def _json(self, code, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=900")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        if "/api/agmarknet" in (self.path or ""):
            sys.stderr.write(f"  [proxy] {self.path[:80]}\n")


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    url = f"http://localhost:{PORT}/?demo=1"
    print("=" * 58)
    print("  KrishiMitra — local server + official price proxy")
    print("=" * 58)
    print(f"  App        : {url}")
    print(f"  Live proxy : http://localhost:{PORT}/api/agmarknet?crop=paddy")
    print(f"  API key    : {'set via DATA_GOV_KEY' if os.environ.get('DATA_GOV_KEY') else 'NOT set — using the shared sample key'}")
    print("  Keep this window open. Ctrl+C stops it.")
    print("=" * 58)
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
