# Relatório — Correções em `src/services/videoOfflineService.ts` (C1–C6)

Escopo alterado: **apenas** `src/services/videoOfflineService.ts`. Nenhuma outra
página/arquivo tocado. `AulasPage.tsx` não foi aberto.

> **Atenção (contexto do git):** o arquivo já estava marcado como modificado
> (`M`) no working tree antes desta sessão. O `git diff` completo (item **e**)
> mostra, além das 6 correções abaixo, outras mudanças **não commitadas que já
> existiam** (campo `restartedAulaIds`, reescrita do bloco `validatePartialDownload`
> e do bloco 416). Essas mudanças pré-existentes **não são minhas** e não foram
> tocadas/revertidas. Os blocos ANTES/DEPOIS de C1–C6 abaixo mostram só o que eu
> alterei.

---

## 1) ANTES e DEPOIS de C1 a C6

### C1 — Bloco de fim de stream (excedente gravava `parts` em vez do necessário)

**ANTES:**
```ts
      if (bufferedBytes > 0) {
        if (meta.downloadedBytes + bufferedBytes > meta.totalBytes) {
          console.warn(
            `[videoOffline] Excedente de ${meta.downloadedBytes + bufferedBytes - meta.totalBytes} bytes ignorado`,
          );
          // Tira apenas o necessário para completar totalBytes
          const needed = meta.totalBytes - meta.downloadedBytes;
          const chunkParts = takeBytes(parts, needed);
          bufferedBytes = parts.reduce((sum, p) => sum + p.length, 0); // recalcula o que sobrou (deve ser 0 ou excedente ignorado)
        }

        if (meta.downloadedBytes < meta.totalBytes) {
          const chunkIndex = Math.floor(meta.downloadedBytes / meta.chunkSize);
          const chunkBlob = new Blob(parts as BlobPart[], { type: meta.mime });
          const actualChunkSize = chunkBlob.size;
```

**DEPOIS:**
```ts
      if (bufferedBytes > 0) {
        let finalParts: Uint8Array<ArrayBuffer>[] = parts;

        if (meta.downloadedBytes + bufferedBytes > meta.totalBytes) {
          // Tira apenas o necessário para completar totalBytes
          const needed = meta.totalBytes - meta.downloadedBytes;
          const excedenteBytes = bufferedBytes - needed;
          console.warn(`[videoOffline] Excedente de ${excedenteBytes} bytes descartado`);
          finalParts = needed > 0 ? takeBytes(parts, needed) : [];
          parts.length = 0;
          bufferedBytes = needed > 0 ? needed : 0;
        }

        if (meta.downloadedBytes < meta.totalBytes && bufferedBytes > 0) {
          const chunkIndex = Math.floor(meta.downloadedBytes / meta.chunkSize);
          const chunkBlob = new Blob(finalParts as BlobPart[], { type: meta.mime });
          const actualChunkSize = chunkBlob.size;
```
- `finalParts` recebe os bytes **necessários** (via `takeBytes`), e o Blob é montado
  com `finalParts`, não com o que sobrou em `parts`.
- `chunkParts` (variável antiga) removida; `excedenteBytes` usado no `console.warn`
  com a palavra "descartado" + a quantidade.
- Chunk vazio não é gravado (a condição passou a ser `&& bufferedBytes > 0`).

---

### C2 — Limpeza indevida no início do `catch`

**ANTES:**
```ts
    } catch (err) {
      this.releaseWakeLock();
      // Falha de verdade (não é pausa nem retentativa): encerra o reinício desta aula
      this.restartedAulaIds.delete(aulaId);
      if (this.currentDownloadAulaId === aulaId) {
        this.currentDownloadAulaId = null;
      }

      // Se foi abortado pelo usuário, não tenta novamente
      if (err instanceof Error && err.name === "AbortError") {
```

