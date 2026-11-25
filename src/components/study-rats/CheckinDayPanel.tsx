import { Clock, CalendarCheck, ChevronRight } from "lucide-react";
import { fmtDuracao } from "@/utils/studyRatsFormat";
import type { StudyCalendarEntry } from "@/types/studyRats";

interface CheckinDayPanelProps {
  checkins: StudyCalendarEntry[];
  onOpenCheckin?: (checkin: StudyCalendarEntry) => void;
  onIrParaComunidade?: () => void;
}

export function CheckinDayPanel({ checkins, onOpenCheckin, onIrParaComunidade }: CheckinDayPanelProps) {
  if (checkins.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <CalendarCheck className="h-3.5 w-3.5 text-accent" /> Check-ins de estudo
      </p>
      <div className="space-y-2">
        {checkins.map((c) => (
          <button
            key={c.id}
            onClick={() => onOpenCheckin?.(c)}
            className="flex w-full items-center gap-3 rounded-2xl bg-surface-2 p-2.5 text-left transition hover:brightness-110"
          >
            <span className="relative shrink-0 h-12 w-12 rounded-xl overflow-hidden bg-surface-2">
              {c.photos?.[0]?.url ? (
                <img src={c.photos[0].url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[11px] font-bold bg-surface-2 text-muted-foreground">
                  {c.subject?.charAt(0).toUpperCase() ?? "📚"}
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-foreground truncate">{c.title ?? `Check-in de ${c.subject}`}</p>
              <p className="text-xs font-semibold text-accent">{c.subject}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> {c.studyTime ?? "—"} · {fmtDuracao(c.durationMin)}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
      {onIrParaComunidade && (
        <button
          onClick={onIrParaComunidade}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
        >
          <CalendarCheck className="h-3.5 w-3.5" /> Ir para a Comunidade
        </button>
      )}
    </div>
  );
}