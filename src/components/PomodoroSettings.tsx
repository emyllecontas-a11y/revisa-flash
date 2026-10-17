// src/components/PomodoroSettings.tsx
// Ajustes do Pomodoro: durações, início automático, alarme e notificação.
// O botão de engrenagem fica no canto superior direito do timer.

import { useEffect, useState } from "react";
import { Settings, X, Play, RotateCcw } from "lucide-react";
import { usePomodoro } from "@/contexts/PomodoroContext";
import type {
  PomodoroSettings as PomodoroSettingsType,
  AlarmSound,
} from "@/contexts/PomodoroContext";
import { playAlarm, unlockAudio } from "@/lib/pomodoroAlarm";
import {
  notificationsSupported,
  notificationPermission,
  requestNotificationPermission,
} from "@/lib/notifications";
import { useToast } from "@/hooks/useToast";

const DEFAULTS: PomodoroSettingsType = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  autoStartBreaks: false,
  autoStartFocus: false,
  alarmOn: true,
  alarmSound: "sino",
  volume: 70,
  browserNotify: true,
};

const MIN_MIN = 1;
const MAX_MIN = 180;

const SOUND_OPTIONS: { value: AlarmSound; label: string }[] = [
  { value: "sino", label: "Sino" },
  { value: "carrilhao", label: "Carrilhão" },
  { value: "digital", label: "Digital" },
];

const field =
  "w-full rounded-xl border border-input bg-muted px-3 py-2 text-sm";

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="flex w-full items-start justify-between gap-3 rounded-xl bg-muted p-3 text-left transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-60"
      aria-pressed={checked}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <span
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-border"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function DurationInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-foreground/70">
        {label}
      </label>
      <input
        type="number"
        min={MIN_MIN}
        max={MAX_MIN}
        className={field}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(Number.isFinite(n) ? n : MIN_MIN);
        }}
      />
      <p className="mt-0.5 text-[10px] text-foreground/50">min</p>
    </div>
  );
}

export function PomodoroSettings() {
  const pomo = usePomodoro();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PomodoroSettingsType>(pomo.settings);
  const [permission, setPermission] = useState(() => notificationPermission());

  useEffect(() => {
    if (open) setDraft(pomo.settings);
  }, [open, pomo.settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const update = (patch: Partial<PomodoroSettingsType>) => {
    setDraft((d) => ({ ...d, ...patch }));
  };

  const handleTest = () => {
    unlockAudio();
    playAlarm(draft.alarmSound, draft.volume);
  };

  // Ligar/desligar a notificação. Se for ligar, pede permissão.
  const handleToggleNotify = async (v: boolean) => {
    if (!v) {
      update({ browserNotify: false });
      return;
    }
    if (!notificationsSupported()) {
      toast.error("Seu navegador não suporta notificações.");
      return;
    }
    const ok = await requestNotificationPermission();
    setPermission(notificationPermission());
    if (!ok) {
      toast.error("Permissão de notificação negada.", {
        description: "Você pode liberar nas configurações do navegador.",
      });
      return;
    }
    update({ browserNotify: true });
  };

  const handleSave = () => {
    const clamped: PomodoroSettingsType = {
      ...draft,
      focusMin: clamp(draft.focusMin, MIN_MIN, MAX_MIN),
      shortMin: clamp(draft.shortMin, MIN_MIN, MAX_MIN),
      longMin: clamp(draft.longMin, MIN_MIN, MAX_MIN),
      volume: clamp(draft.volume, 0, 100),
    };
    pomo.updateSettings(clamped);
    toast.success("Ajustes do Pomodoro salvos.");
    setOpen(false);
  };

  const notifyDisabled =
    !notificationsSupported() || permission === "denied";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid h-9 w-9 place-items-center rounded-full text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Ajustes do Pomodoro"
        title="Ajustes do Pomodoro"
      >
        <Settings className="h-4 w-4" />
      </button>

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
              <h2 className="font-display text-lg font-bold">
                Ajustes do Pomodoro
              </h2>
              <button onClick={() => setOpen(false)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Durações
              </p>
              <div className="grid grid-cols-3 gap-2">
                <DurationInput
                  label="Foco"
                  value={draft.focusMin}
                  onChange={(v) => update({ focusMin: v })}
                />
                <DurationInput
                  label="Pausa curta"
                  value={draft.shortMin}
                  onChange={(v) => update({ shortMin: v })}
                />
                <DurationInput
                  label="Pausa longa"
                  value={draft.longMin}
                  onChange={(v) => update({ longMin: v })}
                />
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Início automático
              </p>
              <Toggle
                checked={draft.autoStartBreaks}
                onChange={(v) => update({ autoStartBreaks: v })}
                label="Começar a pausa sozinho"
                description="Depois que o foco termina."
              />
              <Toggle
                checked={draft.autoStartFocus}
                onChange={(v) => update({ autoStartFocus: v })}
                label="Começar o foco sozinho"
                description="Depois que a pausa termina. Só funciona se houver disciplina escolhida."
              />
            </section>

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Alarme
              </p>
              <Toggle
                checked={draft.alarmOn}
                onChange={(v) => update({ alarmOn: v })}
                label="Tocar alarme ao fim do ciclo"
              />

              {draft.alarmOn && (
                <>
                  <div>
                    <p className="mb-1 text-xs font-medium text-foreground/70">
                      Som
                    </p>
                    <div className="flex gap-1 rounded-xl bg-muted p-1">
                      {SOUND_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => update({ alarmSound: opt.value })}
                          className={`flex-1 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                            draft.alarmSound === opt.value
                              ? "bg-primary font-semibold text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-medium text-foreground/70">
                        Volume: {draft.volume}%
                      </p>
                      <button
                        type="button"
                        onClick={handleTest}
                        className="inline-flex items-center gap-1 text-xs text-foreground/70 hover:text-foreground"
                      >
                        <Play className="h-3 w-3" /> Testar som
                      </button>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={draft.volume}
                      onChange={(e) =>
                        update({ volume: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-[var(--primary)]"
                    />
                  </div>
                </>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notificação
              </p>
              <Toggle
                checked={draft.browserNotify && !notifyDisabled}
                onChange={handleToggleNotify}
                disabled={notifyDisabled}
                label="Notificação do navegador"
                description={
                  notifyDisabled
                    ? permission === "denied"
                      ? "Permissão bloqueada pelo navegador."
                      : "Seu navegador não suporta."
                    : "Avisa quando o ciclo termina e você está em outra aba."
                }
              />
            </section>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDraft(DEFAULTS)}
                className="inline-flex items-center gap-1 text-xs text-foreground/60 hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Restaurar padrão
              </button>
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

            <p className="text-xs text-muted-foreground">
              Mudanças nas durações só valem a partir do próximo ciclo. O ciclo
              em andamento continua.
            </p>
          </div>
        </div>
      )}
    </>
  );
}