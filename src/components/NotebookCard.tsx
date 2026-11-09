/**
 * NotebookCard — visual de "caderno de verdade" para a lista "Meus Cadernos".
 */
import type { ReactNode } from "react";
import { Folder, Pencil, Plus, Trash2 } from "lucide-react";

export type NotebookColor = "laranja" | "vinho" | "azul" | "verde" | "mostarda";

const COLORS: NotebookColor[] = ["laranja", "vinho", "azul", "verde", "mostarda"];

/** Mesma pasta = mesma cor de capa. */
export function notebookColorFor(key: string): NotebookColor {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length] ?? "laranja";
}

const NOTEBOOK_CSS = `
.rf-nb {
  --nb-paper: oklch(0.975 0.012 85);
  --nb-paper-edge: oklch(0.9 0.015 80);
  --nb-line: oklch(0.78 0.05 235 / 0.55);
  --nb-margin: oklch(0.66 0.17 22 / 0.7);
  --nb-ink: oklch(0.27 0.05 290);
  --nb-ink-soft: oklch(0.45 0.04 290);
  --nb-ring: oklch(0.86 0.01 260);
  --nb-ring-shade: oklch(0.55 0.01 260);
  --nb-hole: oklch(0.16 0.03 340);
  --nb-ribbon: oklch(0.72 0.19 50);
  --nb-cover: oklch(0.66 0.17 48);
  --nb-cover-dark: oklch(0.5 0.15 40);
  --nb-band: oklch(0.22 0.04 330);
  --nb-on-cover: oklch(0.99 0.01 80);
}
.rf-nb[data-color="vinho"]    { --nb-cover: oklch(0.45 0.14 355); --nb-cover-dark: oklch(0.34 0.11 355); --nb-ribbon: oklch(0.8 0.15 75); }
.rf-nb[data-color="azul"]     { --nb-cover: oklch(0.47 0.1 245);  --nb-cover-dark: oklch(0.35 0.08 250); }
.rf-nb[data-color="verde"]    { --nb-cover: oklch(0.52 0.09 170); --nb-cover-dark: oklch(0.38 0.07 175); }
.rf-nb[data-color="mostarda"] { --nb-cover: oklch(0.76 0.14 85);  --nb-cover-dark: oklch(0.6 0.12 75); --nb-on-cover: oklch(0.25 0.05 60); --nb-ribbon: oklch(0.5 0.15 355); }

.rf-nb-cover {
  background:
    repeating-linear-gradient(45deg, oklch(1 0 0 / 0.035) 0 2px, transparent 2px 5px),
    repeating-linear-gradient(-45deg, oklch(0 0 0 / 0.05) 0 1px, transparent 1px 4px),
    linear-gradient(100deg, var(--nb-cover-dark) 0%, var(--nb-cover) 9%, var(--nb-cover) 70%, var(--nb-cover-dark) 140%);
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.18),
    inset -2px 0 0 oklch(0 0 0 / 0.15),
    0 14px 24px -12px oklch(0 0 0 / 0.7);
}
.rf-nb-pages {
  background: repeating-linear-gradient(180deg, var(--nb-paper) 0 2px, var(--nb-paper-edge) 2px 3px);
  box-shadow: 0 10px 18px -10px oklch(0 0 0 / 0.6);
}
.rf-nb-label {
  background:
    linear-gradient(90deg, transparent 18px, var(--nb-margin) 18px 19.5px, transparent 19.5px),
    repeating-linear-gradient(180deg, transparent 0 21px, var(--nb-line) 21px 22px),
    var(--nb-paper);
  background-position: 0 0, 0 9px, 0 0;
  box-shadow: 0 1px 0 oklch(0 0 0 / 0.08), 0 4px 10px -4px oklch(0 0 0 / 0.45);
}
.rf-nb-title { font-family: "Caveat", "Segoe Print", "Bradley Hand", cursive; line-height: 1.1; }
.rf-nb-ring {
  background: linear-gradient(180deg, var(--nb-ring) 0%, var(--nb-ring) 45%, var(--nb-ring-shade) 100%);
  box-shadow: 0 1px 1px oklch(0 0 0 / 0.5);
}
.rf-nb-ribbon { clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%); }
.rf-nb-new {
  background: repeating-linear-gradient(180deg, transparent 0 21px, var(--nb-line) 21px 22px);
  background-position: 0 30px;
}
`;

function NotebookStyles() {
  return (
    <style href="rf-notebook-card" precedence="default">
      {NOTEBOOK_CSS}
    </style>
  );
}

