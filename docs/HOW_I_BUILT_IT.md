# How I built it — judge ke saamne technical answer

**Rule #1:** short bolna hai, phir **proof** dikhana hai (code / live feed). Long explanation = kam marks.
**Rule #2:** jo banaya wahi bolo. Over-claim ek hi galti se saara trust khatam.

---

## 1) 30-second version (yaad kar lo, word-by-word)

> "KrishiMitra ek **decision-support app** hai jo paddy farmer ko batati hai **kab aur kitna bechna hai** —
> sirf price dikhana nahi. Ye **web app** hai, lekin **app ki tarah install** ho jati hai: home screen pe
> icon, full screen, aur **internet band hone pe bhi chalti hai**.
> Price **Government of India ke AGMARKNET feed** se aata hai (data.gov.in), weather **Open-Meteo** se.
> Tech side pe maine koi framework use nahi kiya — **plain JavaScript modules**, ek **serverless proxy**
> government API ke liye, ek **service worker** offline ke liye, aur **158 automated checks** jo har build
> pe chalte hain. Recommendation ka engine **transparent rules** hai, black box nahi — koi bhi number
> judge ke saamne trace kar sakta hoon."

---

## 2) 2-minute version — 5 blocks (bolne ka order)

**Block 1 — Problem framing (15s)**
"Mandi me kisan ko price dikh jata hai, par decision nahi milta — kitna bechna, kab bechna, kaunse mandi me
le jaana, storage ke baad fayda hai ya nahi. App ka core yahi decision hai."

**Block 2 — Architecture (30s)**
"Frontend **vanilla JavaScript** hai — 20 modules, apna CSS, koi React/build tool nahi. Data do jagah se:
government price feed aur weather. Government API browser se direct call karna safe nahi (CORS + key leak),
isliye maine **Netlify Function** ko proxy banaya — key **server pe env variable** me rehti hai, browser tak
kabhi nahi jaati. Poora app ek **single 16 MB file** me bhi build hota hai jo double-click pe offline chalta hai."

**Block 3 — Decision engine (30s)**
"Recommendation rule-based hai: har mandi ka **net price** nikalta hai — price minus transport (₹1/km/qtl)
minus storage (₹180/qtl/week). Uske baad 30-day average se comparison, inter-market spread, 3-din ka rain risk
aur harvest window — in sabse verdict aata hai **SELL 60% NOW**, aur ek **confidence score** (coverage + spread
+ freshness + weather). Rules readable hain — `js/sell.js` me `decide()` function, chahein to live dikha dun."

**Block 4 — Offline + installable (25s)**
"Ye PWA hai: **manifest.json** + **service worker**. Install karne pe home screen/Launchpad pe icon aata hai,
browser bar ke bina full screen khulti hai. Service worker app shell cache karta hai, isliye internet band
hone pe bhi khulti hai — par **price API ko kabhi cache nahi karta**, wo hamesha live aata hai. Venue pe agar
internet na ho to humne single-file build USB me rakha hai."

**Block 5 — Honesty + testing (20s)**
"Sabse important: app **price kabhi invent nahi karta**. Teen level dikhati hai — **LIVE** (abhi government
feed se aaya, government ki hi arrival date ke saath), **LAST KNOWN** (last successful fetch, date ke saath),
aur **DEMO** (hamara prototype dataset, har jagah DEMO likha). Aur **7 test suites / 158 checks** hain —
build machine pe hi verify hota hai ki screen toota nahi, feed band hone pe app crash nahi karta."

---

## 3) Architecture — ek nazar me

```
        FARMER KA PHONE / LAPTOP
        ┌──────────────────────────────────────────────┐
        │  KrishiMitra (web app, installable)          │
        │                                              │
        │  UI (plain JS, 20 modules)                   │
        │   ├─ sell.js   → decision engine (rules)      │
        │   ├─ markets.js→ mandi comparison + net price │
        │   ├─ alerts/sales/profile/guidance/risk       │
        │   └─ assistant.js → Gemini, farm-context     │
        │                                              │
        │  store.js → localStorage (farm + apna data)  │
        │  sw.js    → service worker (offline shell)    │
        │  manifest.json → installable app             │
        └───────┬───────────────┬──────────────┬───────┘
                │               │              │
      /api/agmarknet        Open-Meteo     (optional) Gemini
                │           (no key)         assistant
        Netlify Function          │              │
        (server-side proxy)       │              │
                │               │              │
        data.gov.in  ←── AGMARKNET price feed (Ministry of Agriculture, GoI)
```

