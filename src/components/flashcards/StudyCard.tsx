import type { CSSProperties, ReactNode } from "react";
import { Layers, RotateCw } from "lucide-react";
import "./flashcards-cards.css";

/**
 * Flashcard com aparência de carta (frente/verso).
 * Não tem estado próprio: `flipped` e `onFlip` vêm da lógica de revisão já existente.
 */
export function StudyCard({
  front, back, flipped, onFlip, deckName, color = "var(--primary)", position, tag,
}: {
  front: ReactNode; back: ReactNode; flipped: boolean; onFlip: () => void;
  deckName?: string; color?: string; position?: string; tag?: ReactNode;
}) {
  const Corner = ({ label }: { label: string }) => (
    <div className="relative flex items-center justify-between text-xs">
      <span className="rf-corner flex items-center gap-1.5 uppercase tracking-widest"><Layers className="h-3.5 w-3.5" />{label}</span>
      <span className="text-muted-foreground">{position}</span>
    </div>
  );
  return (
    <div className={`rf-studycard ${flipped ? "rf-studycard--flipped" : ""}`} style={{ "--deck": color } as CSSProperties}>
      <button type="button" onClick={onFlip} aria-label={flipped ? "Ver pergunta" : "Ver resposta"} className="rf-studycard__inner block w-full text-left">
        <div className="rf-studycard__face" aria-hidden={flipped}>
          <Corner label="Pergunta" />
          <div className="rf-studycard__body">
            {tag && <div className="mb-3 flex justify-center">{tag}</div>}
            <div className="font-display text-xl font-bold leading-snug sm:text-2xl">{front}</div>
          </div>
          <p className="relative flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><RotateCw className="h-3.5 w-3.5" /> Toque para virar</p>
          {deckName && <p className="rf-corner relative mt-2 rotate-180 text-center text-[10px] uppercase tracking-widest opacity-70">{deckName}</p>}
        </div>
        <div className="rf-studycard__face rf-studycard__face--back" aria-hidden={!flipped}>
          <Corner label="Resposta" />
          <div className="rf-studycard__body text-base leading-relaxed sm:text-lg">{back}</div>
          {deckName && <p className="rf-corner relative text-center text-[10px] uppercase tracking-widest opacity-70">{deckName}</p>}
        </div>
      </button>
    </div>
  );
}