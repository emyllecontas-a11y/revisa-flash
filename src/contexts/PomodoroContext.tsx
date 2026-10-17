// src/contexts/PomodoroContext.tsx
// Pomodoro (timer de foco) — Etapa 3 (notificação + pular ciclo).
// "Cérebro" do Pomodoro: fica fora da tela de Sessões, por isso o timer
// continua contando quando você troca de aba ou de página do app.
//
// Como funciona:
// - O tempo é calculado por HORÁRIO (endsAt), não por contador.
// - Salva no localStorage por usuário (ajustes, contadores e timer).
// - Se o navegador ficou fechado (mais de 2 min sem batimento), pausa sozinho.
// - Quando um FOCO termina, salva 1 registro no histórico via addRecord.
// - As PAUSAS não são salvas.
// - Ao fim de qualquer ciclo: toca o alarme e (se a aba estiver escondida)
//   dispara uma notificação do navegador.
// - Não mexe em banco, sync ou FSRS: só chama o addRecord que já existe.

import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo, useRef,
} from 'react';
import type { ReactNode } from 'react';
import { useStudy } from './StudyContext';
import type { StudyType } from './StudyContext';
import { unlockAudio, playAlarm } from '@/lib/pomodoroAlarm';
import type { AlarmSound } from '@/lib/pomodoroAlarm';
import { notify } from '@/lib/notifications';

export type { AlarmSound };
export type PomodoroMode = 'focus' | 'short' | 'long';
export type PomodoroStatus = 'idle' | 'running' | 'paused';

export interface PomodoroSettings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  alarmOn: boolean;
  alarmSound: AlarmSound;
  volume: number;
  browserNotify: boolean;   // NOVO: notificação do navegador
}

interface PomodoroCounters {
  date: string;
  focus: number;
  short: number;
  long: number;
}

export type PomodoroEventKind = 'focus-saved' | 'focus-save-failed' | 'break-done';

export interface PomodoroEvent {
  id: number;
  at: number;
  kind: PomodoroEventKind;
  mode: PomodoroMode;
  minutes: number;
}

export interface PomodoroStartInfo {
  discipline: string;
  topic: string;
  link: string;
}

interface PomodoroState {
  mode: PomodoroMode;
  status: PomodoroStatus;
  endsAt: number | null;
  remainingSeconds: number;
  totalSeconds: number;
  startedAtWallClock: number | null;
  discipline: string;
  topic: string;
  link: string;
  studyType: StudyType;
  settings: PomodoroSettings;
  counters: PomodoroCounters;
  lastHeartbeat: number;
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  autoStartBreaks: false,
  autoStartFocus: false,
  alarmOn: true,
  alarmSound: 'sino',
  volume: 70,
  browserNotify: true,
};
const MIN_DURATION = 1;
const MAX_DURATION = 180;
const CYCLES_UNTIL_LONG = 4;
const AUTO_PAUSE_THRESHOLD_MS = 2 * 60 * 1000;

export const MODE_LABEL: Record<PomodoroMode, string> = {
  focus: 'Foco',
  short: 'Pausa curta',
  long: 'Pausa longa',
};

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function durationSeconds(settings: PomodoroSettings, mode: PomodoroMode): number {
  const min =
    mode === 'focus' ? settings.focusMin : mode === 'short' ? settings.shortMin : settings.longMin;
  return min * 60;
}

function clampMinutes(v: unknown, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, n));
}

