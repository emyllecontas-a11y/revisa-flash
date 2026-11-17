# Relatório — Fonte offline presa à aula + Plyr por montagem

Escopo alterado: `src/components/aulas/AulasPage.tsx` e `src/components/aulas/AulaPlayer.tsx`.

Nenhum outro arquivo foi editado. Não foram criados nem revogados object URLs fora de `AulasPage.tsx`.

---

## 1) Trechos ANTES e DEPOIS

### P1 — AulasPage.tsx: a fonte offline fica presa à aula

#### P1(a) — estado

ANTES:

```tsx
  const [currentOfflineObjectUrl, setCurrentOfflineObjectUrl] = useState<string | null>(null);
  const currentObjectUrlRef = useRef<string | null>(null);
```

DEPOIS (linhas 127-131):

```tsx
  // Fonte offline: fica presa à aula que a gerou (evita entregar URL de outra aula).
  const [offlineSource, setOfflineSource] = useState<{ aulaId: string; url: string | null } | null>(
    null,
  );
```

#### P1(c) — efeito antigo de revogação removido

ANTES:

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

DEPOIS: o bloco acima foi **removido**. A revogação passou a existir só no cleanup do efeito de P1(b).

#### P1(b) — efeito que carrega o URL, com revogação no cleanup

ANTES:

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

DEPOIS (linhas 200-222):

```tsx
  // Carrega object URL offline quando a aula selecionada muda
  useEffect(() => {
    setOfflineSource(null);
    if (!selectedId) {
      return;
    }
    let cancelled = false;
    let urlCriado: string | null = null;
    getPlayableObjectUrl(selectedId).then((url) => {
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      urlCriado = url;
      setOfflineSource({ aulaId: selectedId, url });
    });
    return () => {
      cancelled = true;
      if (urlCriado) {
        URL.revokeObjectURL(urlCriado);
        urlCriado = null;
      }
    };
  }, [selectedId]);
```

#### P1(d) — player só monta quando a fonte é da aula atual

ANTES:

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

DEPOIS (linhas 614-633):

```tsx
              {offlineSource?.aulaId !== aula.id ? (
                <div
                  className="rf-au-player relative aspect-video w-full overflow-hidden bg-black shadow-lg flex items-center justify-center"
                  aria-live="polite"
                >
                  <div className="flex flex-col items-center gap-3 text-white">
                    <Loader2 className="h-8 w-8 animate-spin text-white/80" />
                    <span className="text-sm text-white/80">Preparando vídeo…</span>
                  </div>
                </div>
              ) : (
                <AulaPlayer
                  teraboxUrl={aula.terabox_url ?? ""}
                  aulaId={aula.id}
                  initialTime={tempos[aula.id]?.current || 0}
                  onTimeUpdate={(curr, dur) => handleTimeUpdate(aula.id, curr, dur)}
                  offlineObjectUrl={offlineSource.url}
                  isOnline={isOnline}
                />
              )}
```

### P2 — AulasPage.tsx: efeito do `subscribeToDownloads`

ANTES:

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

DEPOIS (linhas 156-198), com os refs novos logo acima (linhas 156-159: `ultimaFaseRef`, `selectedIdRef`) e `toastRef` declarado no topo do componente (linhas 92-93, por causa do `react-hooks/exhaustive-deps`):

```tsx
  // Última fase conhecida de cada aula + aula selecionada (para o toast de conclusão)
  const ultimaFaseRef = useRef<Map<string, DownloadPhase>>(new Map());
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;

  // Subscreve progresso de downloads para mostrar na árvore
  useEffect(() => {
    const unsubscribe = subscribeToDownloads((states) => {
      const progress: Record<string, DownloadState> = {};
      states.forEach((state, aulaId) => {
        progress[aulaId] = state;
      });
      setDownloadProgress(progress);
      // Atualiza offlineAulaIds quando algum completa
      setOfflineAulaIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        states.forEach((state, aulaId) => {
          if (state.phase === "complete" && !next.has(aulaId)) {
            next.add(aulaId);
            changed = true;
          } else if ((state.phase === "idle" || state.phase === "error") && next.has(aulaId)) {
            next.delete(aulaId);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
      // Toast só quando uma aula JÁ conhecida (fase anterior registrada) chega a "complete"
      states.forEach((state, aulaId) => {
        const anterior = ultimaFaseRef.current.get(aulaId);
        ultimaFaseRef.current.set(aulaId, state.phase);
        if (anterior && anterior !== "complete" && state.phase === "complete") {
          if (aulaId === selectedIdRef.current) {
            toastRef.current.success(
              "Vídeo salvo. Ele será usado offline na próxima vez que você abrir esta aula.",
            );
          }
        }
      });
    });
    return unsubscribe;
  }, []);
```

