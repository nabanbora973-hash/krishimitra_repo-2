// KrishiMitra builds smoke test — run: node tests/smoke.cjs
// Boots the REAL single-file app in jsdom and verifies every screen the
// walkthrough video shows: Sell decision (verdict + ring + trend chart),
// Compare markets, Alerts, My sales, the demo video player, and that the
// demo numbers match the video.
const path = require('path');
const fs = require('fs');
// Self-healing dependency: install jsdom on first run if it isn't there.
let JSDOM, VirtualConsole;
function loadJsdom(){
  const tries = ['jsdom', '/tmp/domtest/node_modules/jsdom'];
  for (const t of tries){ try { return require(t); } catch {} }
  const { execSync } = require('child_process');
  console.log('installing jsdom (one-time)…');
  execSync('mkdir -p /tmp/domtest && cd /tmp/domtest && npm install jsdom --silent --no-fund --no-audit',
           { stdio: 'ignore' });
  return require('/tmp/domtest/node_modules/jsdom');
}
({ JSDOM, VirtualConsole } = loadJsdom());

// Needs the built single-file app (ships via GitHub Releases, not in git —
// it is ~16 MB because it embeds the demo video). Build it first:
//     python3 tools/build_standalone.py
const APP = process.env.KM_APP || path.join(__dirname, '..', 'offline', 'KRISHIMITRA.html');
if (!fs.existsSync(APP)) {
  console.log('SKIP smoke.cjs — no built app at ' + APP);
  console.log('     Run: python3 tools/build_standalone.py   (or download from Releases)');
  process.exit(0);
}
const html = fs.readFileSync(APP, 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/Not implemented|Could not parse CSS|fetch/i.test(e.message)) errors.push(e.message); });
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  url: 'file://' + APP,
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(win) {
    // jsdom throws on localStorage for file:// URLs — the app only needs a
    // key/value store, so a memory shim is enough for a smoke test.
    const mem = new Map();
    Object.defineProperty(win, 'localStorage', {
      configurable: true,
      value: {
        getItem: k => (mem.has(k) ? mem.get(k) : null),
        setItem: (k, v) => mem.set(k, String(v)),
        removeItem: k => mem.delete(k),
        clear: () => mem.clear(),
        key: i => [...mem.keys()][i] ?? null,
        get length() { return mem.size; },
      },
    });
  },
});
const w = dom.window;
process.on('unhandledRejection', () => {});   // offline build: network calls reject
let played = false;
w.HTMLMediaElement.prototype.play = function(){ played = true; };
w.HTMLMediaElement.prototype.pause = function(){};

