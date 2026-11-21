import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Clock,
  Calendar,
  Trash2,
  RotateCcw,
  Info,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Play,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/useToast";
import {
  studyPlanService,
  type OccurrenceStatus,
  type SourceType,
} from "@/services/studyPlanService";
import type { StudyPlanEvent } from "@/utils/generateWeekSchedule";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_ROUTE_MAP,
  WEEKDAY_NAMES_FULL,
} from "@/types/study-plan";
import "./study-plan.css";

interface OccurrenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  event: StudyPlanEvent | null;
}

/**
 * Formata data ISO (YYYY-MM-DD) para extenso: "Segunda-feira, 23 de novembro de 2026"
 */
function formatDateFull(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  const dayName = WEEKDAY_NAMES_FULL[d.getDay()];
  const months = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${dayName}, ${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

/**
 * Calcula duração formatada entre startTime e endTime
 */
function calculateDurationText(startTime: string, endTime: string): string {
  if (!startTime || !endTime) return "";
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

export function OccurrenceModal({
  isOpen,
  onClose,
  userId,
  event,
}: OccurrenceModalProps) {
  const toast = useToast();

  const [status, setStatus] = useState<OccurrenceStatus>("pending");
  const [scope, setScope] = useState<"single" | "series_from_today">("single");
  const [startTime, setStartTime] = useState<string>("08:00");
  const [endTime, setEndTime] = useState<string>("10:00");
  const [overrideTheme, setOverrideTheme] = useState<string>("");
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (event) {
      setStatus(event.status);
      setStartTime(event.startTime);
      setEndTime(event.endTime);
      setOverrideTheme(event.theme || "");
      setScope("single");
      setIsConfirmDeleteOpen(false);
    }
  }, [event]);

  if (!isOpen || !event) return null;

  const durationText = calculateDurationText(startTime, endTime);
  const isBlock = event.sourceType === "block";
  const navigate = useNavigate();

  const routeForActivity = ACTIVITY_TYPE_ROUTE_MAP[event.activityType] ?? null;
  const hasRoute = routeForActivity !== null;

  const handleStartActivity = () => {
    if (routeForActivity) {
      navigate(routeForActivity);
      onClose();
    }
  };

  const handleSave = async () => {
    try {
      setIsSubmitting(true);

      if (scope === "single") {
        await studyPlanService.upsertOccurrenceOverride(userId, event, {
          status,
          start_time: startTime,
          end_time: endTime,
          override_theme: overrideTheme.trim() || null,
        });
        toast.success("Ocorrência atualizada", { description: "Mudanças salvas para este dia." });
      } else {
        // Escopo de série
        if (isBlock) {
          await studyPlanService.updateWeeklyBlockSeriesFromToday(event.sourceId, {
            start_time: startTime,
            end_time: endTime,
          });
          // Status é sempre gravado na data atual
          await studyPlanService.setOccurrenceStatus(userId, event, status);
          toast.success("Série atualizada", { description: "A série foi atualizada a partir de hoje. O passado permanece preservado." });
        } else {
          // Extra event
          await studyPlanService.updateStudyExtraEvent(event.sourceId, {
            start_time: startTime,
            end_time: endTime,
          });
          await studyPlanService.setOccurrenceStatus(userId, event, status);
          toast.success("Exceção atualizada", { description: "A exceção foi atualizada para todas as semanas marcadas." });
        }
      }

      onClose();
    } catch (err: any) {
      toast.error("Erro ao salvar", { description: err.message || "Ocorreu um erro ao salvar a ocorrência." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsSubmitting(true);

      if (scope === "single") {
        await studyPlanService.deleteOccurrenceInstance(userId, event);
        toast.success("Evento removido", { description: "O evento deste dia foi removido." });
      } else {
        if (isBlock) {
          await studyPlanService.closeWeeklyBlockSeriesFromToday(event.sourceId);
          toast.success("Série encerrada", { description: "A série foi encerrada a partir de hoje. O histórico passado permanece intacto." });
        } else {
          await studyPlanService.deleteStudyExtraEvent(event.sourceId);
          toast.success("Exceção excluída", { description: "A exceção foi removida de todas as semanas." });
        }
      }

      onClose();
    } catch (err: any) {
      toast.error("Erro ao excluir", { description: err.message || "Não foi possível excluir a ocorrência." });
    } finally {
      setIsSubmitting(false);
      setIsConfirmDeleteOpen(false);
    }
  };

  const handleReset = async () => {
    try {
      setIsSubmitting(true);
      await studyPlanService.resetOccurrenceOverride(
        userId,
        event.sourceType,
        event.sourceId,
        event.date
      );
      toast.success("Padrão restaurado", { description: "A ocorrência voltou ao horário e tema da série." });
      onClose();
    } catch (err: any) {
      toast.error("Erro ao restaurar", { description: err.message || "Não foi possível restaurar o padrão." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="study-plan-scope fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="rf-card w-full max-w-lg p-6 relative animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-border pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ backgroundColor: event.taskColor }}
              />
              <span className="font-semibold text-lg">{event.taskName}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground">
                {ACTIVITY_TYPE_LABELS[event.activityType] || event.activityType}
              </span>
            </div>
            {event.theme && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Tema (P1): <span className="text-foreground font-medium">{event.theme}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded bg-muted hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Situação (Status Segmented Control) */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-muted-foreground mb-2">
            Situação (somente nesta data)
          </label>
          <div className="grid grid-cols-3 gap-2 bg-muted/40 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setStatus("pending")}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                status === "pending"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Pendente
            </button>

            <button
              type="button"
              onClick={() => setStatus("done")}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                status === "done"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Feita
            </button>

            <button
              type="button"
              onClick={() => setStatus("missed")}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                status === "missed"
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Não fiz
            </button>
          </div>
        </div>

        {/* Escopo da Edição */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-muted-foreground mb-2">
            Escopo das alterações / exclusão
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer p-2 rounded bg-muted/20 border border-border/50 hover:bg-muted/40 transition-colors">
              <input
                type="radio"
                name="scope"
                value="single"
                checked={scope === "single"}
                onChange={() => setScope("single")}
                className="text-primary focus:ring-primary"
              />
              Somente este evento
            </label>
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer p-2 rounded bg-muted/20 border border-border/50 hover:bg-muted/40 transition-colors">
              <input
                type="radio"
                name="scope"
                value="series_from_today"
                checked={scope === "series_from_today"}
                onChange={() => setScope("series_from_today")}
                className="text-primary focus:ring-primary"
              />
              {isBlock
                ? "Toda a série a partir de hoje"
                : "Todas as semanas desta exceção"}
            </label>
          </div>
          {scope === "series_from_today" && isBlock && (
            <div className="mt-2 p-2.5 rounded bg-primary/10 border border-primary/20 text-[11px] text-primary flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                As mudanças valem para todas as semanas a partir de hoje; o histórico passado permanece intacto.
              </span>
            </div>
          )}
        </div>

        {/* Campos Editáveis */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Horário Início
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Horário Fim
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Tema personalizado (opcional)
          </label>
          <input
            type="text"
            value={overrideTheme}
            onChange={(e) => setOverrideTheme(e.target.value)}
            placeholder="Substituir tema do período por um tema específico..."
            className="w-full bg-background border border-border rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>

        {/* Linhas Informativas */}
        <div className="rounded-lg bg-muted/30 p-3 mb-5 text-xs space-y-1.5 border border-border/40">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" /> Quando
            </span>
            <span className="font-medium text-foreground">{formatDateFull(event.date)}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" /> Horário & Duração
            </span>
            <span className="font-medium text-foreground">
              {startTime} – {endTime} ({durationText})
            </span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Repetição</span>
            <span className="font-medium text-foreground">
              {isBlock ? "Toda semana, no dia agendado" : "Somente nas semanas da exceção"}
            </span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Origem</span>
            <span className="font-medium text-foreground">
              {isBlock ? "Rotina semanal" : "Exceção da semana"}
            </span>
          </div>
        </div>

        {/* Confirmação de Exclusão */}
        {isConfirmDeleteOpen ? (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 mb-4 animate-in fade-in">
            <p className="text-xs text-rose-300 mb-3 font-medium">
              Tem certeza que deseja excluir?{" "}
              {scope === "single"
                ? "Apenas este evento do dia será removido."
                : isBlock
                ? "Toda a série futura será encerrada a partir de hoje."
                : "Todas as semanas desta exceção serão removidas."}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmDeleteOpen(false)}
                className="btn-ghost text-xs px-3 py-1"
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors"
                disabled={isSubmitting}
              >
                Sim, excluir
              </button>
            </div>
          </div>
        ) : null}

        {/* Botões de Ação */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="flex items-center gap-2">
            {!isConfirmDeleteOpen && (
              <button
                type="button"
                onClick={() => setIsConfirmDeleteOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium transition-colors"
                disabled={isSubmitting}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </button>
            )}

            {event.isOverride && (
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-muted hover:bg-white/10 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                disabled={isSubmitting}
                title="Restaurar valores padrão da série"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restaurar padrão
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasRoute && (
              <button
                type="button"
                onClick={handleStartActivity}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary/20 hover:bg-primary/30 text-primary text-xs font-medium border border-primary/30 transition-colors"
                disabled={isSubmitting}
                title="Abrir a página da atividade"
              >
                <Play className="h-3.5 w-3.5" />
                Iniciar atividade
              </button>
            )}
            {!hasRoute && (
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-muted hover:bg-white/10 text-muted-foreground text-xs font-medium border border-border/50 transition-colors cursor-not-allowed"
                disabled
                title="Sem rota disponível para este tipo de atividade"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Em breve
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost text-xs px-3 py-1.5"
              disabled={isSubmitting}
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="btn-sun text-xs px-4 py-1.5 font-medium"
              disabled={isSubmitting}
            >
              Salvar alterações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
