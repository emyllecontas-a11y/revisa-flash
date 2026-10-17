// src/components/PomodoroStats.tsx
// Card com os ciclos de Pomodoro do dia.
// Fica na coluna esquerda de Sessões, junto dos outros cards.

import { useMemo } from "react";
import { Flame } from "lucide-react";
import { usePomodoro } from "@/contexts/PomodoroContext";
import { useStudy } from "@/contexts/StudyContext";

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMin(min: number): string {
  if (min <= 0) return "0min";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-display text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

export function PomodoroStats() {
  const pomo = usePomodoro();
  const { records } = useStudy();

  const todayStr = localDateStr(new Date());

  const minutesToday = useMemo(() => {
    return records
      .filter(
        (r) =>
          r.date === todayStr &&
          typeof r.observations === "string" &&
          r.observations.includes("Pomodoro")
      )
      .reduce((s, r) => s + r.duration, 0);
  }, [records, todayStr]);

  const totalCycles =
    pomo.counters.focus + pomo.counters.short + pomo.counters.long;

  // Se nunca usou Pomodoro hoje e está idle, não mostra o card.
  if (totalCycles === 0 && minutesToday === 0 && pomo.status === "idle") {
    return null;
  }

  return (
    <section className="rounded-3xl rf-card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
        <Flame className="h-4 w-4 text-accent" /> Pomodoro hoje
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Focos" value={String(pomo.counters.focus)} />
        <Stat label="Pausas curtas" value={String(pomo.counters.short)} />
        <Stat label="Pausas longas" value={String(pomo.counters.long)} />
        <Stat label="Min. focados" value={formatMin(minutesToday)} />
      </div>
    </section>
  );
}