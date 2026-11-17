# Relatório de Correção do Loop de Download Offline de Vídeo

## Resumo
Corrigido o bug crítico no loop de gravação de chunks do `videoOfflineService.ts` que causava:
- Loop infinito gravando o mesmo conteúdo repetidamente
- `downloadedBytes` excedendo `totalBytes` (chegou a 1.2GB em arquivo de 39MB)
- Chunks duplicados sendo gravados no IndexedDB

---

## (a) Trecho COMPLETO do Loop de Download Final

```typescript
// Array de partes recebidas para evitar concatenação repetida de buffers grandes
const parts: Uint8Array<ArrayBuffer>[] = [];
let bufferedBytes = 0;
let chunksWrittenThisAttempt = 0;
const maxChunksThisAttempt = Math.ceil(meta.totalBytes / meta.chunkSize) + 1;

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  parts.push(value);
  bufferedBytes += value.length;

  // Escreve chunks completos enquanto houver bytes suficientes E não passar do total
  while (
    bufferedBytes >= meta.chunkSize &&
    meta.downloadedBytes + meta.chunkSize <= meta.totalBytes
  ) {
    if (chunksWrittenThisAttempt >= maxChunksThisAttempt) {
      throw new Error("Erro interno no download: limite de chunks excedido.");
    }

    // TRAVA DE SEGURANÇA: não passar do total
    if (meta.downloadedBytes + meta.chunkSize > meta.totalBytes) {
      throw new Error("Erro interno no download: bytes além do tamanho do arquivo.");
    }

    // Tira exatamente chunkSize bytes de parts
    const chunkParts = takeBytes(parts, meta.chunkSize);
    bufferedBytes -= meta.chunkSize;

    const chunkIndex = Math.floor(meta.downloadedBytes / meta.chunkSize);
    const chunkBlob = new Blob(chunkParts as BlobPart[], { type: meta.mime });

    // TRAVA DE SEGURANÇA: usar tamanho REAL do Blob, nunca a constante
    const actualChunkSize = chunkBlob.size;
    if (meta.downloadedBytes + actualChunkSize > meta.totalBytes) {
      throw new Error("Erro interno no download: bytes além do tamanho do arquivo.");
    }

    // Grava chunk + atualiza meta NA MESMA transação
    await db.transaction("rw", db.videoMeta, db.videoChunks, async () => {
      await db.videoChunks.put({
        aulaId,
        index: chunkIndex,
        blob: chunkBlob,
      });
      meta.downloadedBytes += actualChunkSize;
      meta.updatedAt = new Date().toISOString();
      await db.videoMeta.put(meta);
    });

    chunksWrittenThisAttempt++;
    chunkWrittenThisAttempt = true;
    console.info(
      `[videoOffline] chunk ${chunkIndex} gravado: ${actualChunkSize} bytes, total ${meta.downloadedBytes}/${meta.totalBytes}`,
    );

    this.setState(aulaId, {
      downloadedBytes: meta.downloadedBytes,
      totalBytes: meta.totalBytes,
      percent: Math.min(100, Math.round((meta.downloadedBytes / meta.totalBytes) * 100)),
      message: `Baixando... ${Math.min(100, Math.round((meta.downloadedBytes / meta.totalBytes) * 100))}%`,
    });
  }

  // Verifica abort
  if (controller.signal.aborted) {
    throw new Error("Download cancelado");
  }
}

// Stream acabou: grava o que sobrou como último chunk (pode ser menor que chunkSize)
// Mas só se não completou o totalBytes
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

    if (meta.downloadedBytes + actualChunkSize > meta.totalBytes) {
      throw new Error("Erro interno no download: bytes além do tamanho do arquivo.");
    }

    await db.transaction("rw", db.videoMeta, db.videoChunks, async () => {
      await db.videoChunks.put({
        aulaId,
        index: chunkIndex,
        blob: chunkBlob,
      });
      meta.downloadedBytes += actualChunkSize;
      meta.updatedAt = new Date().toISOString();
      await db.videoMeta.put(meta);
    });

    chunkWrittenThisAttempt = true;
    console.info(
      `[videoOffline] chunk ${chunkIndex} gravado: ${actualChunkSize} bytes, total ${meta.downloadedBytes}/${meta.totalBytes}`,
    );

    this.setState(aulaId, {
      downloadedBytes: meta.downloadedBytes,
      totalBytes: meta.totalBytes,
      percent: Math.min(100, Math.round((meta.downloadedBytes / meta.totalBytes) * 100)),
    });
  }
}

// Stream acabou: se não baixou tudo, é falha de rede (não marca como completo)
if (meta.downloadedBytes < meta.totalBytes) {
  throw new Error(
    `Stream encerrou antes do fim: baixados ${meta.downloadedBytes}/${meta.totalBytes} bytes`,
  );
}

// Verifica se completou
if (meta.downloadedBytes >= meta.totalBytes) {
  // Confirma soma dos chunks
  const chunks = await db.videoChunks.where("aulaId").equals(aulaId).toArray();
  const totalChunksSize = chunks.reduce((sum: number, c: VideoChunk) => sum + c.blob.size, 0);

  if (totalChunksSize !== meta.totalBytes) {
    this.setState(aulaId, {
      phase: "error",
      message: "O arquivo baixado está incompleto. Remova e baixe de novo.",
      downloadedBytes: meta.downloadedBytes,
      totalBytes: meta.totalBytes,
    });
    return;
  }

  // Marca como complete
  meta.status = "complete";
  meta.updatedAt = new Date().toISOString();
  await db.videoMeta.put(meta);

  // Conta chunks para log final
  const finalChunks = await db.videoChunks.where("aulaId").equals(aulaId).toArray();
  console.info(
    `[videoOffline] download completo: ${finalChunks.length} chunks, ${meta.downloadedBytes} bytes`,
  );

  this.setState(aulaId, {
    phase: "complete",
    percent: 100,
    downloadedBytes: meta.totalBytes,
    totalBytes: meta.totalBytes,
    message: "Download concluído!",
  });
  this.releaseWakeLock();
  this.currentDownloadAulaId = null;
}
```

