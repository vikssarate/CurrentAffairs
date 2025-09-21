/* sw.current.js – Current Affairs (SQLite + IndexedDB) */

const APP_NS = 'current';
const CACHE_NAME = `study-notes-${APP_NS}-v2`;

const CORE_ASSETS = [
  './',
  './index.html',
  './lib/sqljs/sql-wasm.js',
  './lib/sqljs/sql-wasm.wasm'
];

// Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .finally(() => self.skipWaiting())
  );
});

// Activate – clean only this app’s old caches
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k !== CACHE_NAME && k.startsWith(`study-notes-${APP_NS}-`))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Normalize cache key (strip ?v= cache busters)
function cacheKeyFor(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;   // same-origin only
  url.searchParams.delete('v');
  return new Request(url.pathname + (url.search || ''));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // allow https or any localhost (with/without port)
  const isLocalhost = /^localhost$|^127\.0\.0\.1$/.test(self.location.hostname);
  if (url.protocol !== 'https:' && !isLocalhost) return;

  // HTML -> network-first
  const isHTML = req.destination === 'document' ||
                 req.headers.get('accept')?.includes('text/html');

  if (isHTML) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const key = cacheKeyFor(req);
        if (key) (await caches.open(CACHE_NAME)).put(key, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(cacheKeyFor(req) || req);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  // Static assets -> cache-first with background refresh
  const key = cacheKeyFor(req);
  if (!key) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(key);
    try {
      const res = await fetch(req);
      cache.put(key, res.clone()).catch(() => {});
      return cached || res;
    } catch {
      if (cached) return cached;
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
