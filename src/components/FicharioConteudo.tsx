// src/components/FicharioConteudo.tsx
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeft, BookOpen, Check, Crown, MoreHorizontal, Play, Plus, Share2, Trash2, Trophy,
} from "lucide-react";

// ✅ CORRIGIDO: usa "nao_estudado" (o que o banco já usa) em vez de "nao_iniciado"
export type TopicStatus = "nao_estudado" | "estudando" | "revisado" | "dominado";

export interface FicharioTopic {
  id: string | number;
  title: string;
  status: TopicStatus;
}
export type FicharioColor = "laranja" | "vinho" | "azul" | "verde" | "roxo";

const COLORS: FicharioColor[] = ["laranja", "vinho", "azul", "verde", "roxo"];

export function ficharioColorFor(key: string): FicharioColor {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length] ?? "laranja";
}

const FICHARIO_CSS = `
.rf-fc {
  --fc-cover: oklch(0.62 0.17 45);
  --fc-cover-dark: oklch(0.47 0.15 38);
  --fc-on-cover: oklch(0.98 0.01 70);
  --fc-plate: oklch(0.12 0.03 340 / 0.28);
  --fc-plate-edge: oklch(1 0 0 / 0.16);
  --fc-metal: oklch(0.86 0.01 260);
  --fc-metal-dark: oklch(0.55 0.01 260);
  --fc-tab-1: oklch(0.8 0.12 85);
  --fc-tab-2: oklch(0.72 0.12 160);
  --fc-tab-3: oklch(0.72 0.11 240);
  --fc-tab-4: oklch(0.74 0.13 350);
  --fc-sheet: oklch(0.255 0.045 345);
  --fc-sheet-2: oklch(0.225 0.04 345);
  --fc-line: oklch(1 0 0 / 0.06);
  --fc-margin: oklch(0.68 0.16 22 / 0.35);
  --fc-hole: oklch(0.16 0.035 345);
  --fc-ink: oklch(0.96 0.01 70);
  --fc-ink-soft: oklch(0.74 0.03 340);
  --fc-done: oklch(0.68 0.15 150);
  --fc-done-dark: oklch(0.5 0.13 150);
  --fc-gold: oklch(0.82 0.15 85);
  --fc-gold-dark: oklch(0.63 0.14 70);
  --fc-gold-ink: oklch(0.28 0.05 60);
  --fc-now: oklch(0.72 0.19 50);
  --fc-now-dark: oklch(0.55 0.17 42);
  --fc-todo: oklch(0.36 0.045 345);
  --fc-todo-dark: oklch(0.27 0.04 345);
  --fc-shadow: oklch(0.08 0.03 340 / 0.75);
}
.rf-fc[data-color="vinho"] { --fc-cover: oklch(0.46 0.14 355); --fc-cover-dark: oklch(0.34 0.11 355); }
.rf-fc[data-color="azul"]  { --fc-cover: oklch(0.47 0.1 250);  --fc-cover-dark: oklch(0.35 0.08 252); }
.rf-fc[data-color="verde"] { --fc-cover: oklch(0.5 0.09 170);  --fc-cover-dark: oklch(0.37 0.07 172); }
.rf-fc[data-color="roxo"]  { --fc-cover: oklch(0.47 0.12 300); --fc-cover-dark: oklch(0.35 0.1 300); }

.rf-fc-cover {
  background:
    radial-gradient(130% 80% at 20% 0%, oklch(1 0 0 / 0.14), transparent 55%),
    repeating-radial-gradient(circle at 30% 40%, oklch(0 0 0 / 0.05) 0 1px, transparent 1px 3px),
    linear-gradient(160deg, var(--fc-cover) 0%, var(--fc-cover) 55%, var(--fc-cover-dark) 130%);
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.2), inset 0 -2px 0 oklch(0 0 0 / 0.18), 0 16px 26px -14px var(--fc-shadow);
}
.rf-fc-spine {
  background: linear-gradient(90deg, var(--fc-cover-dark), color-mix(in oklab, var(--fc-cover-dark) 80%, var(--fc-cover)) 70%, oklch(0 0 0 / 0.25));
}
.rf-fc-rivet {
  background: radial-gradient(circle at 35% 30%, var(--fc-metal) 0 35%, var(--fc-metal-dark) 80%);
  box-shadow: 0 1px 1px oklch(0 0 0 / 0.5);
}
.rf-fc-sheet {
  background:
    linear-gradient(90deg, transparent 46px, var(--fc-margin) 46px 47px, transparent 47px),
    repeating-linear-gradient(180deg, transparent 0 31px, var(--fc-line) 31px 32px),
    var(--fc-sheet);
}
.rf-fc-hand { font-family: "Caveat", "Segoe Print", "Bradley Hand", cursive; }
.rf-fc-stack { background: repeating-linear-gradient(90deg, var(--fc-sheet) 0 2px, var(--fc-sheet-2) 2px 3px); }

.rf-fc-book { perspective: 1400px; }
.rf-fc-door { transform-origin: left center; transform-style: preserve-3d; transition: transform 0.7s cubic-bezier(0.6, 0.05, 0.25, 1); }
.rf-fc-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.rf-fc-back { transform: rotateY(180deg); }
@media (hover: hover) { .rf-fc-book:hover .rf-fc-door:not(.is-open) { transform: rotateY(-16deg); } }
.rf-fc-door.is-open { transform: rotateY(-120deg); }
.rf-fc-lift { transition: transform 0.7s cubic-bezier(0.6, 0.05, 0.25, 1); }
.rf-fc-lift.is-open { transform: translateY(-6px) scale(1.04); }
.rf-fc-tab { transition: transform 0.3s ease; }
.rf-fc-book:hover .rf-fc-tab { transform: translateX(3px); }

@keyframes rf-fc-pagein { from { opacity: 0; transform: perspective(1400px) rotateY(10deg) translateX(24px); } to { opacity: 1; transform: none; } }
@keyframes rf-fc-pop { 0% { opacity: 0; transform: translateY(10px) scale(0.6); } 70% { opacity: 1; transform: translateY(-2px) scale(1.06); } 100% { opacity: 1; transform: none; } }
@keyframes rf-fc-pulse { 0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--fc-now) 55%, transparent); } 100% { box-shadow: 0 0 0 18px transparent; } }
@keyframes rf-fc-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
.rf-fc-pagein { animation: rf-fc-pagein 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) backwards; transform-origin: left center; }
.rf-fc-pop { animation: rf-fc-pop 0.45s cubic-bezier(0.3, 0.7, 0.3, 1.2) backwards; }
.rf-fc-ring { animation: rf-fc-pulse 1.6s ease-out infinite; }
.rf-fc-bob { animation: rf-fc-bob 1.8s ease-in-out infinite; }

.rf-fc-node { transition: transform 0.12s ease, box-shadow 0.12s ease; box-shadow: 0 6px 0 var(--node-dark), 0 10px 16px -6px oklch(0 0 0 / 0.5); }
.rf-fc-node:hover { transform: translateY(-2px); box-shadow: 0 8px 0 var(--node-dark), 0 12px 18px -6px oklch(0 0 0 / 0.5); }
.rf-fc-node:active { transform: translateY(5px); box-shadow: 0 1px 0 var(--node-dark); }

@media (prefers-reduced-motion: reduce) {
  .rf-fc-door, .rf-fc-lift, .rf-fc-tab { transition: none; }
  .rf-fc-pagein, .rf-fc-pop, .rf-fc-ring, .rf-fc-bob { animation: none; }
}
`;

