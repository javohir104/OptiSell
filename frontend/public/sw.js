/**
 * OptiSell service worker: keeps the app itself available without internet.
 *   - pages: network first, the saved app shell when offline
 *   - /assets/* (hashed JS/CSS from Vite): cache first (they never change)
 *   - /api/* is never cached here: offline sales are queued by the app (src/utils/offline.js)
 */
const VERSION = 'optisell-v1';
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function put(request, response) {
  if (response && response.ok && response.type === 'basic') {
    const cache = await caches.open(VERSION);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => put('/index.html', res))
        .catch(async () => (await caches.match('/index.html')) || (await caches.match('/')) || Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => put(request, res))));
    return;
  }

  // Everything else (icons, manifest): use the network, fall back to the cache.
  event.respondWith(fetch(request).then((res) => put(request, res)).catch(() => caches.match(request)));
});
