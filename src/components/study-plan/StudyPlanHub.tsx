import React, { useState, useMemo, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  CalendarDays,
  Home,
  Sun,
  Sunset,
  Moon,
  Plus,
  Target,
  BarChart2,
  CheckSquare,
  Square,
  CheckCircle2,
  AlertCircle,
  Clock,
  Pause,
  Play,
  AlertTriangle,
  X,
  TrendingUp,
  Target as TargetIcon,
  Upload,
} from "lucide-react";
import { CronogramaImportModal } from "./CronogramaImportModal";
import { useToast } from "@/hooks/useToast";
import { useWeekSchedule } from "@/hooks/useWeekSchedule";
import { studyPlanService, type OccurrenceStatus, type StudyStatistics } from "@/services/studyPlanService";
import type { StudyPlanPause } from "@/types/study-plan";
import {
  WeeklyGridEditor,
  ThemeTimeline,
  TaskLibrary,
  ExceptionsManager,
  OccurrenceModal,
  DailyListView,
} from "./index";
import type { WeekSchedule, DaySchedule, StudyPlanEvent } from "@/utils/generateWeekSchedule";
import "./study-plan.css";

/**
 * Hook para detectar se a tela é mobile (< 768px)
 */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  return isMobile;
}

const WEEKDAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const WEEKDAY_FULL = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];

/**
 * Retorna a segunda-feira (início da semana ISO) de uma data
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Dom..6=Sáb
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Formata data como "DD/MM"
 */
