// ============================================================================
//  tests/onboarding_test.cjs — the first-run tour
// ----------------------------------------------------------------------------
//  Runs the real module in jsdom and checks the behaviour a farmer depends on:
//    • shows exactly once, and a skip is remembered (no nagging)
//    • Next walks 3 cards, the last one finishes
//    • Esc / ✕ / backdrop close it
//    • it renders in Hindi and Assamese, not English-with-different-buttons
//    • the "?" button reopens it after it has been seen
//    • a broken localStorage cannot crash boot
// ============================================================================

const path = require('path');
const { JSDOM } = require('jsdom');

const out = [];
const check = (n, c, x) => out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  → ' + x : ''}`);

const MOD = 'file://' + path.join(__dirname, '..', 'src', 'js', 'onboarding.js').replace(/\\/g, '/');

function freshDom() {
  const dom = new JSDOM('<!doctype html><html><body><header id="topbar"><button id="installBtn">Install</button></header></body></html>', {
    url: 'https://krishimitra.example.workers.dev/'
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  return dom;
}

(async () => {
  freshDom();
  const ob = await import(MOD);
  const i18n = await import('file://' + path.join(__dirname, '..', 'src', 'js', 'i18n.js').replace(/\\/g, '/'));

  // ── 1) first run shows, second run does not ──────────────────────────
  ob.resetOnboarding();
  check('fresh device → shouldShow() true', ob.shouldShow() === true);
  const root = ob.maybeShowOnboarding();
  check('maybeShowOnboarding mounts a dialog', !!root && root.getAttribute('role') === 'dialog');
  check('mounts exactly one overlay', globalThis.document.querySelectorAll('.kmob').length === 1);
  check('first card is step 1 of 3', globalThis.document.querySelectorAll('.kmob-dot').length === 3
        && globalThis.document.querySelector('.kmob-dot.on') === globalThis.document.querySelector('.kmob-dot'));

  // ── 2) Next walks all three cards, then finishes ─────────────────────
  const title0 = globalThis.document.querySelector('.kmob-title').textContent;
  globalThis.document.querySelector('.kmob-next').click();
  const title1 = globalThis.document.querySelector('.kmob-title').textContent;
  globalThis.document.querySelector('.kmob-next').click();
  const title2 = globalThis.document.querySelector('.kmob-title').textContent;
  check('three cards have three different titles', new Set([title0, title1, title2]).size === 3,
        [title0, title1, title2].map(t => t.slice(0, 18)).join(' | '));
  check('last card is the install card', /install|internet/i.test(title2), title2.slice(0, 40));
  check('last button says "Got it", not "Next"', /got it/i.test(globalThis.document.querySelector('.kmob-next').textContent));
  check('skip is hidden on the last card', globalThis.document.querySelector('.kmob-skip').style.visibility === 'hidden');

  globalThis.document.querySelector('.kmob-next').click();     // finish
  check('finishing removes the overlay', globalThis.document.querySelectorAll('.kmob').length === 0);
  check('finishing remembers it', ob.shouldShow() === false && ob.ONBOARD_KEY === 'km_onboard_v1');
  check('second run mounts nothing', ob.maybeShowOnboarding() === null);

  // ── 3) skip is remembered too ────────────────────────────────────────
  ob.resetOnboarding();
  const r2 = ob.createOnboarding();
  globalThis.document.querySelector('.kmob-skip').click();
  check('skip closes and marks seen', globalThis.document.querySelectorAll('.kmob').length === 0 && ob.shouldShow() === false);
  check('skip left the root detached', !!r2 && !globalThis.document.body.contains(r2));

  // ── 4) Esc and ✕ close ───────────────────────────────────────────────
  ob.resetOnboarding();
  ob.createOnboarding();
  globalThis.document.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'Escape' }));
  check('Esc closes the tour', globalThis.document.querySelectorAll('.kmob').length === 0);

  ob.resetOnboarding();
  const r4 = ob.createOnboarding();
  r4.querySelector('.kmob-x').click();
  check('✕ closes the tour', globalThis.document.querySelectorAll('.kmob').length === 0);

  // ── 5) the tour actually translates ─────────────────────────────────
  i18n?.setLang?.('hi');
  ob.resetOnboarding();
  ob.createOnboarding();
  const hi = globalThis.document.querySelector('.kmob-title').textContent;
  const hiBody = globalThis.document.querySelector('.kmob-body').textContent;
  const hiNext = globalThis.document.querySelector('.kmob-next').textContent;
  check('Hindi title is Devanagari, not English', /[\u0900-\u097F]/.test(hi), hi.slice(0, 34));
  check('Hindi body is Devanagari', /[\u0900-\u097F]/.test(hiBody));
  check('Hindi button says आगे', hiNext.trim() === 'आगे', hiNext);
  check('no raw i18n key leaked into the UI', !/^ob\.s\d\./.test(hi));

  // language switch from inside the card
  globalThis.document.querySelector('[data-lang="as"]').click();
  const as = globalThis.document.querySelector('.kmob-title').textContent;
  check('in-card language switch renders Assamese', /[\u0980-\u09FF]/.test(as), as.slice(0, 34));
  check('switch changed the stored language', i18n.getLang() === 'as', i18n.getLang());

  i18n.setLang('en');
  ob.resetOnboarding();

  // ── 6) the "?" button reopens it ────────────────────────────────────
  const help = ob.ensureHelpButton();
  check('help button injected into the topbar', !!help && help.id === 'kmHelpBtn'
        && help.parentNode && help.parentNode.id === 'topbar');
  check('help button is idempotent', ob.ensureHelpButton().id === 'kmHelpBtn'
        && globalThis.document.querySelectorAll('#kmHelpBtn').length === 1);
  help.click();
  check('help button opens the tour after it was seen',
        globalThis.document.querySelectorAll('.kmob').length === 1);
  globalThis.document.querySelector('.kmob-skip').click();

  // ── 7) private-mode localStorage cannot crash the app ───────────────
  const boom = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('SecurityError'); },
    removeItem() { throw new Error('SecurityError'); }
  };
  const realLS = globalThis.localStorage;
  globalThis.localStorage = boom;
  let crashed = false;
  try {
    ob.shouldShow();
    ob.markSeen();
    ob.resetOnboarding();
  } catch { crashed = true; }
  check('a throwing localStorage does not crash boot', crashed === false);
  check('shouldShow() defaults to true when storage is unreadable', ob.shouldShow() === true);
  globalThis.localStorage = realLS;

  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} checks passed   onboarding`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