function Spiral({ rings = 9 }: { rings?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute -left-[7px] top-3 bottom-3 z-20 flex flex-col justify-around">
      {Array.from({ length: rings }).map((_, i) => (
        <div key={i} className="relative h-3 w-6">
          <span className="absolute right-[3px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[var(--nb-hole)]" />
          <span className="rf-nb-ring absolute left-0 top-1/2 h-[5px] w-[19px] -translate-y-1/2 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export interface NotebookCardProps {
  title: string;
  questionCount: number;
  folderName?: string | null;
  color?: NotebookColor;
  onOpen?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function NotebookCard({ title, questionCount, folderName, color, onOpen, onEdit, onDelete }: NotebookCardProps) {
  const c = color ?? notebookColorFor(folderName || title);
  
  // Ajuste dinâmico do tamanho da fonte (Diminuído)
  const titleSize = 
    title.length > 24 ? "text-[12px]" :
    title.length > 16 ? "text-[14px]" :
    "text-[18px]";

  return (
    <div className="rf-nb group relative pl-2 pb-2" data-color={c}>
      <NotebookStyles />

      <div aria-hidden className="rf-nb-pages absolute inset-y-2 left-3 right-0 rounded-r-md transition-transform duration-300 group-hover:translate-x-1" />
      <div aria-hidden className="rf-nb-pages absolute bottom-0 left-3 right-1 top-3 rounded-r-md opacity-90 transition-transform duration-300 group-hover:translate-x-2 group-hover:translate-y-0.5" />

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir caderno ${title}, ${questionCount} questões`}
        className="rf-nb-cover relative mr-2 mb-1 flex aspect-[5/6] w-[calc(100%-0.5rem)] flex-col rounded-l-sm rounded-r-lg pl-6 pr-4 pt-4 pb-3 text-left outline-none transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:-rotate-1 focus-visible:ring-2 focus-visible:ring-[var(--nb-ribbon)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      >
        <Spiral />

        <span aria-hidden className="absolute inset-y-0 right-[13%] w-2 bg-[var(--nb-band)] opacity-85 shadow-[1px_0_0_oklch(1_0_0/0.12)]" />
        <span aria-hidden className="rf-nb-ribbon absolute -bottom-3 right-[27%] h-8 w-3.5 bg-[var(--nb-ribbon)] transition-all duration-300 group-hover:-bottom-4 group-hover:h-9" />

        {/* Letra do "Caderno" diminuída */}
        <span className="text-[9px] font-semibold uppercase tracking-[0.25em] text-[var(--nb-on-cover)] opacity-70">Caderno</span>

        <span className="rf-nb-label relative mt-4 mr-[14%] block rounded-[3px] py-[9px] pl-[26px] pr-2.5 -rotate-[0.6deg]">
          <span className={`rf-nb-title line-clamp-3 break-words font-bold text-[var(--nb-ink)] ${titleSize}`}>{title}</span>
          {/* Letra das questões diminuída */}
          <span className="rf-nb-title block text-[13px] font-semibold text-[var(--nb-ink-soft)] mt-1">
            {questionCount} {questionCount === 1 ? "questão" : "questões"}
          </span>
        </span>

        <span className="mt-auto flex min-w-0 items-center pr-[14%]">
          {folderName ? (
            /* Letra da pasta diminuída */
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-[var(--nb-band)]/40 px-2.5 py-1 text-[10px] font-medium text-[var(--nb-on-cover)]">
              <Folder className="h-3 w-3 shrink-0" />
              <span className="truncate">{folderName}</span>
            </span>
          ) : (
            <span className="text-[10px] font-medium text-[var(--nb-on-cover)] opacity-60">Sem pasta</span>
          )}
        </span>
      </button>

      {(onEdit || onDelete) && (
        <div className="absolute right-4 top-2.5 z-30 flex gap-1 opacity-100 transition-all duration-300 group-hover:-translate-y-1 group-hover:-rotate-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
          {onEdit && (
            <button type="button" onClick={onEdit} aria-label={`Editar ${title}`} className="grid h-7 w-7 place-items-center rounded-full bg-[var(--nb-band)]/55 text-[var(--nb-on-cover)] backdrop-blur-sm transition hover:bg-[var(--nb-band)]/80">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} aria-label={`Excluir ${title}`} className="grid h-7 w-7 place-items-center rounded-full bg-[var(--nb-band)]/55 text-[var(--nb-on-cover)] backdrop-blur-sm transition hover:bg-[var(--nb-band)]/80">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function NewNotebookCard({ onClick, label = "Novo caderno" }: { onClick?: () => void; label?: string }) {
  return (
    <div className="rf-nb group relative pl-2 pb-2">
      <NotebookStyles />
      <button
        type="button"
        onClick={onClick}
        className="rf-nb-new relative mr-2 mb-1 flex aspect-[5/6] w-[calc(100%-0.5rem)] flex-col items-center justify-center gap-3 rounded-l-sm rounded-r-lg border-2 border-dashed border-[var(--nb-line)] text-[var(--nb-paper)] opacity-70 outline-none transition duration-300 hover:-translate-y-1 hover:border-[var(--nb-ribbon)] hover:opacity-100 focus-visible:border-[var(--nb-ribbon)] focus-visible:opacity-100"
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--nb-ribbon)] text-[var(--nb-on-cover)] transition-transform duration-300 group-hover:scale-110">
          <Plus className="h-6 w-6" />
        </span>
        <span className="rf-nb-title text-2xl font-bold">{label}</span>
      </button>
    </div>
  );
}

export function NotebookGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">{children}</div>;
}