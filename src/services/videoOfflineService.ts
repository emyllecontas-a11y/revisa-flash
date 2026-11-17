// src/services/videoOfflineService.ts
// Serviço de download e reprodução de vídeos offline (IndexedDB, por aparelho).
// NÃO usa RxDB, NÃO sincroniza. Banco separado do pdfCache.

import Dexie, { Table } from "dexie";
import { VIDEO_OFFLINE } from "@/constants";
import { uid } from "@/utils/helpers";

export interface VideoMeta {
  aulaId: string; // chave primária
  url: string; // URL original do vídeo (GitHub Releases)
  title: string; // título da aula
  totalBytes: number; // tamanho total do arquivo
  downloadedBytes: number; // bytes já baixados
  chunkSize: number; // tamanho do chunk (VIDEO_OFFLINE.CHUNK_SIZE_BYTES)
  chunkCount: number; // número total de chunks esperados
  status: "partial" | "complete"; // estado do download
  mime: string; // 'video/mp4'
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface VideoChunk {
  aulaId: string; // parte da chave composta
  index: number; // parte da chave composta (ordem do chunk)
  blob: Blob; // pedaço do vídeo
}

export type DownloadPhase = "idle" | "checking" | "downloading" | "paused" | "complete" | "error";

export interface DownloadState {
  phase: DownloadPhase;
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  message: string;
}

type Listener = (states: Map<string, DownloadState>) => void;

class VideoOfflineDatabase extends Dexie {
  videoMeta!: Table<VideoMeta, string>;
  videoChunks!: Table<VideoChunk, [string, number]>;