**Do build targets, ek hi codebase:**

| Target | File | Kab use |
|---|---|---|
| **Hosted app** (installable) | `KrishiMitra_Netlify_Official_Data.zip` → Netlify | Home screen pe install, live government data, share link |
| **Single file** (offline) | `KRISHIMITRA.html` (~16 MB) | Double-click, internet zero — event-day backup, USB |

---

## 4) Technical decisions + "why" (yehi table judge ko impress karta hai)

| Kya kiya | Kyun (aapki defend karne wali line) |
|---|---|
| **Vanilla JS, koi framework nahi** | Venue pe build/tooling failure ka risk zero; low-end phones pe halka; judge code padh sake; koi dependency break nahi hoti |
| **20 chhote modules + 1 CSS** | Ek module toota to app nahi tootega; har module ka ek kaam |
| **Single-file build (~16 MB)** | Demo video AND app andar base64 me; `file://` se double-click pe chalti hai — koi server, koi install nahi |
| **Netlify Function as proxy** | (1) CORS — browser ko government server direct allow nahi karta; (2) **key leak nahi hoti** — env variable server pe |
| **Edge cache headers** (15 min browser, 30 min CDN, stale-while-revalidate) | Government API ko gently use karna; ek fetch se **kai farmers** ko price |
| **Client-side fallback ladder** | `/api/agmarknet` → `/.netlify/functions/agmarknet` → direct API: ek rasta band to app nahi rukta |
| **Honesty ladder LIVE / LAST KNOWN / DEMO** | Kisan ko pata rahe ki number kahan se aaya; koi fake price nahi |
| **Apni history localStorage me** | Government feed **sirf current snapshot** deta hai (history nahi) — isliye app khud roz ka price save karti hai, chart dino me asli ho jata hai |
| **Service worker (km-pwa-v1)** | Offline shell; par **`/api/` ko kabhi cache nahi karta** — price hamesha taaza |
| **manifest.json (standalone, icons 192/512/maskable)** | "Normal app" jaisa: home screen/Launchpad icon, full screen, browser bar nahi |
| **Pre-render (jsdom) + `<noscript>`** | WhatsApp/iOS preview me JavaScript block hota hai — tab bhi 9 screens ka snapshot dikhta hai, blank nahi |
| **file:// localStorage guard** | Kuch browsers file se kholne pe storage block karte hain — guard laga hai, app crash nahi hoti |
| **Decision engine = readable rules** | Q&A me defend kar sakte hain; koi bhi number trace ho jata hai (black box nahi) |
| **Gemini sirf assistant me, farm-context ke saath** | "Chatbot" nahi — assistant ko kisan ka crop, mandi, mausam, pichhla sale diya jata hai; key na ho to **rule-based guidance** pe fall back |
| **7 suites / 158 automated checks** | Har rebuild pe verify: screens intact, offline ok, proxy sahi error deta hai, no-JS version dikhta hai |

**Test numbers (yaad rakho):** smoke 36 · standalone 20 · live-feed 15 · proxy 22 · site 29 · no-JS 15 · PWA 21 = **158 checks, sab pass**.

**Repo numbers (agar poochein "kitna code likha"):** ~**20 JS modules**, **~116 KB hand-written JavaScript**, 1 CSS, 1 serverless function (114 lines), 1 service worker, 7 test suites.

---

## 5) Data — exact source (judge sach check kar sakta hai)

