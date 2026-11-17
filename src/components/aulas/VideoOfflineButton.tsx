// src/components/aulas/VideoOfflineButton.tsx
// Botão "Disponibilizar offline" para baixar vídeo da aula no aparelho.

import { useState, useEffect, useCallback } from "react";
import {
  CloudDownload,
  Download,
  CheckCircle,
  X,
  RotateCcw,
  AlertCircle,
  WifiOff,
  Loader2,
  Trash2,
  PauseCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVideoOffline } from "@/hooks/useVideoOffline";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { formatBytes } from "@/utils/helpers";
import { getRemoteVideoSize } from "@/services/videoOfflineService";

interface VideoOfflineButtonProps {
  aulaId: string;
  videoUrl: string | null;
  title: string;
  isOnline: boolean;
}

export function VideoOfflineButton({ aulaId, videoUrl, title, isOnline }: VideoOfflineButtonProps) {
  const confirm = useConfirm();
  const toast = useToast();
  const { state, canDownload, download, cancel, pause, resume, remove, retry, objectUrl } =
    useVideoOffline(aulaId, videoUrl, title);

  const [showProgress, setShowProgress] = useState(false);
  const [iosWarningShown, setIosWarningShown] = useState(false);
  const [isCheckingSize, setIsCheckingSize] = useState(false);

  // Verifica se é iOS e não está instalado como PWA
  useEffect(() => {
    const isIOS =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const flagKey = "video-offline-ios-warning-shown";

    if (isIOS && !isStandalone && !localStorage.getItem(flagKey)) {
      setTimeout(() => {
        const confirmed = confirm({
          title: "Atenção no iPhone/iPad",
          description:
            "No Safari, vídeos baixados podem ser apagados se o app ficar sem uso. Para guardar com mais segurança, instale o app na tela inicial (Compartilhar > Adicionar à Tela de Início).",
          confirmText: "Entendi",
          cancelText: "",
        });
        confirmed.then((ok) => {
          if (ok) localStorage.setItem(flagKey, "true");
        });
      }, 1000);
    }
  }, [confirm]);

  const handleDownload = useCallback(async () => {
    if (!videoUrl) return;

    setIsCheckingSize(true);
    let totalBytes: number;
    try {
      totalBytes = await getRemoteVideoSize(videoUrl);
    } catch (err) {
      setIsCheckingSize(false);
      const msg = err instanceof Error ? err.message : "Erro ao verificar tamanho do vídeo";
      toast.error(msg);
      return;
    }
    setIsCheckingSize(false);

    const confirmed = await confirm({
      title: `Baixar "${title}"?`,
      description: `O vídeo ocupa cerca de ${formatBytes(totalBytes)}. Mantenha esta página aberta até terminar.`,
      confirmText: "Baixar",
      cancelText: "Cancelar",
    });

    if (confirmed) {
      setShowProgress(true);
      await download();
    }
  }, [videoUrl, title, confirm, download, toast]);

  const handleCancel = useCallback(async () => {
    const confirmed = await confirm({
      title: "Cancelar download?",
      description: "O progresso será perdido e o arquivo parcial será removido.",
      confirmText: "Cancelar e remover",
      cancelText: "Manter",
      destructive: true,
    });

    if (confirmed) {
      await cancel();
      setShowProgress(false);
    }
  }, [confirm, cancel]);

  const handlePause = useCallback(() => {
    pause();
  }, [pause]);

  const handleResume = useCallback(async () => {
    await resume();
  }, [resume]);

  const handleRemove = useCallback(async () => {
    const confirmed = await confirm({
      title: "Remover vídeo do aparelho?",
      description: "Você pode baixá-lo de novo depois.",
      confirmText: "Remover",
      cancelText: "Cancelar",
      destructive: true,
    });

    if (confirmed) {
      await remove();
      setShowProgress(false);
      toast.success("Vídeo removido do aparelho");
    }
  }, [confirm, remove, toast]);

  const handleRetry = useCallback(async () => {
    await retry();
  }, [retry]);

  const phase = state.phase;
  const percent = state.percent;
  const message = state.message;

  // Desabilitado se não for URL baixável
  if (videoUrl && !canDownload) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        className="min-h-[36px] px-3.5 py-2 opacity-50"
        title="Este vídeo não pode ser baixado para uso offline."
        aria-label="Vídeo não disponível para offline"
      >
        <Download className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="hidden sm:inline">Indisponível</span>
      </Button>
    );
  }

  // Sem URL de vídeo
  if (!videoUrl) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        className="min-h-[36px] px-3.5 py-2 opacity-50"
        title="Vídeo indisponível"
        aria-label="Vídeo indisponível"
      >
        <Download className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="hidden sm:inline">Indisponível</span>
      </Button>
    );
  }

  // Estados do botão
  if (phase === "idle") {
    if (isCheckingSize) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          className="min-h-[36px] px-3.5 py-2"
          aria-label="Verificando tamanho do vídeo"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="hidden sm:inline">Verificando tamanho…</span>
        </Button>
      );
    }
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={!isOnline}
        className="min-h-[36px] px-3.5 py-2"
        title={isOnline ? "Disponibilizar offline" : "Sem internet para baixar"}
        aria-label={isOnline ? "Baixar vídeo para offline" : "Sem internet"}
      >
        <CloudDownload className="h-3.5 w-3.5 text-primary" />
        <span className="hidden sm:inline">Disponibilizar offline</span>
      </Button>
    );
  }

  if (phase === "checking") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        className="min-h-[36px] px-3.5 py-2"
        aria-label="Verificando vídeo"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span className="hidden sm:inline">Verificando…</span>
      </Button>
    );
  }

  if (phase === "downloading") {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePause}
          className="min-h-[36px] px-3.5 py-2"
          aria-label="Pausar download"
        >
          <PauseCircle className="h-3.5 w-3.5 text-primary" />
          <span className="hidden sm:inline">Pausar</span>
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={handleCancel}
          className="min-h-[36px] px-3 py-2"
          aria-label="Cancelar download"
        >
          <X className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Cancelar</span>
        </Button>
        {showProgress && (
          <div
            className="relative w-32 h-2 bg-secondary rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso do download: ${percent}%`}
          >
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  if (phase === "paused") {
    const isOffline = !isOnline;
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={isOffline ? undefined : handleResume}
          disabled={isOffline}
          className="min-h-[36px] px-3.5 py-2"
          aria-label={isOffline ? "Aguardando internet" : "Continuar download"}
        >
          {isOffline ? (
            <WifiOff className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5 text-primary" />
          )}
          <span className="hidden sm:inline">
            {isOffline ? `Pausado: sem internet (${percent}%)` : `Continuar (${percent}%)`}
          </span>
        </Button>
        {!isOffline && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="min-h-[36px] px-2.5 text-muted-foreground"
            aria-label="Descartar download parcial"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Descartar</span>
          </Button>
        )}
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          className="min-h-[36px] px-3.5 py-2 bg-green-500/10 text-green-700 border-green-500/30 dark:bg-green-500/20 dark:text-green-400 dark:border-green-500/30"
          aria-label="Disponível offline"
        >
          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
          <span className="hidden sm:inline">Disponível offline</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRemove}
          className="min-h-[36px] px-2.5 text-muted-foreground hover:text-destructive"
          aria-label="Remover do aparelho"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Remover</span>
        </Button>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          className="min-h-[36px] px-3.5 py-2 border-destructive/50 text-destructive/80"
          aria-label={`Erro: ${message}`}
        >
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          <span className="hidden sm:inline truncate max-w-[120px]">{message}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRetry}
          className="min-h-[36px] px-3.5 py-2"
          aria-label="Tentar de novo"
        >
          <RotateCcw className="h-3.5 w-3.5 text-primary" />
          <span className="hidden sm:inline">Tentar</span>
        </Button>
      </div>
    );
  }

  return null;
}
