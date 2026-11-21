import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Calendar,
  CalendarDays,
  X,
  AlertCircle,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { useStudyTasks } from "@/hooks/useStudyTasks";
import {
  createStudyTask,
  createStudyExtraEvent,
  deleteStudyExtraEvent,
  getStudyExtraEvents,
  getStudyWeeklyBlocks,
} from "@/services/studyPlanService";
import type { StudyTask, StudyExtraEvent, StudyWeeklyBlock, Weekday } from "@/types/study-plan";
import "./study-plan.css";

const WEEKDAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAY_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

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
 * Formata mês/ano para exibição
 */
function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/**
 * Gera array de segundas-feiras que intersectam o mês
 */
function getMonthWeekStarts(year: number, month: number): Date[] {
  const weeks: Date[] = [];
  // Primeira segunda do mês (ou anterior)
  const firstDay = new Date(year, month, 1);
  let weekStart = getWeekStart(firstDay);

  // Último dia do mês
  const lastDay = new Date(year, month + 1, 0);

  while (weekStart <= lastDay) {
    weeks.push(new Date(weekStart));
    weekStart = new Date(weekStart);
    weekStart.setDate(weekStart.getDate() + 7);
  }

  return weeks;
}

interface ExceptionsManagerProps {
  userId: string;
}

