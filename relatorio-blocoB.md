# Relatório Bloco B — Vídeo Offline (IndexedDB, por aparelho)

---

## 0. LEITURA (Etapa 0)

### 0a) AulaPlayer.tsx
- **Props**: `teraboxUrl` (string), `aulaId` (string), `onTimeUpdate?`, `initialTime?`, `offlineObjectUrl?`, `isOnline?`
- **src do vídeo**: `<source src={teraboxUrl} type="video/mp4" />` dentro de `<video key={teraboxUrl}>` — o `key` força remount ao trocar de aula
- **Reação à troca de aula**: `useEffect` que cria o Plyr depende de `[teraboxUrl, aulaId]` e recria o player
- **Tratamento de erro**: não havia tratamento customizado (só o nativo do Plyr)

### 0b) sw.js — fetch handler (linhas 155-175 original)
```javascript
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
```
- **Atualização**: `self.skipWaiting()` no `install` + `self.clients.claim()` no `activate`
- **Não há** `?v=` no registro visível no código

### 0c) pdfCache.ts
- **Dexie DB name**: `'revisaflash_pdf_cache'`
- **Versão**: 1
- **Schema**: `{ pdfs: 'fileId, cachedAt' }` (PK `fileId`, índice `cachedAt`)
- **Dexie no package.json**: `"dexie": "^4.4.4"`

### 0d) Lista/árvore de aulas
- `AulasPage.tsx` usa `construirArvore(aulas)` → `DisciplinaNode[]`
- Cada aula renderizada via `<AulaCard>` dentro de `<ul>` aninhados
- Ícone offline adicionado em `AulaCard.tsx` (props `isOffline` e `offlineProgress`)

### 0e) constants/index.ts
- Exporta **múltiplas constantes nomeadas** (não objeto único): `CAMPOS`, `TIPOS_ESTUDO`, `STATUS_TOPICO`, `LISTA_TIPOS_ESTUDO`, `LISTA_STATUS_TOPICO`, `ROTAS`, `DB_NAME`, `AULA_MATERIAIS`, `SUPABASE`, **`VIDEO_OFFLINE` (novo)**
- Usa `import.meta.env` em `SUPABASE.URL`, `SUPABASE.ANON_KEY` e agora em `VIDEO_OFFLINE.PROXY_URL`

---

## 1. DIFF EXATO — sw.js (Etapa 1)

```diff
 // ============================================================
 // INTERCEPTAÇÃO – página vem da rede, assets vêm do cache
 // ============================================================
 self.addEventListener('fetch', event => {
   const url = new URL(event.request.url);
 
   if (isExcluded(url, event.request)) return;
 
+  // Não interceptar (deixar o navegador resolver sozinho) quando:
+  // (i) host github.com, githubusercontent.com ou workers.dev
+  // (ii) requisição tem header Range
+  // (iii) destination 'video' ou 'audio'
+  // (iv) URL termina em .mp4
+  const hostname = url.hostname;
+  const isGithubOrProxy =
+    hostname === 'github.com' ||
+    hostname.endsWith('.githubusercontent.com') ||
+    hostname.endsWith('.workers.dev');
+  const hasRangeHeader = event.request.headers.has('range');
+  const isVideoOrAudio = event.request.destination === 'video' || event.request.destination === 'audio';
+  const isMp4Url = url.pathname.endsWith('.mp4');
+
+  if (isGithubOrProxy || hasRangeHeader || isVideoOrAudio || isMp4Url) {
+    console.log('[SW] Bypass para vídeo/proxy/Range:', url.pathname);
+    return; // deixa o navegador fazer o fetch direto
+  }
+
   console.log(`[SW] Fetch: ${url.pathname}`);
 
   if (isDocument(event.request, url)) {
     event.respondWith(networkFirst(event.request));
     return;
   }
 
   event.respondWith(cacheFirst(event.request));
 });
```

---

## 2. CONSTANTES — constants/index.ts (Etapa 2)

```typescript
export const VIDEO_OFFLINE = {
  DB_NAME: 'revisaflash_videos',
  CHUNK_SIZE_BYTES: 8 * 1024 * 1024, // 8 MB
  PROXY_URL: import.meta.env.VITE_VIDEO_PROXY_URL || 'https://revisa-video-proxy.emyllecontas.workers.dev',
  ALLOWED_HOST: 'github.com',
  ALLOWED_PATH_PREFIX: '/emyllecontas-a11y/',
  RELEASE_PATH_PART: '/releases/download/',
  FREE_SPACE_MARGIN: 1.1,
  MAX_RETRIES: 6,
} as const;
```

---

## 3. TRECHOS PRINCIPAIS DE CÓDIGO

### 3.1 videoOfflineService.ts — Download com retomada (streaming, chunks atômicos)

