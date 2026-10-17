// src/contexts/MusicContext.tsx
// "Cérebro" da música do Pomodoro. Vive no topo do app (fora do roteador),
// então a música continua tocando quando você troca de aba/página.
//
// Novidades desta versão:
// - Salva o volume escolhido no localStorage.
// - Fade-out ao pausar e fade-in ao retomar (suave, 400ms).

import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState, useCallback,
} from "react";
import type { ReactNode } from "react";

const STORAGE_KEY = "revisaflash_pomodoro_music";
const VOLUME_KEY = "revisaflash_pomodoro_music_volume";
const FADE_MS = 400;

export type MusicKind = "none" | "youtube" | "audio";

export interface MusicConfig {
  kind: MusicKind;
  url: string;
  label: string;
}

const EMPTY: MusicConfig = { kind: "none", url: "", label: "" };

function load(): MusicConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return EMPTY;
    return {
      kind:
        p.kind === "youtube" || p.kind === "audio" || p.kind === "none"
          ? p.kind
          : "none",
      url: typeof p.url === "string" ? p.url : "",
      label: typeof p.label === "string" ? p.label : "",
    };
  } catch {
    return EMPTY;
  }
}

function save(cfg: MusicConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

function loadVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(n)) return Math.min(100, Math.max(0, n));
  } catch { /* ignore */ }
  return 70;
}

function saveVolume(v: number): void {
  try { localStorage.setItem(VOLUME_KEY, String(v)); } catch { /* ignore */ }
}

export function detectKind(url: string): MusicKind {
  const u = url.trim();
  if (!u) return "none";
  if (/youtu\.?be/.test(u)) return "youtube";
  if (/^[a-zA-Z0-9_-]{11}$/.test(u)) return "youtube";
  if (/\.(mp3|ogg|wav|m4a)(\?|$)/i.test(u)) return "audio";
  if (/^https?:\/\//.test(u)) return "youtube";
  return "none";
}

function youtubeId(url: string): string | null {
  const u = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(u)) return u;
  try {
    const parsed = new URL(u);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.slice(1).split("/")[0] || null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v) return v;
      const parts = parsed.pathname.split("/").filter(Boolean);
      const i = parts.indexOf("embed");
      if (i >= 0 && parts[i + 1]) return parts[i + 1];
    }
  } catch { /* ignore */ }
  return null;
}

function youtubePlaylistId(url: string): string | null {
  try { return new URL(url).searchParams.get("list"); } catch { return null; }
}

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<any> | null = null;

function loadYouTubeApi(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("sem window"));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error("YT não disponível"));
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    tag.onerror = () => reject(new Error("falha ao carregar YouTube API"));
    document.head.appendChild(tag);
  });

  return ytApiPromise;
}

interface MusicContextType {
  config: MusicConfig;
  hasMusic: boolean;
  playing: boolean;
  volume: number;
  playingDetectedKind: MusicKind;
  setConfig: (cfg: MusicConfig) => void;
  setPlaying: (v: boolean) => void;
  togglePlay: () => void;
  setVolume: (v: number) => void;
  clear: () => void;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

export const MusicProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [config, setConfigState] = useState<MusicConfig>(() => load());
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState<number>(() => loadVolume());
  const [ytReady, setYtReady] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const currentVolRef = useRef<number>(volume); // para fades

  const hasMusic = config.kind !== "none" && config.url.trim() !== "";

  const ytId = useMemo(
    () => (config.kind === "youtube" ? youtubeId(config.url) : null),
    [config]
  );
  const ytList = useMemo(
    () => (config.kind === "youtube" ? youtubePlaylistId(config.url) : null),
    [config]
  );

  useEffect(() => { save(config); }, [config]);
  useEffect(() => { saveVolume(volume); }, [volume]);

  // ---------- Controle de volume unificado ----------
  const applyVolume = useCallback((v: number) => {
    const vol = Math.min(100, Math.max(0, v));
    // <audio>
    if (audioRef.current) {
      try { audioRef.current.volume = vol / 100; } catch { /* ignore */ }
    }
    // YouTube
    const p = ytPlayerRef.current;
    if (p && typeof p.setVolume === "function") {
      try { p.setVolume(vol); } catch { /* ignore */ }
    }
    currentVolRef.current = vol;
  }, []);

  // Aplica volume sempre que mudar (sem fade).
  useEffect(() => {
    if (fadeTimerRef.current != null) return; // durante fade, não sobrepõe
    applyVolume(volume);
  }, [volume, applyVolume]);

