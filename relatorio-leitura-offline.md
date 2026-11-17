# Relatório de leitura — "abrir aula já baixada sem internet"

Leitura estática (nada foi executado no navegador). Nenhum arquivo do projeto foi alterado.
O único arquivo criado é este relatório.

---

## 1) PERGUNTA 1 — De onde vem o object URL, quando é chamado, se depende de rede e quem revoga

### 1.1 Onde o `AulasPage` chama `getPlayableObjectUrl`

`src/components/aulas/AulasPage.tsx`, linhas 179–196:

```tsx
  // Carrega object URL offline quando a aula selecionada muda
  useEffect(() => {
    if (!selectedId) {
      setCurrentOfflineObjectUrl(null);
      return;
    }
    let cancelled = false;
    getPlayableObjectUrl(selectedId).then((url) => {
      if (!cancelled) {
        setCurrentOfflineObjectUrl(url);
        if (url) currentObjectUrlRef.current = url;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);
```

Estado que recebe o valor, linhas 125–126:

```tsx
  const [currentOfflineObjectUrl, setCurrentOfflineObjectUrl] = useState<string | null>(null);
  const currentObjectUrlRef = useRef<string | null>(null);
```

### 1.2 Em que momento é chamado

- Depende **unicamente de `selectedId`** (deps `[selectedId]`, linha 196).
- `selectedId` é alterado em três lugares:
  - linha 236 — `setSelectedId(primeiraAulaId(construirArvore(formatadas)));` (primeira aula, dentro de `recarregar`, chamada no mount via `useEffect(() => { recarregar(true); }, [recarregar])`);
  - linha 329 — `const select = (id: string) => { setSelectedId(id); ... }` (clique no `AulaCard`);
  - linha 334 — `if (proxima) setSelectedId(proxima.id);` (botões Anterior/Próxima).
- **Não** é chamado no mount "à toa": no mount `selectedId` começa `null` (linha 98) e só vira algo depois de `recarregar(true)` — ou seja, a montagem do objeto acontece **uma vez, ao selecionar a aula** (e uma segunda vez se a primeira aula escolhida for a que abriu).
- O resultado é entregue ao player em `AulasPage.tsx` linhas 587–595:

```tsx
              <AulaPlayer
                teraboxUrl={aula.terabox_url ?? ""}
                aulaId={aula.id}
                initialTime={tempos[aula.id]?.current || 0}
                onTimeUpdate={(curr, dur) => handleTimeUpdate(aula.id, curr, dur)}
                offlineObjectUrl={currentOfflineObjectUrl}
                isOnline={isOnline}
              />
```

### 1.3 A chamada depende de rede?

**Não.** `getPlayableObjectUrl` só abre o IndexedDB (Dexie). `src/services/videoOfflineService.ts`, linhas 121–136:

```ts
export async function getPlayableObjectUrl(aulaId: string): Promise<string | null> {
  try {
    const db = getVideoDb();
    const meta = await db.videoMeta.get(aulaId);
    if (!meta || meta.status !== "complete") return null;

    const chunks = await db.videoChunks.where("aulaId").equals(aulaId).sortBy("index");

    if (chunks.length === 0) return null;

    const blobs = chunks.map((c) => c.blob);
    const combinedBlob = new Blob(blobs, { type: meta.mime });
    return URL.createObjectURL(combinedBlob);
  } catch {
    return null;
  }
}
```

Nenhum `fetch` aqui. O `catch` engole **qualquer** erro e devolve `null` (ficará `null` = "não baixada" para o resto do fluxo, mesmo que o vídeo exista).

### 1.4 Quem chama `URL.revokeObjectURL` e quando

**Um único lugar**, `AulasPage.tsx` linhas 151–159:

```tsx
  // Revoga object URL ao trocar de aula ou desmontar
  useEffect(() => {
    return () => {
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
        currentObjectUrlRef.current = null;
      }
    };
  }, []);
```

Observações:
- O comentário diz "ao trocar de aula ou desmontar", mas o array de deps é `[]` — o cleanup **só roda quando o `AulasPage` desmonta**. Trocar de aula **não revoga nada**.
- Pior: na linha 190 o ref é sobrescrito (`currentObjectUrlRef.current = url`) sem revogar o valor anterior. Cada troca de aula **vaza** um object URL (e o Blob de 450 MB que ele referencia).
- O hook `useVideoOffline` (`src/hooks/useVideoOffline.ts`, linhas 41–44 e 88–109) cria object URLs e **nunca** revoga:

