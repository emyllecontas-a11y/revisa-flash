// public/sw.js
// Service Worker com estratégia "stale-while-revalidate" e cache automático

const CACHE_NAME = 'revisaflash-v3'; // versão incrementada para forçar atualização

// Arquivos essenciais para o app funcionar offline (apenas os estáticos)
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png'
];

// ============================================================
// INSTALAÇÃO – pré-cache dos arquivos essenciais
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Service Worker: cacheando arquivos essenciais...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Service Worker: instalação concluída.');
        return self.skipWaiting(); // força ativação imediata
      })
  );
});

// ============================================================
// ATIVAÇÃO – limpa caches antigos e assume controle
// ============================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Service Worker: removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker: ativado e controlando as páginas.');
      return self.clients.claim(); // toma controle imediato
    })
  );
});

// ============================================================
// INTERCEPTAÇÃO – "stale-while-revalidate" com cache automático
// ============================================================
self.addEventListener('fetch', (event) => {
  // Ignora requisições para extensões e analytics (otimização)
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/_next/') || url.pathname.includes('chrome-extension')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Se encontrou no cache, retorna imediatamente (stale)
        if (cachedResponse) {
          // Atualiza o cache em segundo plano (revalidate)
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, networkResponse.clone());
                  console.log('🔄 Service Worker: cache atualizado para:', event.request.url);
                });
              }
            })
            .catch(() => {}); // ignora erros de rede
          return cachedResponse;
        }

        // Se não está no cache, busca da rede e guarda
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
                console.log('💾 Service Worker: novo arquivo cacheado:', event.request.url);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Fallback offline: retorna uma página de erro amigável
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