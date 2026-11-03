// src/components/ranking/components/RankingHeader.tsx
import { CalendarDays, Timer } from "lucide-react";
import type { PeriodoTipo, RankingPeriod } from "../types";

interface RankingHeaderProps {
  periodo: RankingPeriod;
  tipo: PeriodoTipo;
  onTipoChange: (t: PeriodoTipo) => void;
}

export function RankingHeader({ periodo, tipo, onTipoChange }: RankingHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="font-display text-2xl font-bold sm:text-3xl">Ranking</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            {periodo.label}
          </span>
          {periodo.encerramento && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
              <Timer className="h-4 w-4" />
              {periodo.encerramento}
            </span>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="Período do ranking" className="inline-flex self-start rounded-full bg-surface p-1 ring-1 ring-border sm:self-auto">
        {(["semanal", "mensal"] as const).map((t) => {
          const active = tipo === t;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              onClick={() => onTipoChange(t)}
              className={`inline-flex items-center justify-center rounded-full px-4 py-1.5 text-sm font-semibold transition-colors sm:px-5 ${
                active ? "btn-sun" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "semanal" ? "Semana" : "Mês"}
            </button>
          );
        })}
      </div>
    </header>
  );
}