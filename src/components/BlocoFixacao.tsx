/**
 * BlocoFixacao — visual da aba "Exercícios de fixação" do RevisaFlash.
 *
 * Cada disciplina vira um BLOQUINHO DE NOTAS pequeno, com espiral em cima (tipo agenda / bloco de recados).
 * Ao passar o mouse a capa levanta um pouquinho e mostra a folha de baixo; ao clicar ela vira por cima
 * e só depois chama onOpen.
 *
 * Arquivo só de visual: não busca dados, não salva nada. Passe props e callbacks.
 *
 * Uso:
 *   <BlocoGrid>
 *     {disciplinas.map((d) => (
 *       <BlocoCard
 *         key={d.id}
 *         title={d.nome}
 *         listCount={d.listas.length}
 *         accuracy={d.taxaAcerto}        // 0 a 100, opcional (null se ainda não fez listas)
 *         onOpen={() => abrir(d.id)}     // chamado DEPOIS da animação
 *       />
 *     ))}
 *   </BlocoGrid>
 *
 * Dependências: React 19, Tailwind, lucide-react.
 * Fonte manuscrita (opcional): Google Fonts "Caveat".
 *   <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap" rel="stylesheet" />
 * Todas as cores próprias ficam no bloco BLOCO_CSS (variáveis --bl-*).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ListChecks } from "lucide-react";

export type BlocoColor = "kraft" | "menta" | "rosa" | "lavanda" | "laranja";
const COLORS: BlocoColor[] = ["kraft", "menta", "rosa", "lavanda", "laranja"];

/** Mesmo nome = mesma cor. */
export function blocoColorFor(key: string): BlocoColor {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length] ?? "kraft";
}

const BLOCO_CSS = `
.rf-bl {
  --bl-cover: oklch(0.6 0.07 65);
  --bl-cover-dark: oklch(0.48 0.06 60);
  --bl-on-cover: oklch(0.99 0.01 80);
  --bl-tape: oklch(0.86 0.09 85 / 0.75);
  --bl-sheet: oklch(0.29 0.045 345);
  --bl-sheet-2: oklch(0.24 0.04 345);
  --bl-line: oklch(1 0 0 / 0.07);
  --bl-ink: oklch(0.95 0.01 70);
  --bl-ink-soft: oklch(0.74 0.03 340);
  --bl-wire: oklch(0.86 0.01 260);
  --bl-wire-dark: oklch(0.55 0.01 260);
  --bl-hole: oklch(0.16 0.035 345);
  --bl-chip: oklch(0.12 0.03 340 / 0.28);
  --bl-good: oklch(0.78 0.15 150);
  --bl-mid: oklch(0.83 0.14 85);
  --bl-bad: oklch(0.72 0.17 25);
  --bl-shadow: oklch(0.08 0.03 340 / 0.75);
}
.rf-bl[data-color="menta"]   { --bl-cover: oklch(0.56 0.08 175); --bl-cover-dark: oklch(0.43 0.07 178); --bl-tape: oklch(0.8 0.1 350 / 0.75); }
.rf-bl[data-color="rosa"]    { --bl-cover: oklch(0.58 0.12 355); --bl-cover-dark: oklch(0.45 0.11 355); --bl-tape: oklch(0.85 0.1 160 / 0.7); }
.rf-bl[data-color="lavanda"] { --bl-cover: oklch(0.55 0.09 295); --bl-cover-dark: oklch(0.43 0.08 295); }
.rf-bl[data-color="laranja"] { --bl-cover: oklch(0.66 0.16 48);  --bl-cover-dark: oklch(0.52 0.15 42); --bl-tape: oklch(0.85 0.08 240 / 0.7); }

.rf-bl-pad { perspective: 1400px; perspective-origin: 50% 0%; }
.rf-bl-cover {
  transform-origin: top center;
  transform-style: preserve-3d;
  transition: transform 0.55s cubic-bezier(0.55, 0.05, 0.3, 1);
  background:
    radial-gradient(120% 70% at 20% 0%, oklch(1 0 0 / 0.14), transparent 60%),
    repeating-linear-gradient(90deg, oklch(0 0 0 / 0.035) 0 1px, transparent 1px 4px),
    linear-gradient(180deg, var(--bl-cover), var(--bl-cover-dark) 160%);
  box-shadow: inset 0 -2px 0 oklch(0 0 0 / 0.18), 0 10px 18px -10px var(--bl-shadow);
}
@media (hover: hover) { .rf-bl-pad:hover .rf-bl-cover:not(.is-open) { transform: rotateX(55deg); } }
.rf-bl-cover.is-open { transform: rotateX(172deg); }
.rf-bl-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.rf-bl-sheet {
  background: repeating-linear-gradient(180deg, transparent 0 19px, var(--bl-line) 19px 20px), var(--bl-sheet);
  background-position: 0 14px, 0 0;
}
.rf-bl-stack { background: repeating-linear-gradient(180deg, var(--bl-sheet) 0 2px, var(--bl-sheet-2) 2px 3px); }
.rf-bl-hand { font-family: "Caveat", "Segoe Print", "Bradley Hand", cursive; }
.rf-bl-wire { background: linear-gradient(90deg, var(--bl-wire-dark), var(--bl-wire) 45%, var(--bl-wire-dark)); box-shadow: 0 1px 1px oklch(0 0 0 / 0.5); }
.rf-bl-tape { background: repeating-linear-gradient(90deg, var(--bl-tape) 0 6px, color-mix(in oklab, var(--bl-tape) 80%, transparent) 6px 8px); }
@media (prefers-reduced-motion: reduce) { .rf-bl-cover { transition: none; } }
`;

