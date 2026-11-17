// src/hooks/useVideoOffline.ts
// Hook React para gerenciar download de vídeo offline.

import { useEffect, useState, useCallback } from "react";
import {
  isDownloadableVideoUrl,
  getVideoMeta,
  startDownload,
  cancelDownload,
  removeVideo,
  pauseDownload,
  subscribeToDownloads,
  getDownloadState,
  type DownloadState,
} from "@/services/videoOfflineService";

export interface UseVideoOfflineReturn {
  state: DownloadState;
  canDownload: boolean;
  download: () => Promise<void>;
  cancel: () => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  remove: () => Promise<void>;
  retry: () => Promise<void>;
}

export function useVideoOffline(
  aulaId: string,
  videoUrl: string | null,
  title: string,
): UseVideoOfflineReturn {
  const [state, setState] = useState<DownloadState>(() => getDownloadState(aulaId));

  // Subscribe to download manager updates
  useEffect(() => {
    const unsubscribe = subscribeToDownloads((states) => {
      const newState = states.get(aulaId);
      if (newState) {
        setState(newState);
      }
    });
    return unsubscribe;
  }, [aulaId]);

  // Verificação inicial ao montar: se o vídeo já está completo no IndexedDB,
  // inicia em "complete" para o botão mostrar "Disponível offline" após recarregar.
  useEffect(() => {
    let cancelled = false;

    const checkInitial = async () => {
      const meta = await getVideoMeta(aulaId);
      if (cancelled) return;
      if (meta && meta.status === "complete") {
        setState({
          phase: "complete",
          percent: 100,
          downloadedBytes: meta.totalBytes,
          totalBytes: meta.totalBytes,
          message: "Download concluído!",
        });
      }
    };
    checkInitial();

    return () => {
      cancelled = true;
    };
  }, [aulaId]);

  const canDownload = videoUrl ? isDownloadableVideoUrl(videoUrl) : false;

  const download = useCallback(async () => {
    if (!videoUrl) return;
    try {
      await startDownload(aulaId, videoUrl, title);
    } catch (err) {
      // Erro já tratado no gerenciador (state será 'error')
      console.error("[useVideoOffline] Download falhou:", err);
    }
  }, [aulaId, videoUrl, title]);

  const cancel = useCallback(async () => {
    await cancelDownload(aulaId);
  }, [aulaId]);

  const pause = useCallback(() => {
    pauseDownload(aulaId);
  }, [aulaId]);

  const resume = useCallback(async () => {
    if (!videoUrl) return;
    const currentState = getDownloadState(aulaId);
    if (currentState.phase === "paused" || currentState.phase === "error") {
      await startDownload(aulaId, videoUrl, title);
    }
  }, [aulaId, videoUrl, title]);

  const remove = useCallback(async () => {
    await removeVideo(aulaId);
  }, [aulaId]);

  const retry = useCallback(async () => {
    if (!videoUrl) return;
    const currentState = getDownloadState(aulaId);
    if (currentState.phase === "error") {
      await startDownload(aulaId, videoUrl, title);
    }
  }, [aulaId, videoUrl, title]);

  return {
    state,
    canDownload,
    download,
    cancel,
    pause,
    resume,
    remove,
    retry,
  };
}
