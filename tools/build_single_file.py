#!/usr/bin/env python3
"""
Build the single-file, fully offline version of KrishiMitra.

    python3 tools/build_single_file.py            # → offline/KRISHIMITRA.html
    python3 tools/build_single_file.py --no-video # smaller, skips the demo video

Takes the modular source in src/ (20 ES modules, one stylesheet, two JSON
datasets) and produces ONE self-contained .html file that runs by
double-clicking — no server, no folders, no internet.

What gets inlined:
  • css/style.css            → <style>
  • js/app.js + its imports  → esbuild bundle → <script>
  • data/*.json              → embedded, `fetch()` calls rewritten
  • icons                    → referenced from the sibling icons/ folder
                               (only needed for the installable PWA build)

Why a separate build at all? A farmer/judge demo has to work on a laptop with
no internet and no terminal. One file that opens on double-click is the only
reliable answer.
"""
import json, pathlib, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT_DIR = ROOT / "offline"
OUT = OUT_DIR / "KRISHIMITRA.html"

WITH_VIDEO = "--no-video" not in sys.argv


def run(cmd, **kw):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, **kw)
    if r.returncode:
        print(r.stdout, r.stderr, file=sys.stderr)
        sys.exit(f"failed: {cmd}")
    return r.stdout


def main():
    OUT_DIR.mkdir(exist_ok=True)

    html = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "css" / "style.css").read_text(encoding="utf-8")

    # ---- 1. bundle the ES modules into one script -------------------------
    print("bundling src/js/app.js …")
    run("node tools/bundle.mjs")
    bundle = (OUT_DIR / "app.bundle.js").read_text(encoding="utf-8")

    # ---- 2. embed the JSON datasets, rewrite the two fetch() calls --------
    crops = (SRC / "data" / "crops.json").read_text(encoding="utf-8")
    markets = (SRC / "data" / "market-data.json").read_text(encoding="utf-8")

    for name, payload in (("data/crops.json", crops), ("data/market-data.json", markets)):
        var = "__KM_" + name.split("/")[1].replace("-", "_").replace(".json", "").upper()
        call = f'fetch("{name}")'
        if call not in bundle:
            print(f"  ! {call} not found in bundle — dataset may be unused", file=sys.stderr)
            continue
        bundle = bundle.replace(
            call,
            f'Promise.resolve({{ ok: true, status: 200, json: () => Promise.resolve({var}) }})',
        )
        bundle = f"const {var} = {payload};\n" + bundle
        print(f"  embedded {name} ({len(payload)//1024} KB)")

    # ---- 3. inline css + js into the html --------------------------------
    html = html.replace(
        '<link rel="stylesheet" href="css/style.css">',
        f"<style>\n{css}\n</style>",
        1,
    )
    html = html.replace(
        '<script type="module" src="js/app.js"></script>',
        f"<script>\n{bundle}\n</script>",
        1,
    )

    OUT.write_text(html, encoding="utf-8")
    (OUT_DIR / "app.bundle.js").unlink(missing_ok=True)

    # ---- 4. copy the assets the PWA build needs --------------------------
    for item in ("icons",):
        dst = OUT_DIR / item
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(SRC / item, dst)
    shutil.copy2(SRC / "manifest.json", OUT_DIR / "manifest.json")
    shutil.copy2(SRC / "sw.js", OUT_DIR / "sw.js")

    size = OUT.stat().st_size
    print(f"\n✅ {OUT.relative_to(ROOT)}  —  {size/1024:.0f} KB")
    print("   open it by double-clicking. no server, no internet.")


if __name__ == "__main__":
    main()
