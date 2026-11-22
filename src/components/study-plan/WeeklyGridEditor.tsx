import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  X,
  Trash2,
  Edit3,
  AlertCircle,
  GripVertical,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { useStudyTasks } from "@/hooks/useStudyTasks";
import {
  createStudyWeeklyBlock,
  updateWeeklyBlockSeriesFromToday,
  closeWeeklyBlockSeriesFromToday,
  getStudyWeeklyBlocks,
} from "@/services/studyPlanService";
import type { StudyTask, StudyWeeklyBlock, Weekday } from "@/types/study-plan";
import "./study-plan.css";

const WEEKDAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const WEEKDAY_FULL = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];

/**
 * Mapeia índice de exibição (0=Seg..6=Dom) para Weekday real (0=Dom..6=Sáb)
 * Conforme types/study-plan.ts: Weekday = 0|1|2|3|4|5|6 com 0=Domingo (Date.getDay())
 */
const DISPLAY_IDX_TO_WEEKDAY: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/**
 * Mapeia Weekday real (0=Dom..6=Sáb) para índice de exibição (0=Seg..6=Dom)
 * Inverso de DISPLAY_IDX_TO_WEEKDAY
 */
const WEEKDAY_TO_DISPLAY_IDX: number[] = [6, 0, 1, 2, 3, 4, 5];

/**
 * Gera slots de 30 min de 06:00 a 23:30
 * Retorna array de strings "HH:MM"
 */
