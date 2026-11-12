import { CheckCircle2, Clock, Play } from "lucide-react";
import type { Aula } from "./aulas-data";

interface AulaCardProps {
  aula: Aula;
  active: boolean;
  onSelect: (id: string) => void;
}

export function AulaCard({ aula, active, onSelect }: AulaCardProps) {
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
        {concluida && !active ? <CheckCircle2 className="h-5 w-5" /> : <Play className="h-4 w-4 fill-current" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Aula {String(aula.numero).padStart(2, "0")}
          <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
          <span className="inline-flex items-center gap-1 normal-case tracking-normal">
            <Clock className="h-3 w-3" />
            {aula.duracao}
          </span>
        </span>
        <span className="mt-1 block truncate font-display text-[15px] font-semibold text-foreground">{aula.titulo}</span>
        <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{aula.descricao}</span>
        <span className="mt-2.5 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="rf-au-bar block h-full rounded-full" style={{ width: `${aula.progresso}%` }} />
          </span>
          <span className="w-9 shrink-0 text-right text-[11px] font-bold text-muted-foreground">
            {concluida ? "✓" : `${aula.progresso}%`}
          </span>
        </span>
      </span>
    </button>
  );
}