function FicharioStyles() {
  return (
    <style href="rf-fichario" precedence="default">
      {FICHARIO_CSS}
    </style>
  );
}

const OPEN_MS = 720;
const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Holes({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute left-3 flex flex-col justify-between ${className}`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-3.5 w-3.5 rounded-full bg-[var(--fc-hole)] shadow-[inset_0_1px_2px_oklch(0_0_0/0.6)]" />
      ))}
    </span>
  );
}

export interface FicharioCardProps {
  title: string;
  topicCount: number;
  progress: number;
  color?: FicharioColor;
  onOpen?: () => void;
  onShare?: () => void;
  onMore?: () => void;
}

export function FicharioCard({ title, topicCount, progress, color, onOpen, onShare, onMore }: FicharioCardProps) {
  const c = color ?? ficharioColorFor(title);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  const handleOpen = () => {
    if (open) return;
    if (prefersReducedMotion()) return onOpen?.();
    setOpen(true);
    timer.current = setTimeout(() => { onOpen?.(); setOpen(false); }, OPEN_MS);
  };

  return (
    <div className="rf-fc rf-fc-book group relative" data-color={c}>
      <FicharioStyles />
      <div className={`rf-fc-lift relative pr-3 ${open ? "is-open z-20" : ""}`}>
        {(["--fc-tab-1", "--fc-tab-2", "--fc-tab-3", "--fc-tab-4"] as const).map((v, i) => (
          <span
            key={v}
            aria-hidden
            className="rf-fc-tab absolute right-0 h-[13%] w-6 rounded-r-md shadow-[2px_2px_4px_oklch(0_0_0/0.35)]"
            style={{ top: `${14 + i * 17}%`, background: `var(${v})`, transitionDelay: `${i * 40}ms` }}
          />
        ))}

        <div aria-hidden className="rf-fc-stack absolute inset-y-1.5 left-1 right-2 rounded-r-lg" />
        <div aria-hidden className="rf-fc-sheet absolute inset-y-1.5 left-1 right-3 overflow-hidden rounded-r-lg pl-14 pr-3 pt-5">
          <Holes className="top-[18%] bottom-[18%]" />
          <p className="rf-fc-hand text-2xl font-bold text-[var(--fc-ink)]">Sumário</p>
          <p className="rf-fc-hand text-lg leading-8 text-[var(--fc-ink-soft)]">{topicCount} tópicos</p>
          <p className="rf-fc-hand text-lg leading-8 text-[var(--fc-ink-soft)]">{pct}% concluído</p>
        </div>

        <button
          type="button"
          onClick={handleOpen}
          aria-label={`Abrir fichário ${title}, ${topicCount} tópicos, ${pct}% concluído`}
          className={`rf-fc-door relative block aspect-[5/6] w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--fc-now)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${open ? "is-open" : ""}`}
        >
          <span className="rf-fc-face rf-fc-cover absolute inset-0 flex flex-col overflow-hidden rounded-l-md rounded-r-xl">
            <span aria-hidden className="rf-fc-spine absolute inset-y-0 left-0 w-5">
              <span className="rf-fc-rivet absolute left-1/2 top-4 h-2.5 w-2.5 -translate-x-1/2 rounded-full" />
              <span className="rf-fc-rivet absolute bottom-4 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full" />
            </span>

            <span aria-hidden className="absolute right-0 top-1/2 flex h-9 w-8 -translate-y-1/2 items-center justify-center rounded-l-lg bg-[var(--fc-cover-dark)] shadow-[-2px_2px_4px_oklch(0_0_0/0.3)]">
              <span className="rf-fc-rivet h-3 w-3 rounded-full" />
            </span>

            <span className="ml-5 flex flex-1 flex-col py-4 pl-4 pr-10">
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--fc-on-cover)] opacity-70">Fichário</span>

              <span className="mt-3 block rounded-lg border border-[var(--fc-plate-edge)] bg-[var(--fc-plate)] px-3 py-2.5 shadow-[inset_0_1px_3px_oklch(0_0_0/0.25)]">
                <span className="line-clamp-3 text-lg font-extrabold leading-tight text-[var(--fc-on-cover)] sm:text-xl">{title}</span>
              </span>

              <span className="mt-auto block">
                <span className="flex items-baseline justify-between text-xs font-medium text-[var(--fc-on-cover)]">
                  <span className="opacity-80">{topicCount} tópicos</span>
                  <span className="font-bold">{pct}%</span>
                </span>
                <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[var(--fc-plate)]">
                  <span className="block h-full rounded-full bg-[var(--fc-on-cover)]" style={{ width: `${pct}%` }} />
                </span>
              </span>
            </span>
          </span>
          <span aria-hidden className="rf-fc-face rf-fc-back absolute inset-0 rounded-l-xl rounded-r-md bg-[var(--fc-cover-dark)]" />
        </button>
      </div>

      {(onShare || onMore) && (
        <div className={`absolute right-11 top-2 z-30 flex gap-0.5 transition-opacity ${open ? "opacity-0" : ""}`}>
          {onShare && (
            <button type="button" onClick={onShare} aria-label={`Compartilhar ${title}`} className="grid h-7 w-7 place-items-center rounded-full text-[var(--fc-on-cover)] opacity-80 transition hover:bg-[var(--fc-plate)] hover:opacity-100">
              <Share2 className="h-3.5 w-3.5" />
            </button>
          )}
          {onMore && (
            <button type="button" onClick={onMore} aria-label={`Mais opções de ${title}`} className="grid h-7 w-7 place-items-center rounded-full text-[var(--fc-on-cover)] opacity-80 transition hover:bg-[var(--fc-plate)] hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function FicharioGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

export interface FicharioAbertoProps {
  title: string;
  subtitle?: string;
  color?: FicharioColor;
  topics: FicharioTopic[];
  onBack?: () => void;
  onTopicClick?: ((id: FicharioTopic["id"]) => void) | undefined;
  onNewTopic?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
}

export function FicharioAberto({ title, subtitle = "Todos os tópicos desta disciplina.", color, topics, onBack, onTopicClick, onNewTopic, onShare, onDelete }: FicharioAbertoProps) {
  const c = color ?? ficharioColorFor(title);
  const done = topics.filter((t) => t.status === "revisado" || t.status === "dominado").length;
  const doing = topics.filter((t) => t.status === "estudando").length;
  const pct = topics.length ? Math.round((done / topics.length) * 100) : 0;

  return (
    <div className="rf-fc" data-color={c}>
      <FicharioStyles />

      {onBack && (
        <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar para disciplinas
        </button>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span aria-hidden className="rf-fc-cover relative grid h-14 w-12 shrink-0 place-items-center overflow-hidden rounded-l-sm rounded-r-lg">
            <span className="rf-fc-spine absolute inset-y-0 left-0 w-2" />
            <BookOpen className="ml-1 h-5 w-5 text-[var(--fc-on-cover)]" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Fichário</p>
            <h1 className="text-3xl font-extrabold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {onNewTopic && (
            <button type="button" onClick={onNewTopic} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> Novo tópico
            </button>
          )}
          {onShare && (
            <button type="button" onClick={onShare} className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-foreground hover:bg-muted">
              <Share2 className="h-4 w-4" /> Compartilhar
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-full border border-destructive/50 px-4 py-2 text-sm text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" /> Excluir
            </button>
          )}
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ["Tópicos", topics.length, "--fc-tab-1"],
          ["Concluídos", done, "--fc-tab-2"],
          ["Em andamento", doing, "--fc-tab-3"],
          ["Progresso", `${pct}%`, "--fc-tab-4"],
        ] as const).map(([k, v, tab]) => (
          <div key={k} className="relative overflow-hidden rounded-xl border border-border bg-card px-4 pb-3 pt-4">
            <span aria-hidden className="absolute left-4 top-0 h-1.5 w-10 rounded-b-md" style={{ background: `var(${tab})` }} />
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{k}</dt>
            <dd className="mt-1 text-2xl font-extrabold text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="rf-fc-pagein relative mt-8">
        <div aria-hidden className="rf-fc-stack absolute -bottom-2 left-2 right-2 top-2 rounded-2xl" />
        <div className="rf-fc-sheet relative overflow-hidden rounded-2xl pb-10 pt-6 shadow-[0_20px_40px_-20px_var(--fc-shadow)]">
          <Holes className="top-24 bottom-24" />
          <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-[var(--fc-cover)]" />
          <div className="flex items-baseline justify-between pl-16 pr-5">
            <h2 className="rf-fc-hand text-3xl font-bold text-[var(--fc-ink)]">Trilha de tópicos</h2>
            <span className="rf-fc-hand text-xl text-[var(--fc-ink-soft)]">{done}/{topics.length}</span>
          </div>
          <TopicTrail topics={topics} onTopicClick={onTopicClick} />
        </div>
      </section>
    </div>
  );
}

const OFFSETS = [0, -58, -88, -58, 0, 58, 88, 58];
const W = 340;
const ROW = 112;
const TOP = 70;

// ✅ CORRIGIDO: chave "nao_estudado" em vez de "nao_iniciado"
const NODE: Record<TopicStatus | "now", { bg: string; dark: string; fg: string }> = {
  dominado: { bg: "var(--fc-gold)", dark: "var(--fc-gold-dark)", fg: "var(--fc-gold-ink)" },
  revisado: { bg: "var(--fc-done)", dark: "var(--fc-done-dark)", fg: "var(--fc-ink)" },
  estudando: { bg: "var(--fc-now)", dark: "var(--fc-now-dark)", fg: "var(--fc-ink)" },
  now: { bg: "var(--fc-now)", dark: "var(--fc-now-dark)", fg: "var(--fc-ink)" },
  nao_estudado: { bg: "var(--fc-todo)", dark: "var(--fc-todo-dark)", fg: "var(--fc-ink-soft)" },
};

const STATUS_LABEL: Record<TopicStatus, string> = {
  nao_estudado: "Não iniciado",
  estudando: "Estudando",
  revisado: "Revisado",
  dominado: "Dominado",
};

export function TopicTrail({ topics, onTopicClick }: { topics: FicharioTopic[]; onTopicClick?: ((id: FicharioTopic["id"]) => void) | undefined }) {
  const isDone = (s: TopicStatus) => s === "revisado" || s === "dominado";
  let current = topics.findIndex((t) => t.status === "estudando");
  if (current === -1) current = topics.findIndex((t) => t.status === "nao_estudado");
  const allDone = topics.length > 0 && topics.every((t) => isDone(t.status));

  if (topics.length === 0) {
    return <p className="rf-fc-hand py-16 text-center text-2xl text-[var(--fc-ink-soft)]">Nenhum tópico ainda — crie o primeiro!</p>;
  }

  const pts = topics.map((_, i) => ({ x: W / 2 + (OFFSETS[i % OFFSETS.length] ?? 0), y: TOP + i * ROW }));
  const end = { x: W / 2, y: TOP + topics.length * ROW };
  const all = [...pts, end];
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    `M ${a.x} ${a.y} C ${a.x} ${a.y + ROW / 2}, ${b.x} ${b.y - ROW / 2}, ${b.x} ${b.y}`;
  const height = end.y + 70;

  return (
    <div className="relative mx-auto mt-2 max-w-full" style={{ width: W, height }}>
      <svg aria-hidden className="absolute inset-0" width={W} height={height} viewBox={`0 0 ${W} ${height}`} fill="none">
        {all.slice(1).map((p, i) => {
          const lit = i < topics.length && isDone(topics[i]!.status);
          return (
            <path
              key={i}
              d={seg(all[i]!, p)}
              stroke={lit ? "var(--fc-done)" : "var(--fc-ink-soft)"}
              strokeOpacity={lit ? 0.9 : 0.35}
              strokeWidth={lit ? 5 : 3}
              strokeDasharray={lit ? undefined : "2 9"}
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      <ol>
        {topics.map((t, i) => {
          const p = pts[i]!;
          const isNow = i === current;
          const style = NODE[isNow ? "now" : t.status];
          const Icon = t.status === "dominado" ? Crown : isDone(t.status) ? Check : isNow ? Play : BookOpen;
          const labelRight = (OFFSETS[i % OFFSETS.length] ?? 0) <= 0;
          return (
            <li key={t.id} className="absolute" style={{ left: p.x, top: p.y }}>
              {isNow && (
                <span className="rf-fc-bob absolute bottom-[46px] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-xl bg-[var(--fc-ink)] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--fc-sheet)] shadow-lg after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-[6px] after:border-transparent after:border-t-[var(--fc-ink)] after:content-['']">
                  {t.status === "estudando" ? "Continuar" : "Começar"}
                </span>
              )}
              <button
                type="button"
                onClick={() => onTopicClick?.(t.id)}
                aria-label={`${t.title} — ${STATUS_LABEL[t.status]}`}
                className={`rf-fc-node rf-fc-pop absolute left-0 top-0 grid h-16 w-16 place-items-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-[var(--fc-now)]/50 ${isNow ? "rf-fc-ring" : ""}`}
                style={{ background: style.bg, color: style.fg, "--node-dark": style.dark, animationDelay: `${i * 70}ms`, translate: "-50% -50%" } as CSSProperties}
              >
                <Icon className="h-7 w-7" strokeWidth={2.6} fill={t.status === "dominado" || isNow ? "currentColor" : "none"} />
              </button>
              <span
                className={`rf-fc-pop absolute top-0 w-[150px] -translate-y-1/2 ${labelRight ? "left-11 text-left" : "right-11 text-right"}`}
                style={{ animationDelay: `${i * 70 + 80}ms` }}
              >
                <span className="rf-fc-hand block text-[22px] font-bold leading-[1.05] text-[var(--fc-ink)]">{t.title}</span>
                <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-widest text-[var(--fc-ink-soft)]">{STATUS_LABEL[t.status]}</span>
              </span>
            </li>
          );
        })}
        <li className="absolute" style={{ left: end.x, top: end.y }}>
          <span
            className="rf-fc-node rf-fc-pop absolute grid h-[72px] w-[72px] place-items-center rounded-2xl"
            style={{
              background: allDone ? "var(--fc-gold)" : "var(--fc-todo)",
              color: allDone ? "var(--fc-gold-ink)" : "var(--fc-ink-soft)",
              "--node-dark": allDone ? "var(--fc-gold-dark)" : "var(--fc-todo-dark)",
              translate: "-50% -50%",
              animationDelay: `${topics.length * 70}ms`,
            } as CSSProperties}
            aria-label={allDone ? "Disciplina concluída" : "Troféu da disciplina"}
          >
            <Trophy className="h-8 w-8" strokeWidth={2.4} />
          </span>
        </li>
      </ol>
    </div>
  );
}