**DEPOIS:**
```ts
    } catch (err) {
      this.releaseWakeLock();

      // Se foi abortado pelo usuário, não tenta novamente
      if ((err instanceof Error && err.name === "AbortError") || controller.signal.aborted) {
```
- Removido do início do `catch`: `this.restartedAulaIds.delete(aulaId)` e o `if`
  que zerava `currentDownloadAulaId`. `this.releaseWakeLock()` permanece no início.
- As duas ações foram **recolocadas** (ver C6 e abaixo) nos ramos de saída
  (abort/pausa, offline, quota), **antes** de cada `return`.
- No caminho de **retentativa** (final do `catch`, após o backoff) nenhuma das duas
  ações foi colocada: a trava e a flag continuam durante a retentativa.

Ramos de saída que receberam `restartedAulaIds.delete(aulaId)` + zero de `currentDownloadAulaId`:

Offline:
```ts
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        this.restartedAulaIds.delete(aulaId);
        if (this.currentDownloadAulaId === aulaId) {
          this.currentDownloadAulaId = null;
        }
        this.setState(aulaId, {
          phase: "paused",
          message: "Sem internet — pausado",
        });
        return;
      }
```

Quota:
```ts
      if (err instanceof DOMException && err.name === "QuotaExceededError") {
        this.restartedAulaIds.delete(aulaId);
        if (this.currentDownloadAulaId === aulaId) {
          this.currentDownloadAulaId = null;
        }
        this.setState(aulaId, {
          phase: "error",
          message: "Sem espaço no aparelho. Libere espaço ou remova outros vídeos offline.",
        });
        return;
      }
```

---

### C3 — Ramo "Muitas tentativas" (`attempt >= MAX_RETRIES`)

**ANTES:**
```ts
    if (attempt >= VIDEO_OFFLINE.MAX_RETRIES) {
      this.setState(aulaId, {
        phase: "error",
        message: "Muitas tentativas falharam. Tente novamente mais tarde.",
      });
      return;
    }
```

**DEPOIS:**
```ts
    if (attempt >= VIDEO_OFFLINE.MAX_RETRIES) {
      this.setState(aulaId, {
        phase: "error",
        message: "Muitas tentativas falharam. Tente novamente mais tarde.",
      });
      this.releaseWakeLock();
      this.restartedAulaIds.delete(aulaId);
      if (this.currentDownloadAulaId === aulaId) {
        this.currentDownloadAulaId = null;
      }
      return;
    }
```

---

### C4 — Flag `restartedAulaIds` vazando + 4º parâmetro `isRestart`

Assinatura (só a interna de `startDownload` da classe; a exportada continua com 3 parâmetros):

**ANTES:**
```ts
  async startDownload(aulaId: string, url: string, title: string): Promise<void> {
    // Validação da URL
```

**DEPOIS:**
```ts
  async startDownload(
    aulaId: string,
    url: string,
    title: string,
    isRestart = false,
  ): Promise<void> {
    if (!isRestart) this.restartedAulaIds.delete(aulaId);

    // Validação da URL
```
> A quebra de linha da assinatura foi feita **à mão** para satisfazer o prettier
> (sem `--fix`), pois a linha em formato único excedia a largura.

Chamadas de reinício que passam `true`:
- validatePartialDownload:
  ```ts
        // Recomeça do zero (uma única vez)
        return this.startDownload(aulaId, url, title, true);
  ```
- 416:
  ```ts
          return this.startDownload(aulaId, meta.url, meta.title, true);
  ```

As demais chamadas recursivas (`size changed`, `200 em vez de 206`, `total mudou
durante download`) **não** foram mudadas e continuam com 3 argumentos (logo limpam
a flag no início, como esperado). A função exportada `startDownload(aulaId, url,
title)` e o `onOnline` **não** foram alterados.

Limpeza da flag em `cancelDownload` e `removeVideo` (método da classe):

**ANTES (cancelDownload):**
```ts
    await removeVideo(aulaId);
    this.states.delete(aulaId);
```
**DEPOIS (cancelDownload):**
```ts
    await removeVideo(aulaId);
    this.restartedAulaIds.delete(aulaId);
    this.states.delete(aulaId);
```

