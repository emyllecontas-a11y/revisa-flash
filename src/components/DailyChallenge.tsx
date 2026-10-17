// src/components/DailyChallenge.tsx
// Desafio de hoje: meta de minutos + barra de progresso + sequência (streak).
// Lê os study_records do dia (via useStudy), então funciona junto com
// Pomodoro, cronômetro livre e sessão manual — tudo conta pra meta.
// A meta e a sequência ficam só neste aparelho (localStorage).

import { useEffect, useMemo, useRef, useState } from "react";
import { Target, Flame, Trophy, X, Check } from "lucide-react";
import { useStudy } from "@/contexts/StudyContext";
import { useToast } from "@/hooks/useToast";
import { notify } from "@/lib/notifications";

const GOAL_KEY = "revisaflash_daily_goal";
const STREAK_KEY = "revisaflash_daily_streak";

const DEFAULT_GOAL_MIN = 60;
const PRESETS = [30, 60, 90, 120, 180, 240];

interface StreakData {
  lastCompletedDay: string | null;
  count: number;
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

function formatMin(min: number): string {
  if (min <= 0) return "0min";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function loadGoal(): number {
  try {
    const raw = localStorage.getItem(GOAL_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  } catch { /* ignore */ }
  return DEFAULT_GOAL_MIN;
}

function loadStreak(): StreakData {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { lastCompletedDay: null, count: 0 };
    const p = JSON.parse(raw);
    return {
      lastCompletedDay:
        typeof p?.lastCompletedDay === "string" ? p.lastCompletedDay : null,
      count:
        typeof p?.count === "number" && p.count > 0 ? Math.floor(p.count) : 0,
    };
  } catch {
    return { lastCompletedDay: null, count: 0 };
  }
}

function saveGoal(goal: number): void {
  try { localStorage.setItem(GOAL_KEY, String(goal)); } catch { /* ignore */ }
}

function saveStreak(s: StreakData): void {
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function DailyChallenge() {
  const { records } = useStudy();
  const toast = useToast();

  const [goal, setGoal] = useState<number>(() => loadGoal());
  const [streak, setStreak] = useState<StreakData>(() => loadStreak());
  const [open, setOpen] = useState(false);
  const [draftGoal, setDraftGoal] = useState<number>(goal);

  const todayStr = localDateStr(new Date());
  const prevStreakRef = useRef<StreakData>(streak);

  const todayMinutes = useMemo(() => {
    return records
      .filter((r) => r.date === todayStr)
      .reduce((s, r) => s + r.duration, 0);
  }, [records, todayStr]);

  const reached = todayMinutes >= goal;
  const progress = goal > 0 ? Math.min(1, todayMinutes / goal) : 0;

  useEffect(() => {
    if (!reached) return;
    if (streak.lastCompletedDay === todayStr) return;

    const continued = streak.lastCompletedDay === yesterdayStr();
    const next: StreakData = {
      lastCompletedDay: todayStr,
      count: continued ? streak.count + 1 : 1,
    };
    setStreak(next);
    saveStreak(next);

    if (prevStreakRef.current.lastCompletedDay !== todayStr) {
      if (next.count > 1) {
        toast.success(`Meta batida! ${next.count} dias seguidos 🔥`);
      } else {
        toast.success("Meta do dia batida! 🎯");
      }

      // Notificação do navegador se a aba estiver escondida.
      if (document.visibilityState === "hidden") {
        notify(
          "Meta do dia batida! 🎯",
          next.count > 1
            ? `${next.count} dias seguidos. Continue assim!`
            : "Bom trabalho. Continue amanhã."
        );
      }
    }
  }, [reached, streak, todayStr, toast]);

  useEffect(() => {
    prevStreakRef.current = streak;
  }, [streak]);

  const visibleStreak =
    streak.lastCompletedDay === todayStr ||
    streak.lastCompletedDay === yesterdayStr()
      ? streak.count
      : 0;

  const handleOpen = () => {
    setDraftGoal(goal);
    setOpen(true);
  };

  const handleSave = () => {
    const g = Math.max(5, Math.min(600, Math.round(draftGoal)));
    setGoal(g);
    saveGoal(g);
    toast.success(`Meta do dia: ${formatMin(g)}.`);
    setOpen(false);
  };

  return (
    <>
      <section className="rounded-3xl rf-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Target className="h-4 w-4 text-accent" /> Desafio de hoje
          </h2>
          <button
            type="button"
            onClick={handleOpen}
            className="text-xs text-foreground/60 hover:text-foreground underline"
          >
            alterar meta
          </button>
        </div>

        <div className="mb-3 flex items-baseline justify-between">
          <p className="font-display text-2xl font-bold tabular-nums">
            {formatMin(todayMinutes)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              / {formatMin(goal)}
            </span>
          </p>
          {visibleStreak > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground"
              title="Dias seguidos batendo a meta"
            >
              <Flame className="h-3 w-3" /> {visibleStreak}
            </span>
          )}
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              reached ? "bg-success" : "bg-primary"
            }`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {reached
            ? "Meta batida! Bom trabalho."
            : `${formatMin(Math.max(0, goal - todayMinutes))} para bater a meta.`}
        </p>
      </section>

      {open && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-background/80 p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm my-8 space-y-4 rounded-3xl rf-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Meta do dia</h2>
              <button onClick={() => setOpen(false)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Quanto tempo você quer estudar hoje? Tudo o que conta em Sessões
              (Pomodoro, cronômetro livre ou registro manual) soma aqui.
            </p>

            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDraftGoal(p)}
                  className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                    draftGoal === p
                      ? "border-primary bg-primary/10 font-semibold"
                      : "border-input hover:bg-muted"
                  }`}
                >
                  {formatMin(p)}
                </button>
              ))}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground/70">
                Ou digite em minutos
              </label>
              <input
                type="number"
                min={5}
                max={600}
                className="w-full rounded-xl border border-input bg-muted px-3 py-2 text-sm"
                value={draftGoal}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setDraftGoal(Number.isFinite(n) ? n : 0);
                }}
              />
            </div>

            {visibleStreak > 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm">
                <Trophy className="h-4 w-4 text-accent" />
                <span>
                  <b>{visibleStreak}</b>{" "}
                  {visibleStreak === 1 ? "dia seguido" : "dias seguidos"} batendo
                  a meta.
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setOpen(false)}
                className="btn-ghost px-4 py-2"
              >
                Cancelar
              </button>
              <button onClick={handleSave} className="btn-sun px-4 py-2">
                <Check className="mr-1 inline h-4 w-4" /> Salvar meta
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}