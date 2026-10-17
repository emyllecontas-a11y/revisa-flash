// src/components/PomodoroCard.tsx
// Pomodoro — Etapa 4: animação no anel e botão de pular ciclo.
// Correção mobile: abas dos modos com flex-wrap e padding menor no celular.

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Square, X, SkipForward } from "lucide-react";
import { usePomodoro, MODE_LABEL, formatClock } from "@/contexts/PomodoroContext";
import type { PomodoroMode } from "@/contexts/PomodoroContext";
import { useActiveSession } from "@/contexts/ActiveSessionContext";
import { PomodoroSettings } from "@/components/PomodoroSettings";
import { MusicPlayer } from "@/components/MusicPlayer";
import { useToast } from "@/hooks/useToast";

const PHRASES = [
  "Um bloco de foco por vez. É assim que a aprovação se constrói.",
  "Comece pequeno, mas comece agora. O ritmo vem depois.",
  "Constância vence intensidade: apareça hoje, mesmo no dia difícil.",
  "Sua atenção é o recurso mais valioso. Proteja estes minutos.",
  "Cada foco concluído é um tijolo a mais na sua aprovação.",
  "Você não precisa estar motivada. Precisa só começar o timer.",
  "O celular pode esperar. O seu futuro, não.",
  "Foco total agora. O resto do mundo espera.",
  "Estudar um pouco todo dia vale mais do que muito um dia só.",
  "Respire, escolha o tema e mergulhe. Você já sabe fazer isso.",
];

const MODES: PomodoroMode[] = ["focus", "short", "long"];