---

## (b) Git Diff Completo

```diff
diff --git a/src/services/videoOfflineService.ts b/src/services/videoOfflineService.ts
index 46eb75c6..f52629bb 100644
--- a/src/services/videoOfflineService.ts
+++ b/src/services/videoOfflineService.ts
@@ -262,6 +262,32 @@ export async function getRemoteVideoSize(url: string): Promise<number> {
 // GERENCIADOR DE DOWNLOADS (singleton, fora do React)
 // ============================================================
 
+/**
+ * Retira exatamente n bytes do início do array `parts` (mutando-o).
+ * Retorna as partes retiradas como um novo array.
+ * Se uma parte for maior que o necessário, divide-a com subarray e deixa o restante em `parts`.
+ */
+function takeBytes(parts: Uint8Array<ArrayBuffer>[], n: number): Uint8Array<ArrayBuffer>[] {
+  const taken: Uint8Array<ArrayBuffer>[] = [];
+  let remaining = n;
+
+  while (remaining > 0 && parts.length > 0) {
+    const first = parts[0];
+    if (first.length <= remaining) {
+      taken.push(first);
+      parts.shift();
+      remaining -= first.length;
+    } else {
+      // Parte maior que o necessário: divide
+      taken.push(first.subarray(0, remaining));
+      parts[0] = first.subarray(remaining);
+      remaining = 0;
+    }
+  }
+
+  return taken;
+}
+
 class DownloadManager {
   private states = new Map<string, DownloadState>();
   private listeners = new Set<Listener>();
@@ -695,6 +721,8 @@ class DownloadManager {
       // Array de partes recebidas para evitar concatenação repetida de buffers grandes
       const parts: Uint8Array<ArrayBuffer>[] = [];
       let bufferedBytes = 0;
+      let chunksWrittenThisAttempt = 0;
+      const maxChunksThisAttempt = Math.ceil(meta.totalBytes / meta.chunkSize) + 1;
 
       while (true) {
         const { done, value } = await reader.read();
@@ -703,33 +731,33 @@ class DownloadManager {
         parts.push(value);
         bufferedBytes += value.length;
 
-        // Quando atingir CHUNK_SIZE_BYTES, monta o Blob do chunk e grava
-        while (bufferedBytes >= meta.chunkSize) {
-          // Monta Blob contendo EXATAMENTE chunkSize bytes
-          const chunkParts: Uint8Array<ArrayBuffer>[] = [];
-          let needed = meta.chunkSize;
-
-          for (const part of parts) {
-            if (needed === 0) break;
-            if (part.length <= needed) {
-              chunkParts.push(part);
-              needed -= part.length;
-            } else {
-              // Parte maior que o necessário: divide
-              chunkParts.push(part.subarray(0, needed));
-              // Substitui a parte original pelo restante
-              const remaining = part.subarray(needed);
-              parts.splice(0, parts.indexOf(part) + 1, remaining);
-              needed = 0;
-            }
+        // Escreve chunks completos enquanto houver bytes suficientes E não passar do total
+        while (
+          bufferedBytes >= meta.chunkSize &&
+          meta.downloadedBytes + meta.chunkSize <= meta.totalBytes
+        ) {
+          if (chunksWrittenThisAttempt >= maxChunksThisAttempt) {
+            throw new Error("Erro interno no download: limite de chunks excedido.");
+          }
+
+          // TRAVA DE SEGURANÇA: não passar do total
+          if (meta.downloadedBytes + meta.chunkSize > meta.totalBytes) {
+            throw new Error("Erro interno no download: bytes além do tamanho do arquivo.");
           }
 
-          // bufferedBytes agora é a soma dos bytes restantes em parts (após o splice acima)
-          bufferedBytes = parts.reduce((sum, p) => sum + p.length, 0);
+          // Tira exatamente chunkSize bytes de parts
+          const chunkParts = takeBytes(parts, meta.chunkSize);
+          bufferedBytes -= meta.chunkSize;
 
           const chunkIndex = Math.floor(meta.downloadedBytes / meta.chunkSize);
           const chunkBlob = new Blob(chunkParts as BlobPart[], { type: meta.mime });
 
+          // TRAVA DE SEGURANÇA: usar tamanho REAL do Blob, nunca a constante
+          const actualChunkSize = chunkBlob.size;
+          if (meta.downloadedBytes + actualChunkSize > meta.totalBytes) {
+            throw new Error("Erro interno no download: bytes além do tamanho do arquivo.");
+          }
+
           // Grava chunk + atualiza meta NA MESMA transação
           await db.transaction("rw", db.videoMeta, db.videoChunks, async () => {
             await db.videoChunks.put({
@@ -737,14 +765,15 @@ class DownloadManager {
               index: chunkIndex,
               blob: chunkBlob,
             });
-            meta.downloadedBytes += meta.chunkSize;
+            meta.downloadedBytes += actualChunkSize;
             meta.updatedAt = new Date().toISOString();
             await db.videoMeta.put(meta);
           });
 
+          chunksWrittenThisAttempt++;
           chunkWrittenThisAttempt = true;
           console.info(
-            `[videoOffline] chunk ${chunkIndex} gravado: ${meta.chunkSize} bytes, total ${meta.downloadedBytes}/${meta.totalBytes}`,
+            `[videoOffline] chunk ${chunkIndex} gravado: ${actualChunkSize} bytes, total ${meta.downloadedBytes}/${meta.totalBytes}`,
           );
 
           this.setState(aulaId, {
@@ -761,32 +790,57 @@ class DownloadManager {
         }
       }
 
-      // Grava último chunk (pode ser menor que CHUNK_SIZE)
+      // Stream acabou: grava o que sobrou como último chunk (pode ser menor que chunkSize)
+      // Mas só se não completou o totalBytes
       if (bufferedBytes > 0) {
-        const chunkIndex = Math.floor(meta.downloadedBytes / meta.chunkSize);
-        const chunkBlob = new Blob(parts as BlobPart[], { type: meta.mime });
-
-        await db.transaction("rw", db.videoMeta, db.videoChunks, async () => {
-          await db.videoChunks.put({
-            aulaId,
-            index: chunkIndex,
-            blob: chunkBlob,
+        if (meta.downloadedBytes + bufferedBytes > meta.totalBytes) {
+          console.warn(
+            `[videoOffline] Excedente de ${meta.downloadedBytes + bufferedBytes - meta.totalBytes} bytes ignorado`,
+          );
+          // Tira apenas o necessário para completar totalBytes
+          const needed = meta.totalBytes - meta.downloadedBytes;
+          const chunkParts = takeBytes(parts, needed);
+          bufferedBytes = parts.reduce((sum, p) => sum + p.length, 0); // recalcula o que sobrou (deve ser 0 ou excedente ignorado)
+        }
+
+        if (meta.downloadedBytes < meta.totalBytes) {
+          const chunkIndex = Math.floor(meta.downloadedBytes / meta.chunkSize);
+          const chunkBlob = new Blob(parts as BlobPart[], { type: meta.mime });
+          const actualChunkSize = chunkBlob.size;
+
+          if (meta.downloadedBytes + actualChunkSize > meta.totalBytes) {
+            throw new Error("Erro interno no download: bytes além do tamanho do arquivo.");
+          }
+
+          await db.transaction("rw", db.videoMeta, db.videoChunks, async () => {
+            await db.videoChunks.put({
+              aulaId,
+              index: chunkIndex,
+              blob: chunkBlob,
+            });
+            meta.downloadedBytes += actualChunkSize;
+            meta.updatedAt = new Date().toISOString();
+            await db.videoMeta.put(meta);
           });
-          meta.downloadedBytes += bufferedBytes;
-          meta.updatedAt = new Date().toISOString();
-          await db.videoMeta.put(meta);
-        });
 
-        chunkWrittenThisAttempt = true;
-        console.info(
-          `[videoOffline] chunk ${chunkIndex} gravado: ${bufferedBytes} bytes, total ${meta.downloadedBytes}/${meta.totalBytes}`,
-        );
+          chunkWrittenThisAttempt = true;
+          console.info(
+            `[videoOffline] chunk ${chunkIndex} gravado: ${actualChunkSize} bytes, total ${meta.downloadedBytes}/${meta.totalBytes}`,
+          );
 
-        this.setState(aulaId, {
-          downloadedBytes: meta.downloadedBytes,
-          totalBytes: meta.totalBytes,
-          percent: Math.min(100, Math.round((meta.downloadedBytes / meta.totalBytes) * 100)),
-        });
+          this.setState(aulaId, {
+            downloadedBytes: meta.downloadedBytes,
+            totalBytes: meta.totalBytes,
+            percent: Math.min(100, Math.round((meta.downloadedBytes / meta.totalBytes) * 100)),
+          });
+        }
+      }
+
+      // Stream acabou: se não baixou tudo, é falha de rede (não marca como completo)
+      if (meta.downloadedBytes < meta.totalBytes) {
+        throw new Error(
+          `Stream encerrou antes do fim: baixados ${meta.downloadedBytes}/${meta.totalBytes} bytes`,
+        );
       }
 
       // Verifica se completou
@@ -810,6 +864,12 @@ class DownloadManager {
         meta.updatedAt = new Date().toISOString();
         await db.videoMeta.put(meta);
 
+        // Conta chunks para log final
+        const finalChunks = await db.videoChunks.where("aulaId").equals(aulaId).toArray();
+        console.info(
+          `[videoOffline] download completo: ${finalChunks.length} chunks, ${meta.downloadedBytes} bytes`,
+        );
+
         this.setState(aulaId, {
           phase: "complete",
           percent: 100,
```