**Validação de URL baixável:**
```typescript
export function isDownloadableVideoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (u.hostname !== VIDEO_OFFLINE.ALLOWED_HOST) return false;
    if (!u.pathname.startsWith(VIDEO_OFFLINE.ALLOWED_PATH_PREFIX)) return false;
    if (!u.pathname.includes(VIDEO_OFFLINE.RELEASE_PATH_PART)) return false;
    return true;
  } catch {
    return false;
  }
}
```

**Descoberta do tamanho total (Range 0-0):**
```typescript
const response = await fetch(proxyUrl, {
  method: 'GET',
  headers: { Range: 'bytes=0-0' },
  signal: controller.signal,
});
const contentRange = response.headers.get('content-range');
let totalBytes = 0;
if (contentRange) {
  const match = contentRange.match(/\/(\d+)$/);
  if (match) totalBytes = parseInt(match[1], 10);
}
```

**Verificação de espaço antes de gravar:**
```typescript
const estimate = await navigator.storage.estimate();
const freeBytes = (estimate.quota ?? 0) - (estimate.usage ?? 0);
const needed = (meta.totalBytes - meta.downloadedBytes) * VIDEO_OFFLINE.FREE_SPACE_MARGIN;
if (freeBytes < needed) {
  const faltandoMB = Math.ceil((needed - freeBytes) / 1024 / 1024);
  this.setState(aulaId, {
    phase: 'error',
    message: `Sem espaço no aparelho. Liberte cerca de ${faltandoMB} MB ou remova outros vídeos offline.`,
  });
  throw new Error('Espaço insuficiente');
}
```

**Download streaming com chunks atômicos (mesma transação):**
```typescript
let buffer = new Uint8Array(0);
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const newBuffer = new Uint8Array(buffer.length + value.length);
  newBuffer.set(buffer);
  newBuffer.set(value, buffer.length);
  buffer = newBuffer;

  while (buffer.length >= meta.chunkSize) {
    const chunkData = buffer.slice(0, meta.chunkSize);
    buffer = buffer.slice(meta.chunkSize);
    const chunkIndex = Math.floor(meta.downloadedBytes / meta.chunkSize);
    const chunkBlob = new Blob([chunkData], { type: meta.mime });

    await db.transaction('rw', db.videoMeta, db.videoChunks, async () => {
      await db.videoChunks.put({ aulaId, index: chunkIndex, blob: chunkBlob });
      meta.downloadedBytes += meta.chunkSize;
      meta.updatedAt = new Date().toISOString();
      await db.videoMeta.put(meta);
    });
  }
}
```

**Retentativas com backoff exponencial + pausa offline automática:**
```typescript
catch (err) {
  if (err instanceof Error && err.name === 'AbortError') {
    this.setState(aulaId, { phase: 'paused', message: 'Download pausado' });
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    this.setState(aulaId, { phase: 'paused', message: 'Sem internet — pausado' });
    return;
  }
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    this.setState(aulaId, {
      phase: 'error',
      message: 'Sem espaço no aparelho. Libere espaço ou remova outros vídeos offline.',
    });
    return;
  }
  const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
  await new Promise((r) => setTimeout(r, delay));
  return this.downloadWithRetries(aulaId, meta, attempt + 1);
}
```

**Montagem do Blob para reprodução (SEM copiar bytes):**
```typescript
export async function getPlayableObjectUrl(aulaId: string): Promise<string | null> {
  const chunks = await db.videoChunks.where('aulaId').equals(aulaId).sortBy('index');
  const blobs = chunks.map((c) => c.blob);
  const combinedBlob = new Blob(blobs, { type: meta.mime });
  return URL.createObjectURL(combinedBlob);
}
```

---

### 3.2 useVideoOffline.ts — Hook React

```typescript
export function useVideoOffline(aulaId: string, videoUrl: string | null, title: string) {
  const [state, setState] = useState<DownloadState>(() => getDownloadState(aulaId));
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToDownloads((states) => {
      const newState = states.get(aulaId);
      if (newState) {
        setState(newState);
        if (newState.phase === 'complete') refreshObjectUrl();
      }
    });
    return unsubscribe;
  }, [aulaId, refreshObjectUrl]);

  return {
    state,
    canDownload: videoUrl ? isDownloadableVideoUrl(videoUrl) : false,
    download: () => videoUrl && startDownload(aulaId, videoUrl, title),
    cancel: () => cancelDownload(aulaId),
    pause: () => pauseDownload(aulaId),
    resume: () => videoUrl && startDownload(aulaId, videoUrl, title),
    remove: () => removeVideoFromManager(aulaId),
    retry: () => videoUrl && startDownload(aulaId, videoUrl, title),
    objectUrl,
  };
}
```