```ts
  const refreshObjectUrl = useCallback(async () => {
    const url = await getPlayableObjectUrl(aulaId);
    setObjectUrl(url);
  }, [aulaId]);
```
```ts
  const cancel = useCallback(async () => {
    await cancelDownload(aulaId);
    setObjectUrl(null);
  }, [aulaId]);
```

  `setObjectUrl(null)` apenas descarta a *string* — o `blob:` continua vivo no documento. E o `objectUrl` desse hook **não é usado**: `VideoOfflineButton.tsx` linha 34 só desestrutura (`const { state, canDownload, download, cancel, pause, resume, remove, retry, objectUrl } = useVideoOffline(...)`) e nunca o coloca em `<video>` nem em `<a>`; grep de `objectUrl` no arquivo retorna 1 ocorrência (a linha 34).
- Os PDFs (`AulaMateriais.tsx`) revogam com `setTimeout(..., 60_000)` — é outro recurso, mas serve de contraste: ali há `revokeObjectURL` explícito.

---

## 2) PERGUNTA 2 — Tudo o que é chamado ao selecionar a aula e usa rede/Supabase

Ao trocar `selectedId` (clique no card, `AulasPage.tsx` linha 329), a árvore inteira do `<main>` é remontada por causa de `key={aula.id}` (linha 466: `<div key={aula.id} className="rf-fade-in">`). O que roda:

### (a) `getPlayableObjectUrl` — IndexedDB, sem rede
`AulasPage.tsx` 179–196 (trecho em 1.1). Falha offline: impossível; em caso de erro interno → `null` (catch silencioso, `videoOfflineService.ts` 134–136) → player cai no `teraboxUrl`.

### (b) `<AulaPlayer>` — monta o `<video>`, e AQUI há rede quando não há objeto local
`src/components/aulas/AulaPlayer.tsx` linha 31:

```tsx
  const effectiveSrc = offlineObjectUrl || teraboxUrl;
```
linhas 44–52:

```tsx
    const videoEl = videoRef.current;
    if (videoEl.src !== effectiveSrc && !videoEl.paused) {
      // Don't switch source mid-playback; will apply on next mount
      return;
    }
    if (videoEl.src !== effectiveSrc) {
      videoEl.src = effectiveSrc;
      videoEl.load();
    }
```

Se `offlineObjectUrl === null` (aula não baixada, **ou** objeto ainda sendo montado), `effectiveSrc` é a URL remota do GitHub Releases → o navegador faz requisição de rede. Offline, isso dispara o evento `error` do `<video>`, tratado em 84–98 (detalhe na Pergunta 3).

### (c) `VideoOfflineButton` → `useVideoOffline` — IndexedDB, sem rede no mount
`VideoOfflineButton.tsx` linha 34 chama o hook; o hook faz `getVideoMeta(aulaId)` (linha 67) e `subscribeToDownloads` (linha 47). Ambos locais. O `getRemoteVideoSize` (rede/proxy) só é chamado **no clique** em "Disponibilizar offline" (`VideoOfflineButton.tsx` linhas 63–70):

```tsx
    setIsCheckingSize(true);
    let totalBytes: number;
    try {
      totalBytes = await getRemoteVideoSize(videoUrl);
    } catch (err) {
```

### (d) `AulaMateriais` — contexto RxDB local, sem rede
`AulasPage.tsx` linha 597: `<AulaMateriais aulaId={aula.id} />`. O componente lê `materiais` do contexto (`AulaMateriaisContext.tsx` linha 37) e filtra localmente (linhas 70–72). A rede só aparece em:
- `getMaterialUrl` (Supabase Storage assinado) — só no clique "Abrir"/"Baixar" (`AulaMateriais.tsx`, `handleAbrir`/`handleBaixar`);
- `hasPdfBlob` — IndexedDB (`pdfCache.ts` linha 95).

### (e) Progresso / concluídas / favoritas — localStorage, sem rede
`AulasPage.tsx` linhas 199–213 (`toggleConcluida`, `toggleFavorita`) e 214–223 (`handleTimeUpdate`) só tocam `localStorage`. Não há chamada Supabase; offline não muda comportamento (o `try/catch` engole cota cheia).

