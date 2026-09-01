// Service worker for the "Tables de Multiplication" PWA.
// Caches the app shell so the game works fully offline once loaded.

const CACHE_NAME = 'tables-multiplication-v1';

// Files that make up the app shell.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

// Install: pre-cache the app shell.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean up old caches from previous versions.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for local files, network fallback for the rest
// (e.g. the Google Fonts stylesheet). Falls back to the cache offline.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req)
        .then(resp => {
          // Cache same-origin responses for future offline use.
          if (resp && resp.status === 200 && new URL(req.url).origin === self.location.origin) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return resp;
        })
        .catch(() => cached);
    })
  );
});
