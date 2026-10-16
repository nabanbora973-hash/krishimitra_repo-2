# 🇮🇳 LIVE government market prices — how KrishiMitra is linked to it

**Yes — the app now pulls the real, official mandi prices.** Not from the prototype dataset: from the
Government of India's own open-data release of **AGMARKNET** daily prices.

---

## 1. What exactly are we pulling (say this to judges)

| | |
|---|---|
| Data | Current daily price of agricultural commodities in mandis — **min / max / modal ₹ per quintal** |
| Published by | **Ministry of Agriculture & Farmers Welfare**, Dept. of Agriculture & Cooperation (the AGMARKNET system) |
| Released as | Government of India open data on **data.gov.in** (OGD Platform India), resource `9ef84268-…-a864a43d0070` |
| Licence | Open (NDSAP) — free to use, we credit the source on screen |
| Update rate | Ministry publishes daily (skips Sundays/holidays); each row carries its own `arrival_date` |
| Filter we use | state = **Assam**, commodity = the crop the farmer selected |

### "Why didn't you just link to agmarknet.gov.in?"
Two hard technical reasons — and a straight answer beats a wrong one if a judge asks:

1. **The website has no public API**, and a browser blocks one website from reading another website's
   pages (security rule called CORS). A farmer-facing app cannot legally-or-technically vacuum a
   government webpage.
2. **data.gov.in is the Government's own machine-readable release of the same AGMARKNET figures.**
   It is the official, intended way for apps to consume it — so the numbers on our screen are the real
   reported prices, with the government's own `arrival_date` shown next to them.

> One-line pitch: *"We don't scrape the government portal — we use the government's own open-data API
> for AGMARKNET, so the price on screen is the price the mandi reported, and we show the date the
> ministry published it."*

---

## 2. Turn it on — 3 steps (10 minutes, do this before the final)

### Step 1 — Get your free API key (2 minutes)
1. Open **https://data.gov.in** *(type it in the browser address bar — not Spotlight)*
2. **Register** (top-right) with an email + OTP — instant for individuals/students, no approval.
3. **My Account → API Keys → generate/copy** the long key.

### Step 2 — Paste it in `js/config.js`
```js
export const dataGov = {
  apiKey: "PASTE_FREE_DATA_GOV_KEY",   // ← paste here
  enabled: true,
  maxAgeHours: 12,
  mandiDistances: { "Dibrugarh": 45, "Jorhat": 90, ... }  // ← YOUR real distances
};
```

**Without a key the app still works** — it falls back to data.gov.in's shared sample key
(rate-limited, still real data). With your own key it's reliable.

### Step 3 — Test it
Open the app → **Dashboard → “Test the government price feed now”**.
- ✅ *"Feed working — N rows received, newest arrival date …"* → you're live.
- ❌ message + reason → see §5.

⚠️ After editing `js/config.js`, bump `sw.js` version line (`km-v1.0.7` → `km-v1.0.8`) so the cached
copy refreshes — same rule as any other edit.

---

## 3. How the app behaves (the honesty ladder)

| State | Badge | Meaning |
|---|---|---|
| **LIVE** | blue `LIVE` | Fetched from the government feed j– minutes ago; shows the ministry's **arrival date** |
| **LAST KNOWN** | orange `LAST KNOWN` | Government server unreachable just now → the last figure this device saw, with its date, and the reason shown |
| **DEMO** | orange `DEMO` | Nothing live available → the prototype dataset, labelled illustrative |

**The app never invents a price.** If the feed is down and nothing was ever cached, it says *DEMO* on
the screen rather than showing a made-up number as if it were real. That behaviour is itself a good
answer to a judge: *"our failure mode is honest."*

Where it appears: the top banner, a chip + source line on **Markets**, the *"Where these numbers come
from"* card on the **Dashboard** (weather = LIVE Open-Meteo · prices = AGMARKNET · risk = our rules),
the footer, and **Reports/guidance** logs.

### What is government data vs our own input (be precise)
- **From the government:** the mandi name, district, crop, variety, grade, min/max/modal price, arrival date.
- **Our own inputs (not government data):** the **distance** from the farm to each mandi (used for the
  transport cost), the **storage cost** estimate, and the ₹1/km/quintal transport assumption.
  These live in `js/config.js` — the user owns them. The app will **refuse to rank a mandi** whose
  distance isn't set (it's shown with "not set" instead of a guessed cost).

### Price history & trends
The government feed publishes **today's snapshot only** — no history API. So KrishiMitra **records each
day it sees the feed** and builds its own trend line from day 2 onward. On day 1 the trend column shows
`—` (not a fake 0%). The Dashboard card shows how many days it has collected.

---

## 3b. 🚀 FOR THE PUBLIC SITE — official data, done properly (server-side proxy)