### (f) Perfil — Supabase, mas **não** por seleção de aula
`src/components/app-shell.tsx` linhas 135–160 (`loadProfile`) consulta `profiles` no Supabase. Depende de `[user, isLoaded]` (linha 161), não de `selectedId`. Tem fallback:

```tsx
      } catch (error) {
        console.warn('Erro ao carregar perfil no AppShell:', error);
        const fallbackName = user?.fullName || user?.username || "Usuário";
        setProfileName(fallbackName);
      }
```

### (g) O que pode travar/perder tempo quando offline (sem timeout em lugar nenhum)

1. **Lista de aulas** — `AulasPage.tsx` linhas 337–341:

```tsx
  if (loading) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
```
   `loading` só cai no fim de `recarregar` (linha 244) → `getAulasDoUsuario` → Supabase (`aulaService.ts` linhas 78–84, `await supabase.from("aulas").select("*")...`) **sem `AbortSignal`/timeout**. Dois cenários:
   - `navigator.onLine === false` (linha 73 de `aulaService.ts`) → cai no cache do localStorage; sem cache → `[]` → lista "Nenhuma aula cadastrada ainda." e **nenhum player**. Recuperação limpa.
   - `navigator.onLine === true` mas sem internet real (Wi‑Fi conectado sem saída, modo avião parcial, captive portal) → o `fetch` do Supabase fica pendurado até o *socket* do navegador desistir → **spinner de tela cheia por tempo indeterminado**, sem mensagem. Só depois do timeout é que o `catch` usa o cache.

2. **`app-shell` sync** — linhas 207–240: `processPendingOperations()` + `syncWithSupabase(userId)` em `try/catch`, disparado no mount (2 s depois, linhas 243–247), a cada 5 min e ao voltar para a aba. Também **sem timeout**; falha não derruba a tela (só `console.error`), mas pode ficar pendurado.

3. **`getSupabaseWithToken`/`getClerkToken`** — `src/lib/supabaseClient.ts` linhas 45–80: `await session.getToken({ template: 'supabase1' })` depende do Clerk (rede). Não há timeout. Se pendurar, `loadProfile` e o sync ficam esperando.

4. **`AulaMateriais` com contexto carregando** — `AulaMateriais.tsx` linhas 274–281:

```tsx
  if (loading) {
    return (
      <Card className="p-5">
        <CardContent className="flex items-center gap-2 p-0 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando materiais…
```
   Esse `loading` é do **contexto** (linha 38 de `AulaMateriaisContext.tsx`), não da aula. Só cai no `finally` (linha 66) — se `getDb()`/`col.find()` pendurar, fica "Carregando materiais…" para sempre. Suspeita (ver 6b).

### (h) Alguma falha pode impedir o player de aparecer / deixar a tela em branco?

- **Player não aparece:** sim — `if (loading)` (337) segura a página inteira enquanto a lista não resolver; e `aula === null` (linha 619) mostra `PlayerEmpty`. Se a lista vier vazia (offline, sem cache), não há aula selecionada → `PlayerEmpty` ("Nenhuma aula selecionada"), nunca um player.
- **Tela em branco:** sim, por dois caminhos:
  1. Não existe `ErrorBoundary` em nenhum `.tsx` do projeto (grep por `ErrorBoundary|componentDidCatch` → **nenhum resultado** em `src/**/*.tsx`), então qualquer exceção de render derruba a árvore inteira.
  2. O efeito de subscribe (linhas 161–178, detalhado em 6a.1) cria um **loop infinito de setState** → React "Maximum update depth exceeded" → tela em branco (sem boundary para segurar).

---

## 3) PERGUNTA 3 — Condição EXATA da mensagem "Sem internet e esta aula não foi baixada"

A mensagem está em `src/components/aulas/AulaPlayer.tsx`. A condição é o **evento `error` do elemento `<video>`**, linhas 84–98:

```tsx
    const handleError = () => {
      // If offline video fails and we're online, try remote URL
      if (!triedFallbackRef.current && offlineObjectUrl && isOnline && teraboxUrl) {
        triedFallbackRef.current = true;
        console.warn("[AulaPlayer] Offline video failed, falling back to remote URL");
        videoEl.src = teraboxUrl;
        videoEl.load();
        return;
      }
      // If we're offline and no video available
      if (!isOnline && (!offlineObjectUrl || triedFallbackRef.current)) {
        setShowOfflineError(true);
      }
    };
```

