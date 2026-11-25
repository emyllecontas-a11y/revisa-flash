import { useEffect, useState } from "react";
import { X, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtDuracao } from "@/utils/studyRatsFormat";
import type { StudyCalendarEntry } from "@/types/studyRats";

interface CheckinDetailViewerProps {
  checkin: StudyCalendarEntry | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export function CheckinDetailViewer({
  checkin,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: CheckinDetailViewerProps) {
  const [idx, setIdx] = useState(0);

  const photos = checkin?.photos?.filter((p) => p.url) ?? [];

  // Zerar idx ao trocar de check-in
  useEffect(() => {
    setIdx(0);
  }, [checkin?.id]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onPrev?.();
      if (e.key === "ArrowRight" && hasNext) onNext?.();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  const goPrev = () => {
    if (photos.length > 1) {
      setIdx((i) => (i - 1 + photos.length) % photos.length);
    } else if (hasPrev) {
      onPrev?.();
    }
  };

  const goNext = () => {
    if (photos.length > 1) {
      setIdx((i) => (i + 1) % photos.length);
    } else if (hasNext) {
      onNext?.();
    }
  };

  if (!checkin) return null;

  const currentPhoto = photos[idx];

  return (
    <div className="srx-overlay fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="srx-sheet srx-card w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          {photos.length > 0 ? (
            <>
              <div
                className="aspect-[4/5] w-full overflow-hidden bg-surface-2"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (e.clientX < rect.left + rect.width / 2) goPrev();
                  else goNext();
                }}
              >
                {currentPhoto?.url ? (
                  <img
                    src={currentPhoto.url}
                    alt={checkin.title ?? ""}
                    className="h-full w-full object-cover transition-transform duration-100"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-surface-2">
                    <span className="text-6xl">{checkin.subject?.charAt(0).toUpperCase() ?? "📚"}</span>
                  </div>
                )}
              </div>
              {photos.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); goPrev(); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full bg-background/80 text-foreground hover:bg-background"
                    aria-label="Anterior"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); goNext(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full bg-background/80 text-foreground hover:bg-background"
                    aria-label="Próxima"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="aspect-[4/5] w-full flex items-center justify-center bg-surface-2">
              <span className="text-6xl">{checkin.subject?.charAt(0).toUpperCase() ?? "📚"}</span>
            </div>
          )}

          <button
            aria-label="Fechar"
            onClick={onClose}
            className="srx-badge absolute right-3 top-3"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="srx-badge absolute left-3 top-3">
            <Clock className="h-3.5 w-3.5 text-accent" /> {fmtDuracao(checkin.durationMin)}
          </span>
        </div>
        <div className="p-4 space-y-1 text-sm">
          <p className="font-bold text-foreground">{checkin.title ?? `Check-in de ${checkin.subject}`}</p>
          <p className="text-accent">{checkin.subject}</p>
          <p className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" /> {checkin.studyTime ?? "—"} · {fmtDuracao(checkin.durationMin)}
          </p>
          {checkin.caption && <p className="text-foreground/90">{checkin.caption}</p>}
        </div>
      </div>
    </div>
  );
}