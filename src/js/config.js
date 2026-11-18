// ============================================================
//  KrishiMitra — config
//  firebaseConfig  → Firebase Console → Project settings → Web app (set ✔)
//  GEMINI_API_KEY  → aistudio.google.com → Get API key (optional)
//
//  A Firebase web config is public by design: it identifies the project, it
//  does not authorise anything. What protects a farmer's data is the
//  Firestore rule set — see CLOUD_SETUP_5_MIN.md.
// ============================================================

export const firebaseConfig = {
  apiKey:            "AIzaSyABo__3MLV0Xom_bxZqxY7VMrcpvQm_b_Q",
  authDomain:        "kishimitra.firebaseapp.com",
  projectId:         "kishimitra",
  storageBucket:     "kishimitra.firebasestorage.app",
  messagingSenderId: "874976388144",
  appId:             "1:874976388144:web:fcddf63a89271458ba79f5",
  measurementId:     "G-E7GK81J180"
};

// Phone (SMS) sign-in is OFF until a real SMS provider is billed in Firebase.
// While it is false the app does not offer "Send OTP" at all — it never invents
// a code and never shows one on screen. Set to true only when SMS really sends.
export const PHONE_SIGNIN = false;

//  NEVER paste a real AI key here. This file ships to every phone and anyone can
//  read it with View Source; a key in the browser is a key that is already leaked.
//  The key lives in Cloudflare as a SECRET (Workers → Settings → Variables →
//  GEMINI_KEY) and the worker adds it server-side. See CHAT_PROXY below.
export const GEMINI_API_KEY = "";            // dev-only escape hatch. Empty in a real build.
//  GOOGLE MAPS — optional, and the one Maps product that costs nothing.
//  Google bills a map embedded with the Maps EMBED API at ₹0 — unlimited, no
//  cap — while an interactive JavaScript map is 10,000 free loads a month and
//  then $7 per 1,000. Rapido/Ola use the paid ones because they draw routes,
//  live cabs and their own pins; we only need to SHOW a map, so we use the free
//  one.
//
//  Two honest conditions:
//   1. Google still wants a billing-enabled Cloud project before the key works.
//      Set a daily quota cap in Cloud Console so a bug can never turn into a bill.
//   2. Restrict the key to your own domain (Application restrictions → HTTP
//      referrers). A restricted Maps key is meant to be public — unlike an AI
//      key, it cannot be used to spend your quota from someone else's site.
//  While this is empty the app draws its own offline map and no Google request
//  is ever made. Nothing breaks; nothing is charged.
export const MAPS_EMBED_KEY = "";

export const GEMINI_MODEL   = "gemini-2.5-flash";
// The AI runs behind the RELAY (the same worker that fronts data.gov.in), never
// behind the static app host — /health is 404 there, which is how this was caught.
// Both relays are tried in order, so one dead relay does not kill the chat.
export const CHAT_PROXIES = [
  "https://krishimitra-api.nabanbora973.workers.dev",
  "https://krishimitra-api-in.pages.dev",
];

// ============================================================
//  LIVE GOVERNMENT MARKET PRICES  (optional, but recommended for the final)
//  AGMARKNET daily mandi prices, released by the Ministry of Agriculture &
//  Farmers Welfare on the Government of India open-data platform (data.gov.in).
//
//  Get a FREE key in ~2 minutes:  data.gov.in → Register → My Account → API Keys
//  Paste it below. Leave it as PASTE_… and the app still works, using
//  data.gov.in's shared sample key (rate-limited) — or DEMO data if offline.
// ============================================================
export const dataGov = {
  apiKey: "PASTE_FREE_DATA_GOV_KEY",

  // false → skip the government feed entirely and always use the DEMO dataset
  enabled: true,

  // Use the saved government result for this many hours before re-fetching.
  maxAgeHours: 12,

  // The Cloudflare Worker that fronts the government feed. It is needed because
  // data.gov.in answers only Indian IPs and sends no CORS header, so a browser
  // (and any server outside India) cannot reach it directly. Deployed once;
  // shipped as the default so LIVE prices need no setup on a new phone.
  // A device can still override it from Farm Profile (slot km_proxy_base).
  proxyBase: "https://krishimitra-api.nabanbora973.workers.dev",
  // The relay that answers today is the first one; the other is kept as a
  // fallback so a dead relay on a Sunday night does not become a dead app.
  // (A Worker is listed first on purpose: its code can be replaced by pasting
  // into the dashboard, which needs no zip and no folder-name convention.)
  proxyBaseAlt: "https://krishimitra-api-in.pages.dev",

  // Fallback name for the greeting on the Sell decision screen — used ONLY in the
  // offline demo where no farmer has registered. Once someone registers, the app
  // greets that person by the name they entered.
  personaName: "Ramen",

  // Which mandi's price series should the trend chart and "your average"
  // follow? Leave "" for "the nearest mandi to your farm". Example: "Dibrugarh".
  referenceMandi: "Dibrugarh",

  // YOUR distances from the farm to each mandi (km). Used for the transport
  // cost, which is NOT part of government data. Edit to your real distances —
  // this is the one assumption the app asks you to own.
  mandiDistances: {
    "Duliajan": 3, "Naharkatia": 12, "Digboi": 15, "Namrup": 25,
    "Jorhat": 90, "Tinsukia": 45, "Sivasagar": 60, "Dibrugarh": 45,
    "Golaghat": 70, "Nagaon": 150, "Sonari": 30, "Margherita": 40
  }
};
