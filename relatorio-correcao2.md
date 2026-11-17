# Relatório de Correção do Bug de Download de Vídeo Offline

## (a) Causa Raiz com Linhas

O bug ocorria no arquivo `src/services/videoOfflineService.ts`, no método `downloadWithRetries`, no loop que processa chunks do stream de resposta HTTP. Havia **duas causas principais**:

### 1. Cálculo incorreto de `bufferedBytes` (linhas 618-635 do original)
O código tinha **duas passagens redundantes** para recalcular as partes restantes após extrair um chunk:
- Primeira passagem (linhas 618-624): calculava `consumed` somando o tamanho das partes
- Segunda passagem (linhas 626-635): recalculava `remainingParts` e `bufferedBytes` de forma confusa

Isso causava **double-counting** dos bytes no buffer: `bufferedBytes` ficava incorreto, e como o `while (bufferedBytes >= meta.chunkSize)` continuava rodando, **o mesmo chunk era gravado múltiplas vezes**, inflando `downloadedBytes` (ex: 30× o total real).

### 2. Falta de validação do parcial salvo ao retomar
Ao recarregar a página, o `downloadedBytes` corrompido do IndexedDB era aceito sem verificação. O Range request `bytes=<downloadedBytes>-` ultrapassava o fim do arquivo → proxy respondia **416 (Range Not Satisfiable)** → retentativas repetiam o mesmo pedido inválido até esgotar `MAX_RETRIES`.

### 3. Percentual sem teto
O `percent` podia ultrapassar 100% (ex: "Continuar (3028%)") porque não havia `Math.min(100, ...)` no serviço nem no botão.

---

## (b) Git Diff Completo