const MODE_STYLE: Record<PomodoroMode, { stroke: string; bar: string }> = {
  focus: { stroke: "stroke-primary", bar: "bg-primary" },
  short: { stroke: "stroke-success", bar: "bg-success" },
  long: { stroke: "stroke-accent", bar: "bg-accent" },
};

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// ============================================================
// TIMER: abas + anel + frase
// ============================================================
export function PomodoroTimer() {
  const pomo = usePomodoro();
  const toast = useToast();

  const idle = pomo.status === "idle";
  const style = MODE_STYLE[pomo.mode];
  const progress =
    pomo.totalSeconds > 0 ? Math.min(1, pomo.remainingSeconds / pomo.totalSeconds) : 0;

  const [phraseIdx, setPhraseIdx] = useState(() =>
    Math.floor(Math.random() * PHRASES.length)
  );
  const mountedAt = useRef(Date.now());
  const handledEvent = useRef(0);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const e = pomo.lastEvent;
    if (!e || e.id === handledEvent.current) return;
    handledEvent.current = e.id;
    if (e.at < mountedAt.current) return;

    if (e.kind === "focus-saved") {
      toast.success(`Foco concluído! ${e.minutes} min salvos no histórico.`);
      setPulse(true);
    } else if (e.kind === "focus-save-failed") {
      toast.error("Não foi possível salvar o foco.", {
        description: `Foram ${e.minutes} min de estudo. Registre como sessão manual para não perder.`,
      });
    } else {
      toast.success("Pausa terminada. Hora de focar!");
    }
    setPhraseIdx((i) => (i + 1) % PHRASES.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomo.lastEvent]);

  // A animação de pulso dura 1.5s.
  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 1500);
    return () => clearTimeout(t);
  }, [pulse]);

  const pillText =
    pomo.status === "running"
      ? "Em andamento"
      : pomo.status === "paused"
      ? "Pausado"
      : `Sessão de ${MODE_LABEL[pomo.mode]}`;

  return (
    <div className="min-w-0">
      {/* Topo: música (esquerda) + ajustes (direita) */}
      <div className="mb-2 flex justify-between gap-2">
        <MusicPlayer />
        <PomodoroSettings />
      </div>

      {/* Abas dos 3 modos */}
      {/* MUDANÇA: flex-wrap + px-2 no mobile (px-3 a partir de sm) para as abas não passarem da tela */}
      <div className="mb-5 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 sm:gap-x-4">
        {MODES.map((m) => {
          const active = pomo.mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => pomo.selectMode(m)}
              disabled={!idle && !active}
              className={`relative px-2 py-2 text-sm transition-colors disabled:cursor-not-allowed sm:px-3 ${
                active
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground disabled:opacity-50"
              }`}
            >
              {MODE_LABEL[m]}
              <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                {pomo.counters[m]}
              </span>
              {active && (
                <span
                  className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full ${MODE_STYLE[m].bar}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Anel de progresso (com animação de pulso ao concluir um foco) */}
      <div
        className={`relative mx-auto aspect-square w-60 max-w-full sm:w-72 transition-transform duration-500 ${
          pulse ? "scale-105" : "scale-100"
        }`}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="3.5"
            className="stroke-muted"
          />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            className={`${style.stroke} transition-[stroke-dashoffset] duration-500 ease-linear ${
              pulse ? "drop-shadow-[0_0_12px_currentColor]" : ""
            }`}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <p className="font-display text-5xl font-bold tabular-nums sm:text-6xl">
            {formatClock(pomo.remainingSeconds)}
          </p>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${style.bar}`} />
            {pillText}
          </span>
        </div>
      </div>

      {/* Frase motivacional */}
      <p className="mx-auto mb-5 mt-6 max-w-md text-center text-sm italic text-muted-foreground">
        {PHRASES[phraseIdx]}
      </p>
    </div>
  );
}

// ============================================================
// CONTROLES: tipo de estudo + botões + janela de encerrar foco
// ============================================================
export function PomodoroControls() {
  const pomo = usePomodoro();
  const session = useActiveSession();
  const toast = useToast();

  const [stopOpen, setStopOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const pausedByModal = useRef(false);

  const idle = pomo.status === "idle";
  const running = pomo.status === "running";
  const paused = pomo.status === "paused";
  const isFocus = pomo.mode === "focus";

  const focusedMin = Math.round(pomo.focusedSeconds / 60);
  const canSave = focusedMin >= 1;

  useEffect(() => {
    if (stopOpen && pomo.status === "idle") {
      pausedByModal.current = false;
      setStopOpen(false);
    }
  }, [stopOpen, pomo.status]);

  const handleStart = () => {
    if (session.status !== "idle") {
      toast.error("Finalize ou cancele o cronômetro livre antes de iniciar o Pomodoro.");
      return;
    }
    if (isFocus && !session.discipline.trim()) {
      toast.error("Escolha uma disciplina antes de iniciar.");
      return;
    }
    pomo.start({
      discipline: session.discipline,
      topic: session.topic,
      link: session.link,
    });
  };

  const handleStopClick = () => {
    if (!isFocus) {
      pomo.cancel();
      return;
    }
    if (running) {
      pomo.pause();
      pausedByModal.current = true;
    } else {
      pausedByModal.current = false;
    }
    setStopOpen(true);
  };

  // Pular o ciclo atual (não conta nem salva).
  const handleSkip = () => {
    pomo.skipCycle();
    toast.success(
      isFocus ? "Foco pulado. Indo para a pausa." : "Pausa pulada. Indo para o foco."
    );
  };

  const closeModal = () => {
    if (stopping) return;
    setStopOpen(false);
    if (pausedByModal.current) {
      pausedByModal.current = false;
      pomo.resume();
    }
  };

  const handleSaveAndStop = async () => {
    setStopping(true);
    try {
      const minutes = focusedMin;
      await pomo.stopFocus(true);
      pausedByModal.current = false;
      setStopOpen(false);
      toast.success(`Foco salvo: ${minutes} min.`);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível salvar o foco.", {
        description: "Tente novamente. O tempo continua guardado.",
      });
    } finally {
      setStopping(false);
    }
  };

  const handleDiscard = async () => {
    setStopping(true);
    try {
      await pomo.stopFocus(false);
      pausedByModal.current = false;
      setStopOpen(false);
      toast.success("Foco descartado.");
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="min-w-0">
      {isFocus && (
        <div className="mx-auto mb-5 w-full max-w-xs">
          <p className="mb-1 text-center text-xs font-medium text-foreground/70">
            Tipo de estudo
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!idle}
              onClick={() => pomo.setStudyType("teorico")}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm disabled:opacity-60 ${
                pomo.studyType === "teorico"
                  ? "border-primary bg-primary/10 font-semibold"
                  : "border-input"
              }`}
            >
              Teórico
            </button>
            <button
              type="button"
              disabled={!idle}
              onClick={() => pomo.setStudyType("pratico")}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm disabled:opacity-60 ${
                pomo.studyType === "pratico"
                  ? "border-primary bg-primary/10 font-semibold"
                  : "border-input"
              }`}
            >
              Prático
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {idle && (
          <button
            onClick={handleStart}
            className="btn-sun flex items-center gap-1.5 px-5 py-2.5"
          >
            <Play className="h-4 w-4" /> Começar
          </button>
        )}
        {running && (
          <button
            onClick={() => pomo.pause()}
            className="btn-sun flex items-center gap-1.5 px-5 py-2.5"
          >
            <Pause className="h-4 w-4" /> Pausar
          </button>
        )}
        {paused && (
          <button
            onClick={() => pomo.resume()}
            className="btn-sun flex items-center gap-1.5 px-5 py-2.5"
          >
            <Play className="h-4 w-4" /> Continuar
          </button>
        )}
        {!idle && (
          <>
            <button
              onClick={handleSkip}
              className="btn-ghost flex items-center gap-1.5 px-5 py-2.5"
              title="Pular este ciclo sem salvar"
            >
              <SkipForward className="h-4 w-4" /> Pular
            </button>
            <button
              onClick={handleStopClick}
              className="btn-ghost flex items-center gap-1.5 px-5 py-2.5"
            >
              <Square className="h-4 w-4" /> Parar
            </button>
          </>
        )}
      </div>

      {stopOpen && (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-background/80 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md space-y-3 rounded-3xl rf-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Encerrar o foco?</h2>
              <button onClick={closeModal} disabled={stopping} aria-label="Voltar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1 rounded-2xl bg-muted p-3 text-sm">
              <p>
                <b>Tempo focado:</b> {formatClock(pomo.focusedSeconds)}
              </p>
              <p>
                <b>Disciplina:</b> {session.discipline || "—"}
              </p>
              {session.topic.trim() && (
                <p>
                  <b>Conteúdo:</b> {session.topic}
                </p>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              {canSave
                ? `Quer salvar ${focusedMin} min no histórico?`
                : "Menos de 1 minuto de foco: não há nada para salvar."}
            </p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                onClick={closeModal}
                disabled={stopping}
                className="btn-ghost flex-1 py-2.5"
              >
                Voltar
              </button>
              <button
                onClick={handleDiscard}
                disabled={stopping}
                className="btn-ghost flex-1 py-2.5"
              >
                Descartar
              </button>
              {canSave && (
                <button
                  onClick={handleSaveAndStop}
                  disabled={stopping}
                  className="btn-sun flex-1 py-2.5"
                >
                  {stopping ? "Salvando…" : `Salvar ${focusedMin} min`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}