- **Price:** AGMARKNET — *"Current Daily Price of Various Commodities from Various Markets (Mandi)"*,
  Ministry of Agriculture & Farmers Welfare, Government of India — **data.gov.in** OGD platform,
  resource ID `9ef84268-d588-465a-a308-a864a43d0070`, licence **NDSAP (open data)**.
  Fields: `state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price` (₹/qtl).
- **Weather:** **Open-Meteo** forecast API (free, no key) — rain probability next 3 days = harvest risk.
- **Key:** data.gov.in se free personal key → Netlify environment variable **`DATA_GOV_KEY`** → server pe hi rehti hai.
- **Feed ka timing:** din me ~1 baje ke baad update hota hai — isliye app "feed aaj ka hai / purana hai" date dikhati hai.

---

## 6) Judge ke technical probe — ready answers

| Judge pooche | Aap bolo |
|---|---|
| "Backend banaya hai ya bas frontend?" | "Serverless function banaya hai — `netlify/functions/agmarknet.js`. Zaroorat kyun padi: CORS aur key security. Client-side fallback bhi hai." |
| "API key kahan hai? Safe hai?" | "Browser me kabhi nahi jaati. Netlify env variable `DATA_GOV_KEY` me hai, request server se government server ko jaati hai." |
| "Ye data asli hai ya copy-paste?" | "Dono alag-alag label ke saath: demo scenario DEMO likha hua hai, aur Dashboard pe 'Test the government price feed now' — ye **live** government feed se aata hai, government ki arrival_date ke saath. Feed band ho to app **'last known'** dikhati hai, fake nahi banati." |
| "Internet na ho to?" | "App shell service worker me cache hai — install ke baad bina internet bhi khulti hai. Aur poora app ek single file me bhi hai, USB se double-click." |
| "Recommendation AI/ML se bana?" | "Nahi — **explainable rule engine** hai: net price after transport + storage, 30-day average, market spread, rain risk, harvest window → verdict + confidence. AI sirf assistant me hai, aur wahi bhi farm ke apne data pe grounded." |
| "Framework kyun nahi use kiya?" | "Deliberate: venue pe zero build risk, low-end phone pe halka, aur code audit-able. 20 modules se structure maintain hai." |
| "Scale kaise karega?" | "Static CDN + edge-cached function — ek fetch se kai farmers, government API pe load kam. Har device ka data lokal (privacy). Aage: proper DB + district-level history pipeline." |
| "Play Store pe app kyun nahi?" | "PWA jaan-boojhkar: installable icon + full screen + offline milta hai, par **100 MB download aur store review ki zaroorat nahi** — aur ye chhote kisan phone ke liye badi baat hai. Ek codebase, sab jagah." |
| "Sabse naya kya hai?" | "Price dikhana normal hai — hum **decision** dete hain: kitna bechna (60% now / 40% hold), kis mandi me, net paisa transport aur storage ke baad, aur apne pichhle sale se comparison." |
| "Code dikhao." | `js/sell.js` → `decide()` (line ~150) aur confidence (~line 233) · `netlify/functions/agmarknet.js` · `sw.js` · `tests/` — chaaron khole rakho. |

---

## 7) Kya NAHI bolna (honesty guardrails — bahut important)

- ❌ "AI model price predict karta hai" → ✅ "Rule-based decision engine; AI sirf assistant me."
- ❌ "Humne government se data liya / apna network banaya" → ✅ "Government ka official open-data feed use kiya."
- ❌ "Kisan use kar rahe hain / accuracy 95%" → ✅ "Prototype hai, judges ke saamne test karne ke liye taiyaar."
- ❌ "Ye iPhone pe bhi app store se milega" → ✅ "Safari → Add to Home Screen se install ho jata hai."
- ❌ Demo numbers ko "live" kehna → ✅ Dashboard pe live feed dikhana, warna "DEMO labelled" bolna.

---

## 8) Ek line closing (bolne ke liye)

> "Technology isliye chuni ki **kisan ke paas sahi nirnay pohanche** — neta sirf dikhana nahi.
> Feed official hai, key safe hai, app offline chalti hai, rules transparent hain, aur 158 automated checks
> har build pe chalti hain. Seedha mandi me le jaane layak prototype."