### P3 — AulaPlayer.tsx

#### P3(1) + P3(2) — fonte definida uma vez por montagem, `<video src>` com `key={aulaId}`

ANTES:

```tsx
  const [currentSrc, setCurrentSrc] = useState<string>(offlineObjectUrl || teraboxUrl);
  const [showOfflineError, setShowOfflineError] = useState(false);
  const triedFallbackRef = useRef(false);

  // Determine which source to use: offline if available, else remote
  const effectiveSrc = offlineObjectUrl || teraboxUrl;

  useEffect(() => {
    hasRestoredTime.current = false;
    triedFallbackRef.current = false;
    setShowOfflineError(false);
  }, [aulaId, effectiveSrc]);
```

DEPOIS (linhas 44-60):

```tsx
  const hasRestoredTime = useRef(false);
  const triedFallbackRef = useRef(false);
  const tentouCarregarSemInternetRef = useRef(false);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  // initialTime é aplicado uma única vez, no loadedmetadata; a ref guarda o valor de montagem.
  const initialTimeRef = useRef(initialTime);
  const [playerMessage, setPlayerMessage] = useState<PlayerMessage>(null);

  // A fonte é definida UMA vez por montagem. AulasPage já garante a remontagem
  // (aulaId na key do wrapper), então mudanças de props não trocam a fonte.
  const [fonteInicial] = useState(() => ({
    src: offlineObjectUrl || teraboxUrl,
    isOffline: !!offlineObjectUrl,
  }));
```

O `<video>` antigo (com `<source>` filho e `key={effectiveSrc}`):

```tsx
        <video ref={videoRef} className="w-full h-full" playsInline controls key={effectiveSrc}>
          <source src={effectiveSrc} type="video/mp4" />
        </video>
```

virou (linhas 175-185):

```tsx
        {fonteInicial.src ? (
          <video
            ref={videoRef}
            src={fonteInicial.src}
            className="w-full h-full"
            playsInline
            controls
            key={aulaId}
          />
        ) : null}
```

#### P3(3) — Plyr criado e destruído no mesmo efeito (deps `[aulaId]`)

ANTES: o Plyr era criado dentro de um efeito cujas deps eram
`[effectiveSrc, aulaId, initialTime, offlineObjectUrl, teraboxUrl, isOnline]` e o `destroy()`
ficava no cleanup desse mesmo efeito (ou seja, recriava a cada mudança de fonte/estado).

DEPOIS (linhas 79-104):

```tsx
  // Plyr: criado no efeito do elemento e destruído no cleanup (deps [aulaId]).
  useEffect(() => {
    if (!videoRef.current) return;
    const videoEl = videoRef.current;
    playerRef.current = new Plyr(videoEl, {
      controls: [
        "play-large",
        "play",
        "progress",
        "current-time",
        "mute",
        "volume",
        "captions",
        "settings",
        "pip",
        "airplay",
        "fullscreen",
      ],
      settings: ["captions", "quality", "speed"],
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4] },
    });

    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [aulaId]);
```

#### P3(4) + P3(5) + P3(6) — eventos, initialTime único, fallback e overlays

ANTES (tudo no mesmo efeito, com deps `[effectiveSrc, aulaId, initialTime, offlineObjectUrl, teraboxUrl, isOnline]`):