function BlocoStyles() {
  return (
    <style href="rf-bloco" precedence="default">
      {BLOCO_CSS}
    </style>
  );
}

function Spiral() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-3 -top-1.5 z-20 flex justify-between">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="relative h-5 w-2">
          <span className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[var(--bl-hole)]" />
          <span className="rf-bl-wire absolute left-1/2 top-0 h-4 w-[4px] -translate-x-1/2 rounded-full" />
        </span>
      ))}
    </span>
  );
}

const OPEN_MS = 520;

export interface BlocoCardProps {
  title: string;
  listCount: number;
  /** Taxa de acerto 0–100; null/undefined quando ainda não há listas feitas. */
  accuracy?: number | null;
  color?: BlocoColor;
  /** Chamado depois que a capa vira. */
  onOpen?: () => void;
}

export function BlocoCard({ title, listCount, accuracy, color, onOpen }: BlocoCardProps) {
  const c = color ?? blocoColorFor(title);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const empty = listCount === 0;
  const acc = accuracy == null ? null : Math.round(accuracy);
  const accColor = acc == null ? "" : acc >= 70 ? "var(--bl-good)" : acc >= 50 ? "var(--bl-mid)" : "var(--bl-bad)";

  const handleOpen = () => {
    if (open) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return onOpen?.();
    setOpen(true);
    timer.current = setTimeout(() => { onOpen?.(); setOpen(false); }, OPEN_MS);
  };

  return (
    <div className="rf-bl" data-color={c}>
      <BlocoStyles />
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`${title}: ${empty ? "nenhuma lista" : `${listCount} ${listCount === 1 ? "lista" : "listas"}`}${acc != null ? `, ${acc}% de acerto` : ""}`}
        className="rf-bl-pad group relative block w-full pt-2 text-left outline-none focus-visible:[&_.rf-bl-cover]:ring-2 focus-visible:[&_.rf-bl-cover]:ring-[var(--bl-on-cover)]"
      >
        {/* folhas embaixo */}
        <span aria-hidden className="rf-bl-stack absolute inset-x-1 -bottom-1.5 top-4 rounded-b-lg shadow-[0_10px_16px_-10px_var(--bl-shadow)]" />
        <span aria-hidden className="rf-bl-sheet absolute inset-x-0 bottom-0 top-2 flex flex-col justify-end overflow-hidden rounded-b-lg rounded-t-sm px-3 pb-3">
          <span className="rf-bl-hand block text-lg font-bold leading-5 text-[var(--bl-ink)]">{empty ? "Página em branco…" : "Continuar daqui"}</span>
          <span className="rf-bl-hand block text-base leading-5 text-[var(--bl-ink-soft)]">{title}</span>
        </span>

        <Spiral />

        <span className={`rf-bl-cover relative flex aspect-[1/1] w-full flex-col rounded-b-lg rounded-t-sm px-3 pb-3 pt-6 ${open ? "is-open" : ""}`}>
          <span className="rf-bl-face absolute inset-0 flex flex-col rounded-b-lg rounded-t-sm px-3 pb-3 pt-6">
            {/* fita adesiva */}
            <span aria-hidden className="rf-bl-tape absolute -right-3 top-[56%] h-4 w-12 -rotate-[28deg] opacity-90" />

            <span className="line-clamp-3 pr-4 text-[15px] font-extrabold leading-tight text-[var(--bl-on-cover)]">{title}</span>

            <span className="mt-auto flex items-center justify-between gap-2">
              <span className={`inline-flex items-center gap-1 text-xs font-medium text-[var(--bl-on-cover)] ${empty ? "opacity-60" : "opacity-90"}`}>
                <ListChecks className="h-3.5 w-3.5" />
                {empty ? "Nenhuma lista" : `${listCount} ${listCount === 1 ? "lista" : "listas"}`}
              </span>
              {acc != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bl-chip)] px-2 py-0.5 text-[11px] font-bold text-[var(--bl-on-cover)]">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: accColor }} />
                  {acc}%
                </span>
              )}
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}

/** Grade de bloquinhos pequenos: cabem 2 no celular e vários lado a lado no computador. */
export function BlocoGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">{children}</div>;
}
