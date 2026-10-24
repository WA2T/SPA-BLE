// SPA-BLE offline cache, automatic network-first refresh.
// No periodic polling, BLE interaction, or forced page reloads.
const CACHE_NAME = 'spa-ble-offline-v2';
const APP_ROOT = '/SPA-BLE/';
const INDEX = APP_ROOT + 'index.html';
const APP_FILES = [APP_ROOT, INDEX];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('spa-ble-offline-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function refreshIndex() {
  const response = await fetch(new Request(INDEX, {cache: 'no-store'}));
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(APP_FILES.map(path => cache.put(path, response.clone())));
}

self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'SPA_REFRESH_CACHE') return;
  event.waitUntil(refreshIndex().catch(() => {}));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.pathname.startsWith(APP_ROOT)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const copy = response.clone();
        event.waitUntil((async () => {
          const cache = await caches.open(CACHE_NAME);
          await Promise.all(APP_FILES.map(path => cache.put(path, copy.clone())));
        })());
        return response;
      } catch (_) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(request)) || (await cache.match(APP_ROOT)) ||
               (await cache.match(INDEX)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    return cached || fetch(request);
  })());
});