**ANTES (removeVideo):**
```ts
  async removeVideo(aulaId: string): Promise<void> {
    await removeVideo(aulaId);
    this.states.delete(aulaId);
    this.notify();
  }
```
**DEPOIS (removeVideo):**
```ts
  async removeVideo(aulaId: string): Promise<void> {
    await removeVideo(aulaId);
    this.restartedAulaIds.delete(aulaId);
    this.states.delete(aulaId);
    this.notify();
  }
```

---

### C5 — `finally` não pode apagar o controller da retentativa seguinte

**ANTES:**
```ts
    } finally {
      this.abortControllers.delete(aulaId);
    }
```

**DEPOIS:**
```ts
    } finally {
      if (this.abortControllers.get(aulaId) === controller) {
        this.abortControllers.delete(aulaId);
      }
    }
```
- Só apaga o controller do mapa se ele **ainda for o desta tentativa**. Quando o
  `catch` já agendou a retentativa e a próxima `downloadWithRetries` instalou um
  controller novo, o `finally` da tentativa antiga não apaga o novo.

---

### C6 — Ramo de abort no `catch`

**ANTES:**
```ts
      // Se foi abortado pelo usuário, não tenta novamente
      if (err instanceof Error && err.name === "AbortError") {
        this.setState(aulaId, {
          phase: "paused",
          message: "Download pausado",
        });
        return;
      }
```

**DEPOIS:**
```ts
      // Se foi abortado pelo usuário, não tenta novamente
      if ((err instanceof Error && err.name === "AbortError") || controller.signal.aborted) {
        this.restartedAulaIds.delete(aulaId);
        if (this.currentDownloadAulaId === aulaId) {
          this.currentDownloadAulaId = null;
        }
        if (this.states.has(aulaId)) {
          this.setState(aulaId, {
            phase: "paused",
            message: "Download pausado",
          });
        }
        return;
      }
```
- Condição agora cobre também `controller.signal.aborted`.
- `setState({ phase: "paused" })` só é chamado se `this.states.has(aulaId)`; se o
  usuário cancelou (estado já removido), apenas retorna sem criar estado.

---

## 2) Saídas reais dos checks

### a) `npx tsc --noEmit`

Esta versão do `tsc` **não imprime** a linha resumo "Found N errors in M files";
a última linha do output é uma linha de erro comum:
```
      Type 'false' has no properties in common with type 'SSROptions'.
```
Contagem real medida no output completo:
- Linhas com `error TS`: **81**
- Arquivos distintos com erro: **25**
- Linhas citando `videoOfflineService.ts`: **nenhuma** (0)

Portanto: continua **81 erros em 25 arquivos**, sem regressão e sem nenhum erro no
arquivo alterado (dentro do limite ≤ 81 / ≤ 25).

### b) `npx eslint src/services/videoOfflineService.ts`

Primeira execução acusou 1 erro de prettier na nova assinatura de `startDownload`
(linha longa). Corrigido **à mão** (sem `--fix`). Segunda execução:

```
sem saída
```

### c) `npm run build`

