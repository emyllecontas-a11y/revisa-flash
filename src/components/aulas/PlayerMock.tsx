import { useState } from "react";
import {
  BookOpen,
  Captions,
  Maximize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  Volume2,
} from "lucide-react";
import type { Aula } from "./aulas-data";

/**
 * Player DEMONSTRATIVO. Nenhum vídeo é reproduzido.
 * O botão play apenas alterna o ícone (estado local) para mostrar o visual.
 * O DeepSeek deve substituir a área marcada por "VIDEO_SLOT" pelo player real.
 */
export function PlayerMock({ aula }: { aula: Aula }) {
  const [playing, setPlaying] = useState(false);
  const pct = Math.max(aula.progresso, 3);
  return (
    <div className="rf-au-player relative aspect-video w-full overflow-hidden">
      {/* VIDEO_SLOT — futura integração do player real */}
      <div className="rf-au-grid absolute inset-0" aria-hidden />

      <div className="absolute left-4 top-4 flex items-center gap-2 sm:left-6 sm:top-6">
        <span className="rounded-full bg-background/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-foreground backdrop-blur">
          {aula.modulo}
        </span>
      </div>

      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pausar (demonstração)" : "Reproduzir (demonstração)"}
            className="rf-au-play grid h-16 w-16 place-items-center rounded-full sm:h-20 sm:w-20"
          >
            {playing ? <Pause className="h-7 w-7 fill-current" /> : <Play className="ml-1 h-7 w-7 fill-current sm:h-8 sm:w-8" />}
          </button>
          <p className="rf-au-hand hidden max-w-md text-3xl text-foreground/90 sm:block">{aula.titulo}</p>
        </div>
      </div>

      {/* Controles visuais */}
      <div className="rf-au-scrim absolute inset-x-0 bottom-0 px-3 pb-3 pt-10 sm:px-5 sm:pb-4">
        <div className="group/bar relative h-1.5 w-full rounded-full bg-foreground/20">
          <div className="bg-progress h-full rounded-full" style={{ width: `${pct}%` }} />
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow"
            style={{ left: `${pct}%` }}
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-2 text-foreground">
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <CtrlBtn label="Play" onClick={() => setPlaying((p) => !p)}>
              {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
            </CtrlBtn>
            <CtrlBtn label="Voltar 10s"><RotateCcw className="h-4 w-4" /></CtrlBtn>
            <CtrlBtn label="Avançar 10s"><RotateCw className="h-4 w-4" /></CtrlBtn>
            <CtrlBtn label="Volume" className="hidden sm:grid"><Volume2 className="h-4 w-4" /></CtrlBtn>
            <span className="ml-1 truncate text-xs font-semibold tabular-nums text-foreground/85">
              00:00 / {aula.duracao}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <span className="hidden rounded-md bg-foreground/10 px-1.5 py-0.5 text-[10px] font-bold sm:inline">1x</span>
            <CtrlBtn label="Legendas" className="hidden sm:grid"><Captions className="h-4 w-4" /></CtrlBtn>
            <CtrlBtn label="Configurações"><Settings className="h-4 w-4" /></CtrlBtn>
            <CtrlBtn label="Tela cheia"><Maximize className="h-4 w-4" /></CtrlBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

function CtrlBtn({
  children,
  label,
  onClick,
  className = "grid",
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`${className} h-8 w-8 shrink-0 place-items-center rounded-full transition-colors hover:bg-foreground/15`}
    >
      {children}
    </button>
  );
}

export function PlayerEmpty() {
  return (
    <div className="rf-au-empty grid aspect-video w-full place-items-center p-6">
      <div className="flex flex-col items-center text-center">
        <span className="rf-au-float grid h-16 w-16 place-items-center rounded-2xl bg-primary/15 text-primary">
          <BookOpen className="h-8 w-8" />
        </span>
        <p className="rf-au-hand mt-4 text-3xl text-foreground sm:text-4xl">Selecione uma aula para começar</p>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          Escolha um conteúdo na lista de aulas e ele aparecerá aqui.
        </p>
      </div>
    </div>
  );
}
