import { verifiedAccount } from "./access.js";
// UI helpers: router, badges, toast, formatting, states. No imports.
const IS_TEST = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
// Motion is decoration: when the OS asks for less of it, none of it is added.
const REDUCED_MOTION = typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Which tab is on screen. Kept module-level so the back button can restore it.
let CURRENT = 'sell';

export function show(viewId){
  if (viewId !== "auth" && !verifiedAccount()) viewId = "auth";
  const prev = CURRENT;
  CURRENT = viewId;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active', 'km-enter'));
  const el = document.getElementById('view-' + viewId);
  if (el){
    el.classList.add('active');
    // The screen arrives once. The class is removed when the animation is over,
    // so a re-render inside the view (a fuel tap, a save) never replays it —
    // content that keeps re-animating reads as a broken screen, not a lively one.
    if (!REDUCED_MOTION){
      el.classList.add('km-enter');
      setTimeout(() => el.classList.remove('km-enter'), 420);
    }
  }
  document.querySelectorAll('.navbtn').forEach(b =>
    b.classList.toggle('on', b.dataset.view === viewId));
  // The magic-notch pill follows the tab. Decoration only — never a dependency.
  try { window.kmNavGlide?.(viewId); } catch {}
  // The bottom bar needs to know a view changed (it lights "More" for the
  // sections that live behind it). Plain event: no module may block on it.
  try { window.dispatchEvent(new CustomEvent('km:view-changed', { detail: viewId })); } catch {}
  window.scrollTo({ top: 0 });

  // Inside the installed Android app there is no browser back button in the
  // chrome — there is the system one. Without a history entry, pressing it
  // closes the app from any tab, which feels broken. Push one entry per tab.
  try {
    if (viewId !== prev && !IS_TEST) {
      history.pushState({ kmView: viewId }, '', '#' + viewId);
    }
  } catch {}
}

// Tabs are a stack, not a set: back goes to the previous tab, and back from the
// first tab leaves the app (the expected Android behaviour).
export function initBackNavigation(onLeave){
  if (typeof window === 'undefined' || IS_TEST) return;
  try {
    if (!history.state || !history.state.kmView) history.replaceState({ kmView: CURRENT }, '', '#' + CURRENT);
  } catch {}
  window.addEventListener('popstate', e => {
    if (!verifiedAccount()) { hideApp(); show('auth'); return; }
    const target = (e.state && e.state.kmView) || null;
    if (!target){ if (typeof onLeave === 'function') onLeave(); return; }
    CURRENT = target;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + target)?.classList.add('active');
    document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('on', b.dataset.view === target));
    try { window.kmNavGlide?.(target); } catch {}
  });
}

export const currentView = () => CURRENT;

export function hideApp(){ document.getElementById('app').style.display = 'none'; }
// flex, not block: #app is a column so a short screen still keeps the footer at
// the bottom instead of leaving it stranded halfway up the page.
// The splash is a promise: "the app is coming". Once the app is actually on
// screen that promise is kept, so the parda must come down.
//
// It used to be CSS-only — `animation: kmSplashAuto .5s ease 2.6s forwards` —
// which held the logo over the app for 3.1 s on EVERY open, including the ones
// that are ready in 250 ms. Measured on a 390x844 viewport:
//   domcontentloaded 155 ms · first heading 247 ms · splash gone 3173 ms.
// Two and a half seconds of a farmer staring at a logo while his price is
// already rendered underneath it.
//
// So: lift it when the screen is real. A 650 ms floor keeps the mark readable
// instead of a flicker; the CSS timer stays as the fallback if JS never runs.
let _splashLifted = false;
export function liftSplash(){
  if (_splashLifted) return;
  _splashLifted = true;
  const sp = document.getElementById('splash');
  if (!sp) return;
  const lift = () => { sp.classList.add('done'); setTimeout(() => sp.remove(), 500); };
  const held = Math.max(0, 650 - (typeof performance !== 'undefined' ? performance.now() : 0));
  setTimeout(lift, held);
}

export function showApp(){
  if (!verifiedAccount()) { hideApp(); show("auth"); return; }
  document.getElementById('app').style.display = 'flex';
  liftSplash();
}
export function setDemoBanner(on){
  document.getElementById('demobanner').style.display = on ? 'block' : 'none';
}
// Same banner, but with text we can update once we know where prices came from.
export function setDemoBannerText(html){
  const el = document.getElementById('demobanner');
  if (!el) return;
  el.innerHTML = html;
  el.style.display = 'block';
}
export function setUserChip(text){ document.getElementById('userchip').textContent = text || ''; }

export const liveBadge = () => '<span class="chip live">LIVE</span>';
export const demoBadge = () => '<span class="chip demo">DEMO</span>';

export function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), 2600);
}

export function loadingHTML(text = 'Loading…'){ return `<p class="loading">${text}</p>`; }
export function errorHTML(msg){
  return `<div class="errorbox">${msg}</div>`;
}
export function emptyHTML(msg){ return `<div class="empty">${msg}</div>`; }

// ---- formatting ----
export const rupees   = n => '₹' + Math.round(n).toLocaleString('en-IN');
export const rupees1  = n => '₹' + (Math.round(n * 10) / 10).toLocaleString('en-IN');
export const pct      = n => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
export const qtl      = n => n + ' qtl';

export function timeAgo(ts){
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return mins + 'm ago';
  const h = Math.floor(mins / 60);
  if (h < 24)     return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}
export const clockStr = ts => new Date(ts).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});

export const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// "What's next" roadmap — shown at the bottom of the Dashboard.
export function roadmapCardHTML(){
  const items = [
    ["LIVE market feeds", "AGMARKNET / data.gov.in daily prices — connected, with weekly history build-up"],
    ["Storage + transport", "partner rates for cold storage and shared transport to the mandi"],
    ["Voice + local languages", "Assamese · Bengali · Hindi — ask by voice, hear the answer"],
    ["IoT crop sensing", "soil moisture and storage temperature feeding the same decision engine"]
  ];
  return `
    <div class="card" style="margin-top:14px">
      <b style="color:var(--green)">What's next</b>
      <div class="statlabel" style="margin-top:4px">Built to grow with the farmer</div>
      <div class="roadmap">
        ${items.map(([t, d]) => `<div class="rmitem"><span class="chip ${t.startsWith("LIVE") ? "live" : "demo"}">${t.startsWith("LIVE") ? "LIVE" : "NEXT"}</span><div><b>${t}</b><div class="dim">${d}</div></div></div>`).join("")}
      </div>
    </div>`;
}

// Retrieval status is not the age of the government's observation.
// Keep the reporting date beside the decision, not hidden in source details.
export function priceBadge(src = {}){
  if(src.source !== 'LIVE' && src.source !== 'LAST KNOWN') return demoBadge();
  const raw = String(src.day || src.govDate || '');
  const date = /^\d{2}\/\d{2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  const age = Number.isFinite(src.ageDays) && src.ageDays >= 0 ? src.ageDays : null;
  const historical = src.source === 'LAST KNOWN' || (age !== null && age > 0);
  const label = historical ? 'LAST REPORTED' : 'GOVERNMENT FEED';
  return `<span class="price-freshness"><span class="chip ${historical ? 'price-old' : 'live'}" data-i18n="price.${historical ? 'lastReported' : 'governmentFeed'}">${label}</span> <span class="price-report-date"><span data-i18n="price.reported">Reported</span>: ${date || '<span data-i18n="price.unknownDate">date unavailable</span>'}${age !== null ? ` · ${age} <span data-i18n="price.daysOld">days old</span>` : ''}</span></span>`;
}
