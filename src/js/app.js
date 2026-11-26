import { verifiedAccount, mountApprovalInfo } from "./access.js";
// App orchestrator: boots the app, watches auth, loads data, wires the demo mode.
import { state, resetData } from "./state.js";

// Farmer- and mandi-typed text must never be parsed as markup (live XSS test, 2026-11-08).
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// A photo src is an attribute too: only http(s) and data:image may pass. A
// javascript: or vbscript: URL in an <img src> is not a script today, but the
// same field is reused for links elsewhere — one rule, everywhere.
const safeSrc = u => /^(https?:|data:image\/)/i.test(String(u || '')) ? String(u) : '';
import { revealView, animate, ease, prefersReduced } from "./motion.js";
import { show, toast, loadingHTML, setDemoBanner, setDemoBannerText, setUserChip, showApp, hideApp } from "./ui.js";
import { renderAuth, renderVerification, initAuth, logout } from "./auth.js";
import { renderHaat, preloadHaats } from "./haats.js";
import { openFeedback, loadFeedback, feedbackText } from "./feedback.js";
import { renderRegister } from "./register.js";
import { renderProfile } from "./profile.js";
import { loadCrops, renderSeason, seasonSummary, CROPS } from "./crops.js";
import { getWeather, renderWeatherBlock } from "./weather.js";
import { refreshMarkets, renderMarkets } from "./markets.js";
import { refreshRisks, risksHTML } from "./risk.js";
import { renderGuidance, buildGuidance } from "./guidance.js";
import { renderAssistant } from "./assistant.js";
import { firebaseConfig, dataGov } from "./config.js";
import { setLiveConfig } from "./live-prices.js";
import { priceSourceLine } from "./live-prices.js";
import { initBackNavigation } from "./ui.js";
import { buildTabBar } from "./tabbar.js";
import { renderSell, wireSellForm, focusSellForm, setReferenceMandi, setPersonaName } from "./sell.js";
import { renderAlerts } from "./alerts.js";
import { renderSales, seedIfEmpty, salesCardHTML } from "./sales.js";
import { applyRole, isMandi, homeView, setRole, role, MANDI, FARMER } from "./roles.js";
import { renderDemand } from "./demand-view.js";
import { renderBuyList } from "./desk-buy.js";
import { pullDemands, flushDemandPending } from "./demand.js";
import { mountNavGlide, placeNavGlide } from "./navglide.js";
import { renderReportDesk } from "./report-desk.js";
import { startMandiFeed, seedBoardFromDevice, flushPending } from "./mandi-feed.js";
import { getLang, setLang, applyI18n, t } from "./i18n.js";
import { maybeShowOnboarding, ensureHelpButton } from "./onboarding.js";
import { checkAlerts, notify, alertText } from "./rate-alerts.js";