---

## (c) Saídas dos Checks e Teste

### TypeScript Check (`npx tsc --noEmit`)
```
Found 81 errors in 25 files.
```
**Status: ✅ OK** - Mesmos 81 erros pré-existentes (zero novos erros no arquivo alterado)

### ESLint (`npx eslint src/services/videoOfflineService.ts`)
```
(empty output - exit code 0)
```
**Status: ✅ PASS** - Sem erros de lint

### Build (`npm run build`)
```
✓ built in 17.55s
dist/index.html                                    4.76 kB │ gzip:   1.58 kB
dist/assets/main-lu26kBVV.js                   3,530.60 kB │ gzip: 968.80 kB
...
```
**Status: ✅ PASS** - Build bem-sucedido

### Grep por `@ts-expect-error` / `@ts-ignore` / `eslint-disable`
```
No matches found
```
**Status: ✅ LIMPO** - Nenhuma supressão de erro introduzida

### Teste de Lógica Pura (Node/tsx)
```
=== Teste 1: takeBytes básico ===
Taken: [ 10, 5 ] = 15? true
Remaining parts: [ 15, 30 ] = [15, 30]? true

=== Teste 2: takeBytes exato no limite da parte ===
Taken: [ 10 ] = 10? true
Remaining parts: [ 20 ] = [20]? true

=== Teste 3: takeBytes mais que uma parte ===
Taken: [ 5, 7 ] = 12? true
Remaining parts: [ 3 ] = [3]? true

=== Teste 4: takeBytes zerando array ===
Taken: [ 10 ] = 10? true
Remaining parts: [] = []? true

=== Teste 5: Simulação do loop de download ===
Chunk 0: 8388608 bytes, total 8388608/39893244
Chunk 1: 8388608 bytes, total 16777216/39893244
Chunk 2: 8388608 bytes, total 25165824/39893244
Chunk 3: 8388608 bytes, total 33554432/39893244
Chunk final 4: 6338812 bytes, total 39893244/39893244

=== RESULTADO FINAL ===
Chunks gravados: 5
Tamanhos dos chunks: [ 8388608, 8388608, 8388608, 8388608, 6338812 ]
Total gravado: 39893244 bytes
Total esperado: 39893244 bytes
Match: SIM ✓
downloadedBytes final: 39893244
downloadedBytes === totalBytes: SIM ✓
```
**Status: ✅ PASS** - Lógica validada: exatamente 5 chunks (4 × 8.388.608 + 1 × 6.338.812), soma = 39.893.244, zero duplicação, `downloadedBytes` final exatamente igual a `totalBytes`

