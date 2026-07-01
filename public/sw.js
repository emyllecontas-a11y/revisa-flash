// public/sw.js
const CACHE_NAME = 'revisaflash-v2'; // mude a versão para forçar atualização

// Arquivos estáticos a serem pré-cacheados (apenas os essenciais)
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png'
];

// Instalação: pré-cache dos arquivos essenciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Pré-cache de arquivos essenciais');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Ativação: limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: removendo cache antigo', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estratégia: Cache First, com fallback para rede e atualização em segundo plano
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Se encontrou no cache, retorna e atualiza em segundo plano (stale-while-revalidate)
        if (cachedResponse) {
          // Atualiza o cache em background para a próxima vez
          fetch(event.request).then((networkResponse) => {
            // Verifica se a resposta é válida
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }

        // Se não está no cache, busca na rede e guarda
        return fetch(event.request).then((networkResponse) => {
          // Verifica se a resposta é válida
          if (networkResponse && networkResponse.status === 200) {
            // Clona a resposta para armazenar no cache
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Se offline e não está no cache, pode retornar uma página fallback
          // Opcional: retornar um erro ou uma página offline
          return new Response('Você está offline', { status: 503 });
        });
      })
  );
});