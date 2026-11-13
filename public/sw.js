// public/sw.js
const CACHE_NAME = 'revisaflash-v14';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png'
];

const EXCLUDED_HOSTS = ['clerk', 'supabase', 'chrome-extension'];

function isExcluded(url, request) {
  if (request.method !== 'GET') return true;
  if (url.protocol === 'chrome-extension:' || url.protocol === 'data:') return true;
  return EXCLUDED_HOSTS.some(host => url.hostname.includes(host));
}

// A página (HTML) é a parte que muda a cada deploy: ela é que aponta para os
// arquivos novos. Por isso ela vem SEMPRE da rede primeiro; o cache só entra
// se a rede falhar. Os arquivos em /assets/ têm hash no nome e podem ficar
// em cache-first, porque o nome muda quando o conteúdo muda.
function isDocument(request, url) {
  return (
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html'
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const body = response.clone();
      // Guarda sempre nas duas chaves para o fallback offline funcionar
      // em qualquer rota do SPA.
      await Promise.all([cache.put('/index.html', body.clone()), cache.put('/', body)]);
    }
    return response;
  } catch (err) {
    const cached = (await cache.match('/index.html')) || (await cache.match('/'));
    if (cached) {
      console.log('[SW] Offline: servindo a página a partir do cache.');
      return cached;
    }
    return new Response('Sem conexão e sem versão em cache.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    // Revalida em segundo plano, sem travar a resposta.
    fetch(request)
      .then(response => {
        if (response && response.ok) cache.put(request, response);
      })
      .catch(() => {});
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (err) {
    console.warn('[SW] Falha ao buscar recurso:', err);
    return new Response('', { status: 404 });
  }
}

// ============================================================
// INSTALAÇÃO – cacheia os assets listados no index.html
// ============================================================
self.addEventListener('install', event => {
  console.log('[SW] Install');

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[SW] Caching static assets...');

      for (const asset of STATIC_ASSETS) {
        try {
          const response = await fetch(asset);
          if (response && response.ok) {
            await cache.put(asset, response);
            console.log(`[SW] Cached: ${asset}`);
          }
        } catch (err) {
          console.warn(`[SW] Failed to cache ${asset}:`, err);
        }
      }

      console.log('[SW] Fetching index.html to extract assets...');
      const indexResponse = await fetch('/index.html');
      if (indexResponse && indexResponse.ok) {
        const html = await indexResponse.text();
        const assetUrls = [];

        const scriptMatches = html.matchAll(/<script\s+[^>]*src="([^"]+)"/gi);
        for (const match of scriptMatches) {
          if (match[1]) assetUrls.push(match[1]);
        }

        const linkMatches = html.matchAll(/<link\s+[^>]*href="([^"]+)"[^>]*>/gi);
        for (const match of linkMatches) {
          if (match[1] && match[0].includes('stylesheet')) {
            assetUrls.push(match[1]);
          }
        }

        const uniqueUrls = [...new Set(assetUrls)];
        console.log('[SW] Assets encontrados:', uniqueUrls);

        for (const asset of uniqueUrls) {
          try {
            const absoluteUrl = new URL(asset, self.location.origin).href;
            const response = await fetch(absoluteUrl);
            if (response && response.ok) {
              await cache.put(absoluteUrl, response);
              console.log(`[SW] Cached asset: ${absoluteUrl}`);
            }
          } catch (err) {
            console.warn(`[SW] Failed to cache asset ${asset}:`, err);
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
self.addEventListener('activate', event => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys.map(key => {
            if (key !== CACHE_NAME) {
              console.log(`[SW] Deleting old cache: ${key}`);
              return caches.delete(key);
            }
          })
        )
      )
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
// INTERCEPTAÇÃO – página vem da rede, assets vêm do cache
// ============================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (isExcluded(url, event.request)) return;

  console.log(`[SW] Fetch: ${url.pathname}`);

  if (isDocument(event.request, url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});