```tsx
    const handleLoadedMetadata = () => {
      if (initialTime > 0 && !hasRestoredTime.current) {
        videoEl.currentTime = initialTime;
        hasRestoredTime.current = true;
      }
    };

    const handleTimeUpdate = () => {
      if (onTimeUpdate && videoEl) {
        onTimeUpdate(videoEl.currentTime, videoEl.duration || 0);
      }
    };

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

DEPOIS (linhas 106-153):

```tsx
  // Eventos do vídeo: tempo, restauração e fallback de fonte.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleLoadedMetadata = () => {
      if (initialTimeRef.current > 0 && !hasRestoredTime.current) {
        videoEl.currentTime = initialTimeRef.current;
        hasRestoredTime.current = true;
      }
    };

    const handleTimeUpdate = () => {
      if (onTimeUpdateRef.current) {
        onTimeUpdateRef.current(videoEl.currentTime, videoEl.duration || 0);
      }
    };

    const handleError = () => {
      if (fonteInicial.isOffline) {
        if (isOnline && teraboxUrl && !triedFallbackRef.current) {
          triedFallbackRef.current = true;
          hasRestoredTime.current = false;
          toastRef.current.warning("Não foi possível tocar o vídeo salvo. Usando a versão online.");
          setPlayerMessage(null);
          videoEl.src = teraboxUrl;
          videoEl.load();
          return;
        }
        setPlayerMessage("salvo-falhou");
        return;
      }
      if (isOnline) {
        setPlayerMessage("erro-carregar");
      }
    };

    videoEl.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoEl.addEventListener("timeupdate", handleTimeUpdate);
    videoEl.addEventListener("error", handleError);

    return () => {
      videoEl.removeEventListener("loadedmetadata", handleLoadedMetadata);
      videoEl.removeEventListener("timeupdate", handleTimeUpdate);
      videoEl.removeEventListener("error", handleError);
    };
  }, [aulaId, fonteInicial, isOnline, teraboxUrl]);
```

#### P3(6) — overlay "sem-internet" já no mount, e volta a carregar quando a internet volta

Novo (linhas 62-77):

```tsx
  // Sem fonte: sem internet e nada baixado — avisa já no mount.
  // Se a conexão voltar, libera a montagem do vídeo e carrega uma única vez.
  useEffect(() => {
    if (fonteInicial.src) return;
    if (!isOnline) {
      setPlayerMessage("sem-internet");
      return;
    }
    if (playerMessage === "sem-internet" && !tentouCarregarSemInternetRef.current) {
      tentouCarregarSemInternetRef.current = true;
      hasRestoredTime.current = false;
      setPlayerMessage(null);
      videoRef.current?.load();
    }
  }, [isOnline, fonteInicial.src, playerMessage]);
```

#### P3(6) — overlay no lugar do `return` antecipado

ANTES:

```tsx
  // Show offline message when no video available
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

DEPOIS (linhas 17-32 para os textos, 170-196 para o overlay):

```tsx
// Estado do overlay de mensagem do player.
type PlayerMessage = null | "sem-internet" | "salvo-falhou" | "erro-carregar";

const MENSAGENS: Record<Exclude<PlayerMessage, null>, { titulo: string; detalhe: string }> = {
  "sem-internet": {
    titulo: "Sem internet e esta aula não foi baixada",
    detalhe: "Conecte-se ou baixe a aula quando estiver online",
  },
  "salvo-falhou": {
    titulo: "Não foi possível tocar o vídeo salvo neste aparelho.",
    detalhe: "Remova o download e baixe de novo.",
  },
  "erro-carregar": {
    titulo: "Não foi possível carregar o vídeo.",
    detalhe: "Verifique sua conexão e tente de novo.",
  },
};
```

```tsx
  const mensagem = playerMessage ? MENSAGENS[playerMessage] : null;

  return (
    <div className="relative group">
      <div className="rf-au-player relative aspect-video w-full overflow-hidden bg-black shadow-lg">
        {fonteInicial.src ? (
          <video
            ref={videoRef}
            src={fonteInicial.src}
            className="w-full h-full"
            playsInline
            controls
            key={aulaId}
          />
        ) : null}
        {mensagem ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            {playerMessage === "sem-internet" ? (
              <WifiOff className="mx-auto mb-3 h-10 w-10 text-white/50" />
            ) : (
              <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-white/50" />
            )}
            <div className="p-4 text-center text-white">
              <p className="text-lg font-medium">{mensagem.titulo}</p>
              <p className="mt-1 text-sm text-white/70">{mensagem.detalhe}</p>
            </div>
          </div>
        ) : null}
      </div>
```

