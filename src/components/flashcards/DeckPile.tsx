import type { CSSProperties, ReactNode } from "react";
import { Layers, Users } from "lucide-react";
import "./flashcards-cards.css";

/** Baralho visual. Só aparência: todos os dados e ações vêm por props. */
export function DeckPile({
  name, description, total, due, color = "var(--primary)", shared, badge,
  onOpen, onStudy, studyDisabled, studyLabel, actions,
}: {
  name: string; description?: string | null; total: number; due: number; color?: string;
  shared?: boolean | undefined; badge?: ReactNode; onOpen?: () => void; onStudy?: () => void;
  studyDisabled?: boolean; studyLabel?: ReactNode; actions?: ReactNode;
}) {
  const empty = total === 0;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <article
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen?.(); }}
      className={`rf-deck ${empty ? "rf-deck--empty" : ""}`}
      style={{ "--deck": color } as CSSProperties}
    >
      <span className="rf-deck__back rf-deck__back--2" />
      <span className="rf-deck__back rf-deck__back--1" />
      <div className="rf-deck__front">
        <header className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="rf-pip"><Layers className="h-5 w-5" /></span>
            <span className="rf-corner text-2xl">{initial}</span>
          </div>
          {actions && <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>{actions}</div>}
        </header>

        <div className="mt-4 min-h-0 flex-1">
          <h3 className="font-display text-lg font-bold leading-tight">{name} {badge}</h3>
          {shared && <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary"><Users className="h-3 w-3" /> Compartilhado</span>}
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{description || "Sem descrição"}</p>
        </div>

        <footer className="mt-4 flex items-center justify-between gap-3">
          {empty ? (
            <span className="text-xs font-semibold text-muted-foreground">Baralho vazio — adicione cartas</span>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onStudy?.(); }}
              disabled={studyDisabled ?? due === 0}
              className="btn-sun inline-flex items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-40"
            >
              {studyLabel ?? (due > 0 ? `${due} para hoje` : "Nada para hoje")}
            </button>
          )}
          <span className="rf-corner text-sm">{total} <span className="font-sans text-xs font-normal text-muted-foreground">cartas</span></span>
        </footer>
      </div>
    </article>
  );
}