  constructor() {
    super(VIDEO_OFFLINE.DB_NAME);
    this.version(1).stores({
      videoMeta: "aulaId, status, updatedAt",
      videoChunks: "[aulaId+index], aulaId",
    });
  }
}

let dbInstance: VideoOfflineDatabase | null = null;

function getVideoDb(): VideoOfflineDatabase {
  if (!dbInstance) {
    dbInstance = new VideoOfflineDatabase();
  }
  return dbInstance;
}

/**
 * Verifica se a URL é de um vídeo baixável (GitHub Releases do repositório permitido).
 */
export function isDownloadableVideoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.hostname !== VIDEO_OFFLINE.ALLOWED_HOST) return false;
    if (!u.pathname.startsWith(VIDEO_OFFLINE.ALLOWED_PATH_PREFIX)) return false;
    if (!u.pathname.includes(VIDEO_OFFLINE.RELEASE_PATH_PART)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Obtém metadados de um vídeo pelo aulaId.
 */
export async function getVideoMeta(aulaId: string): Promise<VideoMeta | null> {
  try {
    const db = getVideoDb();
    return (await db.videoMeta.get(aulaId)) || null;
  } catch {
    return null;
  }
}

/**
 * Lista todos os vídeos baixados (com metadados).
 */
export async function listOfflineVideos(): Promise<VideoMeta[]> {
  try {
    const db = getVideoDb();
    return await db.videoMeta.toArray();
  } catch {
    return [];
  }
}

/**
 * Retorna Set com aulaIds de vídeos com status 'complete'.
 */
export async function getOfflineAulaIds(): Promise<Set<string>> {
  try {
    const db = getVideoDb();
    const metas = await db.videoMeta.where("status").equals("complete").toArray();
    return new Set(metas.map((m) => m.aulaId));
  } catch {
    return new Set();
  }
}

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

/**
 * Remove vídeo (meta + chunks) numa transação atômica.
 */
export async function removeVideo(aulaId: string): Promise<void> {
  try {
    const db = getVideoDb();
    await db.transaction("rw", db.videoMeta, db.videoChunks, async () => {
      await db.videoMeta.delete(aulaId);
      await db.videoChunks.where("aulaId").equals(aulaId).delete();
    });
  } catch {
    // ignore
  }
}

/**
 * Remove TODOS os vídeos offline.
 */
export async function clearAllVideos(): Promise<void> {
  try {
    const db = getVideoDb();
    await db.transaction("rw", db.videoMeta, db.videoChunks, async () => {
      await db.videoMeta.clear();
      await db.videoChunks.clear();
    });
  } catch {
    // ignore
  }
}

/**
 * Informações de armazenamento do navegador.
 */
export async function getStorageInfo(): Promise<{
  usage: number;
  quota: number;
  persisted: boolean;
  supported: boolean;
}> {
  if (typeof navigator === "undefined" || !navigator.storage) {
    return { usage: 0, quota: 0, persisted: false, supported: false };
  }
  try {
    const estimate = await navigator.storage.estimate();
    const persisted = (await navigator.storage.persisted?.()) ?? false;
    return {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
      persisted,
      supported: true,
    };
  } catch {
    return { usage: 0, quota: 0, persisted: false, supported: true };
  }
}

/**
 * Descobre o tamanho total do vídeo remoto via Range: bytes=0-0 no proxy.
 * Reutiliza a lógica interna de leitura do Content-Range.
 * Cacheia o resultado em videoMeta para evitar chamadas de rede repetidas.
 */
async function fetchRemoteVideoSize(url: string): Promise<number> {
  if (!isDownloadableVideoUrl(url)) {
    throw new Error("Este vídeo não pode ser baixado para uso offline.");
  }

  const db = getVideoDb();
  const existingMeta = await db.videoMeta.get(url);
  if (existingMeta && existingMeta.totalBytes > 0) {
    return existingMeta.totalBytes;
  }

  const proxyUrl = `${VIDEO_OFFLINE.PROXY_URL}/?url=${encodeURIComponent(url)}`;
  const response = await fetch(proxyUrl, {
    method: "GET",
    headers: { Range: "bytes=0-0" },
  });

  if (!response.ok && response.status !== 206) {
    if (response.status === 403) {
      throw new Error(
        "O proxy de vídeos recusou o pedido (403). Confira se este endereço do app está liberado no Worker.",
      );
    }
    if (response.status === 0 || response.type === "opaque") {
      throw new Error("Sem internet. Conecte-se para baixar este vídeo.");
    }
    throw new Error(`Falha ao obter tamanho: HTTP ${response.status}`);
  }

  const contentRange = response.headers.get("content-range");
  let totalBytes = 0;
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)$/);
    if (match) totalBytes = parseInt(match[1], 10);
  }

  if (totalBytes === 0) {
    const cl = response.headers.get("content-length");
    if (cl) totalBytes = parseInt(cl, 10);
  }

  if (totalBytes === 0) {
    throw new Error("Não foi possível descobrir o tamanho do vídeo.");
  }

  return totalBytes;
}

/**
 * Obtém o tamanho do vídeo remoto (com cache via videoMeta).
 * Exportada para uso no botão de download (mostra tamanho antes de confirmar).
 */
export async function getRemoteVideoSize(url: string): Promise<number> {
  try {
    return await fetchRemoteVideoSize(url);
  } catch (err) {
    console.error("[videoOffline] Falha ao obter tamanho remoto:", err);
    throw err;
  }
}

// ============================================================
// GERENCIADOR DE DOWNLOADS (singleton, fora do React)
// ============================================================