Registro do listener, linhas 99–101:

```tsx
    videoEl.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoEl.addEventListener("timeupdate", handleTimeUpdate);
    videoEl.addEventListener("error", handleError);
```

Render, linhas 127–137:

```tsx
  if (showOfflineError) {
    return (
      <div className="rf-au-player relative aspect-video w-full overflow-hidden bg-black shadow-lg flex items-center justify-center">
        <div className="text-center p-4 text-white">
          <WifiOff className="mx-auto h-10 w-10 text-white/50 mb-3" />
          <p className="text-lg font-medium">Sem internet e esta aula não foi baixada</p>
          <p className="mt-1 text-sm text-white/70">
            Conecte-se ou baixe a aula quando estiver online
          </p>
        </div>
      </div>
    );
  }
```

### O que a condição realmente olha

- `isOnline` vem de prop, linhas 12/21 (`isOnline = true` default) e é preenchida em `AulasPage.tsx` linha 594 (`isOnline={isOnline}`). Esse `isOnline` do `AulasPage` é `navigator.onLine` (linhas 253–271: `setIsOnline(navigator.onLine)` + listeners `online`/`offline`).
- **Não** consulta `navigator.onLine` diretamente, **não** consulta `meta.status === "complete"`, **não** consulta `getOfflineAulaIds()`.
- Na prática a condição é: *o `<video>` emitiu `error`* **E** *`navigator.onLine === false` no React* **E** *não existe `offlineObjectUrl`* **E** *nenhum fallback para a URL remota foi tentado ainda*.

### Pode aparecer por engano para uma aula já baixada?

**Sim**, em três situações (todas são leitura de código, não execução):

1. **Object URL ainda sendo montado.** Ao selecionar, `currentOfflineObjectUrl` ainda não foi atualizado (o `useEffect` de `AulasPage` 179–196 só escreve no `.then`), então a primeira montagem do `<video>` recebe `teraboxUrl` (linha 31 de `AulaPlayer`) → offline → `error` → mensagem. Quando o object URL chega, o efeito das linhas 33–37 zera o estado:

```tsx
  useEffect(() => {
    hasRestoredTime.current = false;
    triedFallbackRef.current = false;
    setShowOfflineError(false);
  }, [aulaId, effectiveSrc]);
```
   Ou seja: **flash transitório** da mensagem para uma aula baixada (visível sobretudo em vídeos de centenas de MB, em que montar o Blob leva tempo).

2. **`getPlayableObjectUrl` devolveu `null` por exceção.** Qualquer falha (inclusive estouro de memória no `new Blob(...)`) cai no `catch { return null; }` (`videoOfflineService.ts` 134–136) → a aula baixada é tratada como não baixada → mensagem **permanente**.

3. **`triedFallbackRef.current === true`.** Se o vídeo offline falhou uma vez quando `isOnline` era `true` (linha 87), esse ref fica `true`; depois, se o usuário ficar offline, a segunda condição (`!isOnline && (... || triedFallbackRef.current)`) fica verdadeira **mesmo com `offlineObjectUrl` válido** — basta um evento `error` (por qualquer outro motivo) para a mensagem aparecer.

---

## 4) PERGUNTA 4 — `getPlayableObjectUrl` por inteiro, memória e alternativas

### 4.1 Função completa (`src/services/videoOfflineService.ts`, linhas 113–136)

```ts
/**
 * Monta um Blob a partir dos chunks em ordem e devolve object URL.
 * NÃO copia bytes para a memória — apenas referências aos Blobs.
 * Quem chamar DEVE dar URL.revokeObjectURL() quando não precisar mais.
 */
export async function getPlayableObjectUrl(aulaId: string): Promise<string | null> {
  try {
    const db = getVideoDb();
    const meta = await db.videoMeta.get(aulaId);
    if (!meta || meta.status !== "complete") return null;

    const chunks = await db.videoChunks.where("aulaId").equals(aulaId).sortBy("index");

    if (chunks.length === 0) return null;

    const blobs = chunks.map((c) => c.blob);
    const combinedBlob = new Blob(blobs, { type: meta.mime });
    return URL.createObjectURL(combinedBlob);
  } catch {
    return null;
  }
}
```

Esquema relevante (linhas 8–21 e 44–50): `videoMeta` PK = `aulaId`; `videoChunks` PK composta `[aulaId+index]`; `CHUNK_SIZE_BYTES = 8 * 1024 * 1024` (`constants/index.ts` linha 188).