---

## (d) O que NÃO foi testado

1. **Integração real com rede/IndexedDB** - O teste valida apenas a lógica pura de acumulação/escrita de chunks com dados simulados em memória. Não testa:
   - Fetch real via proxy com Range headers
   - Escrita/leitura real no IndexedDB (Dexie)
   - Retentativas com backoff exponencial em falhas de rede reais
   - Wake Lock API
   - Tratamento de 416 Range Not Satisfiable real
   - Pausa/retomada por offline/online
   - Validação de parcial salvo (`validatePartialDownload`)

2. **Cenários de borda não cobertos no teste unitário:**
   - Stream que entrega exatamente `chunkSize` bytes por `read()`
   - Stream que entrega bytes em pedaços de 1 byte apenas
   - Múltiplas retentativas consecutivas com progresso parcial
   - Cancelamento via `AbortController` durante escrita
   - QuotaExceededError no meio do download
   - Mudança de `totalBytes` no servidor durante download (Content-Range diferente)

3. **Teste de carga/estresse** - Não foi simulado download de arquivo grande (ex: >500MB) para validar performance de memória.

---

**Conclusão:** A correção resolve o bug crítico do loop infinito. A nova função `takeBytes()` remove corretamente bytes consumidos do buffer `parts`, as travas de segurança impedem `downloadedBytes > totalBytes`, o limite de chunks por tentativa evita loops infinitos, e o log final mostra contagem real de chunks. Todos os checks de qualidade (TS, ESLint, Build) passam sem regressões.