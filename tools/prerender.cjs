// Pre-render the app's screens INTO the one-file build, so the page is never
// blank — even in viewers that block JavaScript (WhatsApp preview, iOS Quick
// Look, corporate browsers, old Android WebViews).
//
//   node tools/prerender.cjs KRISHIMITRA.html
//
// How: boot the real app in jsdom, snapshot each view's rendered HTML, and
// write those snapshots back into the file as the sections' initial content.
// When JavaScript IS available the app boots and replaces them with live views.
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
function loadJsdom(){
  for (const t of ['jsdom', '/tmp/domtest/node_modules/jsdom']) { try { return require(t); } catch {} }
  const { execSync } = require('child_process');
  execSync('mkdir -p /tmp/domtest && cd /tmp/domtest && npm install jsdom --silent --no-fund --no-audit', { stdio: 'ignore' });
  return require('/tmp/domtest/node_modules/jsdom');
}
({ JSDOM, VirtualConsole } = loadJsdom());

const FILE = path.resolve(process.argv[2] || '/home/user/KRISHIMITRA.html');
const source = fs.readFileSync(FILE, 'utf8');

const PROBLEM = 'Try Opening this file in Chrome or Safari';   // keeps the marker greppable

const vc = new VirtualConsole();
vc.on('jsdomError', () => {});                                  // expected: no fetch/AbortController noise

const dom = new JSDOM(source, { url: 'file://' + FILE, runScripts: 'dangerously',
                               pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.HTMLMediaElement.prototype.play = function(){};
w.HTMLMediaElement.prototype.pause = function(){};

setTimeout(() => {
  const d = w.document;
  const VIEWS = ['sell', 'markets', 'alerts', 'sales', 'dashboard', 'profile', 'season', 'guidance', 'assistant'];

  let out = source;
  let injected = 0;
  const report = [];

  for (const id of VIEWS){
    const el = d.getElementById('view-' + id);
    if (!el) continue;
    const content = el.innerHTML.trim();
    if (!content){ report.push(`${id}: (empty, skipped)`); continue; }
    // match the empty placeholder in the source, whatever the whitespace
    const re = new RegExp(`<section id="view-${id}"(\\s+)class="view"><\\/section>`);
    if (!re.test(out)){ report.push(`${id}: placeholder not found`); continue; }
    out = out.replace(re, `<section id="view-${id}"$1class="view">${content}</section>`);
    injected++;
    report.push(`${id}: ${Math.round(content.length / 1024)} KB snapshot`);
  }

  // The no-JS viewer must see the app shell: un-hide it, and open on Sell decision.
  out = out.replace('<div id="app" style="display:none">', '<div id="app">');
  out = out.replace('<section id="view-sell" class="view">', '<section id="view-sell" class="view active">');

  // The auth screen is empty without JS — keep it out of the way.
  out = out.replace('<section id="view-auth" class="view"></section>',
                    '<section id="view-auth" class="view"><div class="card authcard"><div class="logo">🌱</div>' +
                    '<h1>KrishiMitra</h1><div class="tag">Know Your Market. Choose Your Moment.</div>' +
                    '<p class="sourcenote">Sign-in needs JavaScript. This saved copy runs fully offline in Demo mode.</p></div></section>');

  // Friendly banner for JavaScript-less viewers (styled with the app's own CSS).
  const banner = `
<noscript>
  <div style="background:#FDEBD9;color:#7A4A14;padding:14px 18px;font:14px/1.6 'Segoe UI',system-ui,sans-serif;border-bottom:1px solid #F3D9BC">
    <b>You are seeing a saved snapshot of KrishiMitra.</b>
    This viewer has JavaScript switched off (this is normal in WhatsApp previews and iOS Quick Look),
    so the buttons here will not respond and the walkthrough video cannot play.<br>
    <b>To use the full app:</b> save this file, then open it in
    <b>Chrome</b> or <b>Safari</b> — on Android tap ⋮ → <i>Open with → Chrome</i>; on iPhone tap the
    share icon → <i>Open in Safari</i>. The app then runs fully <b>offline</b>, video included.
  </div>
</noscript>`;
  out = out.replace('<body>', '<body>' + banner);

  fs.writeFileSync(FILE, out, 'utf8');
  console.log('pre-rendered snapshots written into:', path.basename(FILE));
  report.forEach(r => console.log('  ·', r));
  console.log(`  · ${injected} views injected · size ${(fs.statSync(FILE).size/1048576).toFixed(2)} MB`);
  process.exit(0);
}, 2600);
