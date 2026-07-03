// public/sw.js
// Service Worker com cache incremental e logging detalhado

const CACHE_NAME = 'revisaflash-v4'; // versão incrementada

// Arquivos essenciais para o app – se algum falhar, a instalação continua
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png'
];

// ============================================================
// INSTALAÇÃO – cacheia cada arquivo individualmente
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('📦 Service Worker: iniciando cache de arquivos essenciais...');
        
        // Cacheia cada URL separadamente para que uma falha não quebre tudo
        for (const url of urlsToCache) {
          try {
            const response = await fetch(url);
            if (response && response.status === 200) {
              await cache.put(url, response);
              console.log(`✅ Cacheado: ${url}`);
            } else {
              console.warn(`⚠️ Não foi possível cachear ${url} (status: ${response?.status})`);
            }
          } catch (error) {
            console.warn(`⚠️ Erro ao cachear ${url}:`, error);
          }
        }

        console.log('✅ Service Worker: cache de arquivos essenciais concluído.');
        return self.skipWaiting(); // força ativação
      })
  );
});

// ============================================================
// ATIVAÇÃO – limpa caches antigos
// ============================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log(`🗑️ Removendo cache antigo: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker ativado e controlando páginas.');
      return self.clients.claim();
    })
  );
});

// ============================================================
// INTERCEPTAÇÃO – stale-while-revalidate com cache automático
// ============================================================
self.addEventListener('fetch', (event) => {
  // Ignora requisições para extensões e analytics
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/_next/') || url.pathname.includes('chrome-extension')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Devolve do cache e atualiza em segundo plano
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, networkResponse.clone());
                });
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        // Se não está no cache, busca da rede e guarda
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
              console.log(`💾 Novo arquivo cacheado: ${event.request.url}`);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Fallback offline
          return new Response(
            `<html>
              <head><title>Offline</title></head>
              <body style="background:#0B1020;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;text-align:center;">
                <div>
                  <h1>📶 Você está offline</h1>
                  <p>Conecte-se à internet para acessar o RevisaFlash.</p>
                  <button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;background:#14B8A6;border:none;border-radius:8px;color:white;font-weight:bold;cursor:pointer;">Tentar novamente</button>
                </div>
              </body>
            </html>`,
            { status: 503, headers: { 'Content-Type': 'text/html' } }
          );
        });
      })
  );
});