---

## 2) Todos os pontos de `URL.revokeObjectURL` nos dois arquivos do escopo

`src/components/aulas/AulasPage.tsx` — 2 pontos:

| Linha | Contexto |
|---|---|
| 210 | `if (url) URL.revokeObjectURL(url);` — dentro do `.then()` de `getPlayableObjectUrl(selectedId)`, quando o efeito já foi cancelado e mesmo assim veio um URL. |
| 219 | `URL.revokeObjectURL(urlCriado);` — no cleanup do efeito de `[selectedId]` (troca de aula ou desmontagem). |

`src/components/aulas/AulaPlayer.tsx` — 0 pontos (o player não cria nem revoga object URL; o dono é o AulasPage).

---

## 3) Verificações

### a) `npx tsc --noEmit`

```
Found 81 errors in 25 files.
```

Nenhuma linha cita `AulasPage.tsx` ou `AulaPlayer.tsx` (busca no output completo: `No matches found for pattern "AulasPage|AulaPlayer"`). Logo, 81 erros em 25 arquivos — exatamente o baseline.

### b) `npx eslint`

Linha de base (antes das edições):

```
C:\Users\vande\revisa-flash\src\components\aulas\AulasPage.tsx
  139:6   warning  React Hook useEffect has missing dependencies: 'storageKeyConcluidas', 'storageKeyFavoritas', and 'storageKeyProgresso'. Either include them or remove the dependency array  react-hooks/exhaustive-deps
  203:17  error    Empty block statement                                                                                                                                                        no-empty
  211:17  error    Empty block statement                                                                                                                                                        no-empty
  219:19  error    Empty block statement                                                                                                                                                        no-empty

✖ 4 problems (3 errors, 1 warning)
```

```
C:\Users\vande\revisa-flash\src\components\aulas\AulaPlayer.tsx
  109:6  warning  React Hook useEffect has a missing dependency: 'onTimeUpdate'. Either include it or remove the dependency array. If 'onTimeUpdate' changes too often, find the parent component that defines it and wrap that definition in useCallback  react-hooks/exhaustive-deps

✖ 1 problem (0 errors, 1 warning)
```

Depois das edições:

```
C:\Users\vande\revisa-flash\src\components\aulas\AulasPage.tsx
  144:6   warning  React Hook useEffect has missing dependencies: 'storageKeyConcluidas', 'storageKeyFavoritas', and 'storageKeyProgresso'. Either include them or remove the dependency array  react-hooks/exhaustive-deps
  230:17  error    Empty block statement                                                                                                                                                        no-empty
  238:17  error    Empty block statement                                                                                                                                                        no-empty
  246:19  error    Empty block statement                                                                                                                                                        no-empty

✖ 4 problems (3 errors, 1 warning)
```

```
C:\Users\vande\revisa-flash\src\components\aulas\AulaPlayer.tsx
(empty)
```

Comparação: AulasPage continua com 4 problemas (3 errors + 1 warning), mesmos itens, só as linhas mudaram de `139/203/211/219` para `144/230/238/246` por causa do código inserido acima. AulaPlayer passou de 1 warning para 0 (o warning de `onTimeUpdate` desapareceu porque o callback agora é lido por `onTimeUpdateRef`, sem dependência de array).

### c) `npm run build`