// If Firebase keys are not configured yet, run in demo mode automatically —
// so the hosted URL works for anyone without a query string.
// Demo seed = paddy / Duliajan, the numbers in the judge script.
function firebaseConfigured(){
  return !!(firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE'));
}

// The single-file build has no network and a stubbed auth layer. Even with a
// real Firebase config in place, it must open straight into the demo — that is
// the whole point of the 128 KB file.
function offlineBuild(){
  return typeof window !== 'undefined' && window.KM_SKIP_REGISTER === true;
}

const DEMO_SEED = {
  profile: { name: 'Ramen Bora', phone: '+919876500000', village: 'Duliajan',
             district: 'Dibrugarh', state: 'Assam',
             lat: 27.3667, lng: 95.3167, acres: 2, soil: 'Loamy', irrigation: 'Rain-fed' },
  season:  { crop: 'paddy', variety: 'Common', stage: 'maturity', quantityQtl: 27.6,
             sowingDate: new Date(Date.now() - 118 * 86400000).toISOString().slice(0, 10) }
};

// Log out. With Firebase configured this signs the session out; in demo mode
// (and in the offline build) there is no session to sign out of, so it clears
// the device's demo data and returns to the registration screen. Either way the
// button must do something visible — a dead button reads as a broken app.
async function doLogout(){
  const keys = ['km_demo_profile','km_demo_season','km_registered','km_demo_guidanceLog'];
  try { keys.forEach(k => localStorage.removeItem(k)); } catch (e){}
  try { await logout(); } catch (e){ /* no Firebase session in demo — expected */ }
  location.reload();
}

// Registration runs once per device, unless the demo is requested explicitly.
// The offline single-file build sets window.KM_SKIP_REGISTER so that
// "double-click → SELL 60% NOW" stays a one-step demo.
function needsRegistration(){
  if (typeof window !== 'undefined' && window.KM_SKIP_REGISTER === true) return false;
  if (new URLSearchParams(location.search).get('demo') === '1') return false;
  // The flag has to belong to the ACCOUNT, not the browser: on a shared phone a
  // second farmer who signs in must still be asked to set up their own farm.
  const uid = state.user?.uid;
  const key = uid && uid !== 'demo' ? 'km_registered_' + uid : 'km_registered';
  try { return !localStorage.getItem(key); } catch (e){ return false; }
}

// Belt and braces: with no profile there is nothing to show a verdict about.
// Ask for one regardless of any stored flag.
// The farm wizard, on demand. It used to be a wall in front of the app; now it
// is the "Set up my farm" route — and it can be opened from anywhere.
function openRegister(){
  hideApp();
  renderRegister();
  show('auth');
}
try { window.kmOpenRegister = openRegister; } catch {}
// Read-only window into the app state, for support and for tests. Harmless.
// Internal app state is not exposed as a production debug hook.

// The splash is an overlay in index.html, not a screen: nothing behind it
// changes, so guest-first stays guest-first and no sign-in wall appears with it.
// It lifts as soon as a real screen exists, but never in under a second — a logo
// that blinks past in 80 ms reads as a glitch, not a brand. And if the app never
// gets here at all, the CSS timer in index.html lifts it anyway.
const BOOT_AT = Date.now();
export function liftSplash(){
  const el = document.getElementById('splash');
  if (!el || el.dataset.lifting) return;
  el.dataset.lifting = '1';
  const wait = Math.max(0, 1000 - (Date.now() - BOOT_AT));
  setTimeout(() => {
    el.classList.add('done');
    setTimeout(() => el.remove(), 480);     // after the fade, out of the way
  }, wait);
}

// Opens the sign-in screen from inside the app (Profile, or the header button).
export function startAuthScreen(){
  hideApp();
  renderAuth();
  show('auth');
}

// First-run guidance: one card, two choices, then it is gone for good.
// It never blocks anything — closing it leaves the farmer exactly where he was.
const SETUP_SEEN = 'km_setup_seen';
function renderSetupCard(){
  const el = document.getElementById('setupcard');
  if (!el) return;
  const seen = (() => { try { return localStorage.getItem(SETUP_SEEN) === '1'; } catch { return true; } })();
  if (!state.demo || seen){ el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  el.innerHTML = `
    <div class="setupcard">
      <div class="scrow">
        <div class="scicon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26">
            <path d="M4.5 19.5C4.5 11 10.5 4.5 19.5 4.5c0 9-6.5 15-15 15Z" fill="#0B4A2F"/>
            <path d="M6 18C9 13 13 9 18 6.5" stroke="#E2892B" stroke-width="1.8"
                  stroke-linecap="round" fill="none"/>
          </svg>
        </div>
        <div class="sctext">
          <b>Apna khet batao</b>
          <span>Gaon, fasal aur zameen — 30 second. Uske baad saare number aapke apne honge.</span>
        </div>
      </div>
      <div class="scact">
        <button class="btn scstart" id="scStart">Set up now</button>
        <button class="btn ghost scskip" id="scSkip">Sample dekh lu</button>
      </div>
    </div>`;
  const close = () => { try { localStorage.setItem(SETUP_SEEN, '1'); } catch {} el.style.display = 'none'; el.innerHTML = ''; };
  el.querySelector('#scStart').onclick = () => { close(); document.querySelector('.navbtn[data-view="season"]').click(); };
  el.querySelector('#scSkip').onclick = close;
}

function mustRegister(){
  return !state.profile || needsRegistration();
}

// A promise that gives up instead of hanging.
// Firestore's getDoc() has no client-side timeout: on a weak connection it can
// stay pending for minutes, which is how the app ended up on a blank screen.
function withTimeout(promise, ms, what){
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} took longer than ${ms}ms`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

async function boot(){
  // ---- language: applies to the nav and the decision screens ----
  const langSel = document.getElementById('langSel');
  if (langSel){
    langSel.value = getLang();
    langSel.onchange = () => { setLang(langSel.value); paintNavLabels(); };
  }
  paintNavLabels();

  setLiveConfig(dataGov);          // live AGMARKNET feed settings (js/config.js)
  setReferenceMandi(dataGov.referenceMandi);   // which mandi's series the trend chart follows
  // The greeting shows the farmer who registered. personaName in config.js is only
  // a fallback for the offline demo where nobody has registered.
  setPersonaName('');
  const params = new URLSearchParams(location.search);
  // ?local=1 → no account, but the farmer still registers their own farm.
  // It used to be the only way in without Firebase, and it also switched
  // the government feed off. Now that sign-in works, a stale ?local=1 left in a
  // bookmark must not quietly downgrade the app — it only skips the demo seed.
  const LOCAL_MODE = false;
  state.demo = false;
  state.localMode = LOCAL_MODE;

  // Must load the crop table BEFORE rendering the season view — but a missing
  // data/crops.json (offline, cache evicted, new deploy) must not abort the boot.
  // Before this try/catch, a failed fetch here rejected boot() and the farmer got
  // a white page: the splash had already left on its CSS timer and nothing had
  // been rendered behind it. Degrade to the rest of the app instead.
  try { await loadCrops(); }
  catch (err) { console.warn('[boot] crops table unavailable — continuing without it', err); }
  preloadHaats().catch(() => {});   // the haat/bazar rows live in the same dataset

  renderAuth();
  liftSplash();                 // the sign-in screen is on screen — the logo can go
  // Tells the inline watchdog in index.html to stand down. That watchdog is the
  // only thing between a broken module graph and a blank white page.
  if (typeof window.__kmBooted === 'function') window.__kmBooted();
  // If Firebase's CDN cannot be reached, onAuthStateChanged never fires and the
  // app would sit blank forever. Reveal the sign-in screen (which carries the
  // "continue without an account" route) after a few seconds.
  setTimeout(() => {
    const hidden = document.getElementById('app').style.display === 'none';
    const authVisible = document.getElementById('view-auth').classList.contains('active');
    if (hidden && !authVisible){ show('auth'); }
    liftSplash();               // whatever happened, the splash is not a place to live
    const wait = document.getElementById('authWait');
    if (wait && hidden) wait.style.display = 'block';
  }, 6000);

  renderProfile();
  renderSeason();
  renderMarkets();
  renderGuidance();
  renderAssistant();
  renderSell();
  renderAlerts();
  renderSales();

  buildTabBar();          // 10 buttons → 4 tabs + More (before the pill measures)
  mountNavGlide();
  const RERENDER = { dashboard: renderDashboard, guidance: renderGuidance,
                     sell: renderSell, alerts: renderAlerts, sales: renderSales,
                     markets: renderMarkets, demand: renderDemand, deskbuy: renderBuyList,
                     haats: renderHaat };
  document.querySelectorAll('.navbtn').forEach(b =>
    b.addEventListener('click', () => {
      show(b.dataset.view);
      RERENDER[b.dataset.view]?.();
      // Cards rise in sequence after the render — the anime.js-site feel, done
      // with one rAF loop and a transform per card, no library.
      revealView(document.getElementById('view-' + b.dataset.view));
      if (b.dataset.view === 'assistant') window.kmRepaintAssistant?.();
    }));
  // Field-test feedback: one tap from the More sheet, and a viewer so the tester
  // can send everything to me on WhatsApp when he is back on the road.
  const fbBtn = document.getElementById('feedbackBtn');
  if (fbBtn) fbBtn.onclick = () => openFeedback();
  const fbView = document.getElementById('feedbackViewBtn');
  if (fbView) fbView.onclick = () => {
    const list = loadFeedback();
    const txt = feedbackText();
    const host = document.createElement('div');
    host.innerHTML = `<div class="card km-sheet" style="position:fixed;inset:auto 0 0 0;z-index:9999;margin:0;
        border-radius:20px 20px 0 0;padding:18px 16px 26px;background:var(--surface);max-height:80vh;overflow:auto;
        box-shadow:0 -12px 40px rgba(0,0,0,.25)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b style="color:var(--green-900)">Test feedback (${list.length})</b>
        <button id="fbvClose" style="border:0;background:transparent;font-size:22px">×</button></div>
      ${list.length ? `<pre style="white-space:pre-wrap;font-size:13.5px;margin-top:12px">${txt.replace(/</g,'&lt;')}</pre>
        <button class="btn" id="fbvCopy" style="width:100%;margin-top:10px">Copy — WhatsApp pe bhejo</button>`
        : '<div class="statlabel" style="margin-top:12px">Abhi kuch nahi. Kisan se poochho, phir "Kuch kehna hai?" dabao.</div>'}
    </div>`;
    document.body.appendChild(host.firstElementChild);
    document.getElementById('fbvClose').onclick = () => host.remove();
    const copy = document.getElementById('fbvCopy');
    if (copy) copy.onclick = async () => {
      try { await navigator.clipboard.writeText(txt); toast('Copy ho gaya'); }
      catch { toast('Copy nahi hua — screenshot le lo.'); }
    };
  };

  document.getElementById('logoutBtn').onclick = () => {
    // A guest has no session to end — the same button should offer one instead.
    if (state.demo){ startAuthScreen(); return; }
    doLogout();
  };

  // Android's system back button walks back through tabs instead of closing.
  initBackNavigation(() => { try { window.close(); } catch {} });
  // Deep links: #markets, #alerts … open that tab directly (shareable, and the
  // shape a Play Store install can launch with).
  try {
    const wanted = (location.hash || '').replace('#', '').trim();
    const btn = wanted && document.querySelector(`.navbtn[data-view="${wanted}"]`);
    if (btn) btn.click();
  } catch {}

  initAuth(async user => {
    if (!verifiedAccount(user)) {
      state.demo = false; state.localMode = false;
      resetData();
      document.getElementById('kmDeskApprovalInfo')?.remove();
      hideApp();
      if (user && !user.isAnonymous) renderVerification(user); else renderAuth();
      show('auth'); liftSplash();
      return;
    }
    state.demo = false; state.localMode = false;
    setDemoBanner(false);
    setUserChip(user.email);
    // A real uid just arrived: everything the board queued while signed out can
    // finally be written, and the farmer should see it happen.
    flushDemandPending()
      .then(r => { if (r && r.sent){ try { renderDemand(); } catch {} } })
      .catch(() => {});
    showApp();
    liftSplash();

    // Paint first, fetch second. The app used to show the shell and then sit on
    // two Firestore reads before rendering any view — on a slow connection the
    // farmer got a blank white page for as long as getDoc() took (it has no
    // client-side timeout). Everything below can run on this device's copy, so
    // put a real screen up immediately and upgrade it when the cloud answers.
    renderProfile(); renderSeason(); renderSell(); renderAlerts(); renderSales();
    show(state.profile ? homeView() : 'sell');
    offerOnboarding();

    let cloudOk = true;
    try {
      const store = await import('./store.js');
      state.profile = await withTimeout(store.loadProfile(), 8000, 'profile');
      state.season  = await withTimeout(store.loadSeason(),  8000, 'season');
    } catch (e){
      // Offline, blocked, or Firestore too slow: the device copy still works.
      cloudOk = false;
      console.warn('Cloud data did not arrive — continuing on this device:', e.message);
    }

    if (state.profile?.role) setRole(state.profile.role);
    else applyRole();
    seedBoardFromDevice();
    startMandiFeed().catch(() => {});      // live price board for both roles
    renderProfile();          // re-render forms now that state has data
    renderSeason();
    renderSell(); renderAlerts(); renderSales();
    // Only ask a farmer to register when the cloud actually answered and came
    // back empty. A failed read must never look like "you have no account".
    if (cloudOk && mustRegister()){
      hideApp();
      renderRegister();
      show('auth');
      loadLiveData();
      return;
    }
    show(state.profile ? homeView() : (cloudOk ? 'profile' : 'sell'));
    mountApprovalInfo();
    loadLiveData();
  });
}

// Load weather (live, cached fallback) + markets, then risks & dashboard.
export async function loadLiveData(){
  if (state.profile){
    try { state.weather = await getWeather(state.profile.lat, state.profile.lng); }
    catch (e) { state.weather = null; console.warn('Weather unavailable:', e.message); }
  }
  // Both roles need the board: the farmer to choose a gate, the desk to see how
  // its own gate compares with the rest (Gate watch).
  try { await refreshMarkets(); } catch (e) { console.warn('Markets unavailable:', e.message); }
  refreshRisks();
  refreshSourceBanner();

  // Price alerts the farmer set himself: checked when prices land, once per crossing.
  try {
    const fired = checkAlerts();
    if (fired.length){
      notify(fired);
      toast(alertText(fired[0]));
    }
  } catch (e){ console.warn('Alert check failed:', e.message); }

  // Anything a mandi desk posted while offline goes up now.
  flushPending().catch(() => {});
  // Buyer demands posted by any desk — the farmer side of the board.
  // Pull the board BEFORE the first paint, then repaint: a farmer should not
  // stare at "No desk is buying" and only see an open desk appear after
  // switching tabs.
  // Anything the board queued before sign-in goes up now that there is a uid.
  flushDemandPending()
    .then(r => { if (r && r.sent) { try { renderDemand(); } catch {} } })
    .catch(() => {});
  pullDemands()
    .then(r => { if (r && r.ok && r.count) { try { renderDemand(); } catch {} } })
    .catch(() => {});
  renderDashboard();
  renderMarkets();
  renderSell();
  renderAlerts();
  renderSales();
  if (document.getElementById('view-guidance').classList.contains('active')) renderGuidance();
  armFeedRetry();                   // DEMO now does not mean DEMO in two minutes
}

// Nav labels follow the chosen language; English stays the fallback.
function paintNavLabels(){
  const map = { sell:'nav.sell', markets:'nav.markets', alerts:'nav.alerts', sales:'nav.sales',
                assistant:'nav.assistant', dashboard:'nav.dashboard', profile:'nav.profile',
                season:'nav.season', guidance:'nav.guidance',
                demand:'nav.demand', deskbuy:'nav.deskbuy' };
  for (const [view, key] of Object.entries(map)){
    const b = document.querySelector(`.navbtn[data-view="${view}"]`);
    if (b) b.textContent = t(key);
  }
  applyI18n(document);
  applyRole();          // the mandi/farmer rename runs after the language pass
  placeNavGlide(null, { animate: false });   // labels changed width → re-measure
  document.dispatchEvent(new CustomEvent('km:lang-changed'));
}

function renderDashboard(){
  // One route, two audiences: a mandi desk reports prices, it does not read a
  // sell verdict for stock it does not hold.
  if (isMandi()){ renderReportDesk(); return; }
  const v = document.getElementById('view-dashboard');
  const hasProfile = !!state.profile;
  const best = state.markets?.[0];
  const g = (state.markets.length && state.weather) ? buildGuidance() : null;

  v.innerHTML = `
    <h2>Dashboard</h2>
    <p class="sub">${hasProfile
      ? `Your farm at a glance — ${esc(state.profile.village)}.`
      : 'Start by setting up your farm profile.'}</p>

    <div class="grid">
      <div class="card">
        <b style="color:var(--green)">This season</b>
        <div style="margin-top:8px">${seasonSummary()}</div>
        <button class="btn small" style="margin-top:10px" onclick="document.querySelector('[data-view=season]').click()">Update crop</button>
      </div>

      <div class="card">
        <b style="color:var(--green)">Weather now</b>
        <div id="dashWeather" style="margin-top:8px">
          ${renderWeatherBlock()}
        </div>
      </div>

      <div class="card">
        <b style="color:var(--green)">Best market today</b>
        <div style="margin-top:8px">
          ${best
            ? `<div class="stat">${'₹' + best.netPerQtl.toLocaleString('en-IN')}<span class="statlabel"> /q net</span></div>
               <p class="statlabel">${best.name} · ${best.distanceKm} km · ≈ ₹${best.earnings.toLocaleString('en-IN')} total</p>`
            : '<p class="empty">Markets appear once your crop is set.</p>'}
        </div>
        <button class="btn small" style="margin-top:10px" onclick="document.querySelector('[data-view=markets]').click()">Compare markets</button>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <b style="color:var(--green)">Today's signals</b>
      <div id="dashRisks" style="margin-top:10px">${risksHTML()}</div>
      ${g ? `<button class="btn orange" style="margin-top:6px" onclick="document.querySelector('[data-view=guidance]').click()">See my guidance →</button>` : ''}
    </div>

    ${salesCardHTML()}`;
}

// Keeps the banner and footer honest about where the numbers came from.
function refreshSourceBanner(){
  const src = state.priceSource || {};
  // The banner must talk about the PRICES, not about whether an account exists.
  // A guest with live government rates used to be told "sample data" all day —
  // the one thing a farmer must never be told wrongly.
  const pricesLive = src.source === 'LIVE' || src.source === 'LAST KNOWN';
  if (state.demo && pricesLive){
    setDemoBannerText(
      `LIVE government prices · AGMARKNET${src.govDate ? ' · ' + src.govDate : ''}` +
      ' &nbsp;<a href="#" id="bannerAcct" style="color:inherit;font-weight:700">Account banao (cloud backup) →</a>');
    try {
      document.getElementById('bannerAcct').onclick = e => {
        e.preventDefault(); startAuthScreen();
      };
    } catch {}
  } else if (state.demo){
    // Short by design: the long explanation lives inside the screens that show
    // prices. A banner that repeats itself three times reads as a defect.
    setDemoBannerText(
      `Sample data on this device · weather is live · prices: prototype dataset` +
      ' &nbsp;<a href="#" id="bannerSetup" style="color:inherit;font-weight:700">Set up my farm →</a>' +
      ' &nbsp;·&nbsp;<a href="#" id="bannerLive" style="color:inherit;font-weight:800">LIVE karo →</a>');
    try {
      document.getElementById('bannerSetup').onclick = e => {
        e.preventDefault();
        document.querySelector('.navbtn[data-view="season"]').click();
      };
      // The price-source card used to be the last thing on the Dashboard, three
      // taps deep. When the numbers are prototype data, the way to real ones
      // belongs one tap from the screen that shows them.
      document.getElementById('bannerLive').onclick = e => {
        e.preventDefault();
        document.querySelector('.morebtn')?.click();
        document.querySelector('.navbtn[data-view="dashboard"]').click();
        setTimeout(() => {
          const slot = document.querySelector('.keyslot');
          if (slot){ slot.open = true; slot.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        }, 220);
      };
    } catch {}
  } else {
    setDemoBanner(false);
  }
  const f = document.getElementById('footnote');
  if (f) f.innerHTML = 'KrishiMitra · Student innovation prototype · Weather: LIVE (Open-Meteo) · ' +
    'Market prices: ' + priceSourceLine();
}

// The shared government sample key is throttled for hours at a time, so a page
// load can land in a dry window and fall back to DEMO even though the very same
// worker answers fine two minutes later. Rather than making the farmer refresh
// by hand, keep asking in the background and repaint the moment it connects.
let feedRetryTimer = null;
let feedRetryCount = 0;
function armFeedRetry(){
  const inTest = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
  if (inTest || typeof setTimeout !== 'function') return;
  if (feedRetryTimer || (state.priceSource && state.priceSource.source === 'LIVE')) return;
  if (feedRetryCount >= 10) return;
  feedRetryTimer = setTimeout(async () => {
    feedRetryTimer = null;
    feedRetryCount++;
    try { await refreshMarkets(); } catch (e) { console.warn('retry failed:', e.message); }
    refreshRisks();
    refreshSourceBanner();
    renderDashboard();
    renderMarkets();
    renderSell();
    const nowLive = state.priceSource && state.priceSource.source === 'LIVE';
    if (nowLive){
      toast('Government prices connected — LIVE');
    } else {
      armFeedRetry();                 // still dry — try again shortly
    }
  }, 15000);
}

// Any module can trigger a reload of derived data:
document.addEventListener('km:data-changed', () => { loadLiveData(); });

// Switching role repaints the one shared dashboard: mandi desk in, farm view out.
document.addEventListener('km:role-changed', () => {
  renderDashboard();
  show(homeView());
});

// Real road distances arrive after the first paint. Repaint only — asking for
// the weather and the price feed again would restart the whole cycle.
document.addEventListener('km:distances', () => {
  renderSell(); renderMarkets(); renderAlerts(); renderDashboard();
});

// ---------- PWA: service worker + install button ----------
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('Service worker ready — app works offline'))
      .catch(e => console.warn('SW registration failed:', e.message));
  });
}
let deferredInstall = null;

// iOS never fires beforeinstallprompt. That meant an iPhone user saw NO install
// button at all — the one thing a richer phone gets is a worse install path.
// iPadOS reports itself as a Mac, so the touch-point check is needed too.
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
const isStandaloneApp = () => (window.matchMedia &&
  window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

function iosInstallGuideHTML(){
  const step = (n, t) => `<div style="display:flex;gap:10px;align-items:flex-start;margin:10px 0">
      <b style="flex:0 0 22px;height:22px;border-radius:50%;background:var(--green);color:var(--surface);
                display:grid;place-items:center;font-size:13.5px">${n}</b>
      <span>${t}</span></div>`;
  return `<div id="iosGuide" style="position:fixed;left:0;right:0;bottom:0;z-index:99;padding:0 12px 12px">
    <div style="background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;
                box-shadow:0 -8px 30px rgba(0,0,0,.18);max-width:520px;margin:0 auto">
      <div style="display:flex;align-items:center">
        <b style="font-size:15.5px">iPhone par app jaisa kholo</b>
        <button id="iosGuideClose" aria-label="Band karo"
          style="margin-left:auto;background:none;border:0;font-size:22px;line-height:1;color:var(--muted)">×</button>
      </div>
      <p class="statlabel" style="margin:6px 0 2px">Offline chalega, home screen par icon ban jayega.</p>
      ${step(1, 'Neeche <b>Share</b> button dabao — chhota square jisme teer upar jaata hai.')}
      ${step(2, 'Menu scroll karke <b>Add to Home Screen</b> chuno.')}
      ${step(3, 'Upar daayein <b>Add</b> dabao. Bas.')}
    </div></div>`;
}

function showIOSInstallGuide(){
  if (document.getElementById('iosGuide')) return;
  document.body.insertAdjacentHTML('beforeend', iosInstallGuideHTML());
  const close = document.getElementById('iosGuideClose');
  if (close) close.onclick = () => document.getElementById('iosGuide')?.remove();
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  const btn = document.getElementById('installBtn');
  btn.style.display = 'inline-block';
  btn.onclick = async () => {
    btn.style.display = 'none';
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
  };
});
window.addEventListener('appinstalled', () => toast('KrishiMitra installed to your home screen ✓'));

// iOS: same button, Apple's instructions, because there is no prompt to call.
if (isIOS() && !isStandaloneApp()){
  const btn = document.getElementById('installBtn');
  if (btn){
    btn.style.display = 'inline-block';
    btn.onclick = showIOSInstallGuide;
  }
}

window.kmFocusSellForm = focusSellForm;

// First-run tour. Deliberately AFTER the decision screen is on screen: the farmer
// sees a working app first, and the tour explains it rather than delaying it.
// A skip or a close is remembered, and the "?" in the topbar reopens it any time.
function offerOnboarding(){
  try {
    ensureHelpButton();
    maybeShowOnboarding();
  } catch (e) { console.warn('[onboarding] skipped', e && e.message); }
}
window.kmOfferOnboarding = offerOnboarding;

// boot() is async. An unhandled rejection here used to fail silently and leave the
// white page nobody could explain. Show the sign-in screen instead: it is the one
// screen that also carries the "continue without an account" route.
boot().catch(err => {
  console.error('[boot] failed', err);
  try { show('auth'); liftSplash(); } catch (_) {}
  try { toast('App poora load nahi hua. Internet se ek baar khol ke dekho.'); } catch (_) {}
});
