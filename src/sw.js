/* KrishiMitra service worker — makes the installed app work offline.
   Strategy: the page is ONE self-contained file; cache it once so the installed
   app opens instantly and works with no internet. Government-price API calls are
   never cached (always live, with the app's own last-known fallback). */
const VERSION = 'km-pwa-v2';
const CORE = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
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

  // navigations: network-first, fall back to the cached app
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(async () =>
      (await caches.match('/')) || (await caches.match('/index.html')) ||
      new Response('Offline and nothing cached yet — open the app once with internet.', 
                   { status: 503, headers: { 'content-type': 'text/plain' } })));
    return;
  }

  // everything else same-origin: cache-first with a background refresh
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(cached => {
      const fresh = fetch(req).then(res => {
        if (res && res.status === 200) caches.open(VERSION).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || fresh;
    }));
  }
});
