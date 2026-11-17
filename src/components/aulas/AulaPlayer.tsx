import { useEffect, useRef, useState } from "react";
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import { RotateCcw, RotateCw, WifiOff, AlertTriangle } from "lucide-react";

interface AulaPlayerProps {
  teraboxUrl: string;
  aulaId: string;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  initialTime?: number;
  offlineObjectUrl?: string | null;
  isOnline?: boolean;
}

export function AulaPlayer({
  teraboxUrl,
  aulaId,
  onTimeUpdate,
  initialTime = 0,
  offlineObjectUrl,
  isOnline = true,
}: AulaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Plyr | null>(null);
  const hasRestoredTime = useRef(false);
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

  useEffect(() => {
    if (!videoRef.current) return;

    // Update source if it changed (but don't change mid-playback)
    const videoEl = videoRef.current;
    if (videoEl.src !== effectiveSrc && !videoEl.paused) {
      // Don't switch source mid-playback; will apply on next mount
      return;
    }
    if (videoEl.src !== effectiveSrc) {
      videoEl.src = effectiveSrc;
      videoEl.load();
    }

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

    videoEl.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoEl.addEventListener("timeupdate", handleTimeUpdate);
    videoEl.addEventListener("error", handleError);

    return () => {
      videoEl.removeEventListener("loadedmetadata", handleLoadedMetadata);
      videoEl.removeEventListener("timeupdate", handleTimeUpdate);
      videoEl.removeEventListener("error", handleError);
      if (playerRef.current) playerRef.current.destroy();
    };
  }, [effectiveSrc, aulaId, initialTime, offlineObjectUrl, teraboxUrl, isOnline]);

  const handleRewind = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
    }
  };

  const handleForward = () => {
    if (videoRef.current && videoRef.current.duration) {
      videoRef.current.currentTime = Math.min(
        videoRef.current.duration,
        videoRef.current.currentTime + 10,
      );
    }
  };

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

  return (
    <div className="relative group">
      <div className="rf-au-player relative aspect-video w-full overflow-hidden bg-black shadow-lg">
        <video ref={videoRef} className="w-full h-full" playsInline controls key={effectiveSrc}>
          <source src={effectiveSrc} type="video/mp4" />
        </video>
      </div>
      {/* Botões rápidos de -10s e +10s */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10">
        <button
          type="button"
          onClick={handleRewind}
          title="Voltar 10 segundos"
          className="flex items-center gap-1 text-xs font-semibold text-white hover:text-primary transition-colors px-1.5 py-0.5 rounded"
        >
          <RotateCcw className="h-3.5 w-3.5" /> -10s
        </button>
        <span className="text-white/30">|</span>
        <button
          type="button"
          onClick={handleForward}
          title="Avançar 10 segundos"
          className="flex items-center gap-1 text-xs font-semibold text-white hover:text-primary transition-colors px-1.5 py-0.5 rounded"
        >
          +10s <RotateCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