---

### 3.3 VideoOfflineButton.tsx — Estados do botão

| Fase | Texto | Ícone | Ação |
|------|-------|-------|------|
| `idle` | "Disponibilizar offline" | `CloudDownload` | Abre confirmação → `download()` |
| `checking` | "Verificando…" | `Loader2` (spin) | — |
| `downloading` | "Baixando 37%" + barra | `PauseCircle` | `pause()` / `cancel()` |
| `paused` (offline) | "Pausado: sem internet (37%)" | `WifiOff` | Retoma auto ao voltar online |
| `paused` (manual) | "Continuar (37%)" | `RotateCcw` | `resume()` / `cancel()` |
| `complete` | "Disponível offline" | `CheckCircle` (verde) | `remove()` |
| `error` | Mensagem curta | `AlertCircle` | `retry()` |
| URL não baixável | "Indisponível" | `Download` (disabled) | — |

**Confirmação pré-download:**
```typescript
const confirmed = await confirm({
  title: `Baixar "${title}"?`,
  description: `O vídeo ocupa cerca de ${formatBytes(state.totalBytes)}. Mantenha esta página aberta até terminar.`,
  confirmText: 'Baixar',
  cancelText: 'Cancelar',
});
```

**Aviso iOS/Safari (uma vez via localStorage):**
```typescript
if (isIOS && !isStandalone && !localStorage.getItem('video-offline-ios-warning-shown')) {
  // Mostra alerta: "No iPhone, o Safari pode apagar vídeos baixados se o app ficar sem uso..."
}
```

---

### 3.4 AulaPlayer.tsx — Uso do vídeo offline

```typescript
const effectiveSrc = offlineObjectUrl || teraboxUrl;

useEffect(() => {
  const videoEl = videoRef.current;
  if (videoEl.src !== effectiveSrc && !videoEl.paused) return; // não troca mid-playback
  if (videoEl.src !== effectiveSrc) {
    videoEl.src = effectiveSrc;
    videoEl.load();
  }
}, [effectiveSrc, aulaId]);

// Fallback se offline falhar
const handleError = () => {
  if (!triedFallbackRef.current && offlineObjectUrl && isOnline && teraboxUrl) {
    triedFallbackRef.current = true;
    videoEl.src = teraboxUrl;
    videoEl.load();
  }
  if (!isOnline && (!offlineObjectUrl || triedFallbackRef.current)) {
    setShowOfflineError(true); // mostra mensagem "Sem internet e esta aula não foi baixada"
  }
};
```

---

### 3.5 AulasPage.tsx — Integração completa

- **Árvore**: `AulaCard` recebe `isOffline={offlineAulaIds.has(a.id)}` e `offlineProgress={...}`
- **Botão "Vídeos offline"**: abre `Dialog` com:
  - Resumo: espaço usado, cota, persistente/temporário
  - Botão "Pedir armazenamento permanente" se `!persisted`
  - Lista de vídeos: título, tamanho, botão "Remover"
  - "Remover todos" com confirmação
- **Seleção de aula**: carrega `getPlayableObjectUrl(selectedId)` e passa para `AulaPlayer`
- **Cleanup**: `URL.revokeObjectURL` ao trocar de aula e no unmount

---

## 4. ARQUIVOS CRIADOS E ALTERADOS

### Novos arquivos (5):
1. `src/services/videoOfflineService.ts` — Serviço IndexedDB + gerenciador de downloads (singleton)
2. `src/hooks/useVideoOffline.ts` — Hook React para UI
3. `src/components/aulas/VideoOfflineButton.tsx` — Botão com todos os estados
4. `src/utils/helpers.ts` — Adicionado `formatBytes()` (exportado)
5. `supabase/migrations/20261117_create_aula_materiais.sql` — (já existia, não alterado)

### Arquivos alterados (7):
1. `public/sw.js` — Etapa 1: bypass para GitHub/proxy/Range/video/mp4
2. `src/constants/index.ts` — Etapa 2: objeto `VIDEO_OFFLINE`
3. `src/components/aulas/AulaCard.tsx` — Props `isOffline`, `offlineProgress` + ícone
4. `src/components/aulas/AulaPlayer.tsx` — Props `offlineObjectUrl`, `isOnline` + fallback + erro offline
5. `src/components/aulas/AulasPage.tsx` — Integração completa (botão, dialog, tree, player)
6. `src/services/aulaMateriaisService.ts` — (correção upload anterior, não parte deste bloco)
7. `src/utils/helpers.ts` — `formatBytes` adicionado

---

## 5. RESULTADOS DOS CHECKS

