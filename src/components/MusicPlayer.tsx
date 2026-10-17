// src/components/MusicPlayer.tsx
// UI da música: botão pequeno, play/pause e modal para colar o link.
// Toda a lógica (player escondido, YouTube, MP3) está no MusicContext.

import { useEffect, useState } from "react";
import { Music, X, Play, Pause, Volume2 } from "lucide-react";
import { useMusic, detectKind } from "@/contexts/MusicContext";
import type { MusicConfig } from "@/contexts/MusicContext";
import { useToast } from "@/hooks/useToast";

const EMPTY: MusicConfig = { kind: "none", url: "", label: "" };

export function MusicPlayer() {
  const music = useMusic();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MusicConfig>(music.config);

  // Ao abrir, copia o config atual.
  useEffect(() => {
    if (open) setDraft(music.config);
  }, [open, music.config]);

  // Fechar com Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleOpen = () => {
    setDraft(music.config);
    setOpen(true);
  };

  const handleSave = () => {
    const kind = detectKind(draft.url);
    if (draft.url.trim() === "") {
      music.clear();
      toast.success("Música removida.");
      setOpen(false);
      return;
    }
    if (kind === "none") {
      toast.error("Link não reconhecido.", {
        description: "Cole um link do YouTube ou uma URL terminando em .mp3",
      });
      return;
    }
    music.setConfig({
      kind,
      url: draft.url.trim(),
      label: draft.label.trim(),
    });
    music.setPlaying(true);
    toast.success("Música configurada.");
    setOpen(false);
  };

  const handleClear = () => {
    music.clear();
    setDraft(EMPTY);
    setOpen(false);
    toast.success("Música removida.");
  };

  const togglePlay = () => {
    if (!music.hasMusic) {
      handleOpen();
      return;
    }
    music.togglePlay();
  };

  return (
    <>
      {/* Botão + controles compactos */}
      <div className="flex items-center justify-end gap-2">
        {music.hasMusic ? (
          <>
            <button
              type="button"
              onClick={togglePlay}
              className="grid h-9 w-9 place-items-center rounded-full text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              aria-label={music.playing ? "Pausar música" : "Tocar música"}
              title={music.playing ? "Pausar música" : "Tocar música"}
            >
              {music.playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={handleOpen}
              className="grid h-9 w-9 place-items-center rounded-full text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Música"
              title="Música"
            >
              <Music className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleOpen}
            className="grid h-9 w-9 place-items-center rounded-full text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Adicionar música"
            title="Adicionar música"
          >
            <Music className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Modal de configuração */}
      {open && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-background/80 p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md my-8 space-y-4 rounded-3xl rf-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                <Music className="h-4 w-4" /> Música
              </h2>
              <button onClick={() => setOpen(false)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Cole um link do <b>YouTube</b> (vídeo ou playlist) ou uma URL
              direta de <b>MP3</b>. A música continua tocando mesmo que você
              mude de aba no app.
            </p>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground/70">
                Link
              </label>
              <input
                type="url"
                className="w-full rounded-xl border border-input bg-muted px-3 py-2 text-sm"
                placeholder="https://www.youtube.com/watch?v=... ou https://.../musica.mp3"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              />
              {draft.url.trim() !== "" && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Detectado:{" "}
                  <b>
                    {detectKind(draft.url) === "youtube"
                      ? "YouTube"
                      : detectKind(draft.url) === "audio"
                      ? "Áudio (MP3)"
                      : "Não reconhecido"}
                  </b>
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground/70">
                Nome (opcional)
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-input bg-muted px-3 py-2 text-sm"
                placeholder="Ex.: Lo-fi do Pomodoro"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-medium text-foreground/70">
                  <Volume2 className="mr-1 inline h-3 w-3" />
                  Volume: {music.volume}%
                </p>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={music.volume}
                onChange={(e) => music.setVolume(parseInt(e.target.value, 10))}
                className="w-full accent-[var(--primary)]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              {music.hasMusic && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-xs text-foreground/60 hover:text-foreground underline"
                >
                  Remover música
                </button>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="btn-ghost px-4 py-2"
                >
                  Cancelar
                </button>
                <button onClick={handleSave} className="btn-sun px-4 py-2">
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}