```
> build
> vite build

vite v8.1.0 building client environment for production...
transforming...✓ 1607 modules transformed.
rendering chunks...
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
dist/assets/queueService-D8eE5c79.js               8.29 kB │ gzip:   2.89 kB
dist/assets/purify.es-DpYDt3zj.js                 26.14 kB │ gzip:  10.29 kB
dist/assets/index.es-D6ErhvqS.js                 122.23 kB │ gzip:  38.48 kB
dist/assets/html2canvas-DEMszoI2.js              199.98 kB │ gzip:  46.96 kB
dist/assets/supabaseClient-CTS9KG2m.js           213.62 kB │ gzip:  55.37 kB
dist/assets/db-D6IWmvzW.js                       245.92 kB │ gzip:  74.77 kB
dist/assets/jspdf.es.min-DPFaFd6f.js             400.44 kB │ gzip: 129.89 kB
dist/assets/xlsx-BirqPHPc.js                     495.85 kB │ gzip: 161.47 kB
dist/assets/main-D94BKt-f.js                   3,534.44 kB │ gzip: 969.46 kB

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
     │                  ──────────┬──────────
     │                            ╰────────────
─────╯

[INEFFECTIVE_DYNAMIC_IMPORT] src/services/listaService.ts is dynamically imported by src/routes/simulados.tsx, src/services/simuladoService.ts but also statically imported by src/components/EditarListaModal.tsx, src/components/EditarQuestaoModal.tsx, src/components/EditarQuestaoSimuladoModal.tsx, src/components/EscolherDestinoCopiaModal.tsx, src/components/GerenciarQuestoesModal.tsx, ..., dynamic import will not move module into another chunk.

✓ built in 4.21s
```
> Os avisos (`pdfBancoParser.ts` big integers, chunks > 500 kB, dynamic import
> ineficaz de `listaService.ts`) são **pré-existentes** e não têm relação com o
> arquivo alterado. O build **concluiu com sucesso**.

### d) `git grep` de padrões proibidos

```
git grep -n -E " @ts-expect-error|@ts-ignore|eslint-disable" -- src/services/videoOfflineService.ts
```
Resultado: **sem saída** (código de saída 1 = nenhum casamento).

### e) `git --no-pager diff -- src/services/videoOfflineService.ts`