  // ---------- Fade in/out ----------
  const fadeTo = useCallback((target: number, onDone?: () => void) => {
    if (fadeTimerRef.current != null) {
      window.clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    const start = currentVolRef.current;
    const steps = 20;
    const dt = FADE_MS / steps;
    let i = 0;
    fadeTimerRef.current = window.setInterval(() => {
      i++;
      const v = start + ((target - start) * i) / steps;
      applyVolume(v);
      if (i >= steps) {
        if (fadeTimerRef.current != null) {
          window.clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = null;
        }
        onDone?.();
      }
    }, dt);
  }, [applyVolume]);

  // ---------- API pública ----------
  const setConfig = useCallback((cfg: MusicConfig) => {
    setConfigState(cfg);
    if (cfg.kind === "none" || !cfg.url.trim()) setPlaying(false);
  }, []);

  const clear = useCallback(() => {
    setConfigState(EMPTY);
    setPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (!hasMusic) return;
    setPlaying((p) => !p);
  }, [hasMusic]);

  const setVolume = useCallback((v: number) => {
    setVolumeState(Math.min(100, Math.max(0, Math.round(v))));
  }, []);

  // ============================================================
  // YOUTUBE: criar/destruir player
  // ============================================================
  useEffect(() => {
    if (config.kind !== "youtube" || !hasMusic) {
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy?.(); } catch { /* ignore */ }
        ytPlayerRef.current = null;
      }
      setYtReady(false);
      return;
    }

    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        const host = ytHostRef.current;
        if (!host) return;

        if (ytPlayerRef.current) {
          try { ytPlayerRef.current.destroy?.(); } catch { /* ignore */ }
          ytPlayerRef.current = null;
        }

        host.innerHTML = "";
        const target = document.createElement("div");
        host.appendChild(target);

        const playerVars: any = {
          autoplay: 1, controls: 0, disablekb: 1, modestbranding: 1,
          rel: 0, playsinline: 1,
        };
        if (ytList) {
          playerVars.listType = "playlist";
          playerVars.list = ytList;
        }

        ytPlayerRef.current = new YT.Player(target, {
          height: "1", width: "1",
          videoId: ytList ? undefined : ytId || undefined,
          playerVars,
          events: {
            onReady: (e: any) => {
              if (cancelled) return;
              setYtReady(true);
              try { e.target.setVolume(currentVolRef.current); } catch { /* ignore */ }
              if (playing) {
                try { e.target.playVideo(); } catch { /* ignore */ }
              }
            },
            onStateChange: (e: any) => {
              if (e.data === 1) setPlaying(true);
              else if (e.data === 2) setPlaying(false);
            },
          },
        });
      })
      .catch(() => { /* silencioso */ });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.kind, config.url, ytId, ytList, hasMusic]);

  // Play/pause YouTube com fade
  useEffect(() => {
    if (config.kind !== "youtube" || !ytReady) return;
    const p = ytPlayerRef.current;
    if (!p) return;

    if (playing) {
      fadeTo(volume);
      try { p.playVideo?.(); } catch { /* ignore */ }
    } else {
      const target = 0;
      fadeTo(target, () => {
        try { p.pauseVideo?.(); } catch { /* ignore */ }
        applyVolume(volume); // restaura volume para quando tocar de novo
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, ytReady, config.kind]);

  // ============================================================
  // MP3: sincroniza <audio> com fade
  // ============================================================
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    if (playing) {
      fadeTo(volume);
      el.play().catch(() => { /* autoplay bloqueado */ });
    } else {
      fadeTo(0, () => {
        el.pause();
        applyVolume(volume); // restaura para a próxima vez
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, config.kind, config.url, hasMusic]);

  const value = useMemo<MusicContextType>(
    () => ({
      config,
      hasMusic,
      playing,
      volume,
      playingDetectedKind: config.kind,
      setConfig,
      setPlaying,
      togglePlay,
      setVolume,
      clear,
    }),
    [config, hasMusic, playing, volume, setConfig, togglePlay, setVolume, clear]
  );

  return (
    <MusicContext.Provider value={value}>
      {children}

      {config.kind === "audio" && hasMusic && (
        <audio
          key={config.url}
          ref={audioRef}
          src={config.url}
          loop
          playsInline
          preload="auto"
        />
      )}

      {config.kind === "youtube" && hasMusic && (
        <div
          ref={ytHostRef}
          aria-hidden
          style={{
            position: "fixed",
            width: 1, height: 1,
            left: -10000, top: -10000,
            overflow: "hidden", opacity: 0, pointerEvents: "none",
          }}
        />
      )}
    </MusicContext.Provider>
  );
};

export const useMusic = () => {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error("useMusic deve ser usado dentro de MusicProvider");
  return ctx;
};