import { Loader2 } from "lucide-react";
import type { StudyCalendarEntry } from "@/types/studyRats";

interface CheckinDayThumbProps {
  checkins: StudyCalendarEntry[];
  firstPhotoUrl: string | null;
  loading: boolean;
}

export function CheckinDayThumb({ checkins, firstPhotoUrl, loading }: CheckinDayThumbProps) {
  const count = checkins.length;
  const hasMultiple = count > 1;

  if (loading) {
    return (
      <span className="srx-thumb-loader absolute top-1.5 right-1.5 h-5 w-5 sm:h-7 sm:w-7 rounded-full border-2 border-accent/30 border-t-accent animate-spin" aria-hidden="true" />
    );
  }

  if (firstPhotoUrl) {
    // Foto ocupa o círculo inteiro do dia; o número do dia fica por cima (renderizado no calendário).
    return (
      <>
        <span className="srx-thumb absolute inset-0 rounded-full overflow-hidden bg-surface-2" aria-hidden="true">
          <img src={firstPhotoUrl} alt="" className="h-full w-full object-cover" />
          <span className="absolute inset-0 bg-black/35" />
        </span>
        {hasMultiple && (
          <span className="srx-count absolute bottom-0.5 right-0.5 z-20 grid min-w-[16px] h-4 place-items-center rounded-full px-1 text-[9px] font-bold bg-accent text-accent-foreground">
            {count}
          </span>
        )}
      </>
    );
  }

  // Sem foto: círculo simples com inicial da matéria ou ícone
  const first = checkins[0];
  const initial = first?.subject?.charAt(0).toUpperCase() ?? "📚";

  return (
    <span className="srx-thumb-placeholder absolute top-1.5 right-1.5 h-5 w-5 sm:h-7 sm:w-7 rounded-full flex items-center justify-center text-[10px] font-bold bg-surface-2 ring-1 ring-border">
      {initial}
    </span>
  );
}