export function ExceptionsManager({ userId }: ExceptionsManagerProps) {
  const { tasks, reload: reloadTasks } = useStudyTasks(userId);
  const [extras, setExtras] = useState<StudyExtraEvent[]>([]);
  const [weeklyBlocks, setWeeklyBlocks] = useState<StudyWeeklyBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Mês atual sendo visualizado
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Form state para "Acrescentar uma tarefa só nestas semanas"
  const [formTaskId, setFormTaskId] = useState<string>("");
  const [formNewTaskName, setFormNewTaskName] = useState("");
  const [formStartTime, setFormStartTime] = useState("19:00");
  const [formEndTime, setFormEndTime] = useState("21:00");
  const [formWeekdays, setFormWeekdays] = useState<Weekday[]>([]);
  const [formSelectedWeeks, setFormSelectedWeeks] = useState<string[]>([]);
  const [showNewTaskInput, setShowNewTaskInput] = useState(false);
  const [isSavingExtra, setIsSavingExtra] = useState(false);

  // Modal para criar nova tarefa
  const [showTaskCreateModal, setShowTaskCreateModal] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({
    name: "",
    activity_type: "theory" as const,
    color: "#3B82F6",
    theme_rule: "period" as const,
    default_duration_min: 90,
  });
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const toast = useToast();
  const confirmDialog = useConfirm();

  // Load data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [extrasData, blocksData] = await Promise.all([
        getStudyExtraEvents(userId),
        getStudyWeeklyBlocks(userId),
      ]);
      setExtras(extrasData);
      setWeeklyBlocks(blocksData);
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
      toast.error("Erro ao carregar exceções");
    } finally {
      setIsLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Week starts do mês atual
  const monthWeekStarts = useMemo(() => getMonthWeekStarts(currentMonth.getFullYear(), currentMonth.getMonth()), [currentMonth]);

  // Week starts como strings ISO
  const monthWeekStartsStr = useMemo(() => monthWeekStarts.map((d) => d.toISOString().split("T")[0]), [monthWeekStarts]);

  // Blocos ativos para cada semana do mês (para tabela "O padrão da semana neste mês")
  const activeBlocksPerWeek = useMemo(() => {
    const result: Record<string, StudyWeeklyBlock[]> = {};
    monthWeekStartsStr.forEach((weekStart) => {
      const weekEnd = new Date(weekStart + "T00:00:00");
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().split("T")[0];

      result[weekStart] = weeklyBlocks.filter((b) => {
        if (b.isDeleted) return false;
        if (b.effective_from > weekEndStr) return false;
        if (b.effective_until && b.effective_until < weekStart) return false;
        return true;
      });
    });
    return result;
  }, [weeklyBlocks, monthWeekStartsStr]);

  // Extras deste mês
  const monthExtras = useMemo(() => {
    return extras.filter((e) =>
      e.week_starts.some((ws) => monthWeekStartsStr.includes(ws))
    );
  }, [extras, monthWeekStartsStr]);

  // Navegação de mês
  const navigateMonth = (delta: number) => {
    setCurrentMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
    // Reset form week selection
    setFormSelectedWeeks([]);
  };

  // Helpers para formulário
  const toggleWeekday = (weekday: Weekday) => {
    setFormWeekdays((prev) =>
      prev.includes(weekday) ? prev.filter((w) => w !== weekday) : [...prev, weekday]
    );
  };

  const selectAllWeekdays = () => {
    setFormWeekdays([1, 2, 3, 4, 5]); // Seg-Sex
  };

  const toggleWeek = (weekStart: string) => {
    setFormSelectedWeeks((prev) =>
      prev.includes(weekStart) ? prev.filter((w) => w !== weekStart) : [...prev, weekStart]
    );
  };

  const handleAddExtra = async () => {
    if (!formTaskId && !formNewTaskName.trim()) {
      toast.error("Selecione uma tarefa ou digite um nome para nova tarefa");
      return;
    }
    if (formWeekdays.length === 0) {
      toast.error("Selecione pelo menos um dia da semana");
      return;
    }
    if (formSelectedWeeks.length === 0) {
      toast.error("Selecione pelo menos uma semana");
      return;
    }

    let finalTaskId = formTaskId;

    // Se "Escrever uma tarefa nova", criar a tarefa primeiro
    if (!formTaskId && formNewTaskName.trim()) {
      try {
        setIsSavingExtra(true);
        const newTask = await createStudyTask({
          name: formNewTaskName.trim(),
          activity_type: "theory",
          color: "#3B82F6",
          theme_rule: "period",
          default_duration_min: 90,
        });
        finalTaskId = newTask.id;
        await reloadTasks();
        toast.success(`Tarefa "${newTask.name}" criada`);
      } catch (e) {
        console.error(e);
        toast.error("Erro ao criar tarefa");
        setIsSavingExtra(false);
        return;
      }
    }

    if (!finalTaskId) return;

    try {
      setIsSavingExtra(true);
      const newExtra = await createStudyExtraEvent({
        task_id: finalTaskId,
        weekdays: formWeekdays,
        start_time: formStartTime,
        end_time: formEndTime,
        week_starts: formSelectedWeeks,
      });
      setExtras((prev) => [...prev, newExtra]);
      toast.success("Exceção adicionada nas semanas selecionadas");
      // Reset form
      setFormTaskId("");
      setFormNewTaskName("");
      setFormWeekdays([]);
      setFormSelectedWeeks([]);
      setShowNewTaskInput(false);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao adicionar exceção");
    } finally {
      setIsSavingExtra(false);
    }
  };

  const handleDeleteExtra = async (extraId: string) => {
    const ok = await confirmDialog({
      title: "Excluir exceção?",
      description: "Esta exceção será removida de todas as semanas selecionadas.",
      confirmText: "Sim, excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;

    try {
      await deleteStudyExtraEvent(extraId);
      setExtras((prev) => prev.filter((e) => e.id !== extraId));
      toast.success("Exceção excluída");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao excluir exceção");
    }
  };

  const handleCreateTaskInModal = async () => {
    if (!newTaskForm.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    try {
      setIsCreatingTask(true);
      const newTask = await createStudyTask(newTaskForm);
      setFormTaskId(newTask.id);
      setShowNewTaskInput(false);
      setShowTaskCreateModal(false);
      setNewTaskForm({
        name: "",
        activity_type: "theory",
        color: "#3B82F6",
        theme_rule: "period",
        default_duration_min: 90,
      });
      await reloadTasks();
      toast.success("Tarefa criada");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao criar tarefa");
    } finally {
      setIsCreatingTask(false);
    }
  };

  if (isLoading) {
    return (
      <div className="study-plan-scope exceptions-manager">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="study-plan-scope exceptions-manager">
      {/* Header com navegação de mês */}
      <header className="exceptions-manager__header">
        <div className="flex items-center gap-4">
          <h2 className="font-display text-lg font-bold">Exceções do Mês</h2>
        </div>

        <div className="exceptions-manager__month-nav">
          <button
            onClick={() => navigateMonth(-1)}
            className="exceptions-manager__month-btn"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="exceptions-manager__month-title">
            {formatMonthYear(currentMonth)}
          </div>
          <button
            onClick={() => navigateMonth(1)}
            className="exceptions-manager__month-btn"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Tabela "O padrão da semana neste mês" */}
      <section aria-labelledby="pattern-table-title">
        <h3 id="pattern-table-title" className="font-medium text-sm mb-3">
          O padrão da semana neste mês
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table className="exceptions-manager__pattern-table" role="table">
            <thead>
              <tr>
                <th scope="col">Bloco do padrão</th>
                {monthWeekStarts.map((ws, idx) => (
                  <th key={idx} scope="col">
                    <div className="font-medium text-xs">
                      {formatDateShort(ws)}–{formatDateShort(new Date(ws.getTime() + 6 * 86400000))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Semana {idx + 1}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthWeekStartsStr.length > 0 ? (
                <>
                  {weeklyBlocks
                    .filter((b) => !b.isDeleted)
                    .map((block) => {
                      const task = tasks.find((t) => t.id === block.task_id);
                      return (
                        <tr key={block.id}>
                          <td className="pattern-table__block-name">
                            <span
                              className="pattern-table__block-color"
                              style={{ backgroundColor: task?.color || "#FE7802" }}
                            />
                            {task?.name || "Bloco sem nome"}
                          </td>
                          {monthWeekStartsStr.map((weekStart) => {
                            const isActive = activeBlocksPerWeek[weekStart]?.some((b) => b.id === block.id);
                            return (
                              <td key={weekStart}>
                                {isActive ? (
                                  <span className="pattern-table__cell--scheduled">Programado</span>
                                ) : (
                                  <span className="pattern-table__cell--empty">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  {weeklyBlocks.filter((b) => !b.isDeleted).length === 0 && (
                    <tr>
                      <td colSpan={monthWeekStartsStr.length + 1} className="text-center py-8 text-muted-foreground">
                        Nenhum bloco no padrão semanal. Adicione blocos no Editor Semanal.
                      </td>
                    </tr>
                  )}
                </>
              ) : (
                <tr>
                  <td colSpan={2} className="text-center py-8 text-muted-foreground">
                    Este mês não tem semanas completas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Formulário "Acrescentar uma tarefa só nestas semanas" */}
      <section aria-labelledby="extra-form-title">
        <h3 id="extra-form-title" className="font-medium text-sm mb-3">
          Acrescentar uma tarefa só nestas semanas
        </h3>

        <div className="exceptions-manager__extra-form">
          <div className="block-modal__field">
            <label className="block-modal__label block-modal__label--required">Tarefa</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <select
                className="block-modal__select"
                value={formTaskId}
                onChange={(e) => {
                  setFormTaskId(e.target.value);
                  if (e.target.value) setShowNewTaskInput(false);
                }}
              >
                <option value="">— Selecione uma tarefa —</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.default_duration_min} min)
                  </option>
                ))}
                <option value="__new__">+ Escrever uma tarefa nova</option>
              </select>

              {showNewTaskInput && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    placeholder="Nome da nova tarefa"
                    className="block-modal__input flex-1"
                    value={formNewTaskName}
                    onChange={(e) => setFormNewTaskName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !showTaskCreateModal && setShowTaskCreateModal(true)}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowTaskCreateModal(true)}
                    className="btn-ghost whitespace-nowrap"
                  >
                    Criar tarefa completa
                  </button>
                </div>
              )}

              {formTaskId === "__new__" && !showNewTaskInput && (
                <button
                  type="button"
                  onClick={() => setShowNewTaskInput(true)}
                  className="btn-ghost text-sm justify-start"
                >
                  <Plus className="h-4 w-4 mr-1" /> Digite o nome da nova tarefa
                </button>
              )}
            </div>
          </div>

          <div className="block-modal__row">
            <div className="block-modal__field">
              <label htmlFor="extra-start" className="block-modal__label block-modal__label--required">
                Início
              </label>
              <input
                id="extra-start"
                type="time"
                className="block-modal__input"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                min="06:00"
                max="23:00"
                step="1800"
              />
            </div>

            <div className="block-modal__field">
              <label htmlFor="extra-end" className="block-modal__label block-modal__label--required">
                Término
              </label>
              <input
                id="extra-end"
                type="time"
                className="block-modal__input"
                value={formEndTime}
                onChange={(e) => setFormEndTime(e.target.value)}
                min="06:30"
                max="23:59"
                step="1800"
              />
            </div>
          </div>

          <div className="block-modal__field">
            <label className="block-modal__label block-modal__label--required">Dias da semana</label>
            <div className="block-modal__weekdays">
              {WEEKDAY_NAMES.map((name, idx) => {
                const weekday = idx as Weekday;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`block-modal__weekday-btn ${formWeekdays.includes(weekday) ? "block-modal__weekday-btn--selected" : ""}`}
                    onClick={() => toggleWeekday(weekday)}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={selectAllWeekdays} className="btn-ghost text-sm">
                Replicar para dias úteis (Seg–Sex)
              </button>
            </div>
          </div>

          <div className="block-modal__field">
            <label className="block-modal__label block-modal__label--required">Em quais semanas?</label>
            <div className="exceptions-manager__weeks-selector">
              {monthWeekStartsStr.map((weekStart, idx) => {
                const weekEnd = new Date(weekStart + "T00:00:00");
                weekEnd.setDate(weekEnd.getDate() + 6);
                const selected = formSelectedWeeks.includes(weekStart);
                return (
                  <label key={weekStart} className="exceptions-manager__week-checkbox">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleWeek(weekStart)}
                    />
                    <span>
                      Semana {idx + 1}: {formatDateShort(new Date(weekStart + "T00:00:00"))}–{formatDateShort(weekEnd)}
                    </span>
                  </label>
                );
              })}
            </div>
            {formSelectedWeeks.length === 0 && monthWeekStartsStr.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Marque as semanas onde esta tarefa extra deve ocorrer.
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleAddExtra}
              disabled={isSavingExtra}
              className="btn-sun"
            >
              {isSavingExtra ? "Adicionando..." : "Adicionar nas semanas escolhidas"}
            </button>
          </div>
        </div>
      </section>

      {/* Lista dos extras do mês */}
      <section aria-labelledby="extras-list-title">
        <div className="flex items-center justify-between mb-3">
          <h3 id="extras-list-title" className="font-medium text-sm">
            Exceções deste mês ({monthExtras.length})
          </h3>
        </div>

        {monthExtras.length === 0 ? (
          <div className="rf-card p-8 text-center text-muted-foreground">
            <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma exceção neste mês</p>
            <p className="text-sm mt-1">Use o formulário acima para adicionar tarefas em semanas específicas</p>
          </div>
        ) : (
          <div className="exceptions-manager__extras-list">
            {monthExtras.map((extra) => {
              const task = tasks.find((t) => t.id === extra.task_id);
              const weekLabels = extra.week_starts
                .filter((ws) => monthWeekStartsStr.includes(ws))
                .map((ws) => {
                  const idx = monthWeekStartsStr.indexOf(ws);
                  return `Sem ${idx + 1}`;
                })
                .join(", ");

              return (
                <div key={extra.id} className="extra-item">
                  <div className="extra-item__info">
                    <div
                      className="extra-item__color"
                      style={{ backgroundColor: task?.color || "#FE7802" }}
                    />
                    <div className="extra-item__details">
                      <p className="extra-item__name">{task?.name || "Tarefa removida"}</p>
                      <div className="extra-item__meta">
                        <span>{extra.start_time}–{extra.end_time}</span>
                        <span>
                          {extra.weekdays.map((w) => WEEKDAY_NAMES[w]).join(", ")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span className="extra-item__weeks">{weekLabels}</span>
                    <button
                      onClick={() => handleDeleteExtra(extra.id)}
                      className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
                      aria-label="Excluir exceção"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal criar nova tarefa completa */}
      {showTaskCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
          onClick={() => setShowTaskCreateModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-create-modal-title"
        >
          <div
            className="w-full max-w-md rf-card rounded-2xl p-6 task-create-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between mb-6">
              <h3 id="task-create-modal-title" className="font-display text-lg font-bold">
                Nova Tarefa
              </h3>
              <button
                onClick={() => setShowTaskCreateModal(false)}
                className="p-1 rounded-lg hover:bg-muted transition-colors"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <form className="task-create-modal__form" onSubmit={(e) => { e.preventDefault(); handleCreateTaskInModal(); }}>
              <div className="block-modal__field">
                <label htmlFor="new-task-name" className="block-modal__label block-modal__label--required">
                  Nome
                </label>
                <input
                  id="new-task-name"
                  type="text"
                  className="block-modal__input"
                  value={newTaskForm.name}
                  onChange={(e) => setNewTaskForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Simulado de Direito Constitucional"
                  autoFocus
                />
              </div>

              <div className="block-modal__field">
                <label className="block-modal__label">Tipo de atividade</label>
                <div className="flex flex-wrap gap-2">
                  {["theory", "questions", "review", "cards", "exam", "break", "other"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewTaskForm((p) => ({ ...p, activity_type: type as any }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        newTaskForm.activity_type === type
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="block-modal__row">
                <div className="block-modal__field">
                  <label htmlFor="new-task-color" className="block-modal__label">Cor</label>
                  <div className="flex items-center gap-3">
                    <input
                      id="new-task-color"
                      type="color"
                      className="h-10 w-10 rounded-lg border border-border cursor-pointer"
                      value={newTaskForm.color}
                      onChange={(e) => setNewTaskForm((p) => ({ ...p, color: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="flex-1 block-modal__input font-mono"
                      value={newTaskForm.color}
                      onChange={(e) => /^#[0-9A-Fa-f]{6}$/.test(e.target.value) && setNewTaskForm((p) => ({ ...p, color: e.target.value }))}
                      placeholder="#RRGGBB"
                    />
                  </div>
                </div>

                <div className="block-modal__field">
                  <label htmlFor="new-task-duration" className="block-modal__label block-modal__label--required">
                    Duração (min)
                  </label>
                  <input
                    id="new-task-duration"
                    type="number"
                    min="1"
                    max="480"
                    className="block-modal__input"
                    value={newTaskForm.default_duration_min}
                    onChange={(e) => setNewTaskForm((p) => ({ ...p, default_duration_min: Number(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              <div className="block-modal__field">
                <label htmlFor="new-task-theme-rule" className="block-modal__label">Regra de tema</label>
                <select
                  id="new-task-theme-rule"
                  className="block-modal__select"
                  value={newTaskForm.theme_rule}
                  onChange={(e) => setNewTaskForm((p) => ({ ...p, theme_rule: e.target.value as any }))}
                >
                  <option value="period">Tema do período</option>
                  <option value="all">Todos os temas</option>
                  <option value="none">Sem tema</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button type="button" onClick={() => setShowTaskCreateModal(false)} className="btn-ghost">
                  Cancelar
                </button>
                <button type="submit" disabled={isCreatingTask} className="btn-sun">
                  {isCreatingTask ? "Criando..." : "Criar e usar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}