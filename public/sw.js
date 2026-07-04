// public/sw.js
const CACHE_NAME = 'revisaflash-v12';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png'
];

// ============================================================
// INSTALAÇÃO – cacheia os assets listados no index.html
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Install');

  event.waitUntil(
    (async () => {
      // 1. Abre o cache
      const cache = await caches.open(CACHE_NAME);
      console.log('[SW] Caching static assets...');

      // 2. Cacheia os assets manuais (ícones, etc.)
      for (const url of STATIC_ASSETS) {
        try {
          const response = await fetch(url);
          if (response && response.ok) {
            await cache.put(url, response);
            console.log(`[SW] Cached: ${url}`);
          }
        } catch (err) {
          console.warn(`[SW] Failed to cache ${url}:`, err);
        }
      }

      // 3. Agora, busca o index.html e extrai todos os scripts e estilos
      console.log('[SW] Fetching index.html to extract assets...');
      const indexResponse = await fetch('/index.html');
      if (indexResponse && indexResponse.ok) {
        const html = await indexResponse.text();
        // Extrai todas as URLs de scripts (src) e estilos (href)
        const assetUrls = [];
        // Scripts: <script src="...">
        const scriptMatches = html.matchAll(/<script\s+[^>]*src="([^"]+)"/gi);
        for (const match of scriptMatches) {
          if (match[1]) assetUrls.push(match[1]);
        }
        // Estilos: <link rel="stylesheet" href="...">
        const linkMatches = html.matchAll(/<link\s+[^>]*href="([^"]+)"[^>]*>/gi);
        for (const match of linkMatches) {
          if (match[1] && match[0].includes('stylesheet')) {
            assetUrls.push(match[1]);
          }
        }
        // Remove duplicatas
        const uniqueUrls = [...new Set(assetUrls)];
        console.log('[SW] Assets encontrados:', uniqueUrls);

        // Cacheia cada um
        for (const url of uniqueUrls) {
          try {
            // Constrói URL absoluta
            const absoluteUrl = new URL(url, self.location.origin).href;
            const response = await fetch(absoluteUrl);
            if (response && response.ok) {
              await cache.put(absoluteUrl, response);
              console.log(`[SW] Cached asset: ${absoluteUrl}`);
            }
          } catch (err) {
            console.warn(`[SW] Failed to cache asset ${url}:`, err);
          }
        }
      } else {
        console.warn('[SW] Could not fetch index.html for asset extraction.');
      }

      console.log('[SW] All assets cached.');
      await self.skipWaiting();
    })()
  );
});

// ============================================================
// ATIVAÇÃO – limpa caches antigos e assume controle
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              console.log(`[SW] Deleting old cache: ${key}`);
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients...');
        return self.clients.claim();
      })
      .then(() => {
        console.log('[SW] Now controlling all clients.');
      })
  );
});

// ============================================================
// INTERCEPTAÇÃO – com fallback offline
// ============================================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignora requisições não-GET e de terceiros (Clerk, Supabase, extensões)
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('clerk') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('chrome-extension') ||
    url.protocol === 'chrome-extension:'
  ) {
    return;
  }

  // Log para depuração
  console.log(`[SW] Fetch: ${url.pathname}`);

  event.respondWith(
    caches.match(event.request)
      .then((cached) => {
        if (cached) {
          console.log(`[SW] Cache hit: ${url.pathname}`);
          // Atualiza em segundo plano (opcional, mas mantém o cache fresco)
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, networkResponse);
                });
              }
            })
            .catch(() => {});
          return cached;
        }

        console.log(`[SW] Network fetch: ${url.pathname}`);
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const cloned = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, cloned);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Fallback: se for navegação, retorna o index.html
            if (event.request.mode === 'navigate') {
              console.log(`[SW] Offline fallback: index.html`);
              return caches.match('/index.html');
            }
            // Para outros recursos, retorna uma resposta vazia
            return new Response('', { status: 404 });
          });
      })
  );
});