function formatDateShort(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Formata semana como "DD/MM – DD/MM"
 */
function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${formatDateShort(start)} – ${formatDateShort(end)}`;
}

/**
 * Gera semanas do mês para visão mensal
 */
function getMonthWeeks(year: number, month: number): Date[] {
  const weeks: Date[] = [];
  const firstDay = new Date(year, month, 1);
  let weekStart = getWeekStart(firstDay);
  const lastDay = new Date(year, month + 1, 0);
  while (weekStart <= lastDay) {
    weeks.push(new Date(weekStart));
    weekStart = new Date(weekStart);
    weekStart.setDate(weekStart.getDate() + 7);
  }
  return weeks;
}

type TabName = "visao" | "rotina" | "temas" | "biblioteca" | "excecoes";

interface TabConfig {
  id: TabName;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabConfig[] = [
  { id: "visao", label: "Visão geral", icon: <BarChart2 className="h-4 w-4" /> },
  { id: "rotina", label: "Rotina semanal", icon: <Calendar className="h-4 w-4" /> },
  { id: "temas", label: "Cronograma de temas", icon: <Target className="h-4 w-4" /> },
  { id: "biblioteca", label: "Biblioteca de atividades", icon: <Home className="h-4 w-4" /> },
  { id: "excecoes", label: "Exceções da semana", icon: <CalendarDays className="h-4 w-4" /> },
];

interface StudyPlanHubProps {
  userId: string;
}

export function StudyPlanHub({ userId }: StudyPlanHubProps) {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<TabName>("visao");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [weekStart, setWeekStart] = useState<string>(() => {
    const today = new Date();
    return getWeekStart(today).toISOString().split("T")[0];
  });
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [monthViewDate, setMonthViewDate] = useState<Date>(new Date());

  // Modal de edição/detalhes da ocorrência (ETAPA 6)
  const [selectedEvent, setSelectedEvent] = useState<StudyPlanEvent | null>(null);
  const [isOccurrenceModalOpen, setIsOccurrenceModalOpen] = useState<boolean>(false);

  const { weekSchedule, isLoading, reload } = useWeekSchedule(userId, weekStart);

  // Estado de Pausas (ETAPA 7)
  const [pauses, setPauses] = useState<StudyPlanPause[]>([]);
  const [isPauseModalOpen, setIsPauseModalOpen] = useState(false);
  const [pauseForm, setPauseForm] = useState({ startDate: "", endDate: "", reason: "" });

  // Carregar pausas
  useEffect(() => {
    if (!userId) return;
    studyPlanService.getStudyPlanPauses(userId).then(setPauses);
    const unsub = studyPlanService.subscribeStudyPlanPauses(userId, setPauses);
    return () => unsub();
  }, [userId]);

  // Estatísticas de Aderência (FASE 4 - M2)
  const [stats, setStats] = useState<StudyStatistics | null>(null);
  const [statsPeriod, setStatsPeriod] = useState<{ start: string; end: string }>({ start: '', end: '' });

  // Calcular período baseado no viewMode (semana ou mês)
  useEffect(() => {
    if (!weekSchedule) return;
    let start: string, end: string;
    if (viewMode === 'week') {
      start = weekSchedule.weekStart;
      const d = new Date(start + 'T00:00:00');
      d.setDate(d.getDate() + 6);
      end = d.toISOString().split('T')[0];
    } else {
      // Mês: primeira e última semana do mês mostrado
      const firstWeek = getMonthWeeks(monthViewDate.getFullYear(), monthViewDate.getMonth())[0];
      start = firstWeek.toISOString().split('T')[0];
      const lastWeek = getMonthWeeks(monthViewDate.getFullYear(), monthViewDate.getMonth()).pop()!;
      const d = new Date(lastWeek);
      d.setDate(d.getDate() + 6);
      end = d.toISOString().split('T')[0];
    }
    setStatsPeriod({ start, end });
  }, [viewMode, weekSchedule, monthViewDate]);

  // Subscrição reativa às estatísticas
  useEffect(() => {
    if (!userId || !statsPeriod.start || !statsPeriod.end) return;
    const unsub = studyPlanService.useStudyStatistics(userId, statsPeriod.start, statsPeriod.end, setStats);
    return () => unsub();
  }, [userId, statsPeriod.start, statsPeriod.end]);

  // Verifica se há pausa ativa hoje
  const todayStr = new Date().toISOString().split("T")[0];
  const todayDate = new Date(todayStr + "T12:00:00");
  todayDate.setHours(0, 0, 0, 0);

  const activePause = useMemo(() => {
    return pauses.find((p) => {
      const start = new Date(p.start_date + "T00:00:00");
      const end = new Date(p.end_date + "T00:00:00");
      return todayDate >= start && todayDate <= end;
    });
  }, [pauses, todayStr]);

  // Dias para mostrar no seletor de data (hoje + próximos 60 dias)
  const availableDates = useMemo(() => {
    const dates: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i <= 60; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }
    return dates;
  }, []);

  // Navegação de semana
  const navigateWeek = (delta: number) => {
    const current = new Date(weekStart + "T00:00:00");
    current.setDate(current.getDate() + delta * 7);
    setWeekStart(current.toISOString().split("T")[0]);
  };

  const goToToday = () => {
    const today = new Date();
    setWeekStart(getWeekStart(today).toISOString().split("T")[0]);
  };

  // Navegação de mês
  const navigateMonth = (delta: number) => {
    setMonthViewDate((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  };

  // Toggle de status direto pelo check do card (Feita ↔ Pendente)
  const handleToggleStatus = async (e: React.MouseEvent, event: StudyPlanEvent) => {
    e.stopPropagation();
    try {
      const newStatus: OccurrenceStatus = event.status === "done" ? "pending" : "done";
      await studyPlanService.setOccurrenceStatus(userId, event, newStatus);
      toast.success(
        newStatus === "done" ? "Marcada como feita" : "Marcada como pendente",
        { description: `${event.taskName} (${event.date})` }
      );
    } catch (err: any) {
      toast.error("Erro ao atualizar status", { description: err.message || "Não foi possível alterar a situação." });
    }
  };

  // Clique no card abre o OccurrenceModal
  const handleEventClick = (event: StudyPlanEvent) => {
    setSelectedEvent(event);
    setIsOccurrenceModalOpen(true);
  };

  // Estatísticas da semana
  const weekStats = useMemo(() => {
    if (!weekSchedule) return { totalHours: 0, totalEvents: 0, activeThemes: [] as string[] };
    let totalMinutes = 0;
    let totalEvents = 0;
    const themesSet = new Set<string>();
    weekSchedule.days.forEach((day) => {
      [...day.morning, ...day.afternoon, ...day.evening].forEach((event) => {
        const [sh, sm] = event.startTime.split(":").map(Number);
        const [eh, em] = event.endTime.split(":").map(Number);
        let startMin = sh * 60 + sm;
        let endMin = eh * 60 + em;
        if (endMin <= startMin) endMin += 24 * 60;
        totalMinutes += endMin - startMin;
        totalEvents++;
        if (event.theme) themesSet.add(event.theme);
      });
    });
    return {
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      totalEvents,
      activeThemes: Array.from(themesSet),
    };
  }, [weekSchedule]);

  // ============================================================
  // HANDLERS DE PAUSA (ETAPA 7)
  // ============================================================
  const handleOpenPauseModal = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setPauseForm({
      startDate: today.toISOString().split("T")[0],
      endDate: tomorrow.toISOString().split("T")[0],
      reason: "",
    });
    setIsPauseModalOpen(true);
  };

  const handleCreatePause = async () => {
    if (!pauseForm.startDate || !pauseForm.endDate) {
      toast.warning("Preencha data de início e fim");
      return;
    }
    if (pauseForm.startDate > pauseForm.endDate) {
      toast.warning("Data de fim deve ser posterior ao início");
      return;
    }
    if (pauseForm.startDate < todayStr) {
      toast.warning("Início da pausa não pode ser no passado");
      return;
    }
    try {
      await studyPlanService.createStudyPlanPause({
        start_date: pauseForm.startDate,
        end_date: pauseForm.endDate,
        reason: pauseForm.reason.trim() || null,
      });
      toast.success("Plano pausado", { description: `De ${pauseForm.startDate} a ${pauseForm.endDate}` });
      setIsPauseModalOpen(false);
      setPauseForm({ startDate: "", endDate: "", reason: "" });
      reload();
    } catch (err: any) {
      toast.error("Erro ao pausar", { description: err.message || "Não foi possível criar a pausa." });
    }
  };

  const handleResumeNow = async () => {
    try {
      await studyPlanService.resumeStudyPlanNow();
      toast.success("Plano retomado", { description: "A pausa foi encerrada ontem. O plano volta a gerar ocorrências." });
      reload();
    } catch (err: any) {
      toast.error("Erro ao retomar", { description: err.message || "Não foi possível retomar o plano." });
    }
  };

  // Renderização da aba "Visão geral"
  const renderVisaoGeral = () => {
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

    // Mobile: usa DailyListView (lista vertical por dia) em vez de grade/mês
    if (isMobile) {
      return (
        <DailyListView
          userId={userId}
          weekSchedule={weekSchedule}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
          isLoading={isLoading}
          selectedEvent={selectedEvent}
          isOccurrenceModalOpen={isOccurrenceModalOpen}
          onCloseModal={() => {
            setIsOccurrenceModalOpen(false);
            setSelectedEvent(null);
          }}
          onEventClick={handleEventClick}
          onToggleStatus={handleToggleStatus}
        />
      );
    }

    if (viewMode === "week") {
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
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                <button
                  onClick={() => setViewMode("week")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === "week"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-white/5"
                  }`}
                >
                  <Sun className="h-3.5 w-3.5" />
                  Semana
                </button>
                <button
                  onClick={() => setViewMode("month")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    (viewMode as "week" | "month") === "month"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-white/5"
                  }`}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Mês
                </button>
              </div>
            </div>
          </div>

          {/* Estatísticas */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rf-card p-3 text-center">
              <div className="font-display text-xl font-bold">{weekStats.totalHours}h</div>
              <div className="text-xs text-muted-foreground">Horas planejadas</div>
            </div>
            <div className="rf-card p-3 text-center">
              <div className="font-display text-xl font-bold">{weekStats.totalEvents}</div>
              <div className="text-xs text-muted-foreground">Total de ocorrências</div>
            </div>
            <div className="rf-card p-3 text-center">
              <div className="font-display text-xl font-bold">{weekStats.activeThemes.length}</div>
              <div className="text-xs text-muted-foreground">Temas ativos</div>
            </div>
          </div>

          {/* Botão Importar cronograma */}
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="rf-button inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              <Upload className="w-4 h-4 mr-2" />
              Importar cronograma
            </button>
          </div>
          {importModalOpen && (
            <CronogramaImportModal
              userId={userId}
              isOpen={importModalOpen}
              onClose={() => setImportModalOpen(false)}
            />
          )}

          {/* Aderência: Horas planejadas vs Efetivas (FASE 4 - M2) */}
          <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rf-card p-3 text-center">
              <div className="font-display text-xl font-bold text-blue-600 dark:text-blue-400">
                {Math.round((stats?.plannedMinutes || 0) / 60 * 10) / 10}h
              </div>
              <div className="text-xs text-muted-foreground">Planejadas</div>
            </div>
            <div className="rf-card p-3 text-center">
              <div className="font-display text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {Math.round((stats?.effectiveMinutes || 0) / 60 * 10) / 10}h
              </div>
              <div className="text-xs text-muted-foreground">Efetivas</div>
            </div>
            <div className="rf-card p-3 text-center">
              <div className="font-display text-xl font-bold" style={{ color: stats && stats.adherence >= 1 ? 'var(--success)' : stats && stats.adherence >= 0.8 ? 'var(--warning)' : 'var(--destructive)' }}>
                {stats ? Math.round(stats.adherence * 100) : 0}%
              </div>
              <div className="text-xs text-muted-foreground">Aderência</div>
            </div>
            <div className="rf-card p-3 text-center">
              <div className="font-display text-xl font-bold text-purple-600 dark:text-purple-400">
                {stats?.daysWithActivity || 0}
              </div>
              <div className="text-xs text-muted-foreground">Dias c/ atividade</div>
            </div>
          </div>

          {/* Faixa de pausa ativa (ETAPA 7) */}
          {activePause && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4 animate-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-300">Plano pausado até {formatDateShort(new Date(activePause.end_date + "T00:00:00"))}</p>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Retoma sozinho em {Math.ceil((new Date(activePause.end_date + "T00:00:00").getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} dia(s)
                    {activePause.reason && ` — ${activePause.reason}`}
                  </p>
                </div>
              </div>
              <button
                onClick={handleResumeNow}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors shrink-0"
              >
                <Play className="h-4 w-4" /> Retomar agora
              </button>
            </div>
          )}

          {/* Botão "Pausar plano" quando não há pausa ativa */}
          {!activePause && (
            <div className="mb-4 text-right">
              <button
                onClick={handleOpenPauseModal}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 text-sm font-medium transition-colors"
              >
                <Pause className="h-4 w-4" /> Pausar plano
              </button>
            </div>
          )}

          {/* Grade semanal - 7 colunas × 3 turnos */}
          <div className="rf-card overflow-hidden">
            {/* Cabeçalho dos dias */}
            <div className="grid grid-cols-7 border-b border-border bg-muted/50">
              {WEEKDAY_NAMES.map((dayName, dayIdx) => {
                const date = new Date(weekSchedule.weekStart + "T00:00:00");
                date.setDate(date.getDate() + dayIdx);
                const isToday = date.toISOString().split("T")[0] === todayStr;
                const dayNumber = date.getDate();
                return (
                  <div
                    key={dayIdx}
                    className={`p-2 text-center border-r border-border ${isToday ? "bg-primary text-primary-foreground" : "bg-muted/50"}`}
                  >
                    <div className="font-semibold text-sm">{dayName}</div>
                    <div className={`text-lg font-bold ${isToday ? "text-primary-foreground" : "text-foreground"}`}>
                      {dayNumber}
                    </div>
                    {isToday && <div className="text-xs font-medium mt-0.5">Hoje</div>}
                  </div>
                );
              })}
            </div>

            {/* Linhas de turno: Manhã, Tarde, Noite */}
            <div className="grid grid-cols-7">
              {/* Coluna de rótulos dos turnos */}
              <div className="col-span-1 flex flex-col">
                {([
                  { id: "morning", label: "Manhã", icon: <Sun className="h-3.5 w-3.5" /> },
                  { id: "afternoon", label: "Tarde", icon: <Sunset className="h-3.5 w-3.5" /> },
                  { id: "evening", label: "Noite", icon: <Moon className="h-3.5 w-3.5" /> },
                ] as const).map((shift) => (
                  <div
                    key={shift.id}
                    className="flex items-center justify-center p-2 border-b border-border border-r border-border bg-muted/30 min-h-[120px]"
                    style={{ minHeight: "120px" }}
                  >
                    <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                      {shift.icon}
                      <span className="font-medium">{shift.label}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Células dos dias por turno */}
              {weekSchedule.days.map((day, dayIdx) => (
                <React.Fragment key={dayIdx}>
                  {([
                    { id: "morning", events: day.morning },
                    { id: "afternoon", events: day.afternoon },
                    { id: "evening", events: day.evening },
                  ] as const).map((shift) => (
                    <div
                      key={shift.id}
                      className={`relative border-b border-border border-r border-border min-h-[120px] p-1.5 ${day.isPast ? "bg-muted/20" : ""} ${day.isToday ? "ring-1 ring-inset ring-primary/30" : ""}`}
                      style={{ minHeight: "120px" }}
                    >
                      {shift.events.length === 0 ? (
                        <div className="text-center text-muted-foreground/50 text-xs h-full flex items-center justify-center">
                          {day.isPast ? "—" : "Nada marcado"}
                        </div>
                      ) : (
                        shift.events.map((event, eventIdx) => {
                          const isDone = event.status === "done";
                          const isMissed = event.status === "missed";
                          const isOverdue = event.date < todayStr && event.status === "pending";
                          return (
                            <div
                              key={eventIdx}
                              onClick={() => handleEventClick(event)}
                              className={`group relative mb-1.5 rounded-md p-2 text-xs transition-all cursor-pointer hover:shadow-md hover:scale-[1.01] ${
                                isDone ? "opacity-60 grayscale-[25%]" : ""
                              } ${
                                isMissed ? "ring-2 ring-rose-500/80" : ""
                              } ${
                                event.isExtra ? "ring-2 ring-primary/50" : ""
                              }`}
                              style={{
                                backgroundColor: event.taskColor,
                                color: "#ffffff",
                              }}
                            >
                              {/* Checkbox + Task Name */}
                              <div className="flex items-start justify-between gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleStatus(e, event)}
                                  className="mt-0.5 shrink-0 rounded p-0.5 hover:bg-black/20 text-white/90 hover:text-white transition-colors"
                                  title={isDone ? "Marcar como pendente" : "Marcar como feita"}
                                >
                                  {isDone ? (
                                    <CheckSquare className="h-4 w-4 text-emerald-300 fill-emerald-500/30" />
                                  ) : (
                                    <Square className="h-4 w-4 text-white/70 hover:text-white" />
                                  )}
                                </button>
                                <div className={`font-semibold text-xs leading-tight flex-1 truncate ${isDone ? "line-through opacity-90" : ""}`}>
                                  {event.taskName}
                                </div>
                              </div>

                              {/* Horário & Atividade */}
                              <div className="flex items-center justify-between mt-1 text-[10px] opacity-90">
                                <span className="font-mono">{event.startTime}–{event.endTime}</span>
                                <span className="uppercase tracking-wider opacity-80 text-[9px] font-medium px-1 rounded bg-black/15">
                                  {event.activityType}
                                </span>
                              </div>

                              {/* Tema */}
                              {event.theme && (
                                <div className="mt-1 text-[10px] opacity-90 truncate font-medium border-t border-white/15 pt-0.5">
                                  {event.theme}
                                </div>
                              )}

                              {/* Badges / Selos */}
                              <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                                {isOverdue && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-bold shadow-sm animate-pulse">
                                    <Clock className="h-2.5 w-2.5" />
                                    Atrasada
                                  </span>
                                )}
                                {isMissed && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-200 border border-rose-500/50 text-[9px] font-bold">
                                    <AlertCircle className="h-2.5 w-2.5" />
                                    Não fiz
                                  </span>
                                )}
                                {isDone && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-200 border border-emerald-500/50 text-[9px] font-bold">
                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                    Feita
                                  </span>
                                )}
                                {event.isExtra && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/20 text-[9px] font-medium">
                                    Exceção
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Estado vazio */}
          {weekStats.totalEvents === 0 && (
            <div className="rf-card p-8 text-center mt-4">
              <p className="text-muted-foreground mb-3">Nada marcado nesta semana</p>
              <button
                onClick={() => setActiveTab("rotina")}
                className="btn-sun"
              >
                <Plus className="h-4 w-4 mr-1" /> Montar a minha semana
              </button>
            </div>
          )}

          {/* Temas ativos do período */}
          {weekStats.activeThemes.length > 0 && (
            <div className="rf-card p-4 mt-4">
              <div className="font-medium mb-2 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Temas ativos desta semana
              </div>
              <div className="flex flex-wrap gap-2">
                {weekStats.activeThemes.map((theme) => (
                  <span
                    key={theme}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
                  >
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    } else {
      // Visão Mês
      const monthWeeks = getMonthWeeks(monthViewDate.getFullYear(), monthViewDate.getMonth());
      return (
        <div className="study-plan-scope">
          {/* Toolbar de navegação do mês */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigateMonth(-1)}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => {
                  setMonthViewDate(new Date());
                  setViewMode("week");
                  goToToday();
                }}
                className="btn-ghost text-sm whitespace-nowrap"
              >
                <Home className="h-4 w-4 mr-1" /> Hoje
              </button>
              <button
                onClick={() => navigateMonth(1)}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium text-sm">
                {monthViewDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </span>
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                <button
                  onClick={() => setViewMode("week")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    (viewMode as "week" | "month") === "week"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-white/5"
                  }`}
                >
                  <Sun className="h-3.5 w-3.5" />
                  Semana
                </button>
                <button
                  onClick={() => setViewMode("month")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    (viewMode as "week" | "month") === "month"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-white/5"
                  }`}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Mês
                </button>
              </div>
            </div>
          </div>

          {/* Estatísticas do mês */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rf-card p-3 text-center">
              <div className="font-display text-xl font-bold text-blue-600 dark:text-blue-400">
                {Math.round((stats?.plannedMinutes || 0) / 60 * 10) / 10}h
              </div>
              <div className="text-xs text-muted-foreground">Planejadas</div>
            </div>
            <div className="rf-card p-3 text-center">
              <div className="font-display text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {Math.round((stats?.effectiveMinutes || 0) / 60 * 10) / 10}h
              </div>
              <div className="text-xs text-muted-foreground">Efetivas</div>
            </div>
            <div className="rf-card p-3 text-center">
              <div className="font-display text-xl font-bold" style={{ color: stats && stats.adherence >= 1 ? 'var(--success)' : stats && stats.adherence >= 0.8 ? 'var(--warning)' : 'var(--destructive)' }}>
                {stats ? Math.round(stats.adherence * 100) : 0}%
              </div>
              <div className="text-xs text-muted-foreground">Aderência</div>
            </div>
            <div className="rf-card p-3 text-center">
              <div className="font-display text-xl font-bold text-purple-600 dark:text-purple-400">
                {stats?.daysWithActivity || 0}
              </div>
              <div className="text-xs text-muted-foreground">Dias c/ atividade</div>
            </div>
          </div>

          {/* Grade mensal: 7 colunas × semanas do mês */}
          <div className="rf-card overflow-hidden">
            {/* Cabeçalho dos dias da semana */}
            <div className="grid grid-cols-7 border-b border-border bg-muted/50">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                <div key={i} className="px-2 py-2 text-center text-[10px] font-medium tracking-widest text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>

            {/* Semanas do mês */}
            <div className="grid grid-cols-7">
              {monthWeeks.map((weekStartDate, weekIdx) => {
                const weekStartStr = weekStartDate.toISOString().split("T")[0];
                return WEEKDAY_NAMES.map((_, dayIdx) => {
                  const cellDate = new Date(weekStartDate);
                  cellDate.setDate(cellDate.getDate() + dayIdx);
                  const cellDateStr = cellDate.toISOString().split("T")[0];
                  const isCurrentMonth = cellDate.getMonth() === monthViewDate.getMonth();
                  const isToday = cellDateStr === todayStr;
                  const isCurrentWeek = weekStartStr === weekSchedule?.weekStart;
                  let events: StudyPlanEvent[] = [];
                  if (isCurrentWeek && weekSchedule) {
                    const day = weekSchedule.days[dayIdx];
                    if (day) {
                      events = [...day.morning, ...day.afternoon, ...day.evening];
                    }
                  }
                  return (
                    <div
                      key={`${weekIdx}-${dayIdx}`}
                      className={`relative aspect-square p-1 border-r border-border border-b border-border ${!isCurrentMonth ? "bg-muted/30" : ""} ${isToday ? "bg-primary/10 ring-1 ring-inset ring-primary" : ""}`}
                    >
                      <div className={`text-xs font-medium ${isToday ? "text-primary" : "text-foreground/60"}`}>
                        {cellDate.getDate()}
                      </div>
                      {events.length > 0 && (
                        <div className="mt-1 space-y-1 overflow-hidden max-h-[80px]">
                          {events.slice(0, 3).map((event, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleEventClick(event)}
                              className="text-[9px] px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity"
                              style={{
                                backgroundColor: event.taskColor,
                                color: "#ffffff",
                              }}
                              title={`${event.taskName} (${event.startTime}–${event.endTime})`}
                            >
                              {event.startTime} {event.taskName}
                            </div>
                          ))}
                          {events.length > 3 && (
                            <div className="text-[9px] text-center text-muted-foreground">
                              +{events.length - 3} mais
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })}
            </div>
          </div>
        </div>
      );
    }
  };

  // Renderização das outras abas
  const renderTabContent = () => {
    switch (activeTab) {
      case "visao":
        return renderVisaoGeral();
      case "rotina":
        return (
          <div className="study-plan-scope h-[calc(100vh-140px)] min-h-[600px]">
            <WeeklyGridEditor userId={userId} weekStart={weekStart} />
          </div>
        );
      case "temas":
        return <ThemeTimeline userId={userId} />;
      case "biblioteca":
        return <TaskLibrary userId={userId} />;
      case "excecoes":
        return <ExceptionsManager userId={userId} />;
      default:
        return null;
    }
  };

  return (
    <div className="study-plan-scope h-full flex flex-col">
      {/* Abas do hub */}
      <div className="border-b border-border mb-4 flex gap-1" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-primary/50"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba ativa */}
      <div className="flex-1 overflow-auto" role="tabpanel">
        {renderTabContent()}
      </div>

      {/* Modal de Detalhes / Edição de Ocorrência */}
      <OccurrenceModal
        isOpen={isOccurrenceModalOpen}
        onClose={() => {
          setIsOccurrenceModalOpen(false);
          setSelectedEvent(null);
        }}
        userId={userId}
        event={selectedEvent}
      />

      {/* Modal Pausar Plano (ETAPA 7) */}
      {isPauseModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="rf-card w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Pausar plano de estudos</h3>
              <button
                onClick={() => setIsPauseModalOpen(false)}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Início da pausa (não pode ser no passado)
                </label>
                <input
                  type="date"
                  value={pauseForm.startDate}
                  onChange={(e) => setPauseForm({ ...pauseForm, startDate: e.target.value })}
                  min={todayStr}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Fim da pausa
                </label>
                <input
                  type="date"
                  value={pauseForm.endDate}
                  onChange={(e) => setPauseForm({ ...pauseForm, endDate: e.target.value })}
                  min={pauseForm.startDate || todayStr}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Motivo (opcional)
                </label>
                <textarea
                  value={pauseForm.reason}
                  onChange={(e) => setPauseForm({ ...pauseForm, reason: e.target.value })}
                  rows={3}
                  placeholder="Ex: viagem, prova, problemas de saúde..."
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
              <div className="p-3 rounded bg-muted/50 border border-border/50 text-sm text-muted-foreground">
                <p className="font-medium mb-1">Como funciona a pausa:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Ocorrências dentro do período são <strong>ocultadas</strong> (não contam como "Não fiz").</li>
                  <li>Ocorrências já marcadas como <strong>Feita</strong> ou <strong>Não fiz</strong> <strong>não são afetadas</strong> (histórico preservado).</li>
                  <li>Ocorrências com <strong>override manual</strong> (horário, tema, status) <strong>também não são ocultadas</strong>.</li>
                  <li>Ao passar a data de fim, o plano <strong>retoma automaticamente</strong>.</li>
                  <li>Botão "Retomar agora" encerra a pausa ontem.</li>
                </ul>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setIsPauseModalOpen(false)}
                className="btn-ghost text-sm px-4 py-2"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreatePause}
                className="btn-sun text-sm px-4 py-2 font-medium"
              >
                Pausar plano
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}