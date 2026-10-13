// The WhatsApp/iOS-preview problem: viewers that block JavaScript showed a
// blank page. This test loads the one-file build with scripts DISABLED and
// asserts a real screen is visible — then loads it again normally to prove the
// live app still works.
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

const FILE = process.env.KM_APP || path.join(__dirname, '..', 'offline', 'KRISHIMITRA.html');
if (!fs.existsSync(FILE)) { console.log('SKIP nojs_test.cjs — build not present (see README)'); process.exit(0); }
const html = fs.readFileSync(FILE, 'utf8');
const out = [];
const check = (n, c, x) => out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  → ' + x : ''}`);
const clean = s => String(s).replace(/\s+/g, ' ');

// ─────────────── 1) JAVASCRIPT OFF (WhatsApp preview / Quick Look) ───────────────
{
  const dom = new JSDOM(html, { url: 'file://' + FILE });      // no runScripts → scripts do nothing
  const d = dom.window.document;
  const body = clean(d.body.textContent);
  const appVisible = !!(d.getElementById('app') && !/display:\s*none/.test(d.getElementById('app').getAttribute('style') || ''));

  check('app shell is visible without JavaScript', appVisible);
  check('Sell decision screen rendered', /SELL 60% NOW/.test(body), (body.match(/SELL \d+% NOW|SELL ALL NOW|WAIT|STORE/) || [])[0]);
  check('verdict details present (Jorhat ₹2,310, ₹62,928)',
        body.includes('2,310') && body.includes('62,928'));
  check('ingredients the judge looks for (confidence, reasons, signals)',
        /CONFIDENCE/.test(body) && /KRISHIMITRA RECOMMENDS/.test(body) && /Signals used/.test(body));
  check('chart is drawn as static SVG', !!d.querySelector('#view-sell .chart'));
  check('weather strip / advisory visible or honestly noted',
        /drying window|Rain is likely|Some rain possible|Live weather unavailable/i.test(body));
  check('comparison + alerts + sales snapshots present',
        /Jorhat Mandi/.test(clean(d.getElementById('view-markets').textContent)) &&
        clean(d.getElementById('view-alerts').textContent).length > 200 &&
        /Village trader/.test(clean(d.getElementById('view-sales').textContent)));
  check('noscript banner explains what to do', /saved snapshot of KrishiMitra/.test(html) && /Open in Safari/.test(html));
  check('sign-in screen shows something instead of blank',
        /KrishiMitra/.test(clean(d.getElementById('view-auth').textContent)));
  check('video still embedded (byte-identical payload)', /id="km-video-b64"/.test(html) && html.length > 15_000_000);

  dom.window.close();                    // release ~900 MB before the second load
  if (global.gc) global.gc();
}

// ─────────────── 2) JAVASCRIPT ON (real browsers) ───────────────
{
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Not implemented|Could not parse CSS|fetch|AbortController/i.test(e.message)) errs.push(e.message); });
  const dom = new JSDOM(html, { url: 'file://' + FILE, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.HTMLMediaElement.prototype.play = function(){}; w.HTMLMediaElement.prototype.pause = function(){};

  setTimeout(() => {
    const d = w.document;
    const sell = clean(d.getElementById('view-sell').textContent);
    check('live app still boots after pre-render (no console errors)', errs.length === 0, errs.slice(0, 2).join(' | '));
    check('live verdict intact', /SELL 60% NOW/.test(sell) && sell.includes('2,310'));
    check('live chart rendered', !!d.querySelector('#view-sell .chart'));
    check('nav tabs still work', (() => {
      const b = [...d.querySelectorAll('.navbtn')].find(x => x.dataset.view === 'alerts');
      b.click(); const ok = d.getElementById('view-alerts').classList.contains('active');
      [...d.querySelectorAll('.navbtn')].find(x => x.dataset.view === 'sell').click();
      return ok;
    })());
    check('pre-render did not duplicate view ids', d.querySelectorAll('#view-sell').length === 1);

    console.log(out.join('\n'));
    const failed = out.filter(l => l.startsWith('FAIL')).length;
    console.log(`\n${out.length - failed}/${out.length} checks passed`);
    process.exit(failed ? 1 : 0);
  }, 2600);
}