function sanitizeSettings(raw: any): PomodoroSettings {
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const volume =
    typeof raw?.volume === 'number' && Number.isFinite(raw.volume)
      ? Math.min(100, Math.max(0, Math.round(raw.volume)))
      : DEFAULT_SETTINGS.volume;
  const alarmSound: AlarmSound =
    raw?.alarmSound === 'carrilhao' || raw?.alarmSound === 'sino' || raw?.alarmSound === 'digital'
      ? raw.alarmSound
      : DEFAULT_SETTINGS.alarmSound;
  return {
    focusMin: clampMinutes(raw?.focusMin, DEFAULT_SETTINGS.focusMin),
    shortMin: clampMinutes(raw?.shortMin, DEFAULT_SETTINGS.shortMin),
    longMin: clampMinutes(raw?.longMin, DEFAULT_SETTINGS.longMin),
    autoStartBreaks: bool(raw?.autoStartBreaks, DEFAULT_SETTINGS.autoStartBreaks),
    autoStartFocus: bool(raw?.autoStartFocus, DEFAULT_SETTINGS.autoStartFocus),
    alarmOn: bool(raw?.alarmOn, DEFAULT_SETTINGS.alarmOn),
    alarmSound,
    volume,
    browserNotify: bool(raw?.browserNotify, DEFAULT_SETTINGS.browserNotify),
  };
}

function emptyCounters(date: string): PomodoroCounters {
  return { date, focus: 0, short: 0, long: 0 };
}

function sanitizeCounters(raw: any): PomodoroCounters {
  const count = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  return {
    date: typeof raw?.date === 'string' ? raw.date : localDateStr(new Date()),
    focus: count(raw?.focus),
    short: count(raw?.short),
    long: count(raw?.long),
  };
}

function isMode(v: unknown): v is PomodoroMode {
  return v === 'focus' || v === 'short' || v === 'long';
}

