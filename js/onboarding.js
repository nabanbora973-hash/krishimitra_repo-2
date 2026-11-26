// ============================================================================
//  ONBOARDING  —  three screens on first run, reopenable forever
// ----------------------------------------------------------------------------
//  Why three and not ten: a farmer who just installed the app already knows why
//  he installed it. What he does not know is (1) that the app answers with ONE
//  verdict instead of five numbers, (2) what LIVE / LAST KNOWN / DEMO means —
//  the honesty system only works if he can read the labels, and (3) that the
//  app keeps working with no internet once installed.
//
//  Rules this follows, matching the rest of the app:
//    • never blocks the decision screen for longer than it takes to tap Next
//    • skippable, and a skip is remembered (no nagging)
//    • runs in all three languages, switchable from inside the card
//    • no network, no dependency, works on the offline build too
//    • reopenable any time from the "?" button the module adds to the topbar
//
//  Storage: one key, `km_onboard_v1`. Bump the version to show it again after a
//  big change; do not silently reuse the same key for different content.
// ============================================================================

import { t, getLang, setLang, LANGS } from "./i18n.js";

export const ONBOARD_KEY = "km_onboard_v1";

export const STEPS = [
  { icon: "🌾", titleKey: "ob.s1.title", bodyKey: "ob.s1.body" },
  { icon: "🔎", titleKey: "ob.s2.title", bodyKey: "ob.s2.body" },
  { icon: "📲", titleKey: "ob.s3.title", bodyKey: "ob.s3.body" }
];

// ── storage (every access guarded: private mode throws on localStorage) ──────
function store() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function shouldShow() {
  const s = store();
  try { return !(s && s.getItem(ONBOARD_KEY)); } catch { return true; }
}

export function markSeen() {
  try { store()?.setItem(ONBOARD_KEY, "1"); } catch {}
}

export function resetOnboarding() {
  try { store()?.removeItem(ONBOARD_KEY); } catch {}
}

// English fallbacks, used only if a translation key is missing, so a typo can
// never render an empty card.
const FALLBACK = {
  "ob.s1.title": "One clear call, not five numbers",
  "ob.s1.body":
    "Mandi price, weather and harvest timing are read together and turned into one verdict: " +
    "SELL NOW, SELL 60%, WAIT or STORE — with three reasons you can check yourself.",
  "ob.s2.title": "Where a number came from is on the screen",
  "ob.s2.body":
    "LIVE = fetched from the government feed just now. LAST KNOWN = our saved copy, with its " +
    "date. DEMO = sample data, labelled everywhere. The app never invents a price.",
  "ob.s3.title": "Install it once, it opens without internet",
  "ob.s3.body":
    "Tap Install app (or Chrome menu → Add to home screen). After the first load the app is " +
    "cached, so it opens offline and the last price stays visible with its date.",
  "ob.next": "Next",
  "ob.done": "Got it",
  "ob.skip": "Skip",
  "ob.lang": "Language"
};

const say = (key) => {
  try { const v = t(key); if (v && v !== key) return v; } catch {}
  return FALLBACK[key] || key;
};

/**
 * Build and mount the overlay.
 * Returns the root element so a caller (or a test) can inspect/remove it.
 */
export function createOnboarding({ doc = globalThis.document, onDone = null } = {}) {
  if (!doc || !doc.body) return null;

  // Never stack two tours: the "?" button and a delayed first run can both fire.
  try { doc.querySelectorAll(".kmob").forEach(n => n.remove()); } catch {}

  let idx = 0;
  const root = doc.createElement("div");
  root.className = "kmob";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "kmobTitle");
  root.innerHTML = `
    <div class="kmob-backdrop"></div>
    <div class="kmob-card">
      <div class="kmob-head">
        <span class="kmob-icon" aria-hidden="true">🌾</span>
        <button class="kmob-x" type="button" aria-label="Close">✕</button>
      </div>
      <h2 class="kmob-title" id="kmobTitle"></h2>
      <p class="kmob-body"></p>
      <div class="kmob-dots" aria-hidden="true"></div>
      <div class="kmob-actions">
        <button class="kmob-skip" type="button"></button>
        <button class="kmob-next btn" type="button"></button>
      </div>
      <div class="kmob-langs" role="group" aria-label="${say("ob.lang")}"></div>
    </div>`;

  const el = (sel) => root.querySelector(sel);
  const titleEl = el(".kmob-title");
  const bodyEl = el(".kmob-body");
  const iconEl = el(".kmob-icon");
  const dotsEl = el(".kmob-dots");
  const nextBtn = el(".kmob-next");
  const skipBtn = el(".kmob-skip");
  const langsEl = el(".kmob-langs");

  function paint() {
    const step = STEPS[idx];
    iconEl.textContent = step.icon;
    titleEl.textContent = say(step.titleKey);
    bodyEl.textContent = say(step.bodyKey);
    const last = idx === STEPS.length - 1;
    nextBtn.textContent = last ? say("ob.done") : say("ob.next");
    skipBtn.textContent = say("ob.skip");
    skipBtn.style.visibility = last ? "hidden" : "visible";
    dotsEl.innerHTML = STEPS.map((_, i) =>
      `<span class="kmob-dot${i === idx ? " on" : ""}"></span>`).join("");
    langsEl.innerHTML = LANGS.map(l =>
      `<button type="button" class="kmob-lang${l.code === getLang() ? " on" : ""}"
               data-lang="${l.code}">${l.native}</button>`).join("");
    langsEl.querySelectorAll("[data-lang]").forEach(b => {
      b.onclick = () => { setLang(b.dataset.lang); paint(); };
    });
  }

  function finish(how) {
    markSeen();
    try { root.remove(); } catch {}
    try { if (typeof onDone === "function") onDone(how); } catch {}
  }

  nextBtn.onclick = () => {
    if (idx < STEPS.length - 1) { idx += 1; paint(); return; }
    finish("done");
  };
  skipBtn.onclick = () => finish("skip");
  el(".kmob-x").onclick = () => finish("close");
  el(".kmob-backdrop").onclick = () => finish("close");

  // Esc closes, like every other dialog in the app.
  const onKey = (e) => {
    if (e.key === "Escape") { doc.removeEventListener("keydown", onKey); finish("esc"); }
  };
  doc.addEventListener("keydown", onKey);

  paint();
  doc.body.appendChild(root);
  // Focus the primary action so a keyboard/switch user is not stranded.
  try { nextBtn.focus(); } catch {}
  return root;
}

export function maybeShowOnboarding(opts) {
  if (!shouldShow()) return null;
  return createOnboarding(opts);
}

/**
 * A "?" in the topbar, so the tour is not a one-shot the farmer can never find
 * again. Injected from here on purpose: no HTML edit, no tabbar coupling.
 */
export function ensureHelpButton({ doc = globalThis.document } = {}) {
  if (!doc) return null;
  const existing = doc.getElementById("kmHelpBtn");
  if (existing) return existing;
  const bar = doc.getElementById("topbar");
  if (!bar) return null;
  const b = doc.createElement("button");
  b.id = "kmHelpBtn";
  b.className = "btn ghost small kmob-help";
  b.type = "button";
  b.title = "How KrishiMitra works";
  b.setAttribute("aria-label", "How KrishiMitra works");
  b.textContent = "?";
  b.onclick = () => createOnboarding({ doc });
  const anchor = doc.getElementById("installBtn");
  if (anchor && anchor.parentNode === bar) bar.insertBefore(b, anchor);
  else bar.appendChild(b);
  return b;
}
