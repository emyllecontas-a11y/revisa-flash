import React, { useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Home,
  CheckSquare,
  Square,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sun,
  Sunset,
  Moon,
} from "lucide-react";
import { useToast } from "@/hooks/useToast";
import {
  studyPlanService,
  type OccurrenceStatus,
} from "@/services/studyPlanService";
import type { StudyPlanEvent, WeekSchedule } from "@/utils/generateWeekSchedule";
import { WEEKDAY_NAMES_FULL } from "@/types/study-plan";
import { OccurrenceModal } from "./index";
import "./study-plan.css";

const WEEKDAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

interface DailyListViewProps {
  userId: string;
  weekSchedule: WeekSchedule | null;
  weekStart: string;
  onWeekChange: (weekStart: string) => void;
  isLoading: boolean;
  selectedEvent: StudyPlanEvent | null;
  isOccurrenceModalOpen: boolean;
  onCloseModal: () => void;
  onEventClick: (event: StudyPlanEvent) => void;
  onToggleStatus: (e: React.MouseEvent, event: StudyPlanEvent) => void;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${String(start.getDate()).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")} – ${String(end.getDate()).padStart(2, "0")}/${String(end.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${WEEKDAY_NAMES_FULL[d.getDay()]}, ${d.getDate()} de ${d.toLocaleDateString("pt-BR", { month: "long" })} de ${d.getFullYear()}`;
}

function calculateDurationText(startTime: string, endTime: string): string {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60;
  const totalMin = endMin - startMin;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}min`;
  if (hours > 0) return `${hours}h`;
  return `${mins}min`;
}

function getShiftIcon(shift: "morning" | "afternoon" | "evening"): React.ReactNode {
  switch (shift) {
    case "morning": return <Sun className="h-3.5 w-3.5" />;
    case "afternoon": return <Sunset className="h-3.5 w-3.5" />;
    case "evening": return <Moon className="h-3.5 w-3.5" />;
  }
}

function getShiftLabel(shift: "morning" | "afternoon" | "evening"): string {
  switch (shift) {
    case "morning": return "Manhã";
    case "afternoon": return "Tarde";
    case "evening": return "Noite";
  }
}

export function DailyListView({
  userId,
  weekSchedule,
  weekStart,
  onWeekChange,
  isLoading,
  selectedEvent,
  isOccurrenceModalOpen,
  onCloseModal,
  onEventClick,
  onToggleStatus,
}: DailyListViewProps) {
  const toast = useToast();
  const todayStr = new Date().toISOString().split("T")[0];

  const navigateWeek = (delta: number) => {
    const current = new Date(weekStart + "T00:00:00");
    current.setDate(current.getDate() + delta * 7);
    onWeekChange(current.toISOString().split("T")[0]);
  };

  const goToToday = () => {
    const today = new Date();
    onWeekChange(getWeekStart(today).toISOString().split("T")[0]);
  };

  // Flatten all events grouped by day
  const daysWithEvents = useMemo(() => {
    if (!weekSchedule) return [];
    return weekSchedule.days.map((day) => {
      const allEvents = [...day.morning, ...day.afternoon, ...day.evening].sort(
        (a, b) => a.startTime.localeCompare(b.startTime)
      );
      return { ...day, allEvents };
    });
  }, [weekSchedule]);

  if (isLoading) {
    return (
      <div className="study-plan-scope flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!weekSchedule) {
    return (
      <div className="study-plan-scope flex items-center justify-center h-64 text-center">
        <div>
          <p className="text-muted-foreground mb-2">Não foi possível carregar a semana</p>
          <button onClick={goToToday} className="btn-sun">
            Ir para hoje
          </button>
        </div>
      </div>
    );
  }

  const totalEvents = daysWithEvents.reduce((sum, day) => sum + day.allEvents.length, 0);

  return (
    <div className="study-plan-scope">
      {/* Toolbar de navegação */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigateWeek(-1)}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={goToToday}
            className="btn-ghost text-sm whitespace-nowrap"
          >
            <Home className="h-4 w-4 mr-1" /> Hoje
          </button>
          <button
            onClick={() => navigateWeek(1)}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Próxima semana"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm">{formatWeekRange(weekStart)}</span>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rf-card p-3 text-center">
          <div className="font-display text-xl font-bold">
            {daysWithEvents.reduce((sum, day) => {
              return sum + day.allEvents.reduce((s, e) => {
                const [sh, sm] = e.startTime.split(":").map(Number);
                const [eh, em] = e.endTime.split(":").map(Number);
                let startMin = sh * 60 + sm;
                let endMin = eh * 60 + em;
                if (endMin <= startMin) endMin += 24 * 60;
                return s + (endMin - startMin);
              }, 0);
            }, 0) / 60}h
          </div>
          <div className="text-xs text-muted-foreground">Horas planejadas</div>
        </div>
        <div className="rf-card p-3 text-center">
          <div className="font-display text-xl font-bold">{totalEvents}</div>
          <div className="text-xs text-muted-foreground">Total de ocorrências</div>
        </div>
        <div className="rf-card p-3 text-center">
          <div className="font-display text-xl font-bold">
            {new Set(daysWithEvents.flatMap((d) => d.allEvents.map((e) => e.theme).filter(Boolean))).size}
          </div>
          <div className="text-xs text-muted-foreground">Temas ativos</div>
        </div>
      </div>

      {/* Lista por dia */}
      <div className="space-y-4">
        {daysWithEvents.map((day) => {
          const isToday = day.date === todayStr;
          const hasEvents = day.allEvents.length > 0;

          return (
            <div
              key={day.date}
              className={`rf-card ${isToday ? "ring-2 ring-primary/30" : ""}`}
            >
              {/* Cabeçalho do dia */}
              <div
                className={`p-3 border-b border-border ${
                  isToday ? "bg-primary/10" : "bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-lg">
                      {WEEKDAY_NAMES_FULL[new Date(day.date + "T12:00:00").getDay()]}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {formatDateFull(day.date)}
                    </span>
                    {isToday && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                        Hoje
                      </span>
                    )}
                    {day.isPast && !isToday && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                        Passado
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {day.allEvents.length} ocorrência{day.allEvents.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {/* Cards das ocorrências */}
              {hasEvents ? (
                <div className="p-2 space-y-2">
                  {day.allEvents.map((event, eventIdx) => {
                    const isDone = event.status === "done";
                    const isMissed = event.status === "missed";
                    const isOverdue = event.date < todayStr && event.status === "pending";

                    return (
                      <div
                        key={eventIdx}
                        onClick={() => onEventClick(event)}
                        className={`group relative p-3 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                          isDone ? "opacity-60 grayscale-[25%]" : ""
                        } ${isMissed ? "ring-2 ring-rose-500/80" : ""} ${
                          event.isExtra ? "ring-2 ring-primary/50" : ""
                        }`}
                        style={{ backgroundColor: event.taskColor }}
                      >
                        {/* Checkbox + Task Name */}
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={(e) => onToggleStatus(e, event)}
                            className="mt-0.5 shrink-0 rounded p-0.5 hover:bg-black/20 text-white/90 hover:text-white transition-colors"
                            title={isDone ? "Marcar como pendente" : "Marcar como feita"}
                          >
                            {isDone ? (
                              <CheckSquare className="h-5 w-5 text-emerald-300 fill-emerald-500/30" />
                            ) : (
                              <Square className="h-5 w-5 text-white/70 hover:text-white" />
                            )}
                          </button>

                          <div className={`font-semibold leading-tight flex-1 truncate ${isDone ? "line-through opacity-90" : ""}`}>
                            {event.taskName}
                          </div>
                        </div>

                        {/* Horário, Turno, Duração, Tipo */}
                        <div className="flex items-center justify-between mt-2 text-sm opacity-90">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 font-mono">
                              {getShiftIcon(getShift(event.startTime))}
                              <span>{event.startTime}–{event.endTime}</span>
                            </span>
                            <span className="uppercase tracking-wider opacity-80 text-[10px] font-medium px-2 rounded bg-black/15">
                              {getShiftLabel(getShift(event.startTime))}
                            </span>
                            <span className="uppercase tracking-wider opacity-80 text-[10px] font-medium px-2 rounded bg-black/15">
                              {event.activityType}
                            </span>
                          </div>
                          <span className="font-mono text-xs">{calculateDurationText(event.startTime, event.endTime)}</span>
                        </div>

                        {/* Tema */}
                        {event.theme && (
                          <div className="mt-2 text-sm opacity-90 truncate font-medium border-t border-white/15 pt-2">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {event.theme}
                            </span>
                          </div>
                        )}

                        {/* Badges / Selos */}
                        <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                          {isOverdue && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold shadow-sm animate-pulse">
                              <Clock className="h-3 w-3" />
                              Atrasada
                            </span>
                          )}
                          {isMissed && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-rose-950/80 text-rose-200 border border-rose-500/50 text-[10px] font-bold">
                              <AlertCircle className="h-3 w-3" />
                              Não fiz
                            </span>
                          )}
                          {isDone && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-200 border border-emerald-500/50 text-[10px] font-bold">
                              <CheckCircle2 className="h-3 w-3" />
                              Feita
                            </span>
                          )}
                          {event.isExtra && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-white/20 text-[10px] font-medium">
                              Exceção
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 text-center text-muted-foreground/50">
                  {day.isPast ? "—" : "Nada marcado neste dia"}
                </div>
              )}
            </div>
          );
        })}

        {/* Estado vazio da semana inteira */}
        {totalEvents === 0 && (
          <div className="rf-card p-8 text-center">
            <p className="text-muted-foreground mb-3">Nada marcado nesta semana</p>
            <button className="btn-sun">
              Montar a minha semana
            </button>
          </div>
        )}
      </div>

      {/* Modal de ocorrência */}
      <OccurrenceModal
        isOpen={isOccurrenceModalOpen}
        onClose={onCloseModal}
        userId={userId}
        event={selectedEvent}
      />
    </div>
  );
}

function getShift(startTime: string): "morning" | "afternoon" | "evening" {
  const hour = parseInt(startTime.split(":")[0], 10);
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}