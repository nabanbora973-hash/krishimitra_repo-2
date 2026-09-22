// App orchestrator: boots the app, watches auth, loads data, wires the demo mode.
import { state } from "./state.js";
import { show, toast, loadingHTML, setDemoBanner, setDemoBannerText, setUserChip, showApp, hideApp, roadmapCardHTML } from "./ui.js";
import { renderAuth, initAuth, logout } from "./auth.js";
import { renderProfile } from "./profile.js";
import { loadCrops, renderSeason, seasonSummary, CROPS } from "./crops.js";
import { getWeather, renderWeatherBlock } from "./weather.js";
import { refreshMarkets, renderMarkets } from "./markets.js";
import { refreshRisks, risksHTML } from "./risk.js";
import { renderGuidance, buildGuidance } from "./guidance.js";
import { renderAssistant } from "./assistant.js";
import { firebaseConfig, dataGov } from "./config.js";
import { setLiveConfig } from "./live-prices.js";
import { videoCardHTML } from "./video.js";
import { sourcesCardHTML, wireSourcesCard, priceSourceLine } from "./live-prices.js";
import { renderSell, wireSellForm, focusSellForm, setReferenceMandi, setPersonaName } from "./sell.js";
import { renderAlerts } from "./alerts.js";
import { renderSales, seedIfEmpty, salesCardHTML } from "./sales.js";

// If Firebase keys are not configured yet, run in demo mode automatically —
// so the hosted URL works for anyone without a query string.
// Demo seed = paddy / Duliajan, matching the walkthrough video's numbers.
function firebaseConfigured(){
  return !!(firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE'));
}

const DEMO_SEED = {
  profile: { village: 'Duliajan', lat: 27.3667, lng: 95.3167, acres: 2, soil: 'Loamy', irrigation: 'Rain-fed' },
  season:  { crop: 'paddy', variety: 'Common', stage: 'maturity', quantityQtl: 27.6,
             sowingDate: new Date(Date.now() - 118 * 86400000).toISOString().slice(0, 10) }
};

async function boot(){
  setLiveConfig(dataGov);          // live AGMARKNET feed settings (js/config.js)
  setReferenceMandi(dataGov.referenceMandi);   // which mandi's series the trend chart follows
  setPersonaName(dataGov.personaName);          // greeting name on the Sell decision screen
  state.demo = !firebaseConfigured()
            || new URLSearchParams(location.search).get('demo') === '1';

  await loadCrops();          // must load crop table BEFORE rendering season view

  renderAuth();
  renderProfile();
  renderSeason();
  renderMarkets();
  renderGuidance();
  renderAssistant();
  renderSell();
  renderAlerts();
  renderSales();

  const RERENDER = { guidance: renderGuidance, sell: renderSell, alerts: renderAlerts, sales: renderSales };
  document.querySelectorAll('.navbtn').forEach(b =>
    b.addEventListener('click', () => { show(b.dataset.view); RERENDER[b.dataset.view]?.(); }));
  document.getElementById('logoutBtn').onclick = () => logout();

  if (state.demo){
    state.user = { uid: 'demo', email: 'offline demo' };
    const ls = k => JSON.parse(localStorage.getItem('km_demo_' + k) || 'null');
    state.profile = ls('profile') || DEMO_SEED.profile;
    state.season  = ls('season')  || DEMO_SEED.season;
    seedIfEmpty(true);
    setDemoBanner(true);
    setUserChip('Demo mode');   // (banner text is refreshed after prices load)
    showApp();
    renderProfile();          // re-render forms now that state has data
    renderSeason();
    await loadLiveData();
    renderSell(); renderAlerts(); renderSales();
    show('sell');
    return;
  }

  initAuth(async user => {
    if (!user){ hideApp(); show('auth'); return; }
    setUserChip(user.email);
    showApp();
    state.profile = await (await import('./store.js')).loadProfile();
    state.season  = await (await import('./store.js')).loadSeason();
    renderProfile();          // re-render forms now that state has data
    renderSeason();
    await loadLiveData();
    renderSell(); renderAlerts(); renderSales();
    show(state.profile ? 'sell' : 'profile');
  });
}

// Load weather (live, cached fallback) + markets, then risks & dashboard.
export async function loadLiveData(){
  if (state.profile){
    try { state.weather = await getWeather(state.profile.lat, state.profile.lng); }
    catch (e) { state.weather = null; console.warn('Weather unavailable:', e.message); }
  }
  try { await refreshMarkets(); } catch (e) { console.warn('Markets unavailable:', e.message); }
  refreshRisks();
  refreshSourceBanner();
  renderDashboard();
  renderMarkets();
  renderSell();
  renderAlerts();
  renderSales();
  if (document.getElementById('view-guidance').classList.contains('active')) renderGuidance();
}

function renderDashboard(){
  const v = document.getElementById('view-dashboard');
  const hasProfile = !!state.profile;
  const best = state.markets?.[0];
  const g = (state.markets.length && state.weather) ? buildGuidance() : null;

  v.innerHTML = `
    <h2>Dashboard</h2>
    <p class="sub">${hasProfile
      ? `Your farm at a glance — ${state.profile.village}.`
      : 'Start by setting up your farm profile.'}</p>

    ${videoCardHTML()}

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

    ${salesCardHTML()}

    ${sourcesCardHTML()}

    ${roadmapCardHTML()}`;

  wireSourcesCard();
}

// Keeps the banner and footer honest about where the numbers came from.
function refreshSourceBanner(){
  const src = state.priceSource || {};
  if (state.demo){
    setDemoBannerText(
      `DEMO MODE — offline, no login. Weather is LIVE (Open-Meteo). Market prices: ${priceSourceLine()}`);
  }
  const f = document.getElementById('footnote');
  if (f) f.innerHTML = 'KrishiMitra · Student innovation prototype · Weather: LIVE (Open-Meteo) · ' +
    'Market prices: ' + priceSourceLine();
}

// Any module can trigger a reload of derived data:
document.addEventListener('km:data-changed', () => { loadLiveData(); });

// ---------- PWA: service worker + install button ----------
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('Service worker ready — app works offline'))
      .catch(e => console.warn('SW registration failed:', e.message));
  });
}
let deferredInstall = null;
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

window.kmFocusSellForm = focusSellForm;

boot();