```
> build
> vite build

vite v8.1.0 building client environment for production...
✓ 1607 modules transformed.
computing gzip size...
dist/index.html                                    4.76 kB │ gzip:   1.58 kB
dist/assets/unavox-wordmark-BwEKsy6C.png         140.13 kB
dist/assets/unavox-simbolo-D-2lB80W.png          219.82 kB
dist/assets/unavox-logo-completa-D4FJ6Ymy.png    528.98 kB
dist/assets/pdf.worker.min-Dswkl-cV.mjs        1,265.41 kB
dist/assets/main-CiPl7ddx.css                    275.26 kB │ gzip:  43.25 kB
dist/assets/typeof-B5XbjTb1.js                     0.27 kB │ gzip:   0.16 kB
dist/assets/defineProperty-BRAO5bv8.js             0.85 kB │ gzip:   0.46 kB
dist/assets/rolldown-runtime-DAXXjFlN.js           1.26 kB │ gzip:   0.70 kB
dist/assets/preload-helper-NuCatGIt.js             1.28 kB │ gzip:   0.72 kB
dist/assets/queueService-8FL9oenn.js               8.29 kB │ gzip:   2.89 kB
dist/assets/purify.es-DpYDt3zj.js                 26.14 kB │ gzip:  10.29 kB
dist/assets/index.es-D9nLawQ-.js                 122.23 kB │ gzip:  38.48 kB
dist/assets/html2canvas-DEMszoI2.js             199.98 kB │ gzip:  46.96 kB
dist/assets/supabaseClient-CTS9KG2m.js           213.62 kB │ gzip:  55.37 kB
dist/assets/db-BaS9H627.js                       245.92 kB │ gzip:  74.77 kB
dist/assets/jspdf.es.min-CBxFGF89.js             400.44 kB │ gzip: 129.89 kB
dist/assets/xlsx-BirqPHPc.js                     495.85 kB │ gzip: 161.47 kB
dist/assets/main-BF6BloQt.js                   3,536.15 kB │ gzip: 969.94 kB

[TOLERATED_TRANSFORM] Big integer literals are not available in the configured target environment.
     ╭─[ src/services/pdfBancoParser.ts:366:13 ]
     │
 366 │     let hash = 14695981039346656037n;
     │                ──────────┬──────────  
     │                          ╰──────────── 
─────╯

[plugin builtin:vite-reporter] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
[TOLERATED_TRANSFORM] Big integer literals are not available in the configured target environment.
     ╭─[ src/services/pdfBancoParser.ts:367:16 ]
     │
 367 │     const prime = 1099511628211n;
     │                   ───────┬──────  
     │                          ╰──────── 
─────╯

[TOLERATED_TRANSFORM] Big integer literals are not available in the configured target environment.
     ╭─[ src/services/pdfBancoParser.ts:368:15 ]
     │
 368 │     const mask = 18446744073709551615n;
     │                  ──────────┬──────────── 
     │                            ╰──────────── 
─────╯

[INEFFECTIVE_DYNAMIC_IMPORT] src/services/listaService.ts is dynamically imported by src/routes/simulados.tsx, src/services/simuladoService.ts but also statically imported by src/components/EditarListaModal.tsx, src/components/EditarQuestaoModal.tsx, src/components/EditarQuestaoSimuladoModal.tsx, src/components/EscolherDestinoCopiaModal.tsx, src/components/GerenciarQuestoesModal.tsx, ..., dynamic import will not move module into another chunk.

✓ built in 5.53s
```

Exit code 0. Os avisos (`[TOLERATED_TRANSFORM]`, chunks > 500 kB, `[INEFFECTIVE_DYNAMIC_IMPORT]`) já existiam e não vêm dos arquivos do escopo.

### d) `git grep` de supressões

Comando:

```
git grep -n -E " @ts-expect-error|@ts-ignore|eslint-disable" -- src/components/aulas/AulasPage.tsx src/components/aulas/AulaPlayer.tsx
```

Resultado: **sem saída** (exit code 1 = nenhum casamento). Não há `@ts-expect-error`, `@ts-ignore` nem `eslint-disable` nos dois arquivos.

### e) `git --no-pager diff`

O diff completo (vs HEAD) dos dois arquivos foi mostrado na íntegra durante a execução. **Atenção:** o `AulasPage.tsx` já tinha alterações não commitadas antes desta sessão (banner de cache offline / `isFromCache` / `formatarDataPtBR` / useEffect de conexão com `recarregar` / imports de `aulaService`). Esses blocos aparecem no diff vs HEAD mas **não são meus**. As minhas mudanças no `AulasPage.tsx` são exatamente:

1. linha 55: `type DownloadPhase` no import de `videoOfflineService`;
2. linhas 92-93: `toastRef`;
3. linhas 127-131: `offlineSource` no lugar de `currentOfflineObjectUrl` + `currentObjectUrlRef`;
4. linhas 156-198: `ultimaFaseRef` / `selectedIdRef` + efeito do `subscribeToDownloads` reescrito;
5. linhas 200-222: efeito do `getPlayableObjectUrl(selectedId)` com revogação no cleanup (e remoção do efeito antigo de revogação com deps `[]`);
6. linhas 614-633: placeholder "Preparando vídeo…" + montagem condicional do `AulaPlayer`.

No `AulaPlayer.tsx` o diff é 100% meu (o arquivo não tinha alterações não commitadas antes desta sessão).

### f) `git status --short`

Antes (início da sessão):

```
 M src/components/app-shell.tsx
 M src/components/aulas/AulasPage.tsx
 M src/routes/configuracoes.tsx
 M src/services/aulaService.ts
 M src/services/videoOfflineService.ts
?? diff-videooffline.txt
?? relatorio-cache-aulas.md
?? relatorio-leitura-offline.md
?? relatorio-videooffline-c7.md
?? relatorio-videooffline-correcao.md
?? saida-build.txt
?? saida-eslint.txt
?? saida-tsc.txt
```

Depois (fim da sessão):

```
 M src/components/app-shell.tsx
 M src/components/aulas/AulaPlayer.tsx
 M src/components/aulas/AulasPage.tsx
 M src/routes/configuracoes.tsx
 M src/services/aulaService.ts
 M src/services/videoOfflineService.ts
?? diff-videooffline.txt
?? relatorio-cache-aulas.md
?? relatorio-leitura-offline.md
?? relatorio-videooffline-c7.md
?? relatorio-videooffline-correcao.md
?? saida-build.txt
?? saida-eslint.txt
?? saida-tsc.txt
```

Diferença: só `AulaPlayer.tsx` passou a aparecer como modificado. O `AulasPage.tsx` já estava modificado antes (por trabalho anterior, não meu). Nada mais mudou; os arquivos temporários que criei para montar o diff isolado (`__base_AulasPage.tsx`, `__base_AulaPlayer.tsx`, `diff-jogador-offline.txt`) foram apagados.

---

## 4) O que NÃO foi testado

Eu não abri o navegador. Nada abaixo foi executado de fato:

- tocar um vídeo offline (URL de blob) e confirmar que o Plyr e os controles funcionam;
- pular/avançar/retroceder 10 s (`handleRewind` / `handleForward`) com a fonte offline;
- trocar de aula com o player montado (placeholder "Preparando vídeo…" → player, sem entregar o URL da aula anterior);
- fallback remoto: simular falha do vídeo salvo e confirmar o toast "Não foi possível tocar o vídeo salvo. Usando a versão online." e a troca para `terabox_url`;
- overlay "salvo-falhou" (offline ou fallback já tentado) e "erro-carregar";
- overlay "sem-internet" já no mount e o `videoEl.load()` único quando a conexão volta;
- toast de conclusão do download (só para a aula selecionada, nunca no primeiro retorno do subscribe);
- recarregar a página offline e confirmar que o vídeo salvo continua tocando;
- revogação de object URL na prática (troca rápida de aulas, desmontagem) — só inspecionei o código.

---

## 5) Nomes ajustados e pontos com incerteza

### Nomes pedidos que existem / não existem

