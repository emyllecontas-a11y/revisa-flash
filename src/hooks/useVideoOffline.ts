// src/hooks/useVideoOffline.ts
// Hook React para gerenciar download de vídeo offline.

import { useEffect, useState, useCallback } from "react";
import {
  isDownloadableVideoUrl,
  getVideoMeta,
  getPlayableObjectUrl,
  startDownload,
  cancelDownload,
  removeVideo as removeVideoService,
  pauseDownload,
  subscribeToDownloads,
  getDownloadState,
  type DownloadState,
  type DownloadPhase,
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
  objectUrl: string | null;
}

export function useVideoOffline(
  aulaId: string,
  videoUrl: string | null,
  title: string,
): UseVideoOfflineReturn {
  const [state, setState] = useState<DownloadState>(() => getDownloadState(aulaId));
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [hasCheckedInitial, setHasCheckedInitial] = useState(false);

  // Atualiza objectUrl se status for complete
  const refreshObjectUrl = useCallback(async () => {
    const url = await getPlayableObjectUrl(aulaId);
    setObjectUrl(url);
  }, [aulaId]);

  // Subscribe to download manager updates
  useEffect(() => {
    const unsubscribe = subscribeToDownloads((states) => {
      const newState = states.get(aulaId);
      if (newState) {
        setState(newState);
        // Se completou, atualiza objectUrl
        if (newState.phase === "complete") {
          refreshObjectUrl();
        }
      }
    });
    return unsubscribe;
  }, [aulaId, refreshObjectUrl]);

  // Verificação inicial: se já tem meta complete ou partial, carrega estado
  useEffect(() => {
    if (hasCheckedInitial) return;
    setHasCheckedInitial(true);

    const checkInitial = async () => {
      const meta = await getVideoMeta(aulaId);
      if (meta) {
        if (meta.status === "complete") {
          await refreshObjectUrl();
        }
        // O subscribe já vai pegar o estado do gerenciador
      }
    };
    checkInitial();
  }, [aulaId, hasCheckedInitial, refreshObjectUrl]);

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
    setObjectUrl(null);
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
    await removeVideoFromManager(aulaId);
    setObjectUrl(null);
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
    objectUrl,
  };
}

// Re-exporta removeVideoFromManager para uso no hook
import { removeVideo as removeVideoFromManager } from "@/services/videoOfflineService";