class DownloadManager {
  private states = new Map<string, DownloadState>();
  private listeners = new Set<Listener>();
  private abortControllers = new Map<string, AbortController>();
  private wakeLock: WakeLockSentinel | null = null;
  private currentDownloadAulaId: string | null = null;
  private onlineHandler: (() => void) | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.onlineHandler = () => this.onOnline();
      window.addEventListener("online", this.onlineHandler);
    }
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(new Map(this.states));
    }
  }

  private setState(aulaId: string, partial: Partial<DownloadState>) {
    const current = this.states.get(aulaId) || {
      phase: "idle" as DownloadPhase,
      percent: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      message: "",
    };
    this.states.set(aulaId, { ...current, ...partial });
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Entrega estado atual imediatamente
    listener(new Map(this.states));
    return () => this.listeners.delete(listener);
  }

  getState(aulaId: string): DownloadState {
    return (
      this.states.get(aulaId) || {
        phase: "idle",
        percent: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        message: "",
      }
    );
  }

  private async requestWakeLock() {
    if ("wakeLock" in navigator) {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: string) => Promise<WakeLockSentinel> };
        };
        this.wakeLock = await nav.wakeLock?.request("screen");
        this.wakeLock?.addEventListener("release", () => {
          this.wakeLock = null;
        });
      } catch {
        // Wake Lock não disponível ou negado
      }
    }
  }

  private releaseWakeLock() {
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
      } catch {
        // ignore
      }
      this.wakeLock = null;
    }
  }

  private async onOnline() {
    // Retoma downloads pausados por falta de internet
    for (const [aulaId, state] of this.states) {
      if (state.phase === "paused") {
        const meta = await getVideoMeta(aulaId);
        if (meta) {
          this.startDownload(aulaId, meta.url, meta.title);
        }
      }
    }
  }

  /**
   * Inicia ou retoma download de um vídeo.
   * UM download por vez; segundo pedido entra em erro.
   */
  async startDownload(aulaId: string, url: string, title: string): Promise<void> {
    // Validação da URL
    if (!isDownloadableVideoUrl(url)) {
      this.setState(aulaId, {
        phase: "error",
        message: "Este vídeo não pode ser baixado para uso offline.",
      });
      throw new Error("Este vídeo não pode ser baixado para uso offline.");
    }

    // Verifica se já há outro download em andamento
    if (this.currentDownloadAulaId && this.currentDownloadAulaId !== aulaId) {
      const otherState = this.states.get(this.currentDownloadAulaId);
      if (otherState && (otherState.phase === "downloading" || otherState.phase === "checking")) {
        this.setState(aulaId, {
          phase: "error",
          message: `Já existe um download em andamento: termine ou cancele antes.`,
        });
        throw new Error("Já existe um download em andamento: termine ou cancele antes.");
      }
    }

    this.currentDownloadAulaId = aulaId;
    const db = getVideoDb();
    let meta = await db.videoMeta.get(aulaId);

    // Se não há meta, descobre o tamanho total via função compartilhada
    if (!meta) {
      this.setState(aulaId, { phase: "checking", message: "Verificando tamanho do vídeo..." });

      const controller = new AbortController();
      this.abortControllers.set(aulaId, controller);

      try {
        const totalBytes = await fetchRemoteVideoSize(url);

        const chunkSize = VIDEO_OFFLINE.CHUNK_SIZE_BYTES;
        const chunkCount = Math.ceil(totalBytes / chunkSize);

        meta = {
          aulaId,
          url,
          title,
          totalBytes,
          downloadedBytes: 0,
          chunkSize,
          chunkCount,
          status: "partial",
          mime: "video/mp4",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await db.videoMeta.put(meta);
      } catch (err) {
        this.abortControllers.delete(aulaId);
        const msg = err instanceof Error ? err.message : "Erro ao verificar vídeo";
        console.error("[videoOffline] Falha ao verificar tamanho:", err);
        this.setState(aulaId, { phase: "error", message: `Falha ao verificar vídeo: ${msg}` });
        throw err;
      }
    }

    // Verifica se o tamanho total mudou (vídeo foi substituído no GitHub)
    if (meta && meta.totalBytes > 0) {
      const controller = new AbortController();
      this.abortControllers.set(aulaId, controller);

      try {
        const proxyUrl = `${VIDEO_OFFLINE.PROXY_URL}/?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl, {
          method: "GET",
          headers: { Range: "bytes=0-0" },
          signal: controller.signal,
        });

        if (response.ok || response.status === 206) {
          const contentRange = response.headers.get("content-range");
          let currentTotal = meta.totalBytes;
          if (contentRange) {
            const match = contentRange.match(/\/(\d+)$/);
            if (match) currentTotal = parseInt(match[1], 10);
          }

          if (currentTotal !== meta.totalBytes) {
            // Tamanho mudou: descarta o parcial e recomeça
            await removeVideo(aulaId);
            meta = undefined;
            // Recomeça recursivamente (agora sem meta)
            this.abortControllers.delete(aulaId);
            return this.startDownload(aulaId, url, title);
          }
        }
      } catch {
        // Se falhar a verificação, continua com a meta existente
      } finally {
        this.abortControllers.delete(aulaId);
      }
    }

    // Recarrega meta caso tenha sido recriada
    meta = await db.videoMeta.get(aulaId);
    if (!meta) {
      // Se chegou aqui sem meta, algo deu errado
      this.setState(aulaId, { phase: "error", message: "Falha ao preparar download." });
      return;
    }

    // Verifica espaço disponível
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      const freeBytes = (estimate.quota ?? 0) - (estimate.usage ?? 0);
      const needed = (meta.totalBytes - meta.downloadedBytes) * VIDEO_OFFLINE.FREE_SPACE_MARGIN;
      if (freeBytes < needed) {
        const faltandoMB = Math.ceil((needed - freeBytes) / 1024 / 1024);
        this.setState(aulaId, {
          phase: "error",
          message: `Sem espaço no aparelho. Liberte cerca de ${faltandoMB} MB ou remova outros vídeos offline.`,
        });
        throw new Error("Espaço insuficiente");
      }
      // Pede armazenamento persistente (uma vez)
      if (navigator.storage.persist && !(await navigator.storage.persisted())) {
        try {
          await navigator.storage.persist();
        } catch {
          // ignore
        }
      }
    }

    // Inicia download com retentativas
    await this.downloadWithRetries(aulaId, meta, 0);
  }

  private async downloadWithRetries(
    aulaId: string,
    meta: VideoMeta,
    attempt: number,
  ): Promise<void> {
    const db = getVideoDb();
    if (attempt >= VIDEO_OFFLINE.MAX_RETRIES) {
      this.setState(aulaId, {
        phase: "error",
        message: "Muitas tentativas falharam. Tente novamente mais tarde.",
      });
      return;
    }

    const controller = new AbortController();
    this.abortControllers.set(aulaId, controller);

    // Declarado fora do try para ser acessível no catch (retentativas com progresso real)
    let chunkWrittenThisAttempt = false;

    try {
      this.setState(aulaId, {
        phase: "downloading",
        message: `Baixando... ${Math.round((meta.downloadedBytes / meta.totalBytes) * 100)}%`,
      });
      await this.requestWakeLock();

      const proxyUrl = `${VIDEO_OFFLINE.PROXY_URL}/?url=${encodeURIComponent(meta.url)}`;
      const startByte = meta.downloadedBytes;
      const headers: Record<string, string> = { Range: `bytes=${startByte}-` };

      const response = await fetch(proxyUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      // Verifica status esperado
      const expectedStatus = startByte === 0 ? [200, 206] : [206];
      if (!expectedStatus.includes(response.status)) {
        if (response.status === 403) {
          throw new Error(
            "O proxy de vídeos recusou o pedido (403). Confira se este endereço do app está liberado no Worker.",
          );
        }
        if (response.status >= 500) {
          throw new Error(`Erro do servidor (${response.status})`);
        }
        // Se veio 200 quando esperava 206, descarta parcial e reinicia do zero
        if (startByte > 0 && response.status === 200) {
          console.warn("[videoOffline] Recebeu 200 em vez de 206 ao retomar; reiniciando do zero");
          await removeVideo(aulaId);
          this.abortControllers.delete(aulaId);
          return this.startDownload(aulaId, meta.url, meta.title);
        }
        throw new Error(`Resposta inesperada: ${response.status}`);
      }

      // Confere total no Content-Range
      const contentRange = response.headers.get("content-range");
      if (contentRange) {
        const match = contentRange.match(/\/(\d+)$/);
        if (match) {
          const totalFromServer = parseInt(match[1], 10);
          if (totalFromServer !== meta.totalBytes) {
            console.warn("[videoOffline] Tamanho total mudou durante download; reiniciando");
            await removeVideo(aulaId);
            this.abortControllers.delete(aulaId);
            return this.startDownload(aulaId, meta.url, meta.title);
          }
        }
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Resposta sem corpo de leitura");
      }

      // Array de partes recebidas para evitar concatenação repetida de buffers grandes
      const parts: Uint8Array<ArrayBuffer>[] = [];
      let bufferedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        parts.push(value);
        bufferedBytes += value.length;

        // Quando atingir CHUNK_SIZE_BYTES, monta o Blob do chunk e grava
        while (bufferedBytes >= meta.chunkSize) {
          // Monta Blob contendo EXATAMENTE chunkSize bytes
          const chunkParts: Uint8Array<ArrayBuffer>[] = [];
          let needed = meta.chunkSize;

          for (const part of parts) {
            if (needed === 0) break;
            if (part.length <= needed) {
              chunkParts.push(part);
              needed -= part.length;
            } else {
              // Parte maior que o necessário: divide
              chunkParts.push(part.subarray(0, needed));
              // Substitui a parte original pelo restante
              const remaining = part.subarray(needed);
              parts.splice(0, parts.indexOf(part) + 1, remaining);
              needed = 0;
            }
          }

          // Remove as partes consumidas
          let consumed = 0;
          for (const part of parts) {
            if (consumed >= meta.chunkSize) break;
            consumed += part.length;
          }
          // Recalcula partes restantes de forma simples
          const remainingParts: Uint8Array<ArrayBuffer>[] = [];
          let remainingNeeded = bufferedBytes - meta.chunkSize;
          for (const part of parts) {
            if (remainingNeeded === 0) {
              remainingParts.push(part);
            } else if (part.length <= remainingNeeded) {
              remainingNeeded -= part.length;
            } else {
              remainingParts.push(part.subarray(part.length - remainingNeeded));
              remainingNeeded = 0;
            }
          }
          parts.length = 0;
          parts.push(...remainingParts);
          bufferedBytes = remainingParts.reduce((sum, p) => sum + p.length, 0);

          const chunkIndex = Math.floor(meta.downloadedBytes / meta.chunkSize);
          const chunkBlob = new Blob(chunkParts as BlobPart[], { type: meta.mime });

          // Grava chunk + atualiza meta NA MESMA transação
          await db.transaction("rw", db.videoMeta, db.videoChunks, async () => {
            await db.videoChunks.put({
              aulaId,
              index: chunkIndex,
              blob: chunkBlob,
            });
            meta.downloadedBytes += meta.chunkSize;
            meta.updatedAt = new Date().toISOString();
            await db.videoMeta.put(meta);
          });

          chunkWrittenThisAttempt = true;
          this.setState(aulaId, {
            downloadedBytes: meta.downloadedBytes,
            totalBytes: meta.totalBytes,
            percent: Math.round((meta.downloadedBytes / meta.totalBytes) * 100),
            message: `Baixando... ${Math.round((meta.downloadedBytes / meta.totalBytes) * 100)}%`,
          });
        }

        // Verifica abort
        if (controller.signal.aborted) {
          throw new Error("Download cancelado");
        }
      }

      // Grava último chunk (pode ser menor que CHUNK_SIZE)
      if (bufferedBytes > 0) {
        const chunkIndex = Math.floor(meta.downloadedBytes / meta.chunkSize);
        const chunkBlob = new Blob(parts as BlobPart[], { type: meta.mime });

        await db.transaction("rw", db.videoMeta, db.videoChunks, async () => {
          await db.videoChunks.put({
            aulaId,
            index: chunkIndex,
            blob: chunkBlob,
          });
          meta.downloadedBytes += bufferedBytes;
          meta.updatedAt = new Date().toISOString();
          await db.videoMeta.put(meta);
        });

        chunkWrittenThisAttempt = true;
        this.setState(aulaId, {
          downloadedBytes: meta.downloadedBytes,
          totalBytes: meta.totalBytes,
          percent: Math.round((meta.downloadedBytes / meta.totalBytes) * 100),
        });
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
    } catch (err) {
      this.releaseWakeLock();

      // Se foi abortado pelo usuário, não tenta novamente
      if (err instanceof Error && err.name === "AbortError") {
        this.setState(aulaId, {
          phase: "paused",
          message: "Download pausado",
        });
        return;
      }

      // Se está offline, pausa e aguarda voltar
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        this.setState(aulaId, {
          phase: "paused",
          message: "Sem internet — pausado",
        });
        return;
      }

      // Erro de quota
      if (err instanceof DOMException && err.name === "QuotaExceededError") {
        this.setState(aulaId, {
          phase: "error",
          message: "Sem espaço no aparelho. Libere espaço ou remova outros vídeos offline.",
        });
        return;
      }

      // Se escreveu pelo menos um chunk nesta tentativa, reseta contador de retentativas
      // MAX_RETRIES vale para falhas consecutivas SEM progresso real
      const nextAttempt = chunkWrittenThisAttempt ? 0 : attempt + 1;

      // Backoff exponencial: 2s, 4s, 8s, 16s... (teto 30s)
      const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
      console.warn(
        `[videoOffline] Tentativa ${attempt + 1} falhou, tentando novamente em ${delay}ms (próxima tentativa: ${nextAttempt}):`,
        err,
      );

      this.setState(aulaId, {
        phase: "downloading",
        message: `Falha na rede — retentativa ${attempt + 1}/${VIDEO_OFFLINE.MAX_RETRIES} em ${Math.round(delay / 1000)}s...`,
      });

      await new Promise((r) => setTimeout(r, delay));
      this.abortControllers.delete(aulaId);
      return this.downloadWithRetries(aulaId, meta, nextAttempt);
    } finally {
      this.abortControllers.delete(aulaId);
    }
  }

  /**
   * Cancela download e apaga o parcial.
   */
  async cancelDownload(aulaId: string): Promise<void> {
    const controller = this.abortControllers.get(aulaId);
    if (controller) {
      controller.abort();
    }
    await removeVideo(aulaId);
    this.states.delete(aulaId);
    this.notify();
    if (this.currentDownloadAulaId === aulaId) {
      this.currentDownloadAulaId = null;
      this.releaseWakeLock();
    }
  }

  /**
   * Pausa download (mantém o parcial).
   */
  pauseDownload(aulaId: string): void {
    const controller = this.abortControllers.get(aulaId);
    if (controller) {
      controller.abort();
    }
    const state = this.states.get(aulaId);
    if (state) {
      this.setState(aulaId, { phase: "paused", message: "Download pausado" });
    }
  }

  /**
   * Remove vídeo completo.
   */
  async removeVideo(aulaId: string): Promise<void> {
    await removeVideo(aulaId);
    this.states.delete(aulaId);
    this.notify();
  }
}

// Singleton
const downloadManager = new DownloadManager();

// Exporta funções do gerenciador
export function startDownload(aulaId: string, url: string, title: string): Promise<void> {
  return downloadManager.startDownload(aulaId, url, title);
}

export function cancelDownload(aulaId: string): Promise<void> {
  return downloadManager.cancelDownload(aulaId);
}

export function pauseDownload(aulaId: string): void {
  downloadManager.pauseDownload(aulaId);
}

export function removeVideoFromManager(aulaId: string): Promise<void> {
  return downloadManager.removeVideo(aulaId);
}

export function subscribeToDownloads(listener: Listener): () => void {
  return downloadManager.subscribe(listener);
}

export function getDownloadState(aulaId: string): DownloadState {
  return downloadManager.getState(aulaId);
}