### 4.2 Para um vídeo de 450 MB: carrega na memória ou só referências?

- **O código JS não copia bytes.** `chunks.map(c => c.blob)` cria um array de *handles* de Blob (450 MB / 8 MB ≈ **57 chunks** → 57 objetos). `sortBy("index")` materializa esses 57 registros em memória — irrelevante em tamanho.
- **A cópia (se houver) acontece dentro do engine**, em `new Blob(blobs, ...)`. A especificação permite ao browser criar um blob que **referencia** as partes; na prática Chrome/Edge montam um blob "multipart" apontando para os mesmos dados (sem cópia), enquanto outros engines podem materializar um segundo buffer de 450 MB. **Isso não é determinável por leitura do repositório** — é comportamento de implementação.
- O que **é** certo e já é um problema: cada `getPlayableObjectUrl` cria **um novo blob combinado + um novo object URL**, e o `AulasPage` **nunca revoga os anteriores ao trocar de aula** (linhas 152–158 com deps `[]`, linha 190 sobrescrevendo o ref). Dois ou três cliques em aulas diferentes e o documento passa a segurar **2–3 × 450 MB** de blob vivo, até o `AulasPage` desmontar.

### 4.3 Risco real de estourar memória no celular?

Leitura de código + limitações conhecidas de plataforma: **sim, risco real**, por três motivos que o código comprova:

1. Blob combinado de 450 MB por exibição (linha 132) — no iOS Safari, que impõe limite de memória por aba (centenas de MB), um único blob desse tamanho já é perigoso; em Android/iPhones antigos o mesmo vale.
2. Retenção acumulada (item 4.2) — o pior cenário.
3. A montagem é feita **de novo a cada troca de aula** (deps `[selectedId]`), inclusive quando o usuário só quer voltar para a lista.

Otimista: com 1 única aula e 1 único `revoke`, um blob de 450 MB é "apenas" 450 MB de blob (o vídeo já ocupa isso em disco). O problema é o **acúmulo** e a **cópia dependente de engine**.

### 4.4 Alternativas e o que cada uma exigiria de mudança

| Alternativa | O que muda no código | Observação |
|---|---|---|
| **A. OPFS (Origin Private File System) — 1 arquivo por aula** | Trocar `videoChunks` por escrita sequencial em `createWritable({ keepExistingData: true })` no offset correto (`% 8 MB` do `downloadedBytes`); `getPlayableObjectUrl` vira `URL.createObjectURL(await handle.getFile())`; `removeVideo`/`clearAllVideos`/`getStorageInfo` reescritos; migração dos vídeos já baixados | **Melhor custo-benefício.** Zero montagem, zero cópia, seek nativo por range. `navigator.storage.getDirectory()` |
| **B. Service Worker servindo `Range` sobre os chunks do IndexedDB** | Manter o banco como está; criar rota virtual (ex.: `/__video_offline__/<aulaId>`); interceptar no SW, ler só os chunks cobertos pelo `Range` e responder `206` com `blob.slice()`; apontar `effectiveSrc` para essa URL | Mais robusto para arquivos gigantes; **requer** escopo/registro de SW (o projeto já tem `public/sw.js`, hoje cache-first) e cuidado para não piorar o problema de deploy stale já conhecido |
| **C. MSE (MediaSource)** | Exigiria fonte **fragmentada** (fMP4/CMAF) ou WebM; o arquivo do GitHub é MP4 "normal" → precisaria de remux (ex.: mp4box.js) no cliente ou novo formato no servidor | Alto custo, ganho pequeno frente a A/B |
| **D. Só mitigar o vazamento** | Revogar o object URL anterior antes de criar o novo (no `AulasPage`, ao trocar `selectedId`) e revogar no cleanup do hook (`useVideoOffline` 88–110) | Resolve o acúmulo (2–3 × 450 MB), **não** resolve o blob único de 450 MB |

---

## 5) PERGUNTA 5 — Seek sem rede, com object URL de Blob

**Sim, o seek funciona sem rede**, pelo que o código faz:

- O blob é montado com `type: meta.mime`, e `mime` é fixado como `"video/mp4"` na criação do meta (`videoOfflineService.ts` linha 441: `mime: "video/mp4",`) e reusado no `new Blob(blobs, { type: meta.mime })` (linha 132).
- `URL.createObjectURL(combinedBlob)` produz uma URL `blob:` **local**: o elemento `<video>` não faz nenhuma requisição para ler, pular ou reposicionar — o browser lê o intervalo de bytes que quiser do blob (inclusive via `Range` interno).
- O player não faz nada que dependa de rede para o seek: `AulaPlayer.tsx` linhas 113–125 (`handleRewind`/`handleForward`) só mexem em `videoRef.current.currentTime`; os botões do Plyr (`progress` nas linhas 56–70) idem.
- Consequência para MP4: os 450 MB estão **integros e contíguos** no blob, então mesmo um MP4 com `moov` no fim (que exige ler o final do arquivo para achar o índice) funciona — o browser lê o "rabo" do blob localmente, sem internet.

Ressalvas honestas:
- A *velocidade* do seek depende do engine (arquivo de 450 MB em blob no celular pode levar alguns segundos para o primeiro reposicionamento) — desempenho, não rede.
- Se o blob fosse montado com `type` errado (não é o caso: `video/mp4` fixo), o sniffing poderia falhar em alguns browsers; não é o caso aqui.
- Nada no código força `preload`/`crossOrigin`; não afeta blob.

---

## 6) PERGUNTA 6 — Outros problemas no caminho "abrir aula baixada offline"

### (a) Certeza — lido no código

**a.1 — Loop infinito de render no subscribe (tela em branco).**
`AulasPage.tsx` linhas 161–178:

```tsx
  // Subscreve progresso de downloads para mostrar na árvore
  useEffect(() => {
    const unsubscribe = subscribeToDownloads((states) => {
      const progress: Record<string, DownloadState> = {};
      states.forEach((state, aulaId) => {
        progress[aulaId] = state;
      });
      setDownloadProgress(progress);
      // Atualiza offlineAulaIds quando algum completa
      const newOfflineIds = new Set(offlineAulaIds);
      states.forEach((state, aulaId) => {
        if (state.phase === "complete") newOfflineIds.add(aulaId);
        else if (state.phase === "idle" || state.phase === "error") newOfflineIds.delete(aulaId);
      });
      setOfflineAulaIds(newOfflineIds);
    });
    return unsubscribe;
  }, [offlineAulaIds]);
```

E `subscribe` **chama o listener imediatamente** (`videoOfflineService.ts`, linhas 305–310):

```ts
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Entrega estado atual imediatamente
    listener(new Map(this.states));
    return () => this.listeners.delete(listener);
  }
```