A browser page cannot be *guaranteed* to read api.data.gov.in directly (CORS), and the API key must
never sit inside a public page. So the deployed site fetches through **our own server endpoint**:

```
browser  →  /api/agmarknet?crop=paddy   (our Netlify Function)
                    ↓  server-to-server, key from an environment variable
           api.data.gov.in  →  AGMARKNET (Ministry of Agriculture)
```

**Deploy (5 minutes, free):**
1. Netlify → your site → **Deploys** tab → drag the folder/zip `KrishiMitra_Netlify_Official_Data.zip`
   (contains `index.html` + `netlify.toml` + `netlify/functions/agmarknet.js`).
2. Netlify → **Site configuration → Environment variables** → add
   **`DATA_GOV_KEY`** = your free data.gov.in key → **Save**, then redeploy once.
   *(Without it the function uses data.gov.in's shared sample key — works, but rate-limited.)*
3. Open your site → Dashboard → **Test the government price feed now** → expect
   ✅ *"Feed working — N rows … arrival date …"*.

**What this buys you in the Q&A:**
- The price on screen is the mandi's **reported modal price**, with the ministry's own **arrival date**.
- The **API key never reaches the browser** — say that plainly; judges who know web security will notice.
- Results are **cached at the edge for 15–30 min**, so one fetch serves many farmers — that's the
  "how does this scale?" answer.
- If the ministry is slow/down, the endpoint returns an **honest error** and the app falls back to
  LAST KNOWN → DEMO, labelled. It never invents a number. (Tested: 21 automated checks.)

**Test it on your laptop first** — the same proxy runs locally:
```bash
cd krishimitra_website
DATA_GOV_KEY=your_key python3 serve_local.py
# then: http://localhost:8000/api/agmarknet?crop=paddy
```
Or just double-click `start_mac.command` — it now starts this improved server automatically.

---

## 3c. For the hosted "Manus" landing page — paste this

> Wire the market prices to the **Government of India** feed instead of illustrative figures:
> use **AGMARKNET "Current Daily Price of Various Commodities from Various Markets"** published on
> **data.gov.in** (resource `9ef84268-d588-465a-a308-a864a43d0070`, filters `state=Assam` and the
> selected commodity). Call it **from your backend** (server-side), not the browser — keep the
> data.gov.in API key in an environment variable and never in the client. Show the min/max/modal price
> per quintal, the mandi name and district, and the **arrival_date** exactly as the ministry reports it.
> Add a **"LIVE · AGMARKNET, Govt of India"** badge next to the prices. If the feed is unreachable,
> show the last successful figures with their date and a "last known" label — never invent a price.
> Also label any remaining illustrative content clearly.

---

## 4. If judges ask "is this real?" — 20-second live proof
Dashboard → *Test the government price feed now* → the panel shows the row count and the ministry's
arrival date. Then Markets tab → the badge says `LIVE` and each row carries the government's date.
Optional: open **https://agmarknet.gov.in** or **data.gov.in** on your phone next to it and show the
same mandi's price. (Do this from an Indian connection — see §5.)

---

## 5. Known limitations (be upfront, it earns trust)

1. **Government servers block foreign IP addresses.** `agmarknet.gov.in` returned **403** and
   `api.data.gov.in` refused the connection from an overseas IP while we built this. From India
   (your laptop, NFSU Guwahati campus) it works. **Test it in Assam before the final** — if a venue
   network blocks it, the app falls back to LAST KNOWN/DEMO and still runs the whole demo.
2. **Sample key is rate-limited** (~10 rows per request). Fine for a demo; get your own key for the real thing.
3. **No history from the API** — the trend line grows day by day as the app is opened (see §3).
4. **Missing days** — mandis don't report on Sundays/holidays; the app shows the last reported date.
5. **Crop names must match AGMARKNET spelling** — mapped in `js/live-prices.js` (`COMMODITY`);
   add a line there if you enable a new crop.
6. **The double-click single-file app** opened from `file://` usually can't call the API (browsers block
   `file://` origins) → it uses LAST KNOWN/DEMO. For the live demo use the **hosted site** or the
   localhost server.

---

## 6. Files in this build
```
js/live-prices.js     ← the whole government-feed module (fetch, mapping, cache, history, UI bits)
js/config.js          ← dataGov { apiKey, enabled, maxAgeHours, mandiDistances }
js/markets.js         ← renders LIVE/LAST KNOWN/DEMO, min–max, arrival date, unranked rows
js/app.js             ← source card, banner/footer text, feed test button
sw.js                 ← km-v1.0.7 · API requests bypass the cache; results kept in localStorage
tests/live_feed_test.mjs ← 15 checks simulating the government feed (mapping, ranking, fallbacks)
```
