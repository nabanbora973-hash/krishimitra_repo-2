/* KrishiMitra service worker — offline fix + design system (v43)

   THE BUG THIS FIXES
   ------------------
   The previous worker precached only the HTML shell: '/', manifest.json and two
   icons. Every module in js/, the stylesheet, and data/*.json were cached only
   lazily — i.e. if (and only if) that exact URL had already been fetched while
   online, under this same worker. Any offline start where that lazy cache was
   incomplete booted into a blank white page:

       title bar: "KrishiMitra — Aaj ka Mandi Bhav..."
       body:      nothing

   Why nothing, and not an error: the whole UI is built by js/app.js. The splash
   leaves on a CSS timer at 1.4 s whether or not the app booted. Behind it sit
   #app (display:none until JS reveals it) and #view-auth (an empty <section>
   until JS fills it). No JS, nothing to lift the curtain for.

   THE RULE NOW
   ------------
   Shell = the whole app, not just the document. 64 URLs, ~840 KB, precached at
   install. 'add' is per-file and never throws the install: one missing icon
   must not cost a farmer the entire offline app.

   Update rule is unchanged and still deliberate: for code and data the network
   wins when there is a network, so a deploy reaches phones immediately. The
   cache exists for the offline case, not to pin an old build.
*/
const VERSION = 'km-pwa-v434';

const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/alerts.js',
  '/js/app.js',
  '/js/assistant-local.js',
  '/js/assistant.js',
  '/js/auth.js',
  '/js/backup.js',
  '/js/chart.js',
  '/js/config.js',
  '/js/costs.js',
  '/js/crops.js',
  '/js/demand-view.js',
  '/js/demand.js',
  '/js/desk-buy.js',
  '/js/feedback.js',
  '/js/firebase.js',
  '/js/fpo.js',
  '/js/fuel.js',
  '/js/gate-watch.js',
  '/js/geo.js',
  '/js/guidance.js',
  '/js/haats.js',
  '/js/i18n.js',
  '/js/live-prices.js',
  '/js/mandi-feed.js',
  '/js/mandi-sheet.js',
  '/js/map.js',
  '/js/markets.js',
  '/js/motion.js',
  '/js/msp.js',
  '/js/navglide.js',
  '/js/order.js',
  '/js/otp.js',
  '/js/photo.js',
  '/js/places.js',
  '/js/profile.js',
  '/js/purchases.js',
  '/js/rate-alerts.js',
  '/js/receipt.js',
  '/js/register.js',
  '/js/report-desk.js',
  '/js/risk.js',
  '/js/roles.js',
  '/js/sales.js',
  '/js/sell.js',
  '/js/share.js',
  '/js/state.js',
  '/js/store.js',
  '/js/tabbar.js',
  '/js/trust.js',
  '/js/ui.js',
  '/js/voice.js',
  '/js/weather.js',
  '/js/wholesale.js',
  '/data/assam-places.json',
  '/data/crops.json',
  '/data/market-data.json',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // Per-file, not addAll(): addAll rejects the whole install if ONE url 404s.
    await Promise.all(SHELL.map(async url => {
      try { await c.add(new Request(url, { cache: 'reload' })); } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // official price feed + serverless function: always live, never cached
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/.netlify/functions/')) return;
  // the privacy policy must always be the deployed one (Play Store links here)
  if (url.pathname.startsWith('/privacy')) return;
  // Digital Asset Links must be read fresh — a cached copy breaks app verification
  if (url.pathname.startsWith('/.well-known/')) return;

  // navigations: network-first, fall back to the cached document
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(async () =>
      (await caches.match('/')) || (await caches.match('/index.html')) ||
      new Response('Offline and nothing cached yet — open the app once with internet.',
                   { status: 503, headers: { 'content-type': 'text/plain' } })));
    return;
  }

  // The Firebase SDK comes from Google's CDN — and only on demand. Cache it once
  // so a phone that has opened the app before still boots with no internet.
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200) caches.open(VERSION).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => hit)));
    return;
  }

  // code + data, same-origin: network first, cache as the offline fallback
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => {
      if (res && res.status === 200) caches.open(VERSION).then(c => c.put(req, res.clone()));
      return res;
    }).catch(async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      // A 504 with an empty body is what a failed module script looks like. Say
      // so in the type, so the console does not blame the app for a dead cache.
      return new Response('', { status: 504, statusText: 'offline-and-not-cached' });
    }));
  }
});
