import { useEffect, useRef, useState } from "react";
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import { RotateCcw, RotateCw, WifiOff, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/useToast";

interface AulaPlayerProps {
  teraboxUrl: string;
  aulaId: string;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onPause?: () => void;
  /** Disparado quando o vídeo chega ao fim. */
  onEnded?: () => void;
  /** Começa a tocar sozinho assim que o vídeo carrega (usado na lista de reprodução). */
  autoPlay?: boolean;
  initialTime?: number;
  offlineObjectUrl?: string | null;
  isOnline?: boolean;
}

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

export function AulaPlayer({
  teraboxUrl,
  aulaId,
  onTimeUpdate,
  onPause,
  onEnded,
  autoPlay = false,
  initialTime = 0,
  offlineObjectUrl,
  isOnline = true,
}: AulaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Plyr | null>(null);
  const hasRestoredTime = useRef(false);
  const triedFallbackRef = useRef(false);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;
  const onPauseRef = useRef(onPause);
  onPauseRef.current = onPause;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const autoPlayRef = useRef(autoPlay);
  const autoPlayFeitoRef = useRef(false);
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

  // Sem internet e sem vídeo salvo: avisa já no mount.
  // Se a conexão voltar, libera a montagem do vídeo e carrega uma única vez.
  useEffect(() => {
    if (fonteInicial.isOffline) return;
    if (!isOnline) {
      setPlayerMessage("sem-internet");
      return;
    }
    if (playerMessage === "sem-internet") {
      hasRestoredTime.current = false;
      setPlayerMessage(null);
      videoRef.current?.load();
    }
  }, [isOnline, fonteInicial.isOffline, playerMessage]);

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

  // Eventos do vídeo: tempo, restauração e fallback de fonte.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleLoadedMetadata = () => {
      // Se a aula já foi vista até o fim, recomeça do zero em vez de abrir no último segundo.
      const duracao = videoEl.duration;
      const jaNoFim = Number.isFinite(duracao) && duracao > 0 && initialTimeRef.current >= duracao - 3;
      if (initialTimeRef.current > 0 && !hasRestoredTime.current && !jaNoFim) {
        videoEl.currentTime = initialTimeRef.current;
        hasRestoredTime.current = true;
      }
      if (autoPlayRef.current && !autoPlayFeitoRef.current) {
        autoPlayFeitoRef.current = true;
        // O navegador pode bloquear o play automático; nesse caso o aluno aperta play.
        videoEl.play().catch(() => {});
      }
    };

    const handleEnded = () => {
      onEndedRef.current?.();
    };

    const handleTimeUpdate = () => {
      if (onTimeUpdateRef.current) {
        onTimeUpdateRef.current(videoEl.currentTime, videoEl.duration || 0);
      }
    };

    const handlePause = () => {
      if (onPauseRef.current) {
        onPauseRef.current();
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
      if (!isOnline) {
        setPlayerMessage("sem-internet");
      } else {
        setPlayerMessage("erro-carregar");
      }
    };

    videoEl.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoEl.addEventListener("timeupdate", handleTimeUpdate);
    videoEl.addEventListener("pause", handlePause);
    videoEl.addEventListener("ended", handleEnded);
    videoEl.addEventListener("error", handleError);

    // Se os metadados já chegaram antes de o ouvinte existir (vídeo salvo/em cache), aplica agora.
    if (videoEl.readyState >= 1) handleLoadedMetadata();

    return () => {
      videoEl.removeEventListener("loadedmetadata", handleLoadedMetadata);
      videoEl.removeEventListener("timeupdate", handleTimeUpdate);
      videoEl.removeEventListener("pause", handlePause);
      videoEl.removeEventListener("ended", handleEnded);
      videoEl.removeEventListener("error", handleError);
    };
  }, [aulaId, fonteInicial, isOnline, teraboxUrl]);

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
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
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