function isStatus(v: unknown): v is PomodoroStatus {
  return v === 'idle' || v === 'running' || v === 'paused';
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function makeInitialState(): PomodoroState {
  const settings = { ...DEFAULT_SETTINGS };
  const total = durationSeconds(settings, 'focus');
  return {
    mode: 'focus',
    status: 'idle',
    endsAt: null,
    remainingSeconds: total,
    totalSeconds: total,
    startedAtWallClock: null,
    discipline: '',
    topic: '',
    link: 'Sem vínculo',
    studyType: 'teorico',
    settings,
    counters: emptyCounters(localDateStr(new Date())),
    lastHeartbeat: 0,
  };
}

function computeRemaining(s: PomodoroState, nowTs: number): number {
  if (s.status === 'running' && s.endsAt) {
    const rem = Math.ceil((s.endsAt - nowTs) / 1000);
    return Math.min(s.totalSeconds, Math.max(0, rem));
  }
  return s.remainingSeconds;
}

function resetToIdle(p: PomodoroState): PomodoroState {
  const total = durationSeconds(p.settings, p.mode);
  return {
    ...p,
    status: 'idle',
    endsAt: null,
    remainingSeconds: total,
    totalSeconds: total,
    startedAtWallClock: null,
  };
}

function startCycle(p: PomodoroState, t: number, info?: PomodoroStartInfo): PomodoroState {
  const total = durationSeconds(p.settings, p.mode);
  const useInfo = p.mode === 'focus' && info;
  return {
    ...p,
    status: 'running',
    endsAt: t + total * 1000,
    remainingSeconds: total,
    totalSeconds: total,
    startedAtWallClock: t,
    lastHeartbeat: t,
    discipline: useInfo ? info.discipline : p.discipline,
    topic: useInfo ? info.topic : p.topic,
    link: useInfo ? (info.link || 'Sem vínculo') : p.link,
  };
}

function afterCycle(prev: PomodoroState, nowTs: number): PomodoroState {
  const today = localDateStr(new Date(nowTs));
  const counters: PomodoroCounters =
    prev.counters.date === today ? { ...prev.counters } : emptyCounters(today);
  counters[prev.mode] += 1;

  let nextMode: PomodoroMode = 'focus';
  if (prev.mode === 'focus') {
    nextMode = counters.focus % CYCLES_UNTIL_LONG === 0 ? 'long' : 'short';
  }
  return resetToIdle({ ...prev, mode: nextMode, counters });
}

function maybeAutoStart(p: PomodoroState, t: number): PomodoroState {
  if (p.mode === 'focus') {
    if (p.settings.autoStartFocus && p.discipline.trim() !== '') return startCycle(p, t);
    return p;
  }
  return p.settings.autoStartBreaks ? startCycle(p, t) : p;
}

function storageKey(userId: string | null): string | null {
  return userId ? `revisaflash_pomodoro_${userId}` : null;
}

function loadState(userId: string | null): PomodoroState {
  const fresh = makeInitialState();
  const key = storageKey(userId);
  if (!key) return fresh;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fresh;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return fresh;

    const settings = sanitizeSettings(p.settings);
    const mode: PomodoroMode = isMode(p.mode) ? p.mode : 'focus';
    const full = durationSeconds(settings, mode);

    let status: PomodoroStatus = isStatus(p.status) ? p.status : 'idle';
    let totalSeconds = Math.max(1, Math.round(numOr(p.totalSeconds, full)));
    let remainingSeconds = Math.min(
      totalSeconds,
      Math.max(0, Math.round(numOr(p.remainingSeconds, totalSeconds)))
    );
    let endsAt: number | null =
      typeof p.endsAt === 'number' && Number.isFinite(p.endsAt) ? p.endsAt : null;
    const lastHeartbeat = numOr(p.lastHeartbeat, 0);

    if (status === 'running') {
      if (!endsAt) {
        status = 'idle';
      } else {
        const t = Date.now();
        const gap = lastHeartbeat ? t - lastHeartbeat : Infinity;
        if (gap > AUTO_PAUSE_THRESHOLD_MS) {
          const ref = lastHeartbeat || t;
          remainingSeconds = Math.min(
            totalSeconds,
            Math.max(0, Math.ceil((endsAt - ref) / 1000))
          );
          status = 'paused';
          endsAt = null;
        }
      }
    }
    if (status === 'paused') endsAt = null;
    if (status === 'idle') {
      totalSeconds = full;
      remainingSeconds = full;
      endsAt = null;
    }

    return {
      mode,
      status,
      endsAt,
      remainingSeconds,
      totalSeconds,
      startedAtWallClock:
        status === 'idle' ? null : (typeof p.startedAtWallClock === 'number' ? p.startedAtWallClock : null),
      discipline: typeof p.discipline === 'string' ? p.discipline : '',
      topic: typeof p.topic === 'string' ? p.topic : '',
      link: typeof p.link === 'string' && p.link ? p.link : 'Sem vínculo',
      studyType: p.studyType === 'pratico' ? 'pratico' : 'teorico',
      settings,
      counters: sanitizeCounters(p.counters),
      lastHeartbeat,
    };
  } catch {
    return fresh;
  }
}

interface PomodoroContextType {
  mode: PomodoroMode;
  status: PomodoroStatus;
  remainingSeconds: number;
  totalSeconds: number;
  focusedSeconds: number;
  settings: PomodoroSettings;
  counters: { focus: number; short: number; long: number };
  studyType: StudyType;
  lastEvent: PomodoroEvent | null;
  selectMode: (mode: PomodoroMode) => void;
  start: (info?: PomodoroStartInfo) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  skipCycle: () => void;   // NOVO
  stopFocus: (save: boolean) => Promise<void>;
  setStudyType: (t: StudyType) => void;
  setTarget: (info: PomodoroStartInfo) => void;
  updateSettings: (partial: Partial<PomodoroSettings>) => void;
  resetCounters: () => void;
}

const PomodoroContext = createContext<PomodoroContextType | undefined>(undefined);

