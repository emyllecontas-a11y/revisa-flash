// src/lib/pomodoroAlarm.ts
// Sons do alarme do Pomodoro — feitos com a Web Audio API do próprio navegador.
// Sem arquivos de áudio, sem bibliotecas novas, funciona offline.
//
// - unlockAudio()          -> libera o som no primeiro toque (obrigatório no iPhone)
// - playAlarm(som, volume) -> toca o alarme escolhido, no volume (0 a 100)
//
// Fade-in suave no começo e queda natural no fim, para não soar "seco".

export type AlarmSound = 'sino' | 'carrilhao' | 'digital';

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    try { ctx = new Ctx(); } catch { return null; }
  }
  return ctx;
}

export function unlockAudio(): void {
  const c = getContext();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => { /* silencioso */ });
}

function gainFromVolume(volume: number): number {
  const v = Math.min(100, Math.max(0, volume)) / 100;
  return v * 0.6;
}

interface ToneOpts {
  freq: number;
  startAt: number;
  duration: number;
  volume: number;
  type?: OscillatorType;
  attack?: number;
  hold?: number;   // quanto tempo fica no volume máximo antes de cair
}

function playTone(c: AudioContext, opts: ToneOpts): void {
  const {
    freq, startAt, duration, volume,
    type = 'sine',
    attack = 0.08,           // fade-in suave (80ms)
    hold = duration * 0.25,  // 25% do tempo no máximo
  } = opts;

  const t0 = c.currentTime + startAt;
  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);

  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + attack);
  gain.gain.linearRampToValueAtTime(volume * 0.7, t0 + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + (duration - attack - hold));

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.1);
}

function playSino(c: AudioContext, vol: number): void {
  playTone(c, { freq: 880,  startAt: 0, duration: 1.4, volume: vol,        type: 'sine' });
  playTone(c, { freq: 1320, startAt: 0, duration: 1.0, volume: vol * 0.4,  type: 'sine' });
  playTone(c, { freq: 1760, startAt: 0, duration: 0.6, volume: vol * 0.2,  type: 'sine' });
}

function playCarrilhao(c: AudioContext, vol: number): void {
  playTone(c, { freq: 523.25, startAt: 0,   duration: 1.6, volume: vol,        type: 'sine' });
  playTone(c, { freq: 392,    startAt: 0,   duration: 1.6, volume: vol * 0.5,  type: 'sine' });
  playTone(c, { freq: 523.25, startAt: 0.6, duration: 1.6, volume: vol * 0.8,  type: 'sine' });
  playTone(c, { freq: 392,    startAt: 0.6, duration: 1.6, volume: vol * 0.4,  type: 'sine' });
}

function playDigital(c: AudioContext, vol: number): void {
  for (let i = 0; i < 3; i++) {
    playTone(c, {
      freq: 1200,
      startAt: i * 0.20,
      duration: 0.14,
      volume: vol,
      type: 'square',
      attack: 0.01,
      hold: 0.05,
    });
  }
}

export function playAlarm(sound: AlarmSound, volume: number): void {
  const c = getContext();
  if (!c) return;

  if (c.state === 'suspended') c.resume().catch(() => { /* silencioso */ });

  const vol = gainFromVolume(volume);
  if (vol <= 0) return;

  try {
    if (sound === 'carrilhao') playCarrilhao(c, vol);
    else if (sound === 'digital') playDigital(c, vol);
    else playSino(c, vol);
  } catch (err) {
    console.warn('⚠️ [Pomodoro] Falha ao tocar o alarme:', err);
  }
}