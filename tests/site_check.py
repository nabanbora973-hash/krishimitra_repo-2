#!/usr/bin/env python3
"""Site check for the localhost server — proves every file the app loads actually
exists and returns HTTP 200 from http://localhost:8000.

Usage:  python3 tests/site_check.py [base_url]
"""
import re, sys, urllib.request, urllib.error

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")

def get(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=10) as r:
            return r.status, len(r.read())
    except urllib.error.HTTPError as e:
        return e.code, 0
    except Exception as e:
        return None, str(e)

# 1) the page itself
status, size = get("/?demo=1")
ok = status == 200
print(f"{'✓' if ok else '✗'}  /?demo=1  →  {status} ({size} bytes)")
failures = 0 if ok else 1

# 2) everything index.html references
try:
    with urllib.request.urlopen(BASE + "/", timeout=10) as r:
        html = r.read().decode("utf-8")
except Exception as e:
    print("✗ could not fetch index.html:", e); sys.exit(1)

refs = set(re.findall(r'(?:src|href)="([^"#?]+)"', html))
# 3) everything the service worker pre-caches (skip the './' root entry)
try:
    with urllib.request.urlopen(BASE + "/sw.js", timeout=10) as r:
        sw = r.read().decode("utf-8")
    shell = re.search(r"SHELL_FILES\s*=\s*\[(.*?)\]", sw, re.S)
    if shell:
        for m in re.findall(r"'\./([^']+)'", shell.group(1)):
            refs.add(m)
except Exception as e:
    print("! could not read sw.js:", e)

# 4) ES-module imports (js/*.js import each other dynamically in places)
for mod in ["js/app.js"]:
    _, _ = get("/" + mod)

refs = sorted(r for r in refs if not r.startswith(("http", "data:", "//")))
print(f"\nchecking {len(refs)} files referenced by the page + service worker:\n")
for ref in refs:
    st, sz = get("/" + ref.lstrip("/"))
    good = st == 200
    if not good: failures += 1
    extra = f"{sz:,} bytes" if isinstance(sz, int) else sz
    print(f"  {'✓' if good else '✗'}  {ref:<34} {st}  {extra}")

# 5) the demo video must actually be playable size
st, sz = get("/media/demo.mp4")
if st == 200 and isinstance(sz, int) and sz > 1_000_000:
    print(f"\n✓  demo video served: {sz/1048576:.2f} MB (plays offline in the built app)")
else:
    print("\n✗  demo video problem:", st, sz); failures += 1

print("\n" + (f"ALL GOOD — {len(refs)+2} checks passed" if not failures
              else f"{failures} PROBLEM(S) — see ✗ above"))
sys.exit(1 if failures else 0)
