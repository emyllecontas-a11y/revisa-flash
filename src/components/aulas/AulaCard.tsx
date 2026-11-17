import {
  CheckCircle2,
  Clock,
  Play,
  ChevronUp,
  ChevronDown,
  HardDrive,
  Loader2,
} from "lucide-react";
import type { AulaVisual } from "./aulas-data";

interface AulaCardProps {
  aula: AulaVisual;
  active: boolean;
  onSelect: (id: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  isOffline?: boolean;
  offlineProgress?: number; // 0-100, se estiver baixando
}

export function AulaCard({
  aula,
  active,
  onSelect,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  isOffline,
  offlineProgress,
}: AulaCardProps) {
  const concluida = aula.progresso >= 100;
  return (
    <button
      type="button"
      onClick={() => onSelect(aula.id)}
      data-tone={aula.tone}
      data-active={active}
      aria-current={active ? "true" : undefined}
      className="rf-au-card group flex w-full min-w-0 items-start gap-3 p-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="rf-au-icon grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors">
        {concluida && !active ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <Play className="h-4 w-4 fill-current" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Aula {String(aula.numero).padStart(2, "0")}
          {isOffline && (
            <span
              className="flex items-center gap-1"
              aria-label={
                offlineProgress !== undefined
                  ? `Baixando: ${offlineProgress}%`
                  : "Disponível offline"
              }
              title={
                offlineProgress !== undefined
                  ? `Baixando: ${offlineProgress}%`
                  : "Disponível offline"
              }
            >
              {offlineProgress !== undefined ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              ) : (
                <HardDrive className="h-3 w-3 text-green-500" />
              )}
            </span>
          )}
          <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
          <span className="inline-flex items-center gap-1 normal-case tracking-normal">
            <Clock className="h-3 w-3" />
            {aula.duracao}
          </span>
        </span>
        <span className="mt-1 block truncate font-display text-[15px] font-semibold text-foreground">
          {aula.titulo}
        </span>
        <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
          {aula.descricao}
        </span>
        <span className="mt-2.5 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="rf-au-bar block h-full rounded-full"
              style={{ width: `${aula.progresso}%` }}
            />
          </span>
          <span className="w-9 shrink-0 text-right text-[11px] font-bold text-muted-foreground">
            {concluida ? "✓" : `${aula.progresso}%`}
          </span>
        </span>
      </span>
      {(onMoveUp || onMoveDown) && (
        <div className="flex flex-col gap-1 ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {onMoveUp && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              disabled={isFirst}
              className="grid h-6 w-6 place-items-center rounded-lg text-foreground/50 hover:text-foreground hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Mover para cima"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              disabled={isLast}
              className="grid h-6 w-6 place-items-center rounded-lg text-foreground/50 hover:text-foreground hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Mover para baixo"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </button>
  );
}