- Existem e foram usados: `currentOfflineObjectUrl` (removido, virava `offlineSource`), `currentObjectUrlRef` (removido), `offlineAulaIds`, `downloadProgress`, `isOnline`, `selectedId`, `getPlayableObjectUrl`, `subscribeToDownloads`, `hasRestoredTime`, `triedFallbackRef`, `showOfflineError` (removido, virou `playerMessage`).
- **`effectiveSrc` não é um ref**: era uma constante reativa (`offlineObjectUrl || teraboxUrl`) usada como `key` do `<video>`. Foi removida; no lugar há `fonteInicial` (`useState` com inicializador) guardando `{ src, isOffline }`.
- Nomes novos que criei: `offlineSource`, `ultimaFaseRef`, `selectedIdRef`, `toastRef` (AulasPage); `fonteInicial`, `playerMessage`, `tentouCarregarSemInternetRef`, `onTimeUpdateRef`, `initialTimeRef`, `toastRef`, `MENSAGENS`, `PlayerMessage` (AulaPlayer).
- `toast` vem de `@/hooks/useToast` (o mesmo caminho que `VideoOfflineButton.tsx` e `AulaMateriais.tsx` usam). Em `AulaPlayer.tsx` precisei adicionar o import `import { useToast } from "@/hooks/useToast";`.

### Ajustes que fiz além do literal do pedido (e por quê)

1. **`toastRef` no AulasPage (linhas 92-93) e `toastRef.current` no efeito do subscribe** — sem isso o eslint acusava `missing dependency: 'toast'` no efeito de deps `[]`, e o baseline não pode ter mais problemas. O `useToast()` continua sendo chamado no topo do componente; só a chamada passou por `toastRef`.
2. **`toastRef` e `initialTimeRef` no AulaPlayer** — mesmo motivo: o eslint acusava `missing dependency: 'initialTime'` e `'toast'` no efeito de eventos. O `initialTimeRef` guarda o valor de montagem (o `initialTime` é aplicado uma única vez, no `loadedmetadata`), então o comportamento pedido é preservado.
3. **`onTimeUpdateRef`** — era a única forma de manter a regra "eventos montados uma vez" sem `react-hooks/exhaustive-deps` reclamar de `onTimeUpdate`. O callback do pai continua sendo usado; só é lido por ref.
4. **Remoção do `console.warn`** no fallback remoto — o aviso agora é o toast pedido. O `console.warn` foi retirado porque o toast cumpre o papel e o `no-console` não reclamaria, mas preferi não deixar log duplicado.
5. **Overlay "erro-carregar"** — o pedido diz "erro do vídeo remoto com isOnline true". Implementado exatamente assim. Não tratei o caso "vídeo remoto falhou e está offline" (nesse caso nenhum overlay aparece, o `<video>` simplesmente fica sem imagem). Se você quiser uma mensagem para esse caso também, me diga o texto.
6. **Ícone do overlay** — "sem-internet" usa `WifiOff`; os outros dois usam `AlertTriangle` (que já estava importado no arquivo original e não era usado; agora é). Se preferir `WifiOff` nos três, é uma linha.

### Pontos em que não tenho certeza

- **`key={aulaId}` no `<video>` combinado com a remontagem por `key={aula.id}` no wrapper do AulasPage**: as duas chaves são redundantes (o wrapper já remonta o AulaPlayer inteiro a cada troca de aula). Mantive as duas porque o pedido foi explícito nos dois pontos (P1(d) e P3.2). Não vejo conflito, mas é redundância.
- **`fonteInicial` congelado no mount + `teraboxUrl` chegando depois**: hoje o AulasPage só monta o AulaPlayer depois de `offlineSource` resolver, e nessa altura `aula.terabox_url` já está carregado. Se algum dia o player for montado antes do `terabox_url` chegar, a fonte inicial ficaria vazia e cairia no overlay "sem-internet". Não é o caso hoje, mas o congelamento no mount torna essa dependência explícita.
- **`isOnline` no AulasPage**: o `setIsOnline(navigator.onLine)` está em um efeito cujas deps incluem `recarregar`; isso já era assim antes de mim e não mexi.
- **Toast de conclusão**: usei a regra "fase anterior registrada e diferente de complete → complete". Se o app já abrir com um download em andamento e ele completar antes do primeiro subscribe, nenhum toast aparece (a fase anterior não estava registrada). Achei que era o comportamento pedido ("não mostre toast no primeiro retorno do subscribe").