```
warning: in the working copy of 'src/services/videoOfflineService.ts', LF will be replaced by CRLF the next time Git touches it
diff --git a/src/services/videoOfflineService.ts b/src/services/videoOfflineService.ts
index f52629bb..b823f576 100644
--- a/src/services/videoOfflineService.ts
+++ b/src/services/videoOfflineService.ts
@@ -295,6 +295,9 @@ class DownloadManager {
   private wakeLock: WakeLockSentinel | null = null;
   private currentDownloadAulaId: string | null = null;
   private onlineHandler: (() => void) | null = null;
+  // AulaIds que já tiveram um reinício do zero nesta tentativa (416 ou parcial inválido).
+  // Evita loop infinito de reinícios; zerado quando o download termina, é cancelado ou falha.
+  private restartedAulaIds = new Set<string>();

   constructor() {
     if (typeof window !== "undefined") {
@@ -388,7 +391,14 @@ class DownloadManager {
    * Inicia ou retoma download de um vídeo.
    * UM download por vez; segundo pedido entra em erro.
    */
-  async startDownload(aulaId: string, url: string, title: string): Promise<void> {
+  async startDownload(
+    aulaId: string,
+    url: string,
+    title: string,
+    isRestart = false,
+  ): Promise<void> {
+    if (!isRestart) this.restartedAulaIds.delete(aulaId);
+
     // Validação da URL
     if (!isDownloadableVideoUrl(url)) {
       this.setState(aulaId, {
@@ -499,14 +509,38 @@ class DownloadManager {
     // Validação de integridade do parcial salvo
     const validationResult = await this.validatePartialDownload(aulaId, meta);
     if (!validationResult.valid) {
-      console.warn("[videoOffline] Partial download inválido:", validationResult.reason);
-      await removeVideo(aulaId);
+      if (!this.restartedAulaIds.has(aulaId)) {
+        this.restartedAulaIds.add(aulaId);
+        console.warn("[videoOffline] Partial download inválido:", validationResult.reason);
+        await removeVideo(aulaId);
+        // Libera a trava de "um download por vez" antes de reiniciar
+        if (this.currentDownloadAulaId === aulaId) {
+          this.currentDownloadAulaId = null;
+        }
+        this.abortControllers.delete(aulaId);
+        this.releaseWakeLock();
+        this.setState(aulaId, {
+          phase: "checking",
+          message: "O download anterior estava inconsistente e foi reiniciado.",
+        });
+        // Recomeça do zero (uma única vez)
+        return this.startDownload(aulaId, url, title, true);
+      }
+      // Já reiniciou uma vez e o parcial continua inconsistente: erro, sem novo reinício
+      console.warn(
+        "[videoOffline] Partial download inválido após reinício:",
+        validationResult.reason,
+      );
+      this.releaseWakeLock();
+      if (this.currentDownloadAulaId === aulaId) {
+        this.currentDownloadAulaId = null;
+      }
+      this.restartedAulaIds.delete(aulaId);
       this.setState(aulaId, {
-        phase: "checking",
-        message: "O download anterior estava inconsistente e foi reiniciado.",
+        phase: "error",
+        message: "O arquivo baixado está inconsistente. Remova e baixe de novo.",
       });
-      // Recomeça do zero
-      return this.startDownload(aulaId, url, title);
+      return;
     }

     // Verifica espaço disponível
@@ -608,6 +642,11 @@ class DownloadManager {
         phase: "error",
         message: "Muitas tentativas falharam. Tente novamente mais tarde.",
       });
+      this.releaseWakeLock();
+      this.restartedAulaIds.delete(aulaId);
+      if (this.currentDownloadAulaId === aulaId) {
+        this.currentDownloadAulaId = null;
+      }
       return;
     }

@@ -650,6 +689,7 @@ class DownloadManager {
             meta.updatedAt = new Date().toISOString();
             await db.videoMeta.put(meta);

+            this.restartedAulaIds.delete(aulaId);
             this.setState(aulaId, {
               phase: "complete",
               percent: 100,
@@ -663,16 +703,34 @@ class DownloadManager {
           }
         }
         // Caso contrário, o parcial salvo está corrompido/inconsistente: descarta e reinicia do zero UMA vez
-        console.warn(
-          "[videoOffline] 416 Range Not Satisfiable - descartando parcial e reiniciando",
-        );
-        await removeVideo(aulaId);
+        if (!this.restartedAulaIds.has(aulaId)) {
+          this.restartedAulaIds.add(aulaId);
+          console.warn(
+            "[videoOffline] 416 Range Not Satisfiable - descartando parcial e reiniciando",
+          );
+          await removeVideo(aulaId);
+          // Libera a trava de "um download por vez" antes de reiniciar
+          this.abortControllers.delete(aulaId);
+          if (this.currentDownloadAulaId === aulaId) {
+            this.currentDownloadAulaId = null;
+          }
+          this.releaseWakeLock();
+          this.setState(aulaId, {
+            phase: "checking",
+            message: "O download anterior estava inconsistente e foi reiniciado.",
+          });
+          return this.startDownload(aulaId, meta.url, meta.title, true);
+        }
+        // 416 de novo após o reinício: erro definitivo, sem novo reinício
+        this.releaseWakeLock();
         this.abortControllers.delete(aulaId);
+        this.currentDownloadAulaId = null;
+        this.restartedAulaIds.delete(aulaId);
         this.setState(aulaId, {
-          phase: "checking",
-          message: "O download anterior estava inconsistente e foi reiniciado.",
+          phase: "error",
+          message: "O servidor recusou o trecho pedido (416). Remova o download e tente de novo.",
         });
-        return this.startDownload(aulaId, meta.url, meta.title);
+        return;
       }

       // Verifica status esperado
@@ -793,19 +851,21 @@ class DownloadManager {
       // Stream acabou: grava o que sobrou como último chunk (pode ser menor que chunkSize)
       // Mas só se não completou o totalBytes
       if (bufferedBytes > 0) {
+        let finalParts: Uint8Array<ArrayBuffer>[] = parts;
+
         if (meta.downloadedBytes + bufferedBytes > meta.totalBytes) {
-          console.warn(
-            `[videoOffline] Excedente de ${meta.downloadedBytes + bufferedBytes - meta.totalBytes} bytes ignorado`,
-          );
           // Tira apenas o necessário para completar totalBytes
           const needed = meta.totalBytes - meta.downloadedBytes;
-          const chunkParts = takeBytes(parts, needed);
-          bufferedBytes = parts.reduce((sum, p) => sum + p.length, 0); // recalcula o que sobrou (deve ser 0 ou excedente ignorado)
+          const excedenteBytes = bufferedBytes - needed;
+          console.warn(`[videoOffline] Excedente de ${excedenteBytes} bytes descartado`);
+          finalParts = needed > 0 ? takeBytes(parts, needed) : [];
+          parts.length = 0;
+          bufferedBytes = needed > 0 ? needed : 0;
         }

-        if (meta.downloadedBytes < meta.totalBytes) {
+        if (meta.downloadedBytes < meta.totalBytes && bufferedBytes > 0) {
           const chunkIndex = Math.floor(meta.downloadedBytes / meta.chunkSize);
-          const chunkBlob = new Blob(parts as BlobPart[], { type: meta.mime });
+          const chunkBlob = new Blob(finalParts as BlobPart[], { type: meta.mime });
           const actualChunkSize = chunkBlob.size;

           if (meta.downloadedBytes + actualChunkSize > meta.totalBytes) {
@@ -850,12 +910,15 @@ class DownloadManager {
         const totalChunksSize = chunks.reduce((sum: number, c: VideoChunk) => sum + c.blob.size, 0);

         if (totalChunksSize !== meta.totalBytes) {
+          this.restartedAulaIds.delete(aulaId);
           this.setState(aulaId, {
             phase: "error",
             message: "O arquivo baixado está incompleto. Remova e baixe de novo.",
             downloadedBytes: meta.downloadedBytes,
             totalBytes: meta.totalBytes,
           });
+          this.releaseWakeLock();
+          this.currentDownloadAulaId = null;
           return;
         }

@@ -870,6 +933,7 @@ class DownloadManager {
           `[videoOffline] download completo: ${finalChunks.length} chunks, ${meta.downloadedBytes} bytes`,
         );

+        this.restartedAulaIds.delete(aulaId);
         this.setState(aulaId, {
           phase: "complete",
           percent: 100,
@@ -884,16 +948,26 @@ class DownloadManager {
       this.releaseWakeLock();

       // Se foi abortado pelo usuário, não tenta novamente
-      if (err instanceof Error && err.name === "AbortError") {
-        this.setState(aulaId, {
-          phase: "paused",
-          message: "Download pausado",
-        });
+      if ((err instanceof Error && err.name === "AbortError") || controller.signal.aborted) {
+        this.restartedAulaIds.delete(aulaId);
+        if (this.currentDownloadAulaId === aulaId) {
+          this.currentDownloadAulaId = null;
+        }
+        if (this.states.has(aulaId)) {
+          this.setState(aulaId, {
+            phase: "paused",
+            message: "Download pausado",
+          });
+        }
         return;
       }

       // Se está offline, pausa e aguarda voltar
       if (typeof navigator !== "undefined" && !navigator.onLine) {
+        this.restartedAulaIds.delete(aulaId);
+        if (this.currentDownloadAulaId === aulaId) {
+          this.currentDownloadAulaId = null;
+        }
         this.setState(aulaId, {
           phase: "paused",
           message: "Sem internet — pausado",
@@ -903,6 +977,10 @@ class DownloadManager {

       // Erro de quota
       if (err instanceof DOMException && err.name === "QuotaExceededError") {
+        this.restartedAulaIds.delete(aulaId);
+        if (this.currentDownloadAulaId === aulaId) {
+          this.currentDownloadAulaId = null;
+        }
         this.setState(aulaId, {
           phase: "error",
           message: "Sem espaço no aparelho. Libere espaço ou remova outros vídeos offline.",
@@ -930,7 +1008,9 @@ class DownloadManager {
       this.abortControllers.delete(aulaId);
       return this.downloadWithRetries(aulaId, meta, nextAttempt);
     } finally {
-      this.abortControllers.delete(aulaId);
+      if (this.abortControllers.get(aulaId) === controller) {
+        this.abortControllers.delete(aulaId);
+      }
     }
   }

@@ -943,6 +1023,7 @@ class DownloadManager {
       controller.abort();
     }
     await removeVideo(aulaId);
+    this.restartedAulaIds.delete(aulaId);
     this.states.delete(aulaId);
     this.notify();
     if (this.currentDownloadAulaId === aulaId) {
@@ -970,6 +1051,7 @@ class DownloadManager {
    */
   async removeVideo(aulaId: string): Promise<void> {
     await removeVideo(aulaId);
+    this.restartedAulaIds.delete(aulaId);
     this.states.delete(aulaId);
     this.notify();
   }
```