setTimeout(() => {
  const out = [];
  const check = (n, c, x) => out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  → ' + x : ''}`);
  const d = w.document;
  const clean = el => el.textContent.replace(/\s+/g, ' ');
  const nav = v => [...d.querySelectorAll('.navbtn')].find(b => b.dataset.view === v);
  const view = v => d.getElementById('view-' + v);

  // ---------- boot ----------
  check('bundle runs, zero console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  check('app shell visible', d.getElementById('app').style.display !== 'none');

  // ---------- nav matches the video ----------
  const navOrder = [...d.querySelectorAll('.navbtn')].map(b => b.dataset.view);
  check('video tab order first: sell, markets, alerts, sales, assistant',
    navOrder.slice(0, 5).join(',') === 'sell,markets,alerts,sales,assistant', navOrder.join(','));
  check('opens on Sell decision', view('sell').classList.contains('active'));

  // ---------- SELL DECISION: verdict card ----------
  const sell = clean(view('sell'));
  check('verdict eyebrow present', sell.includes('KRISHIMITRA RECOMMENDS'));
  check('verdict = SELL 60% NOW (merged partial-sell rule)', /SELL 60% NOW/.test(sell), (sell.match(/SELL \d+% NOW|SELL ALL NOW|WAIT|STORE/) || [])[0]);
  check('best market line: Jorhat Mandi · ₹2,310', /Jorhat Mandi/.test(sell) && sell.includes('2,310'));
  check('confidence ring rendered (SVG + %)', !!view('sell').querySelector('.ringsvg') && /\d+%/.test(view('sell').querySelector('.ring text').textContent),
        view('sell').querySelector('.ring text')?.textContent);
  check('3 plain-language reasons', view('sell').querySelectorAll('.vreasons li').length === 3);


  // ---------- merged features (from the hosted landing page) ----------
  check('greeting hero: Good <time>, <name>', /Good (morning|afternoon|evening), Ramen\./.test(sell),
        (sell.match(/Good (morning|afternoon|evening), \w+\./) || [])[0]);
  check('live weather strip container present', !!view('sell').querySelector('#view-sell .wstrip') || !!view('sell').querySelector('.wstrip'));
  check('field-weather advisory rendered (or honest offline note)', /drying window|Rain is likely|Some rain possible|Live weather unavailable/i.test(sell),
        (sell.match(/Good drying window[^.]*|Rain is likely[^.]*|Some rain possible[^.]*/) || [])[0]);
  check('partial-sell split box (sell X qtl now / hold Y qtl)', /Sell 16\.6 qtl now/.test(sell) && /Hold 11 qtl/.test(sell),
        (sell.match(/Sell [\d.]+ qtl now/) || [])[0]);
  check('compare earning options: best net + your market + farm-gate', /Compare earning options/.test(sell) && /your market/.test(sell) && /farm-gate/.test(sell));
  check('own-sale benchmark card', /Your last sale/.test(sell) && /Today's best net/.test(sell));
  check("roadmap Whats-next card on dashboard", (() => { nav('dashboard').click();
        const dt = clean(view('dashboard')); nav('sell').click();
        return dt.indexOf("What's next") >= 0 && dt.indexOf('IoT crop sensing') >= 0; })(), 'roadmap');

  // ---------- trend chart + range pills ----------
  const chart = view('sell').querySelector('.chart');
  check('trend chart SVG drawn', !!chart);
  check('chart has a 30-point series', !!chart && /\b30 recorded days\b/.test(clean(view('sell'))),
        (clean(view('sell')).match(/\d+ recorded days?/) || [])[0]);
  check('average line labelled ₹2,139 (video figure)', view('sell').innerHTML.includes('2,139'));
  const pills = [...view('sell').querySelectorAll('.pill')].map(b => b.textContent.trim());
  check('range pills 90/30/7', pills.join(',') === '90 days,30 days,7 days', pills.join(','));
  pills && nav('sell').click();  // re-render sanity
  check('7-day pill switches range', (() => {
    const b = [...view('sell').querySelectorAll('.pill')].find(x => x.dataset.range === '7');
    b.click();
    const ok = clean(view('sell')).includes('7-day price trend') && view('sell').querySelector('.pill.on').dataset.range === '7';
    [...view('sell').querySelectorAll('.pill')].find(x => x.dataset.range === '30').click();
    return ok;
  })());

  // ---------- earnings card + signals strip ----------
  check('earnings ₹62,928 with net breakdown', sell.includes('62,928') && sell.includes('2,280'));
  check('gain vs village trader = +₹230/qtl (video model)', sell.includes('230'));
  check('signals used strip', /Signals used:/.test(sell) && /30 days of mandi prices/.test(sell));

  // ---------- COMPARE MARKETS ----------
  nav('markets').click();
  const t = clean(view('markets'));
  const rows = [...view('markets').querySelectorAll('table tr')].slice(1);
  const names = rows.map(r => r.querySelector('td b').textContent.trim());
  check('5 market rows, video set', names.join('|') === 'Jorhat Mandi|Tinsukia Mandi|Dibrugarh Mandi|Sivasagar Mandi|Village trader', names.join(', '));
  check('prices 2,050 / 2,120 / 2,180 / 2,240 / 2,310', ['2,050','2,120','2,180','2,240','2,310'].every(p => t.includes(p)));

  // ---------- ALERTS ----------
  nav('alerts').click();
  const al = clean(view('alerts'));
  check('alerts render with reasons', view('alerts').querySelectorAll('.alert').length >= 4);
  check('alert about best market spread (₹230, video model)', /pays .*23[0-3].*more than your nearest market/.test(al), (al.match(/pays[^.]{0,60}/) || [])[0]);
  check('alert states price source honestly', /prototype \(DEMO\) prices|LIVE from AGMARKNET|last government price/i.test(al));

  // ---------- MY SALES ----------
  nav('sales').click();
  const sl = clean(view('sales'));
  check('seeded demo sales 12 Sep + 26 Sep (video rows)', /12 Sep/.test(sl) && /26 Sep/.test(sl));
  check('sales summary totals', /Total sold/.test(sl) && /14/.test(sl), (sl.match(/Total sold.{0,20}/) || [])[0]);
  check('sale rows: Village trader ₹2,050 / Tinsukia ₹2,240',
    sl.includes('2,050') && sl.includes('2,240') && sl.includes('Village trader') && sl.includes('Tinsukia Mandi'));

  // ---------- demo video still wired ----------
  const btn = d.getElementById('demoVideoBtn');
  check('topbar "Watch demo" button exists', !!btn && btn.textContent.includes('Watch demo'));
  btn.click();
  const m = d.getElementById('videoModal');
  check('video modal opens with external source', !!m && m.classList.contains('open') && m.querySelector('source').getAttribute('src') === 'media/demo.mp4');
  check('play() attempted', played);
  d.getElementById('videoClose').click();
  check('no base64 video inlined', !/base64,[A-Za-z0-9+/]{5000}/.test(html));

  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} checks passed`);
  process.exit(failed ? 1 : 0);
}, 1500);
