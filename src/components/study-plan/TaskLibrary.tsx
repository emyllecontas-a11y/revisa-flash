import { useState } from "react";
import { Plus, Trash2, Edit3, X } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { useStudyTasks } from "@/hooks/useStudyTasks";
import {
  type StudyTask,
  type ActivityType,
  type ThemeRule,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_DEFAULT_COLORS,
  THEME_RULE_LABELS,
} from "@/types/study-plan";

interface TaskFormData {
  name: string;
  activity_type: ActivityType;
  color: string;
  theme_rule: ThemeRule;
  default_duration_min: number;
}

const ACTIVITY_TYPES: ActivityType[] = [
  "theory",
  "questions",
  "review",
  "cards",
  "exam",
  "break",
  "other",
];
const THEME_RULES: ThemeRule[] = ["period", "all", "none"];

const DEFAULT_FORM_DATA: TaskFormData = {
  name: "",
  activity_type: "theory",
  color: ACTIVITY_TYPE_DEFAULT_COLORS.theory,
  theme_rule: "period",
  default_duration_min: 90,
};

export function TaskLibrary({ userId }: { userId: string }) {
  const { tasks, isLoading, create, update, remove, reload } = useStudyTasks(userId);
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<StudyTask | null>(null);
  const [formData, setFormData] = useState<TaskFormData>(DEFAULT_FORM_DATA);

  const handleOpenCreate = () => {
    setEditingTask(null);
    setFormData(DEFAULT_FORM_DATA);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (task: StudyTask) => {
    setEditingTask(task);
    setFormData({
      name: task.name,
      activity_type: task.activity_type,
      color: task.color,
      theme_rule: task.theme_rule,
      default_duration_min: task.default_duration_min,
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
    setFormData(DEFAULT_FORM_DATA);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (formData.default_duration_min <= 0) {
      toast.error("Duração deve ser maior que zero");
      return;
    }

    try {
      if (editingTask) {
        await update(editingTask.id, formData);
        toast.success("Tarefa atualizada");
      } else {
        await create(formData);
        toast.success("Tarefa criada");
      }
      handleCloseModal();
    } catch (err) {
      console.error(err);
      toast.error(editingTask ? "Erro ao atualizar tarefa" : "Erro ao criar tarefa");
    }
  };

  const handleDelete = async (task: StudyTask) => {
    const ok = await confirmDialog({
      title: "Excluir tarefa?",
      description: `"${task.name}" será removida da biblioteca.`,
      confirmText: "Sim, excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;

    try {
      await remove(task.id);
      toast.success("Tarefa excluída");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao excluir tarefa");
    }
  };

  const handleActivityTypeChange = (type: ActivityType) => {
    setFormData((prev) => ({
      ...prev,
      activity_type: type,
      color: ACTIVITY_TYPE_DEFAULT_COLORS[type],
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Biblioteca de Tarefas</h2>
        <button onClick={handleOpenCreate} className="btn-sun text-sm">
          <Plus className="h-4 w-4 mr-1" /> Nova Tarefa
        </button>
      </div>

      {/* Empty state */}
      {tasks.length === 0 && (
        <div className="rf-card p-8 text-center text-muted-foreground">
          <p className="mb-2">Nenhuma tarefa cadastrada</p>
          <p className="text-sm">
            Clique em "Nova Tarefa" para criar sua primeira atividade de estudo
          </p>
        </div>
      )}

      {/* Task list */}
      <div className="rf-card divide-y divide-border">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: task.color }}
              >
                <span className="text-white font-semibold text-sm">
                  {task.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate">{task.name}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: task.color }}
                    />
                    {ACTIVITY_TYPE_LABELS[task.activity_type as ActivityType]}
                  </span>
                  <span>{THEME_RULE_LABELS[task.theme_rule as ThemeRule]}</span>
                  <span>{task.default_duration_min} min</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenEdit(task)}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Editar tarefa"
              >
                <Edit3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDelete(task)}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
                aria-label="Excluir tarefa"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
          onClick={handleCloseModal}
        >
          <div
            className="w-full max-w-md rf-card rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between mb-6">
              <h3 className="font-display text-lg font-bold">
                {editingTask ? "Editar Tarefa" : "Nova Tarefa"}
              </h3>
              <button onClick={handleCloseModal} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-1">
                  Nome da tarefa <span className="text-destructive">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Teoria - Direito Constitucional"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>

              {/* Activity Type */}
              <div>
                <label className="block text-sm font-medium mb-1">Tipo de atividade</label>
                <div className="flex flex-wrap gap-2">
                  {ACTIVITY_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleActivityTypeChange(type)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        formData.activity_type === type
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                      }`}
                    >
                      {ACTIVITY_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label htmlFor="color" className="block text-sm font-medium mb-1">
                  Cor
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
                    className="h-10 w-10 rounded-lg border border-border cursor-pointer"
                    aria-label="Seletor de cor"
                  />
                  <input
                    type="text"
                    value={formData.color}
                    onChange={(e) => {
                      if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                        setFormData((prev) => ({ ...prev, color: e.target.value }));
                      }
                    }}
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="#RRGGBB"
                  />
                </div>
              </div>

              {/* Theme Rule */}
              <div>
                <label htmlFor="theme_rule" className="block text-sm font-medium mb-1">
                  Regra de tema
                </label>
                <select
                  id="theme_rule"
                  value={formData.theme_rule}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, theme_rule: e.target.value as ThemeRule }))
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {THEME_RULES.map((rule) => (
                    <option key={rule} value={rule}>
                      {THEME_RULE_LABELS[rule]}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.theme_rule === "period" &&
                    "Usa o tema definido na Linha do Tempo para o período"}
                  {formData.theme_rule === "all" && "Mostra todos os temas do período"}
                  {formData.theme_rule === "none" && "Não mostra tema (ex: pausas, simulados)"}
                </p>
              </div>

              {/* Default Duration */}
              <div>
                <label htmlFor="duration" className="block text-sm font-medium mb-1">
                  Duração padrão (minutos) <span className="text-destructive">*</span>
                </label>
                <input
                  id="duration"
                  type="number"
                  min="1"
                  max="480"
                  value={formData.default_duration_min}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      default_duration_min: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button type="button" onClick={handleCloseModal} className="btn-ghost">
                  Cancelar
                </button>
                <button type="submit" className="btn-sun">
                  {editingTask ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