O ciclo: `offlineAulaIds` muda de identidade → efeito reexecuta → `subscribe` → listener síncrono → `setOfflineAulaIds(new Set(...))` (identidade nova **sempre**) → re-render → efeito reexecuta… É laço infinito de updates (`Maximum update depth exceeded`, React #185) e não existe ErrorBoundary (grep: nenhum). Também nota: `setDownloadProgress(progress)` cria objeto novo a cada volta.

**a.2 — Object URLs vazados a cada troca de aula.** `AulasPage.tsx` 151–159 (deps `[]`) + linha 190 (`currentObjectUrlRef.current = url` sem revogar o anterior). Cada troca retém um blob de até 450 MB.

**a.3 — Vídeo da aula anterior aparece na aula nova.** `select`/`go` (linhas 328–335) só trocam `selectedId`; `currentOfflineObjectUrl` **não** é zerado no início do efeito (179–196 só escreve no `.then`, e o `setCurrentOfflineObjectUrl(null)` do `if (!selectedId)` não roda). Entre o clique e a leitura do IndexedDB, `<AulaPlayer>` recebe o object URL da aula **anterior** (linha 587–595) → o usuário vê (e pode dar play) o vídeo errado. Se a aula anterior não tinha vídeo offline e a nova tem, o inverso também vale.

**a.4 — Download que termina com a aula na tela não passa a tocar offline.** O efeito depende só de `[selectedId]` (linha 196); não reage ao `phase === "complete"` do subscribe. Se o download da aula aberta termina, `offlineAulaIds` (asterisco da árvore) atualiza, mas `currentOfflineObjectUrl` **não** — é preciso trocar de aula (ou recarregar) para o vídeo passar a usar o blob.

**a.5 — Object URLs do hook nunca revogados e nunca usados.** `useVideoOffline.ts` 41–44 (cria), 88–92 e 104–110 (`setObjectUrl(null)` sem `revokeObjectURL`); `VideoOfflineButton.tsx` linha 34 desestrutura `objectUrl` e **não usa**. O hook cria um blob novo a cada `phase === "complete"` (linhas 50–55) e um no mount (linhas 63–76) — dois por aula, ambos retidos.

**a.6 — Estado "complete" não é restaurado do banco.** `useVideoOffline.ts` linhas 37–39:

```ts
  const [state, setState] = useState<DownloadState>(() => getDownloadState(aulaId));
```
`getDownloadState` só olha o Map do singleton (`videoOfflineService.ts` 1089–1097), que nasce vazio após recarregar a página. O `checkInitial` (linhas 61–76) restaura apenas o `objectUrl`; **não** faz `setState({ phase: "complete" })`. Resultado: depois de um refresh, uma aula já baixada aparece como "Disponibilizar offline" (fase `idle`), e clicar dispara `getRemoteVideoSize` (rede).

**a.7 — Cache de tamanho nunca acerta (a chave está errada).**
`videoOfflineService.ts` linhas 205–209:

```ts
  const db = getVideoDb();
  const existingMeta = await db.videoMeta.get(url);
  if (existingMeta && existingMeta.totalBytes > 0) {
    return existingMeta.totalBytes;
  }
```
A PK de `videoMeta` é `aulaId` (linha 10 `aulaId: string; // chave primária` e linha 48 `videoMeta: "aulaId, status, updatedAt"`), e os registros gravados usam o `aulaId` (linhas 441–453). `get(url)` recebe a **URL do GitHub** → nunca encontra nada → **cache inexistente, toda chamada vira request de rede** (inclusive o clique em "Disponibilizar offline", que já é uma segunda chamada de rede depois do download).

**a.8 — Spinner de tela cheia sem timeout quando `navigator.onLine === true` e não há internet.** `AulasPage.tsx` 337–341 + `aulaService.ts` 78–84 (`supabase...select()` sem `AbortSignal`/timeout). Afeta justamente o cenário "sem internet de verdade" (Wi‑Fi sem saída), que é o mais comum no celular.

**a.9 — Player preto sem nenhuma mensagem quando `isOnline === true` mas o vídeo offline falha.** `AulaPlayer.tsx` 84–98: se `triedFallbackRef.current` já é `true` (fallback para remoto já tentado) e `isOnline` continua `true`, **as duas** condições são falsas → `showOfflineError` fica `false` → o `<video>` fica preto, sem aviso, sem erro visível.

**a.10 — `handleTimeUpdate` escreve no `localStorage` a cada evento.** `AulasPage.tsx` 214–223: `setTempos` + `localStorage.setItem(storageKeyProgresso, JSON.stringify(next))` a cada `timeupdate` (várias vezes por segundo), serializando **todas** as aulas. Durante o playback offline isso concorre com a leitura do blob no mesmo thread.

**a.11 — `mime` fixado em `video/mp4`.** Linha 441 (`mime: "video/mp4"`) — se alguma aula vier com fonte que não seja MP4, o blob (linha 132) e o `<source type="video/mp4">` (`AulaPlayer.tsx` linha 145) ficam errados e o `error` do vídeo aparece (→ mensagem da Pergunta 3).

**a.12 — O `<source type>` é decorativo.** `AulaPlayer.tsx` linhas 48–52 atribuem `videoEl.src` diretamente (o `<video>` tem `key={effectiveSrc}` e um `<source>` filho, linha 144–146). Não é bug funcional, mas o `type="video/mp4"` do `<source>` não protege nada: a escolha real é feita pelo `src` do elemento.

### (b) Suspeita — não provado por leitura

**b.1 — Estouro de memória no iOS Safari** ao montar/segurar o blob de 450 MB (depende do engine; ver 4.2/4.3).
**b.2 — `getDb()` (RxDB) pendurar offline** deixando `AulaMateriaisContext.loading = true` para sempre → "Carregando materiais…" eterno (linhas 274–281 de `AulaMateriais.tsx` + `finally` da linha 66 do contexto). Não verifiquei `src/lib/db.ts` a fundo.
**b.3 — `session.getToken()` do Clerk pendurar sem internet** (`supabaseClient.ts` 45–80), travando `loadProfile`/sync por tempo indeterminado.
**b.4 — Latência da leitura dos 57 chunks** em celulares lentos pode ser longa o bastante para o flash da mensagem "Sem internet e esta aula não foi baixada" (Pergunta 3, caso 1) ser percebido.
**b.5 — `syncWithSupabase`/`processPendingOperations` (app-shell 207–240)** podem ficar pendurados e, ao voltar a internet, disparar rajada de operações — não testei.

---

## Extra (pedido explícito, sem correção)

> Em `fetchRemoteVideoSize`, `db.videoMeta.get(url)` (linha 206) consulta pela URL, mas a PK de `videoMeta` é `aulaId` (linhas 10 e 48) — **o cache nunca acerta e toda chamada vira request de rede**.

---

## 2) `git status --short` — antes e depois

**Antes (primeiro comando da sessão):**

```
 M src/components/app-shell.tsx
 M src/components/aulas/AulasPage.tsx
 M src/routes/configuracoes.tsx
 M src/services/aulaService.ts
 M src/services/videoOfflineService.ts
?? diff-videooffline.txt
?? relatorio-cache-aulas.md
?? relatorio-videooffline-c7.md
?? relatorio-videooffline-correcao.md
?? saida-build.txt
?? saida-eslint.txt
?? saida-tsc.txt
```

**Depois (último comando da sessão):**

```
 M src/components/app-shell.tsx
 M src/components/aulas/AulasPage.tsx
 M src/routes/configuracoes.tsx
 M src/services/aulaService.ts
 M src/services/videoOfflineService.ts
?? diff-videooffline.txt
?? relatorio-cache-aulas.md
?? relatorio-videooffline-c7.md
?? relatorio-videooffline-correcao.md
?? saida-build.txt
?? saida-eslint.txt
?? saida-tsc.txt
```

**Idênticas**, exceto por `relatorio-leitura-offline.md`, que ainda não existia quando o "depois" foi capturado (foi criado em seguida, atendendo à autorização do enunciado).

---

## 3) O que NÃO foi verificado

- **Nada foi executado.** Não abri o navegador, não rodei `npm run build`, `tsc`, `eslint` nem os testes. Todas as conclusões são leitura estática de código.
- **Comportamento de memória real** (blob de 450 MB no iOS Safari/Android) — não medido, não reproduzível por leitura.
- **Comportamento de rede**: não sei quanto tempo o `fetch` do Supabase/Clerk leva para desistir neste aparelho; não sei se o proxy de vídeo responde `Range` como o código espera.
- **Estado real do IndexedDB do usuário** (`revisaflash_videos`): não inspecionei nenhum banco real; não sei se há metas `complete` com chunks íntegros.
- **Loop infinito (6a.1)**: concluído por leitura; não observei o erro no console porque não rodei o app.
- **`src/lib/db.ts` (RxDB)** só foi visto por grep, não lido — afeta as suspeitas b.2.
- **`public/sw.js`** não foi lido nesta sessão; só sei que existe (memória do projeto) e que cache-first já causou deploy stale.
- **iOS/PWA, `navigator.storage.persist`, Wake Lock**: não exercitados.

---

## 4) Dúvidas

1. **A aula que o usuário abre offline é sempre MP4 do GitHub Releases?** Se sim, a alternativa A (OPFS) é a mais direta; se houver fontes diferentes, o `mime` fixo (6a.11) precisa virar metadado por aula.
2. **O loop de render (6a.1) está acontecendo em produção?** Se a página de Aulas abre normalmente hoje, minha leitura está errada em algum ponto (ou o React está "aguentando" o ciclo em lote) — vale conferir no console antes de qualquer correção.
3. **É para baixar 450 MB ou menos?** Isso muda a prioridade: com arquivos de ~50–100 MB, o blob único é viável e só o vazamento (6a.2) precisa de correção.
4. **Posso mexer no `public/sw.js`?** A alternativa B (Service Worker com `Range`) mexe em arquivo sensível (já houve problema de cache-first). Só sigo por aí com aval explícito.
5. **Vídeos já baixados em IndexedDB (versão atual, em chunks) precisam continuar funcionando** depois de uma eventual mudança de storage (OPFS)? Se sim, precisamos de migração na primeira execução.
6. **`relatorio-*.md` novos na raiz** (há 4 arquivos `??` de relatórios anteriores) — quer que eu mantenha este relatório no mesmo padrão/destino, ou prefere mover para uma pasta?