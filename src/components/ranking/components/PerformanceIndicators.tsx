import { BookOpen, CheckCircle2, Clock, type LucideIcon } from "lucide-react";
import type { UserIndicators } from "../types";
import { fmtMin, fmtNum } from "../format";

/** Cards com os 3 indicadores: tempo, questões e simulados. */
export function PerformanceIndicators({ data }: { data: UserIndicators }) {
  return (
    <section aria-label="Indicadores de desempenho">
      <h3 className="mb-3 font-display text-lg font-bold">Seus indicadores</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <IndicatorCard
          icon={Clock}
          title="Tempo de estudo"
          lip="var(--primary)"
          rows={[
            ["Hoje", fmtMin(data.tempo.dia)],
            ["Semana", fmtMin(data.tempo.semana)],
            ["Mês", fmtMin(data.tempo.mes)],
          ]}
        />
        <IndicatorCard
          icon={CheckCircle2}
          title="Questões resolvidas"
          lip="var(--rk-green)"
          rows={[
            ["Hoje", fmtNum(data.questoes.dia)],
            ["Semana", fmtNum(data.questoes.semana)],
            ["Mês", fmtNum(data.questoes.mes)],
          ]}
        />
        <IndicatorCard
          icon={BookOpen}
          title="Simulados realizados"
          lip="var(--rk-gold)"
          rows={[
            ["Semana", String(data.simulados.semana)],
            ["Mês", String(data.simulados.mes)],
          ]}
        />
      </div>
    </section>
  );
}

function IndicatorCard({ icon: Icon, title, lip, rows }: { icon: LucideIcon; title: string; lip: string; rows: [string, string][] }) {
  return (
    <div className="card-lip p-4" style={{ ["--lip" as string]: lip }}>
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${lip} 22%, transparent)`, color: lip }}>
          <Icon className="h-5 w-5" />
        </span>
        <p className="font-semibold">{title}</p>
      </div>
      <dl className="mt-3 space-y-1.5">
        {rows.map(([k, v], i) => (
          <div key={k} className="flex items-baseline justify-between">
            <dt className="text-sm text-muted-foreground">{k}</dt>
            <dd className={`font-display font-bold ${i === rows.length - 1 ? "text-lg" : "text-base"}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
