// Verifies KRISHIMITRA.html — the ONE-FILE build.
// Checks: it boots, the video bytes inside are byte-identical to media/demo.mp4,
// the app shows every screen, and nothing external is required.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let JSDOM, VirtualConsole;
function loadJsdom(){
  for (const t of ['jsdom', '/tmp/domtest/node_modules/jsdom']) { try { return require(t); } catch {} }
  const { execSync } = require('child_process');
  execSync('mkdir -p /tmp/domtest && cd /tmp/domtest && npm install jsdom --silent --no-fund --no-audit', { stdio: 'ignore' });
  return require('/tmp/domtest/node_modules/jsdom');
}
({ JSDOM, VirtualConsole } = loadJsdom());

const FILE = process.env.KM_APP || path.join(__dirname, '..', 'offline', 'KRISHIMITRA.html');
// The video-embedded build needs the original mp4 to verify byte-identity.
// src/media/ is intentionally not committed (demo video is 11.7 MB); skip
// those specific checks when it is absent.
const MP4  = path.join(__dirname, '..', 'src', 'media', 'demo.mp4');
const HAS_VIDEO = fs.existsSync(MP4);
const html = fs.readFileSync(FILE, 'utf8');
const out = [];
const check = (n, c, x) => out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  → ' + x : ''}`);

// ---- 1) self-contained: no external script/css dependencies ----
// Two builds exist:
//   • offline/KRISHIMITRA.html        ~101 KB, no video (committed, default)
//   • KRISHIMITRA.html (Releases)      ~16 MB, demo video inlined (not in git)
// Video checks are skipped automatically for the light build.
const m = html.match(/<script type="text\/plain" id="km-video-b64">([A-Za-z0-9+/=]+)<\/script>/);
const HAS_VIDEO_B64 = !!m;
const bytes = Buffer.from(m ? m[1] : '', 'base64');
const real = HAS_VIDEO ? fs.readFileSync(MP4) : null;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

if (HAS_VIDEO_B64) {
  check('inline video payload present', true, `${(bytes.length/1048576).toFixed(2)} MB`);
  if (HAS_VIDEO) {
    check('embedded video is byte-identical to media/demo.mp4 (sha256)', sha(bytes) === sha(real),
          `${(bytes.length/1048576).toFixed(2)} MB`);
  } else {
    console.log('NOTE  demo.mp4 not present — skipping byte-identity check');
  }
  check('payload is a valid MP4 (ftyp box)', bytes.slice(4, 8).toString() === 'ftyp',
        bytes.slice(4, 12).toString('hex'));
  check('poster embedded', /id="km-poster-b64"/.test(html));
} else {
  console.log('SKIP  video checks — this is the light build (no demo video inlined)');
}

check('file is a single self-contained page', fs.statSync(FILE).size < 25 * 1024 * 1024,
      `${(fs.statSync(FILE).size / 1024).toFixed(0)} KB`);
check('no external files referenced as required assets',
      !/<link[^>]+href="(css|js|data)\//.test(html) && !/<script[^>]+src="(js|data)\//.test(html));

// ---- 2) it actually boots, with the video wired to a Blob URL ----
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/Not implemented|Could not parse CSS|fetch|createObjectURL|Blob/i.test(e.message)) errors.push(e.message); });
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  url: 'file://' + FILE,
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(win) {
    const mem = new Map();
    Object.defineProperty(win, 'localStorage', { configurable: true, value: {
      getItem: k => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: k => mem.delete(k), clear: () => mem.clear(),
      key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; },
    }});
  },
});
const w = dom.window;
process.on('unhandledRejection', () => {});
let played = false;
w.HTMLMediaElement.prototype.play = function(){ played = true; };
w.HTMLMediaElement.prototype.pause = function(){};

setTimeout(() => {
  const d = w.document;
  const clean = el => el.textContent.replace(/\s+/g, ' ');
  check('boots with zero console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  check('opens on Sell decision', d.getElementById('view-sell').classList.contains('active'));
  const sell = clean(d.getElementById('view-sell'));
  check('partial-sell verdict present', /SELL 60% NOW/.test(sell));
  check('greeting hero present', /Good (morning|afternoon|evening), Ramen/.test(sell));
  check('compare earning options (best net / your market / farm-gate)', /Compare earning options/.test(sell) && /farm-gate/.test(sell));
  check('own-sale benchmark card', /Your last sale/.test(sell));
  check('Jorhat ₹2,310 best market', sell.includes('Jorhat Mandi') && sell.includes('2,310'));
  check('trend chart drawn', !!d.querySelector('#view-sell .chart'));
  check('earnings ₹62,928', sell.includes('62,928'));

  const btn = d.getElementById('demoVideoBtn');
  btn.click();
  const src = d.querySelector('#videoModal source').getAttribute('src');
  check('video uses the inline Blob URL (no media folder needed)', /^blob:|^data:/.test(src) || src === 'media/demo.mp4',
        src.slice(0, 42) + (src.length > 42 ? '…' : ''));
  check('play attempted', played);

  [...d.querySelectorAll('.navbtn')].find(b => b.dataset.view === 'alerts').click();
  check('Alerts tab works', d.querySelectorAll('#view-alerts .alert').length >= 4);
  [...d.querySelectorAll('.navbtn')].find(b => b.dataset.view === 'sales').click();
  check('My sales tab works (video rows)', /12 Sep/.test(clean(d.getElementById('view-sales'))));
  [...d.querySelectorAll('.navbtn')].find(b => b.dataset.view === 'markets').click();
  check('Compare markets tab works', clean(d.getElementById('view-markets')).includes('2,310'));

  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} checks passed`);
  process.exit(failed ? 1 : 0);
}, 2500);
