// ============================================================
//  KrishiMitra — config  ⚠️ FILL THESE TWO THINGS BEFORE RUNNING
//  1. firebaseConfig  → Firebase Console → Project settings → Web app
//  2. GEMINI_API_KEY  → aistudio.google.com → Get API key
//  Keep this file OUT of public GitHub repos (add to .gitignore).
// ============================================================

export const firebaseConfig = {
  apiKey:            "PASTE_FIREBASE_API_KEY",
  authDomain:        "PASTE.firebaseapp.com",
  projectId:         "PASTE_PROJECT_ID",
  storageBucket:     "PASTE.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId:             "PASTE_APP_ID"
};

export const GEMINI_API_KEY = "PASTE_GEMINI_KEY";
export const GEMINI_MODEL   = "gemini-flash-latest";

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

  // If you host the app somewhere that CANNOT run the server proxy (e.g. GitHub
  // Pages), put the proxy's full URL here — the app then calls that server and
  // still shows official data. Example: "https://krishimitra.netlify.app"
  // Leave "" when the proxy lives on the same site (Netlify drag-and-drop).
  proxyBase: "",

  // Name shown in the "Good morning, ..." greeting on the Sell decision screen.
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