export const PomodoroProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { addRecord } = useStudy();
  const [userId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('revisaflash_user_id') : null
  );
  const [state, setState] = useState<PomodoroState>(() => loadState(userId));
  const [now, setNow] = useState<number>(() => Date.now());
  const [lastEvent, setLastEvent] = useState<PomodoroEvent | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const completingRef = useRef(false);
  const eventSeqRef = useRef(0);
  const baseTitleRef = useRef('');

  useEffect(() => {
    const key = storageKey(userId);
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state, userId]);

  useEffect(() => {
    const onFirstTouch = () => unlockAudio();
    document.addEventListener('pointerdown', onFirstTouch, { once: true });
    return () => document.removeEventListener('pointerdown', onFirstTouch);
  }, []);

  useEffect(() => {
    if (state.status !== 'running') return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [state.status]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (state.status !== 'running') return;
    const id = setInterval(() => {
      setState(prev => ({ ...prev, lastHeartbeat: Date.now() }));
    }, 30_000);
    return () => clearInterval(id);
  }, [state.status]);

  const remainingSeconds = useMemo(() => computeRemaining(state, now), [state, now]);

  useEffect(() => {
    if (state.status !== 'running') return;
    baseTitleRef.current = document.title;
    return () => { document.title = baseTitleRef.current; };
  }, [state.status]);

  useEffect(() => {
    if (state.status !== 'running') return;
    document.title = `${formatClock(remainingSeconds)} · ${MODE_LABEL[state.mode]}`;
  }, [state.status, state.mode, remainingSeconds]);

  const finishCycle = useCallback(async () => {
    if (completingRef.current) return;
    const s = stateRef.current;
    if (s.status !== 'running') return;
    completingRef.current = true;

    if (s.settings.alarmOn) playAlarm(s.settings.alarmSound, s.settings.volume);

    let kind: PomodoroEventKind = 'break-done';
    const minutes = Math.max(1, Math.round(s.totalSeconds / 60));

    // Notificação do navegador quando a aba está escondida.
    if (s.settings.browserNotify && document.visibilityState === 'hidden') {
      if (s.mode === 'focus') {
        notify('Foco concluído! 🎯', `${minutes} min salvos no histórico.`);
      } else {
        notify('Pausa terminada', 'Hora de voltar ao foco.');
      }
    }

    try {
      if (s.mode === 'focus') {
        try {
          await addRecord({
            date: localDateStr(new Date(s.startedAtWallClock ?? Date.now())),
            type: s.studyType,
            discipline: s.discipline.trim() || 'Sem disciplina',
            topic: s.topic || '',
            duration: minutes,
            source: s.link || undefined,
            observations: 'Pomodoro',
          });
          kind = 'focus-saved';
        } catch (err) {
          console.error('❌ [Pomodoro] Erro ao salvar o foco:', err);
          kind = 'focus-save-failed';
        }
      }
      const t = Date.now();
      setState(prev => maybeAutoStart(afterCycle(prev, t), t));
      eventSeqRef.current += 1;
      setLastEvent({ id: eventSeqRef.current, at: t, kind, mode: s.mode, minutes });
    } finally {
      completingRef.current = false;
    }
  }, [addRecord]);

  useEffect(() => {
    if (state.status === 'running' && remainingSeconds <= 0) {
      void finishCycle();
    }
  }, [state.status, remainingSeconds, finishCycle]);

  const selectMode = useCallback((mode: PomodoroMode) => {
    setState(prev => {
      if (prev.status !== 'idle' || prev.mode === mode) return prev;
      return resetToIdle({ ...prev, mode });
    });
  }, []);

  const start = useCallback((info?: PomodoroStartInfo) => {
    unlockAudio();
    setState(prev => {
      if (prev.status !== 'idle') return prev;
      return startCycle(prev, Date.now(), info);
    });
  }, []);

  const pause = useCallback(() => {
    setState(prev => {
      if (prev.status !== 'running') return prev;
      const t = Date.now();
      return {
        ...prev,
        status: 'paused',
        endsAt: null,
        remainingSeconds: computeRemaining(prev, t),
        lastHeartbeat: t,
      };
    });
  }, []);

  const resume = useCallback(() => {
    unlockAudio();
    setState(prev => {
      if (prev.status !== 'paused') return prev;
      const t = Date.now();
      return {
        ...prev,
        status: 'running',
        endsAt: t + prev.remainingSeconds * 1000,
        lastHeartbeat: t,
      };
    });
  }, []);

  const cancel = useCallback(() => {
    setState(prev => resetToIdle(prev));
  }, []);

  // NOVO: pula o ciclo atual sem contar nem salvar. Foco→pausa, pausa→foco.
  const skipCycle = useCallback(() => {
    setState(prev => {
      if (prev.status === 'idle') return prev;
      const nextMode: PomodoroMode = prev.mode === 'focus' ? 'short' : 'focus';
      return resetToIdle({ ...prev, mode: nextMode });
    });
  }, []);

  const stopFocus = useCallback(async (save: boolean) => {
    const s = stateRef.current;
    if (s.status === 'idle') return;
    if (s.mode === 'focus' && save) {
      const remaining = computeRemaining(s, Date.now());
      const elapsed = Math.max(0, s.totalSeconds - remaining);
      const minutes = Math.round(elapsed / 60);
      if (minutes >= 1) {
        await addRecord({
          date: localDateStr(new Date(s.startedAtWallClock ?? Date.now())),
          type: s.studyType,
          discipline: s.discipline.trim() || 'Sem disciplina',
          topic: s.topic || '',
          duration: minutes,
          source: s.link || undefined,
          observations: 'Pomodoro',
        });
      }
    }
    setState(prev => resetToIdle(prev));
  }, [addRecord]);

  const setStudyType = useCallback((t: StudyType) => {
    setState(prev => ({ ...prev, studyType: t }));
  }, []);

  const setTarget = useCallback((info: PomodoroStartInfo) => {
    setState(prev => {
      if (prev.status !== 'idle' && prev.mode === 'focus') return prev;
      const link = info.link || 'Sem vínculo';
      if (prev.discipline === info.discipline && prev.topic === info.topic && prev.link === link) {
        return prev;
      }
      return { ...prev, discipline: info.discipline, topic: info.topic, link };
    });
  }, []);

  const updateSettings = useCallback((partial: Partial<PomodoroSettings>) => {
    setState(prev => {
      const settings = sanitizeSettings({ ...prev.settings, ...partial });
      const next = { ...prev, settings };
      return prev.status === 'idle' ? resetToIdle(next) : next;
    });
  }, []);

  const resetCounters = useCallback(() => {
    setState(prev => ({ ...prev, counters: emptyCounters(localDateStr(new Date())) }));
  }, []);

  const isToday = state.counters.date === localDateStr(new Date());
  const cFocus = isToday ? state.counters.focus : 0;
  const cShort = isToday ? state.counters.short : 0;
  const cLong = isToday ? state.counters.long : 0;
  const focusedSeconds =
    state.status === 'idle' ? 0 : Math.max(0, state.totalSeconds - remainingSeconds);

  const value = useMemo<PomodoroContextType>(() => ({
    mode: state.mode,
    status: state.status,
    remainingSeconds,
    totalSeconds: state.totalSeconds,
    focusedSeconds,
    settings: state.settings,
    counters: { focus: cFocus, short: cShort, long: cLong },
    studyType: state.studyType,
    lastEvent,
    selectMode,
    start,
    pause,
    resume,
    cancel,
    skipCycle,
    stopFocus,
    setStudyType,
    setTarget,
    updateSettings,
    resetCounters,
  }), [
    state.mode, state.status, remainingSeconds, state.totalSeconds, focusedSeconds,
    state.settings, cFocus, cShort, cLong, state.studyType, lastEvent,
    selectMode, start, pause, resume, cancel, skipCycle, stopFocus, setStudyType,
    setTarget, updateSettings, resetCounters,
  ]);

  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>;
};

export const usePomodoro = () => {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error('usePomodoro deve ser usado dentro de PomodoroProvider');
  return ctx;
};