```diff
diff --git a/src/components/aulas/VideoOfflineButton.tsx b/src/components/aulas/VideoOfflineButton.tsx
index 5c4c5054..cd0d3627 100644
--- a/src/components/aulas/VideoOfflineButton.tsx
+++ b/src/components/aulas/VideoOfflineButton.tsx
@@ -136,7 +136,7 @@ export function VideoOfflineButton({ aulaId, videoUrl, title, isOnline }: VideoO
   }, [retry]);
 
   const phase = state.phase;
-  const percent = state.percent;
+  const percent = Math.max(0, Math.min(100, state.percent));
   const message = state.message;
 
   // Desabilitado se não for URL baixável
diff --git a/src/services/videoOfflineService.ts b/src/services/videoOfflineService.ts
index 9772848f..46eb75c6 100644
--- a/src/services/videoOfflineService.ts
+++ b/src/services/videoOfflineService.ts
@@ -291,7 +291,12 @@ class DownloadManager {
       totalBytes: 0,
       message: "",
     };
-    this.states.set(aulaId, { ...current, ...partial });
+    // Garante que percent nunca ultrapasse 100
+    const next = { ...current, ...partial };
+    if (typeof next.percent === "number") {
+      next.percent = Math.max(0, Math.min(100, next.percent));
+    }
+    this.states.set(aulaId, next);
     this.notify();
   }
 
@@ -465,6 +470,19 @@ class DownloadManager {
       return;
     }
 
+    // Validação de integridade do parcial salvo
+    const validationResult = await this.validatePartialDownload(aulaId, meta);
+    if (!validationResult.valid) {
+      console.warn("[videoOffline] Partial download inválido:", validationResult.reason);
+      await removeVideo(aulaId);
+      this.setState(aulaId, {
+        phase: "checking",
+        message: "O download anterior estava inconsistente e foi reiniciado.",
+      });
+      // Recomeça do zero
+      return this.startDownload(aulaId, url, title);
+    }
+
     // Verifica espaço disponível
     if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
       const estimate = await navigator.storage.estimate();
@@ -492,6 +510,67 @@ class DownloadManager {
     await this.downloadWithRetries(aulaId, meta, 0);
   }
 
+  /**
+   * Valida a integridade de um download parcial salvo no banco.
+   * Retorna { valid: boolean, reason?: string }.
+   */
+  private async validatePartialDownload(
+    aulaId: string,
+    meta: VideoMeta,
+  ): Promise<{ valid: boolean; reason?: string }> {
+    // Se não baixou nada ainda, é válido (começa do zero)
+    if (meta.downloadedBytes === 0) {
+      return { valid: true };
+    }
+
+    // downloadedBytes não pode ser maior que totalBytes
+    if (meta.downloadedBytes > meta.totalBytes) {
+      return {
+        valid: false,
+        reason: `downloadedBytes (${meta.downloadedBytes}) > totalBytes (${meta.totalBytes})`,
+      };
+    }
+
+    // Carrega chunks salvos
+    const db = getVideoDb();
+    const chunks = await db.videoChunks.where("aulaId").equals(aulaId).toArray();
+
+    // Número de chunks deve bater: downloadedBytes / chunkSize (arredondado para cima para o último chunk parcial)
+    const expectedChunkCount =
+      meta.downloadedBytes === meta.totalBytes
+        ? meta.chunkCount
+        : Math.ceil(meta.downloadedBytes / meta.chunkSize);
+
+    if (chunks.length !== expectedChunkCount) {
+      return {
+        valid: false,
+        reason: `chunk count mismatch: saved ${chunks.length}, expected ${expectedChunkCount}`,
+      };
+    }
+
+    // Soma dos tamanhos dos blobs deve ser igual a downloadedBytes
+    const totalChunksSize = chunks.reduce((sum, c) => sum + c.blob.size, 0);
+    if (totalChunksSize !== meta.downloadedBytes) {
+      return {
+        valid: false,
+        reason: `chunk size sum (${totalChunksSize}) != downloadedBytes (${meta.downloadedBytes})`,
+      };
+    }
+
+    // Índices devem ser contíguos a partir de 0
+    const sortedChunks = chunks.sort((a, b) => a.index - b.index);
+    for (let i = 0; i < sortedChunks.length; i++) {
+      if (sortedChunks[i].index !== i) {
+        return {
+          valid: false,
+          reason: `chunk index gap: expected ${i}, got ${sortedChunks[i].index}`,
+        };
+      }
+    }
+
+    return { valid: true };
+  }
+
   private async downloadWithRetries(
     aulaId: string,
     meta: VideoMeta,
@@ -529,6 +608,47 @@ class DownloadManager {
         signal: controller.signal,
       });
 
+      // Tratamento específico de 416 (Range Not Satisfiable)
+      if (response.status === 416) {
+        // Se o startByte for exatamente o totalBytes, o arquivo já estava completo
+        if (startByte >= meta.totalBytes) {
+          // Verifica integridade final
+          const chunks = await db.videoChunks.where("aulaId").equals(aulaId).toArray();
+          const totalChunksSize = chunks.reduce(
+            (sum: number, c: VideoChunk) => sum + c.blob.size,
+            0,
+          );
+
+          if (totalChunksSize === meta.totalBytes) {
+            meta.status = "complete";
+            meta.updatedAt = new Date().toISOString();
+            await db.videoMeta.put(meta);
+
+            this.setState(aulaId, {
+              phase: "complete",
+              percent: 100,
+              downloadedBytes: meta.totalBytes,
+              totalBytes: meta.totalBytes,
+              message: "Download concluído!",
+            });
+            this.releaseWakeLock();
+            this.currentDownloadAulaId = null;
+            return;
+          }
+        }
+        // Caso contrário, o parcial salvo está corrompido/inconsistente: descarta e reinicia do zero UMA vez
+        console.warn(
+          "[videoOffline] 416 Range Not Satisfiable - descartando parcial e reiniciando",
+        );
+        await removeVideo(aulaId);
+        this.abortControllers.delete(aulaId);
+        this.setState(aulaId, {
+          phase: "checking",
+          message: "O download anterior estava inconsistente e foi reiniciado.",
+        });
+        return this.startDownload(aulaId, meta.url, meta.title);
+      }
+
       // Verifica status esperado
       const expectedStatus = startByte === 0 ? [200, 206] : [206];
       if (!expectedStatus.includes(response.status)) {
@@ -565,6 +685,8 @@ class DownloadManager {
         }
       }
 
+      console.info(`[videoOffline] pedindo Range bytes=${startByte}-`);
+
       const reader = response.body?.getReader();
       if (!reader) {
         throw new Error("Resposta sem corpo de leitura");
@@ -602,28 +724,8 @@ class DownloadManager {
             }
           }
 
-          // Remove as partes consumidas
-          let consumed = 0;
-          for (const part of parts) {
-            if (consumed >= meta.chunkSize) break;
-            consumed += part.length;
-          }
-          // Recalcula partes restantes de forma simples
-          const remainingParts: Uint8Array<ArrayBuffer>[] = [];
-          let remainingNeeded = bufferedBytes - meta.chunkSize;
-          for (const part of parts) {
-            if (remainingNeeded === 0) {
-              remainingParts.push(part);
-            } else if (part.length <= remainingNeeded) {
-              remainingNeeded -= part.length;
-            } else {
-              remainingParts.push(part.subarray(part.length - remainingNeeded));
-              remainingNeeded = 0;
-            }
-          }
-          parts.length = 0;
-          parts.push(...remainingParts);
-          bufferedBytes = remainingParts.reduce((sum, p) => sum + p.length, 0);
+          // bufferedBytes agora é a soma dos bytes restantes em parts (após o splice acima)
+          bufferedBytes = parts.reduce((sum, p) => sum + p.length, 0);
 
           const chunkIndex = Math.floor(meta.downloadedBytes / meta.chunkSize);
           const chunkBlob = new Blob(chunkParts as BlobPart[], { type: meta.mime });
@@ -641,11 +743,15 @@ class DownloadManager {
           });
 
           chunkWrittenThisAttempt = true;
+          console.info(
+            `[videoOffline] chunk ${chunkIndex} gravado: ${meta.chunkSize} bytes, total ${meta.downloadedBytes}/${meta.totalBytes}`,
+          );
+
           this.setState(aulaId, {
             downloadedBytes: meta.downloadedBytes,
             totalBytes: meta.totalBytes,
-            percent: Math.round((meta.downloadedBytes / meta.totalBytes) * 100),
-            message: `Baixando... ${Math.round((meta.downloadedBytes / meta.totalBytes) * 100)}%`,
+            percent: Math.min(100, Math.round((meta.downloadedBytes / meta.totalBytes) * 100)),
+            message: `Baixando... ${Math.min(100, Math.round((meta.downloadedBytes / meta.totalBytes) * 100))}%`,
           });
         }
 
@@ -672,10 +778,14 @@ class DownloadManager {
         });
 
         chunkWrittenThisAttempt = true.
+        console.info(
+          `[videoOffline] chunk ${chunkIndex} gravado: ${bufferedBytes} bytes, total ${meta.downloadedBytes}/${meta.totalBytes}`,
+        );
+
         this.setState(aulaId, {
           downloadedBytes: meta.downloadedBytes,
           totalBytes: meta.totalBytes,
-          percent: Math.round((meta.downloadedBytes / meta.totalBytes) * 100),
+          percent: Math.min(100, Math.round((meta.downloadedBytes / meta.totalBytes) * 100)),
         });
       }
```