---

## 3) O que NÃO foi testado

Eu **não abri o navegador** nem executei o app. Os itens abaixo dependem de execução
real no dispositivo/PWA e **não** foram verificados:

- **Simulação de HTTP 416** (parcial corrompido/inconsistente): confirmar que o
  primeiro 416 descarta o parcial e reinicia **uma vez** (via `isRestart = true`/
  `restartedAulaIds`), e que um segundo 416 leva ao estado de erro definitivo.
- **Simulação de excedente no fim do stream** (C1): validar que, quando o servidor
  entrega bytes a mais, o último chunk é montado com os bytes **necessários**
  (`finalParts`) e o excedente é descartado — e que o tamanho total do arquivo
  reproduzível bate com `totalBytes` (sem corromper o MP4).
- **Cancelar download** (C6): confirmar que, ao cancelar, o ramo de abort retorna
  **sem** criar/alterar estado (pois o estado já foi removido por `cancelDownload`)
  e sem deixar `restartedAulaIds` preso.
- **Pausar download** (manual e por perda de internet): confirmar que o estado vira
  `paused`, que a flag `restartedAulaIds` é limpa no ramo de saída, e que ao voltar a
  internet (`onOnline`) o download retoma corretamente.
- **Retentativa após falha de rede** (C2/C5): confirmar que, durante as retentativas
  com backoff, a trava `currentDownloadAulaId` e a flag `restartedAulaIds`
  **permanecem**, e que o controller da nova tentativa **não** é apagado pelo
  `finally` da tentativa anterior.
