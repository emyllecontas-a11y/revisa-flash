import type { CSSProperties, ReactNode } from "react";
import { useState, useEffect } from "react";
import { Layers, RotateCw } from "lucide-react";
import "./flashcards-cards.css";

/**
 * Flashcard com aparência de carta (frente/verso).
 * Não tem estado próprio: `flipped` e `onFlip` vêm da lógica de revisão já existente.
 */
export function StudyCard({
  front, back, flipped, onFlip, deckName, color = "var(--primary)", position, tag,
  frontImageUrl, backImageUrl
}: {
  front: ReactNode; back: ReactNode; flipped: boolean; onFlip: () => void;
  deckName?: string; color?: string; position?: string; tag?: ReactNode;
  frontImageUrl?: string | null; backImageUrl?: string | null;
}) {
  const Corner = ({ label }: { label: string }) => (
    <div className="relative flex items-center justify-between text-xs">
      <span className="rf-corner flex items-center gap-1.5 uppercase tracking-widest"><Layers className="h-3.5 w-3.5" />{label}</span>
      <span className="text-muted-foreground">{position}</span>
    </div>
  );

  const [frontImageError, setFrontImageError] = useState(false);
  const [backImageError, setBackImageError] = useState(false);

  // Resetar estado de erro quando a URL da imagem muda (ex.: troca de card)
  useEffect(() => {
    setFrontImageError(false);
  }, [frontImageUrl]);

  useEffect(() => {
    setBackImageError(false);
  }, [backImageUrl]);

  return (
    <div className={`rf-studycard ${flipped ? "rf-studycard--flipped" : ""}`} style={{ "--deck": color } as CSSProperties}>
      <button type="button" onClick={onFlip} aria-label={flipped ? "Ver pergunta" : "Ver resposta"} className="rf-studycard__inner block w-full text-left">
        <div className="rf-studycard__face" aria-hidden={flipped}>
          <Corner label="Pergunta" />
          <div className="rf-studycard__body">
            {tag && <div className="mb-3 flex justify-center">{tag}</div>}
            <div className="font-display text-xl font-bold leading-snug sm:text-2xl">{front}</div>
            {frontImageUrl && !frontImageError && (
              <img
                src={frontImageUrl}
                alt="Imagem da frente do flashcard"
                className="mt-3 max-w-full h-auto rounded-lg border border-border max-h-48 object-contain"
                loading="lazy"
                onError={() => setFrontImageError(true)}
              />
            )}
          </div>
          <p className="relative flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><RotateCw className="h-3.5 w-3.5" /> Toque para virar</p>
          {deckName && <p className="rf-corner relative mt-2 rotate-180 text-center text-[10px] uppercase tracking-widest opacity-70">{deckName}</p>}
        </div>
        <div className="rf-studycard__face rf-studycard__face--back" aria-hidden={!flipped}>
          <Corner label="Resposta" />
          <div className="rf-studycard__body text-base leading-relaxed sm:text-lg">
            {back}
            {backImageUrl && !backImageError && (
              <img
                src={backImageUrl}
                alt="Imagem do verso do flashcard"
                className="mt-3 max-w-full h-auto rounded-lg border border-border max-h-48 object-contain"
                loading="lazy"
                onError={() => setBackImageError(true)}
              />
            )}
          </div>
          {deckName && <p className="rf-corner relative text-center text-[10px] uppercase tracking-widest opacity-70">{deckName}</p>}
        </div>
      </button>
    </div>
  );
}