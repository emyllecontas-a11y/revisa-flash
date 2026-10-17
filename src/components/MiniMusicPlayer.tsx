// src/components/MiniMusicPlayer.tsx
// Player flutuante fixo no canto inferior direito.
// Aparece quando há música configurada, em qualquer página do app.
// Só controla play/pause e volume — a configuração completa fica no MusicPlayer.

import { useState } from "react";
import { Music, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useMusic } from "@/contexts/MusicContext";

export function MiniMusicPlayer() {
  const music = useMusic();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Nada para mostrar se não tem música configurada, ou se foi dispensado.
  if (!music.hasMusic || dismissed) return null;

  const Icon = music.playing ? Pause : Play;
  const VolumeIcon = music.volume === 0 ? VolumeX : Volume2;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 rf-card shadow-2xl"
      style={{ minWidth: expanded ? 220 : "auto" }}
    >
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={music.togglePlay}
          className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
          aria-label={music.playing ? "Pausar música" : "Tocar música"}
        >
          <Icon className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 items-center gap-2 text-left"
          aria-label="Expandir controles da música"
        >
          <Music className="h-3.5 w-3.5 shrink-0 text-foreground/60" />
          <span className="max-w-[120px] truncate text-xs font-medium">
            {music.config.label || "Música"}
          </span>
        </button>

        {expanded && (
          <div className="flex items-center gap-1.5 border-l border-border pl-2">
            <VolumeIcon className="h-3.5 w-3.5 text-foreground/60" />
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={music.volume}
              onChange={(e) => music.setVolume(parseInt(e.target.value, 10))}
              className="w-20 accent-[var(--primary)]"
              aria-label="Volume da música"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="grid h-6 w-6 place-items-center rounded-full text-foreground/40 hover:bg-muted hover:text-foreground"
          aria-label="Fechar player"
          title="Fechar (a música continua tocando)"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}