- **Reprodução do vídeo offline** montado a partir dos chunks (qualidade/tamanho).

---

## 4) Nomes ajustados e dúvidas

- **Nomes:** nenhum nome foi renomeado. Mantidos os nomes reais já existentes
  (`parts`, `bufferedBytes`, `finalParts` [novo], `excedenteBytes` [novo],
  `chunkParts` [removido por ficar sem uso], `restartedAulaIds`,
  `currentDownloadAulaId`, `abortControllers`, `isRestart` [novo]). O 4º parâmetro
  `isRestart` segue camelCase.
- **Prettier:** a assinatura de `startDownload` precisou ser quebrada em várias
  linhas (largura de linha). Ajuste feito **à mão**, sem `--fix`.
- **Aviso do item (a):** esta versão do `tsc` não emite a linha "Found N errors in M
  files". Em vez de inventar essa linha, reportei a contagem real: **81 linhas de
  `error TS` em 25 arquivos**, 0 no `videoOfflineService.ts` (igual ao baseline).
- **Dúvida / ponto de atenção:** o `git diff` (item **e**) contém mudanças que
  **já estavam no working tree antes desta tarefa** (campo `restartedAulaIds`, bloco
  `validatePartialDownload` e bloco 416 reescritos). Elas **não** fazem parte das 6
  correções pedidas, mas aparecem no diff porque não estavam commitadas. Não as
  alterei nem reverti. Se a intenção era um diff isolado só das 6 correções, me
  avise — mas eu não devo reverter trabalho pré-existente sem sua ordem.
```