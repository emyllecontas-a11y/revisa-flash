// src/components/ranking/components/MedalsSection.tsx
import { useState } from "react";
import type { Medal, PeriodoTipo } from "../types";
import { MedalBadge } from "./MedalBadge";
import { RankingAvatar } from "./RankingAvatar";

interface MedalsSectionProps {
  semanais: Medal[];
  mensais: Medal[];
  defaultCategoria?: PeriodoTipo;
}

export function MedalsSection({ semanais, mensais, defaultCategoria = "semanal" }: MedalsSectionProps) {
  const [cat, setCat] = useState<PeriodoTipo>(defaultCategoria);
  const [selected, setSelected] = useState<string | null>(null);
  const list = cat === "semanal" ? semanais : mensais;
  const conquistadas = list.filter((m) => m.conquistada).length;
  const active = list.find((m) => m.id === selected) ?? list[0];

  if (!list || list.length === 0) return null;

  return (
    <section aria-label="Medalhas de constância" className="rf-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h3 className="font-display text-lg font-bold">Medalhas de constância</h3>
          <p className="text-sm text-muted-foreground">
            {conquistadas} de {list.length} conquistadas {cat === "semanal" ? "nesta semana" : "neste mês"}
          </p>
        </div>
        <div className="inline-flex self-start rounded-full bg-background p-1 ring-1 ring-border">
          {(["semanal", "mensal"] as const).map((c) => (
            <button
              key={c}
              onClick={() => { setCat(c); setSelected(null); }}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${cat === c ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {c === "semanal" ? "Semanais" : "Mensais"}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex snap-x gap-3 overflow-x-auto px-4 py-5 sm:gap-5 sm:px-5 ${cat === "mensal" ? "rk-hero" : ""}`}>
        {list.map((m) => {
          const isActive = active?.id === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setSelected(m.id)}
              className={`group flex h-auto whitespace-normal w-24 shrink-0 snap-start flex-col items-center gap-2 rounded-2xl p-2 transition-all sm:w-28 ${
                isActive ? "bg-surface-2 ring-2 ring-primary" : "hover:bg-surface-2"
              }`}
            >
              <div className={`transition-transform group-hover:-translate-y-1 ${m.conquistada && isActive ? "rk-float" : ""} ${m.conquistada ? "" : "opacity-70"}`}>
                <MedalBadge tier={m.tier} icon={m.icon} categoria={m.categoria} locked={!m.conquistada} size={cat === "mensal" ? 76 : 68} />
              </div>
              <span className="line-clamp-2 text-center text-xs font-semibold leading-tight">{m.titulo}</span>
              {!m.conquistada && m.progresso !== undefined && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
                  <div className="bg-progress h-full" style={{ width: `${m.progresso * 100}%` }} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {active && (
        <div key={active.id} className="rf-fade-in flex flex-col gap-3 border-t border-border bg-background/40 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: active.conquistada ? "var(--primary)" : "var(--muted-foreground)" }}>
              {active.conquistada ? "Conquistada" : `Em progresso · ${Math.round((active.progresso ?? 0) * 100)}%`}
            </p>
            <p className="font-display text-base font-bold">{active.titulo}</p>
            <p className="text-sm text-muted-foreground">{active.descricao}</p>
          </div>
          {active.ganhadores && active.ganhadores.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {active.ganhadores.slice(0, 4).map((g) => (
                  <RankingAvatar key={g.id} id={g.id} name={g.name} avatarUrl={g.avatar_url} size={30} />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {active.ganhadores.length} {active.ganhadores.length === 1 ? "estudante" : "estudantes"}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}