function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let hour = 6; hour <= 23; hour++) {
    slots.push(`${String(hour).padStart(2, "0")}:00`);
    if (hour < 23) {
      slots.push(`${String(hour).padStart(2, "0")}:30`);
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots(); // 36 slots (06:00 - 23:30)
const SLOT_HEIGHT = 60; // px por slot de 30min

interface WeeklyGridEditorProps {
  userId: string;
  weekStart: string; // ISO date (segunda-feira)
}

interface EditingBlockData {
  block: StudyWeeklyBlock;
  task: StudyTask;
}

export function WeeklyGridEditor({ userId, weekStart }: WeeklyGridEditorProps) {
  const { tasks, reload: reloadTasks } = useStudyTasks(userId);
  const [blocks, setBlocks] = useState<StudyWeeklyBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();
  const confirmDialog = useConfirm();

  // Modal state
  const [editingBlock, setEditingBlock] = useState<EditingBlockData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // DnD state
  const [draggedTask, setDraggedTask] = useState<StudyTask | null>(null);
  const [dropTargetCell, setDropTargetCell] = useState<{ day: number; slotIndex: number } | null>(null);

  // Load blocks on mount and when weekStart changes
  const loadBlocks = useCallback(async () => {
    setIsLoading(true);
    try {
      const allBlocks = await getStudyWeeklyBlocks(userId);
      // Filter blocks that apply to this week (effective_from <= weekStart+6 and (no effective_until or effective_until >= weekStart))
      const weekEnd = new Date(weekStart + "T00:00:00");
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().split("T")[0];

      const filtered = allBlocks.filter((b) => {
        if (b.effective_from > weekEndStr) return false;
        if (b.effective_until && b.effective_until < weekStart) return false;
        return true;
      });
      setBlocks(filtered);
    } catch (e) {
      console.error("Erro ao carregar blocos:", e);
      toast.error("Erro ao carregar padrão semanal");
    } finally {
      setIsLoading(false);
    }
  }, [userId, weekStart, toast]);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  // Helper: converter time string para índice do slot
  const timeToSlotIndex = (time: string): number => {
    const [h, m] = time.split(":").map(Number);
    const totalMinutes = h * 60 + m;
    const startMinutes = 6 * 60; // 06:00
    return Math.floor((totalMinutes - startMinutes) / 30);
  };

  // Helper: converter slot index para time string
  const slotIndexToTime = (index: number): string => {
    const totalMinutes = 6 * 60 + index * 30;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  // Helper: calcular end_time baseado no start_time + duração padrão da task
  const calculateEndTime = (startTime: string, durationMin: number): string => {
    const [h, m] = startTime.split(":").map(Number);
    let totalMinutes = h * 60 + m + durationMin;
    // Se passar de 24h, ajustar (embora não deva acontecer no grid)
    if (totalMinutes >= 24 * 60) totalMinutes = 23 * 60 + 30;
    const nh = Math.floor(totalMinutes / 60);
    const nm = totalMinutes % 60;
    return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
  };

  // Get blocks for a specific day and time range
  // displayDayIdx: 0=Seg..6=Dom (ordem de exibição)
  const getBlocksForCell = useCallback(
    (displayDayIdx: number, slotIndex: number): StudyWeeklyBlock[] => {
      const weekday = DISPLAY_IDX_TO_WEEKDAY[displayDayIdx];
      const cellTime = slotIndexToTime(slotIndex);
      return blocks.filter((b) => {
        if (b.weekday !== weekday) return false;
        const startSlot = timeToSlotIndex(b.start_time);
        const endSlot = timeToSlotIndex(b.end_time);
        return slotIndex >= startSlot && slotIndex < endSlot;
      });
    },
    [blocks]
  );

  // Get the main block that STARTS at this cell (for rendering)
  // displayDayIdx: 0=Seg..6=Dom (ordem de exibição)
  const getBlockStartingAt = useCallback(
    (displayDayIdx: number, slotIndex: number): StudyWeeklyBlock | null => {
      const weekday = DISPLAY_IDX_TO_WEEKDAY[displayDayIdx];
      const cellTime = slotIndexToTime(slotIndex);
      return blocks.find((b) => b.weekday === weekday && timeToSlotIndex(b.start_time) === slotIndex) || null;
    },
    [blocks]
  );

  // Calculate block height in slots
  const getBlockHeight = (block: StudyWeeklyBlock): number => {
    const startSlot = timeToSlotIndex(block.start_time);
    const endSlot = timeToSlotIndex(block.end_time);
    return Math.max(1, endSlot - startSlot);
  };

  // ===== DRAG AND DROP HANDLERS =====

  const handleDragStart = (e: React.DragEvent, task: StudyTask) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", task.id);
    // Adicionar classe visual
    const target = e.currentTarget as HTMLElement;
    target.classList.add("dragging");
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedTask(null);
    setDropTargetCell(null);
    const target = e.currentTarget as HTMLElement;
    target.classList.remove("dragging");
  };

  const handleDragOver = (e: React.DragEvent, day: number, slotIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropTargetCell({ day, slotIndex });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Só limpar se realmente saiu do elemento (não entrou em filho)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      setDropTargetCell(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, day: number, slotIndex: number) => {
    e.preventDefault();
    setDropTargetCell(null);

    if (!draggedTask) return;

    const startTime = slotIndexToTime(slotIndex);
    const endTime = calculateEndTime(startTime, draggedTask.default_duration_min);

    // Converter índice de exibição (0=Seg..6=Dom) para Weekday real (0=Dom..6=Sáb)
    const weekday = DISPLAY_IDX_TO_WEEKDAY[day];

    // Verificar se já existe bloco nesse horário/dia
    const existing = blocks.find(
      (b) =>
        b.weekday === weekday &&
        timeToSlotIndex(b.start_time) === slotIndex
    );

    if (existing) {
      toast.warning("Já existe um bloco neste horário");
      return;
    }

    try {
      const newBlock = await createStudyWeeklyBlock({
        task_id: draggedTask.id,
        weekday: weekday,
        start_time: startTime,
        end_time: endTime,
        effective_from: weekStart, // Começa nesta semana
      });
      setBlocks((prev) => [...prev, newBlock]);
      toast.success(`"${draggedTask.name}" adicionado às ${startTime}`);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao criar bloco");
    }
  };

  // ===== MODAL HANDLERS =====

  const handleBlockClick = (block: StudyWeeklyBlock) => {
    const task = tasks.find((t) => t.id === block.task_id);
    if (task) {
      setEditingBlock({ block, task });
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBlock(null);
  };

  const handleSaveBlock = async () => {
    if (!editingBlock) return;

    const { block, task } = editingBlock;
    const formData = editingBlockFormData.current;
    if (!formData) return;

    setIsSaving(true);
    try {
      // Usar semântica "a partir de hoje"
      const updated = await updateWeeklyBlockSeriesFromToday(block.id, {
        task_id: formData.taskId,
        weekday: formData.weekday,
        start_time: formData.startTime,
        end_time: formData.endTime,
      });
      // Atualizar lista local
      setBlocks((prev) =>
        prev.map((b) => (b.id === block.id ? updated : b))
      );
      toast.success("Bloco atualizado para as próximas semanas");
      handleCloseModal();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar bloco");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBlock = async () => {
    if (!editingBlock) return;

    const { block } = editingBlock;

    const ok = await confirmDialog({
      title: "Excluir série de blocos?",
      description: `O padrão "${block.task_id}" será encerrado a partir de hoje. Ocorrências passadas serão preservadas.`,
      confirmText: "Sim, excluir série",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;

    try {
      await closeWeeklyBlockSeriesFromToday(block.id);
      setBlocks((prev) => prev.filter((b) => b.id !== block.id));
      toast.success("Série encerrada a partir de hoje");
      handleCloseModal();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao excluir série");
    }
  };

  // Ref para armazenar dados do formulário do modal
  const editingBlockFormData = useRef<{
    taskId: string;
    weekday: Weekday;
    startTime: string;
    endTime: string;
  }>({
    taskId: "",
    weekday: 1,
    startTime: "19:00",
    endTime: "21:00",
  });

  const handleFormChange = (field: keyof typeof editingBlockFormData.current, value: any) => {
    editingBlockFormData.current = {
      ...editingBlockFormData.current,
      [field]: value,
    };
  };

  // Inicializar form data quando modal abre
  useEffect(() => {
    if (editingBlock && isModalOpen) {
      // Guardar o Weekday real (0=Dom) - o dropdown e botões usam valores reais
      editingBlockFormData.current = {
        taskId: editingBlock.block.task_id,
        weekday: editingBlock.block.weekday,
        startTime: editingBlock.block.start_time,
        endTime: editingBlock.block.end_time,
      };
    }
  }, [editingBlock, isModalOpen]);

  // ===== RENDER =====

  if (isLoading) {
    return (
      <div className="study-plan-scope weekly-grid-editor">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  const weekStartDate = new Date(weekStart + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="study-plan-scope weekly-grid-editor">
      {/* Sidebar - Tasks arrastáveis */}
      <aside className="weekly-grid-editor__sidebar" role="complementary" aria-label="Biblioteca de tarefas">
        <h3>Arraste para a grade</h3>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma tarefa na biblioteca.<br />
            Crie tarefas na aba "Biblioteca".
          </p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="task-draggable"
              draggable
              onDragStart={(e) => handleDragStart(e, task)}
              onDragEnd={handleDragEnd}
              role="button"
              tabIndex={0}
              aria-label={`Arraste ${task.name} para a grade`}
            >
              <div
                className="task-draggable__color"
                style={{ backgroundColor: task.color }}
              >
                {task.name.charAt(0).toUpperCase()}
              </div>
              <div className="task-draggable__info">
                <p className="task-draggable__name">{task.name}</p>
                <div className="task-draggable__meta">
                  <span className="task-draggable__type">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: task.color }}
                    />
                    {task.default_duration_min} min
                  </span>
                </div>
              </div>
              <GripVertical className="text-muted-foreground hover:text-foreground" />
            </div>
          ))
        )}
      </aside>

      {/* Grid Principal */}
      <div className="weekly-grid-editor__grid" role="grid" aria-label="Grade semanal de estudos">
        {/* Cabeçalho - Dias da semana */}
        <div className="weekly-grid-editor__header" role="row">
          <div className="weekly-grid-editor__time-col" role="columnheader">
            Horário
          </div>
          {WEEKDAY_NAMES.map((dayName, dayIdx) => {
            const date = new Date(weekStartDate);
            date.setDate(date.getDate() + dayIdx);
            const isToday = date.getTime() === today.getTime();
            const dayNumber = date.getDate();

            return (
              <div
                key={dayIdx}
                className={`weekly-grid-editor__day-header ${isToday ? "weekly-grid-editor__day-today" : ""}`}
                role="columnheader"
                aria-label={WEEKDAY_FULL[dayIdx]}
              >
                <div className="weekly-grid-editor__day-name">{dayName}</div>
                <div className="weekly-grid-editor__day-number">{dayNumber}</div>
              </div>
            );
          })}
        </div>

        {/* Corpo da grade */}
        <div className="weekly-grid-editor__body">
          <div className="weekly-grid-editor__rows">
            {TIME_SLOTS.map((time, slotIndex) => (
              <React.Fragment key={slotIndex}>
                {/* Label de horário */}
                <div className="weekly-grid-editor__time-label" role="rowheader">
                  {time}
                </div>

                {/* Células dos 7 dias */}
                {WEEKDAY_NAMES.map((_, dayIdx) => {
                  const blockStarting = getBlockStartingAt(dayIdx, slotIndex);
                  const blockHeight = blockStarting ? getBlockHeight(blockStarting) : 0;
                  const isDropTarget = dropTargetCell?.day === dayIdx && dropTargetCell?.slotIndex === slotIndex;
                  const cellDate = new Date(weekStartDate);
                  cellDate.setDate(cellDate.getDate() + dayIdx);
                  const isPast = cellDate < today;

                  return (
                    <div
                      key={dayIdx}
                      className={`weekly-grid-editor__cell ${isDropTarget ? "weekly-grid-editor__cell--drop-target" : ""} ${isPast ? "weekly-grid-editor__cell--past" : ""}`}
                      onDragOver={(e) => handleDragOver(e, dayIdx, slotIndex)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, dayIdx, slotIndex)}
                      role="gridcell"
                      aria-label={`${WEEKDAY_FULL[dayIdx]} ${time}`}
                    >
                      {/* Bloco que inicia nesta célula */}
                      {blockStarting && (
                        <div
                          className="grid-block"
                          style={{
                            top: 0,
                            height: `${blockHeight * SLOT_HEIGHT - 4}px`,
                            backgroundColor: blockStarting.task_id
                              ? tasks.find((t) => t.id === blockStarting.task_id)?.color || "#FE7802"
                              : "#FE7802",
                          }}
                          onClick={() => handleBlockClick(blockStarting)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && handleBlockClick(blockStarting)}
                          aria-label={`${tasks.find((t) => t.id === blockStarting.task_id)?.name || "Bloco"} ${blockStarting.start_time}-${blockStarting.end_time}`}
                        >
                          <div className="grid-block__name">
                            {tasks.find((t) => t.id === blockStarting.task_id)?.name || "Bloco"}
                          </div>
                          <div className="grid-block__time">
                            {blockStarting.start_time}–{blockStarting.end_time}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}

            {/* Linhas de separação de turno (Manhã/Tarde/Noite) */}
            <div
              className="weekly-grid-editor__shift-label"
              data-shift="Manhã"
              style={{ top: `${(12 - 6) * 2 * SLOT_HEIGHT}px` }}
            />
            <div
              className="weekly-grid-editor__shift-label"
              data-shift="Tarde"
              style={{ top: `${(18 - 6) * 2 * SLOT_HEIGHT}px` }}
            />
            <div
              className="weekly-grid-editor__shift-label"
              data-shift="Noite"
              style={{ top: `${(23.5 - 6) * 2 * SLOT_HEIGHT}px` }}
            />
          </div>
        </div>
      </div>

      {/* Modal Editar Bloco */}
      {isModalOpen && editingBlock && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
          onClick={handleCloseModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-modal-title"
        >
          <div
            className="w-full max-w-md rf-card rounded-2xl p-6 block-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="block-modal__header">
              <h3 id="block-modal-title" className="block-modal__title">
                Editar Bloco Semanal
              </h3>
              <button
                onClick={handleCloseModal}
                className="p-1 rounded-lg hover:bg-muted transition-colors"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="block-modal__warning" role="alert">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>
                As mudanças valem para <strong>todas as semanas</strong> a partir de hoje.
                O padrão anterior será encerrado ontem.
              </span>
            </div>

            <form className="block-modal__form" onSubmit={(e) => { e.preventDefault(); handleSaveBlock(); }}>
              <div className="block-modal__field">
                <label htmlFor="modal-task" className="block-modal__label block-modal__label--required">
                  Tarefa
                </label>
                <select
                  id="modal-task"
                  className="block-modal__select"
                  value={editingBlockFormData.current?.taskId || editingBlock.block.task_id}
                  onChange={(e) => handleFormChange("taskId", e.target.value)}
                >
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.default_duration_min} min)
                    </option>
                  ))}
                </select>
              </div>

              <div className="block-modal__row">
                <div className="block-modal__field">
                  <label htmlFor="modal-weekday" className="block-modal__label block-modal__label--required">
                    Dia da semana
                  </label>
                  <select
                    id="modal-weekday"
                    className="block-modal__select"
                    value={editingBlockFormData.current?.weekday ?? editingBlock.block.weekday}
                    onChange={(e) => handleFormChange("weekday", Number(e.target.value))}
                  >
                    {WEEKDAY_NAMES.map((name, displayIdx) => {
                      const weekday = DISPLAY_IDX_TO_WEEKDAY[displayIdx];
                      return (
                        <option key={displayIdx} value={weekday}>
                          {WEEKDAY_FULL[displayIdx]}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="block-modal__field">
                  <label htmlFor="modal-start" className="block-modal__label block-modal__label--required">
                    Início
                  </label>
                  <input
                    id="modal-start"
                    type="time"
                    className="block-modal__input"
                    value={editingBlockFormData.current?.startTime || editingBlock.block.start_time}
                    onChange={(e) => handleFormChange("startTime", e.target.value)}
                    min="06:00"
                    max="23:00"
                    step="1800"
                  />
                </div>
              </div>

              <div className="block-modal__field">
                <label htmlFor="modal-end" className="block-modal__label block-modal__label--required">
                  Término
                </label>
                <input
                  id="modal-end"
                  type="time"
                  className="block-modal__input"
                  value={editingBlockFormData.current?.endTime || editingBlock.block.end_time}
                  onChange={(e) => handleFormChange("endTime", e.target.value)}
                  min="06:30"
                  max="23:59"
                  step="1800"
                />
              </div>

              <div className="block-modal__field">
                <label className="block-modal__label">Dias da semana (múltipla seleção)</label>
                <div className="block-modal__weekdays">
                  {WEEKDAY_NAMES.map((name, displayIdx) => {
                    const weekday = DISPLAY_IDX_TO_WEEKDAY[displayIdx];
                    const selected = editingBlockFormData.current?.weekday === weekday;
                    return (
                      <button
                        key={displayIdx}
                        type="button"
                        className={`block-modal__weekday-btn ${selected ? "block-modal__weekday-btn--selected" : ""}`}
                        onClick={() => handleFormChange("weekday", weekday)}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Selecione múltiplos dias para replicar o mesmo horário.
                </p>
              </div>

              <div className="block-modal__actions">
                <button type="button" onClick={handleCloseModal} className="btn-ghost">
                  Cancelar
                </button>
                <button type="button" onClick={handleDeleteBlock} className="btn-destructive">
                  <Trash2 className="h-4 w-4 mr-1" /> Excluir série
                </button>
                <button type="submit" disabled={isSaving} className="btn-sun">
                  {isSaving ? "Salvando..." : "Salvar para próximas semanas"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}