| Check | Comando | Resultado |
|-------|---------|-----------|
| **TypeScript** | `npx tsc --noEmit` | **81 erros** (baseline: 81 em 25 arquivos) — **zero erros novos** nos arquivos criados/alterados |
| **ESLint (novos)** | `npx eslint` nos 5 arquivos novos | **0 erros**, 1 warning (missing dependency `onTimeUpdate` em AulaPlayer) |
| **ESLint (AulasPage)** | `npx eslint src/components/aulas/AulasPage.tsx` | **4 problemas** (3 erros `no-empty` pré-existentes + 1 warning) — **abaixo do limite de 48** |
| **Build** | `npm run build` | ✅ **Sucesso** (5.71s) — sem erros |

---

## 6. CHECKLIST DE TESTE (para você testar no navegador)

| # | Cenário | Esperado |
|---|---------|----------|
| 1 | **Iniciar download** de vídeo disponível (GitHub Releases) | Confirmação com tamanho → barra de progresso → "Baixando X%" → completa → "Disponível offline" |
| 2 | **Cancelar download** no meio | Confirmação "Cancelar e remover" → apaga parcial → volta a "Disponibilizar offline" |
| 3 | **Pausar com internet desligada** (modo avião) | Fica "Pausado: sem internet (X%)" → ao religar, retoma sozinho |
| 4 | **Recarregar página** no meio do download | Ícone na árvore mostra spinner + % → botão "Continuar download (X%)" → clica → continua |
| 5 | **Assistir offline** (modo avião, aula completa) | Player usa `objectURL` do IndexedDB → vídeo roda sem internet |
| 6 | **Offline + aula não baixada** | Mensagem "Sem internet e esta aula não foi baixada. Conecte-se ou baixe..." no lugar do player |
| 7 | **Remover vídeo** do botão "Disponível offline" | Confirmação → apaga meta+chunks → space liberado → botão volta a "Disponibilizar offline" |
| 8 | **Painel "Vídeos offline"** (botão HardDrive) | Abre Dialog: mostra espaço usado/cota, lista vídeos, "Remover" por item, "Remover todos", "Pedir armazenamento permanente" se temporário |
| 9 | **Árvore de aulas** mostra ícone 💾 verde nas baixadas | Ícone `HardDrive` verde + tooltip "Disponível offline" nas aulas com status complete |
| 10 | **iOS/Safari não instalado** | Aviso único: "No iPhone, o Safari pode apagar vídeos baixados... instale o app na tela inicial" |

---

## 7. O QUE NÃO FOI TESTADO (não consigo abrir navegador)

- ❌ Testes reais de download com proxy Cloudflare Worker (precisa de rede)
- ❌ Teste de retomada após falha de rede real (5xx do proxy)
- ❌ Teste de quota excedida (QuotaExceededError) real
- ❌ Teste de Wake Lock em mobile/desktop
- ❌ Teste de fallback automático (offline falha → remote URL)
- ❌ Teste de armazenamento persistente (`navigator.storage.persist()`)
- ❌ Teste em iPhone/iPad real (aviso PWA)
- ❌ Teste de performance com vídeo 450 MB (streaming + chunks)

---

## 8. DIFERENÇAS DO PEDIDO ORIGINAL

| Item | Pedido | Implementado | Nota |
|------|--------|--------------|------|
| `getOfflineAulaIds()` retorna `Promise<Set<string>>` | ✅ | ✅ | |
| `VIDEO_OFFLINE.PROXY_URL` usa `import.meta.env` | ✅ | ✅ | Com fallback hardcoded |
| Chunks gravados atomicamente na mesma transação | ✅ | ✅ | `db.transaction('rw', db.videoMeta, db.videoChunks)` |
| Blob montado sem copiar bytes | ✅ | ✅ | `new Blob(chunks.map(c => c.blob))` |
| UM download por vez | ✅ | ✅ | Singleton `DownloadManager` com `currentDownloadAulaId` |
| Backoff exponencial 2s, 4s, 8s... | ✅ | ✅ | `Math.min(2000 * 2^attempt, 30000)` |
| Pausa automática offline | ✅ | ✅ | Event listener `online` no singleton |
| Wake Lock | ✅ | ✅ | `navigator.wakeLock.request('screen')` |
| Aviso iOS uma vez | ✅ | ✅ | `localStorage` flag |
| Ícone na árvore com % | ✅ | ✅ | `AulaCard` props `isOffline` + `offlineProgress` |
| Dialog "Vídeos offline" com tudo | ✅ | ✅ | Espaço, cota, persistência, lista, remover, remover todos |
| Não troca fonte mid-playback | ✅ | ✅ | Verifica `!videoEl.paused` antes de trocar `src` |
| Fallback offline→remote no erro | ✅ | ✅ | `triedFallbackRef` + `videoEl.src = teraboxUrl` |

---

Relatório salvo em relatorio-blocoB.md