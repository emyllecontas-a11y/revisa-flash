// src/contexts/ActiveSessionContext.tsx
// Etapa 5 — Fonte única de verdade para a sessão de estudo em andamento.
// O tempo é calculado por timestamps (startedAt + accumulatedSeconds), não por contador.
// Persiste em localStorage por usuário. Sobrevive a navegação e recarregamento.
// Ao recarregar, se ficou muito tempo sem "batimento" (heartbeat), auto-pausa para
// não contar períodos em que a aba ficou fechada.

import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode, useRef,
} from 'react';
import { useStudy, StudyType } from './StudyContext';

export type SessionStatus = 'idle' | 'running' | 'paused';

interface ActiveSessionState {
  status: SessionStatus;
  startedAt: number | null;          // timestamp do início do segmento atual
  accumulatedSeconds: number;        // segundos acumulados em segmentos anteriores
  startedAtWallClock: number | null; // timestamp do início da sessão (para o "date" do registro)
  discipline: string;
  topic: string;
  link: string;
  lastHeartbeat: number;             // atualizado a cada ~30s enquanto roda
}

const initialState: ActiveSessionState = {
  status: 'idle',
  startedAt: null,
  accumulatedSeconds: 0,
  startedAtWallClock: null,
  discipline: '',
  topic: '',
  link: 'Sem vínculo',
  lastHeartbeat: 0,
};

interface FinalizeOptions {
  type: StudyType;
  observations?: string;
}

interface ActiveSessionContextType {
  status: SessionStatus;
  elapsedSeconds: number;
  discipline: string;
  topic: string;
  link: string;
  setDiscipline: (v: string) => void;
  setTopic: (v: string) => void;
  setLink: (v: string) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  finalize: (opts: FinalizeOptions) => Promise<void>;
}

const ActiveSessionContext = createContext<ActiveSessionContextType | undefined>(undefined);

function storageKey(userId: string | null): string | null {
  return userId ? `revisaflash_active_session_${userId}` : null;
}

function loadState(userId: string | null): ActiveSessionState {
  const key = storageKey(userId);
  if (!key) return initialState;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return initialState;
    return { ...initialState, ...parsed };
  } catch {
    return initialState;
  }
}

const AUTO_PAUSE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutos

export const ActiveSessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { addRecord } = useStudy();
  const [userId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('revisaflash_user_id') : null
  );
  const [state, setState] = useState<ActiveSessionState>(initialState);
  const [now, setNow] = useState<number>(() => Date.now());
  const loadedRef = useRef(false);

  // -------- Carregar do localStorage ao montar --------
  useEffect(() => {
    if (!userId) return;
    const loaded = loadState(userId);
    const current = Date.now();
    const gap = loaded.lastHeartbeat ? current - loaded.lastHeartbeat : Infinity;

    if (loaded.status === 'running' && gap > AUTO_PAUSE_THRESHOLD_MS) {
      // Ficou muito tempo sem heartbeat: assume que ficou fechado. Auto-pausa
      // contabilizando apenas o tempo até o último heartbeat.
      const segment = loaded.startedAt && loaded.lastHeartbeat
        ? Math.max(0, Math.floor((loaded.lastHeartbeat - loaded.startedAt) / 1000))
        : 0;
      setState({
        ...loaded,
        status: 'paused',
        startedAt: null,
        accumulatedSeconds: loaded.accumulatedSeconds + segment,
      });
    } else {
      setState(loaded);
    }
    loadedRef.current = true;
  }, [userId]);

  // -------- Persistir no localStorage a cada mudança --------
  useEffect(() => {
    if (!loadedRef.current) return;
    const key = storageKey(userId);
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch { /* ignore */ }
  }, [state, userId]);

  // -------- Tick de 1s para atualizar o display --------
  useEffect(() => {
    if (state.status !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.status]);

  // -------- Heartbeat a cada 30s (para detectar abas fechadas) --------
  useEffect(() => {
    if (state.status !== 'running') return;
    const id = setInterval(() => {
      setState(prev => ({ ...prev, lastHeartbeat: Date.now() }));
    }, 30_000);
    return () => clearInterval(id);
  }, [state.status]);

  // -------- Tempo decorrido (por timestamps) --------
  const elapsedSeconds = useMemo(() => {
    if (state.status === 'idle') return 0;
    if (state.status === 'paused') return state.accumulatedSeconds;
    const segment = state.startedAt ? Math.floor((now - state.startedAt) / 1000) : 0;
    return state.accumulatedSeconds + Math.max(0, segment);
  }, [state.status, state.startedAt, state.accumulatedSeconds, now]);

  // -------- Ações --------
  const start = useCallback(() => {
    const t = Date.now();
    setState(prev => ({
      ...prev,
      status: 'running',
      startedAt: t,
      accumulatedSeconds: 0,
      startedAtWallClock: t,
      lastHeartbeat: t,
    }));
  }, []);

  const pause = useCallback(() => {
    setState(prev => {
      if (prev.status !== 'running') return prev;
      const t = Date.now();
      const segment = prev.startedAt ? Math.floor((t - prev.startedAt) / 1000) : 0;
      return {
        ...prev,
        status: 'paused',
        startedAt: null,
        accumulatedSeconds: prev.accumulatedSeconds + Math.max(0, segment),
        lastHeartbeat: t,
      };
    });
  }, []);

  const resume = useCallback(() => {
    setState(prev => {
      if (prev.status !== 'paused') return prev;
      const t = Date.now();
      return { ...prev, status: 'running', startedAt: t, lastHeartbeat: t };
    });
  }, []);

  const cancel = useCallback(() => {
    setState(initialState);
  }, []);

  const finalize = useCallback(async ({ type, observations }: FinalizeOptions) => {
    // Calcula o total no momento do finalize.
    let totalSeconds = 0;
    if (state.status === 'paused') {
      totalSeconds = state.accumulatedSeconds;
    } else if (state.status === 'running' && state.startedAt) {
      totalSeconds = state.accumulatedSeconds + Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
    }
    const minutes = Math.max(1, Math.round(totalSeconds / 60)); // mínimo 1 minuto
    const dateSource = state.startedAtWallClock ? new Date(state.startedAtWallClock) : new Date();
    const date = dateSource.toISOString().split('T')[0];

    await addRecord({
      date,
      type,
      discipline: state.discipline || 'Sem disciplina',
      topic: state.topic || '',
      duration: minutes,
      source: state.link || undefined,
      observations: observations || undefined,
    });

    setState(initialState);
  }, [state, addRecord]);

  const setDiscipline = useCallback((v: string) => setState(p => ({ ...p, discipline: v })), []);
  const setTopic = useCallback((v: string) => setState(p => ({ ...p, topic: v })), []);
  const setLink = useCallback((v: string) => setState(p => ({ ...p, link: v })), []);

  const value = useMemo<ActiveSessionContextType>(() => ({
    status: state.status,
    elapsedSeconds,
    discipline: state.discipline,
    topic: state.topic,
    link: state.link,
    setDiscipline,
    setTopic,
    setLink,
    start,
    pause,
    resume,
    cancel,
    finalize,
  }), [state.status, state.discipline, state.topic, state.link, elapsedSeconds,
       setDiscipline, setTopic, setLink, start, pause, resume, cancel, finalize]);

  return (
    <ActiveSessionContext.Provider value={value}>
      {children}
    </ActiveSessionContext.Provider>
  );
};

export const useActiveSession = () => {
  const ctx = useContext(ActiveSessionContext);
  if (!ctx) throw new Error('useActiveSession deve ser usado dentro de ActiveSessionProvider');
  return ctx;
};