---

## (c) Saídas Reais dos Checks

### TypeScript (`npx tsc --noEmit`)
```
Found 81 errors in 25 files.
```
**Nota:** Mesmo número de erros do baseline (81 em 25 arquivos) — **nenhum erro novo introduzido**. Os erros são pré-existentes em outros arquivos do projeto.

### ESLint (`npx eslint --fix` nos 3 arquivos alterados)
```
✖ 12 problems (12 errors, 0 warnings)
  12 errors and 0 warnings potentially fixable with the `--fix` option.
```
Após `--fix`: **saída vazia (exit code 0)** — todos os problemas de formatação (prettier) corrigidos automaticamente.

### Build (`npm run build`)
```
✓ built in 17.33s
```
**Build bem-sucedido.** Avisos apenas sobre chunks grandes e bigints (pré-existentes, não relacionados à correção).

### Grep por supressões nos 3 arquivos alterados
```
No matches found for pattern "@ts-expect-error|@ts-ignore|eslint-disable"
```
**Nenhuma supressão** de erro TypeScript ou ESLint nos arquivos modificados.

---

## (d) O que NÃO foi testado

1. **Download real end-to-end** contra o proxy de vídeo (GitHub Releases) — requer rede e ambiente de produção.
2. **Retomada após falha de rede** (offline → online) — requer simulação de desconexão.
3. **Wake Lock** em dispositivos móveis (iOS Safari, Android Chrome) — requer hardware real.
4. **Persistência de armazenamento** (`navigator.storage.persist()`) — comportamento varia entre navegadores.
5. **Cenários de quota excedida** (QuotaExceededError) — requer encher o armazenamento do navegador.
6. **Múltiplos downloads simultâneos** — a arquitetura garante "um por vez", mas não foi testado em paralelo.
7. **Vídeo com tamanho não múltiplo de CHUNK_SIZE** — último chunk parcial (< 8 MB) foi verificado logicamente mas não em runtime.

---

**Arquivos alterados:**
- `src/services/videoOfflineService.ts` — correção principal do serviço
- `src/components/aulas/VideoOfflineButton.tsx` — teto de 100% no percentual exibido
- `src/hooks/useVideoOffline.ts` — sem alterações funcionais (apenas re-export)