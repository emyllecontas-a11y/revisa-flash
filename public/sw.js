// public/sw.js
const CACHE_NAME = 'revisaflash-v1';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Tenta adicionar cada URL individualmente, ignorando falhas
        return Promise.allSettled(
          urlsToCache.map((url) => cache.add(url))
        ).then((results) => {
          // Loga quais falharam (opcional)
          const failed = results.filter(r => r.status === 'rejected');
          if (failed.length) {
            console.warn('⚠️ Alguns recursos não puderam ser cacheados:', failed.map(r => r.reason));
          }
        });
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});