import { useState, useMemo } from "react";
import { Plus, Trash2, X, Calendar, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/useToast";
import { useThemeTimeline } from "@/hooks/useThemeTimeline";
import { type StudyThemeTimeline, type PeriodType, PERIOD_TYPE_LABELS } from "@/types/study-plan";

interface ThemeChipProps {
  theme: string;
  onRemove: () => void;
}

function ThemeChip({ theme, onRemove }: ThemeChipProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
      {theme}
      <button
        onClick={onRemove}
        className="p-0.5 hover:bg-primary/20 rounded-full transition-colors"
        aria-label={`Remover tema ${theme}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function PeriodSelector({
  periodType,
  onPeriodTypeChange,
  currentPeriodStart,
  onPeriodChange,
  onAddTheme,
  themes,
}: {
  periodType: PeriodType;
  onPeriodTypeChange: (type: PeriodType) => void;
  currentPeriodStart: string;
  onPeriodChange: (date: string) => void;
  onAddTheme: () => void;
  themes: string[];
}) {
  // Calculate period boundaries for navigation
  const getPeriodStart = (date: Date, type: PeriodType): string => {
    const d = new Date(date);
    if (type === "month") {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    } else {
      // week: Monday
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day; // Sunday -> -6, Monday -> 0, etc.
      d.setDate(d.getDate() + diff);
      return d.toISOString().split("T")[0];
    }
  };

  const getPeriodEnd = (startStr: string, type: PeriodType): string => {
    const start = new Date(startStr + "T12:00:00");
    if (type === "month") {
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(end.getDate() - 1);
      return end.toISOString().split("T")[0];
    } else {
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return end.toISOString().split("T")[0];
    }
  };

  const periodStart = currentPeriodStart || getPeriodStart(new Date(), periodType);
  const periodEnd = getPeriodEnd(periodStart, periodType);

  const formatPeriodLabel = (start: string, end: string, type: PeriodType) => {
    const s = new Date(start + "T12:00:00");
    const e = new Date(end + "T12:00:00");
    if (type === "month") {
      return s.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    }
    return `${s.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} - ${e.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  };

  const navigate = (delta: number) => {
    const date = new Date(periodStart + "T12:00:00");
    if (periodType === "month") {
      date.setMonth(date.getMonth() + delta);
    } else {
      date.setDate(date.getDate() + delta * 7);
    }
    onPeriodChange(getPeriodStart(date, periodType));
  };

  return (
    <div className="space-y-4">
      {/* Period type toggle */}
      <div className="flex items-center gap-4">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(["month", "week"] as PeriodType[]).map((type) => (
            <button
              key={type}
              onClick={() => onPeriodTypeChange(type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                periodType === type
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-white/5"
              }`}
            >
              {type === "month" ? (
                <Calendar className="h-3.5 w-3.5" />
              ) : (
                <CalendarDays className="h-3.5 w-3.5" />
              )}
              {PERIOD_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Period navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Período anterior"
        >
          <span className="sr-only">Anterior</span>
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="text-center flex-1">
          <p className="font-medium">{formatPeriodLabel(periodStart, periodEnd, periodType)}</p>
          <p className="text-xs text-muted-foreground">
            {periodType === "month" ? "Mês" : "Semana"} atual
          </p>
        </div>
        <button
          onClick={() => navigate(1)}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Próximo período"
        >
          <span className="sr-only">Próximo</span>
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* Themes for current period */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Temas deste período</label>
        <div className="flex flex-wrap gap-2 min-h-[40px]">
          {themes.length === 0 ? (
            <p className="text-sm text-muted-foreground w-full text-center py-4">
              Nenhum tema definido. Clique em "+ Tema junto" para adicionar.
            </p>
          ) : (
            themes.map((theme) => <ThemeChip key={theme} theme={theme} onRemove={() => {}} />)
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onAddTheme} className="btn-ghost text-sm flex-1">
            <Plus className="h-4 w-4 mr-1" /> + Tema
          </button>
          <button onClick={onAddTheme} className="btn-ghost text-sm flex-1">
            <Plus className="h-4 w-4 mr-1" /> + Tema junto
          </button>
        </div>
      </div>
    </div>
  );
}

interface ThemeTimelineModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

function ThemeTimelineModal({ userId, isOpen, onClose }: ThemeTimelineModalProps) {
  const { upsert, reload } = useThemeTimeline(userId);
  const toast = useToast();
  const [newTheme, setNewTheme] = useState("");

  const handleAddTheme = (
    themes: string[],
    setThemes: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    const trimmed = newTheme.trim();
    if (!trimmed) return;
    if (themes.includes(trimmed)) {
      toast.warning("Este tema já foi adicionado");
      return;
    }
    setThemes((prev) => [...prev, trimmed]);
    setNewTheme("");
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-md rf-card rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between mb-6">
          <h3 className="font-display text-lg font-bold">Adicionar Tema</h3>
          <button onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Digite o nome do tema e pressione Enter ou clique em Adicionar.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTheme}
              onChange={(e) => setNewTheme(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // The parent will handle adding
                }
              }}
              placeholder="Ex: Direito Constitucional"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            <button onClick={() => {}} className="btn-sun">
              Adicionar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThemeTimeline({ userId }: { userId: string }) {
  const { timelines, isLoading, upsert, reload, getThemesForPeriod } = useThemeTimeline(userId);
  const toast = useToast();

  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [currentPeriodStart, setCurrentPeriodStart] = useState<string>("");
  const [editingThemes, setEditingThemes] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [modalThemes, setModalThemes] = useState<string[]>([]);
  const [modalNewTheme, setModalNewTheme] = useState("");
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  // Initialize current period to current month/week
  const getCurrentPeriodStart = (type: PeriodType): string => {
    const now = new Date();
    if (type === "month") {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    } else {
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diff);
      return monday.toISOString().split("T")[0];
    }
  };

  // Load themes when period changes
  const themes = useMemo(() => {
    if (!currentPeriodStart) return [];
    return getThemesForPeriod(periodType, currentPeriodStart);
  }, [periodType, currentPeriodStart, getThemesForPeriod]);

  // Initialize on mount
  if (timelines.length > 0 && !currentPeriodStart) {
    setCurrentPeriodStart(getCurrentPeriodStart(periodType));
  }

  const handlePeriodTypeChange = (type: PeriodType) => {
    setPeriodType(type);
    setCurrentPeriodStart(getCurrentPeriodStart(type));
    setEditingThemes([]);
    setMultiSelectMode(false);
  };

  const handlePeriodChange = (date: string) => {
    setCurrentPeriodStart(date);
    setEditingThemes([]);
    setMultiSelectMode(false);
  };

  const handleAddTheme = () => {
    setModalThemes([...themes]);
    setMultiSelectMode(false);
    setShowThemeModal(true);
  };

  const handleAddMultipleThemes = () => {
    setModalThemes([...themes]);
    setMultiSelectMode(true);
    setShowThemeModal(true);
  };

  const handleModalAddTheme = () => {
    const trimmed = modalNewTheme.trim();
    if (!trimmed) return;
    if (modalThemes.includes(trimmed)) {
      toast.warning("Este tema já foi adicionado");
      return;
    }
    setModalThemes((prev) => [...prev, trimmed]);
    setModalNewTheme("");
  };

  const handleModalRemoveTheme = (theme: string) => {
    setModalThemes((prev) => prev.filter((t) => t !== theme));
  };

  const handleModalConfirm = async () => {
    if (modalThemes.length === 0 && themes.length === 0) {
      toast.warning("Adicione pelo menos um tema");
      return;
    }

    setIsSaving(true);
    try {
      await upsert({
        period_type: periodType,
        period_start: currentPeriodStart,
        themes: modalThemes,
      });
      toast.success("Temas salvos");
      setShowThemeModal(false);
      setModalNewTheme("");
      setEditingThemes(modalThemes);
      await reload();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar temas");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveTheme = async (theme: string) => {
    const newThemes = themes.filter((t: string) => t !== theme);
    setIsSaving(true);
    try {
      await upsert({
        period_type: periodType,
        period_start: currentPeriodStart,
        themes: newThemes,
      });
      toast.success("Tema removido");
      setEditingThemes(newThemes);
      await reload();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao remover tema");
    } finally {
      setIsSaving(false);
    }
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
        <h2 className="font-display text-lg font-bold">Linha do Tempo de Temas</h2>
      </div>

      {/* Info message */}
      <div className="rf-card p-4 bg-muted/30 border-border/50">
        <p className="text-sm text-muted-foreground">
          <strong>Você pode trocar quando quiser.</strong> Defina os temas para cada mês ou semana.
          As tarefas com regra "Tema do período" usarão estes temas automaticamente.
        </p>
      </div>

      {/* Period selector and themes */}
      <div className="rf-card p-5">
        <PeriodSelector
          periodType={periodType}
          onPeriodTypeChange={handlePeriodTypeChange}
          currentPeriodStart={currentPeriodStart}
          onPeriodChange={handlePeriodChange}
          onAddTheme={handleAddTheme}
          themes={editingThemes.length > 0 ? editingThemes : themes}
        />
      </div>

      {/* Save button when editing */}
      {(editingThemes.length > 0 || themes.length > 0) && (
        <div className="flex justify-end">
          <button onClick={handleModalConfirm} disabled={isSaving} className="btn-sun">
            {isSaving ? "Salvando..." : "Salvar temas deste período"}
          </button>
        </div>
      )}

      {/* Theme modal */}
      {showThemeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
          onClick={() => setShowThemeModal(false)}
        >
          <div
            className="w-full max-w-md rf-card rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between mb-6">
              <h3 className="font-display text-lg font-bold">
                {multiSelectMode ? "Adicionar Múltiplos Temas" : "Adicionar Tema"}
              </h3>
              <button onClick={() => setShowThemeModal(false)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="space-y-4">
              {/* Current themes */}
              <div>
                <label className="block text-sm font-medium mb-2">Temas atuais</label>
                <div className="flex flex-wrap gap-2 min-h-[40px]">
                  {modalThemes.length === 0 ? (
                    <p className="text-sm text-muted-foreground w-full text-center py-4">
                      Nenhum tema
                    </p>
                  ) : (
                    modalThemes.map((theme) => (
                      <ThemeChip
                        key={theme}
                        theme={theme}
                        onRemove={() => handleModalRemoveTheme(theme)}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Add theme input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={modalNewTheme}
                  onChange={(e) => setModalNewTheme(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleModalAddTheme();
                    }
                  }}
                  placeholder="Digite o nome do tema e pressione Enter"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
                <button onClick={handleModalAddTheme} className="btn-sun whitespace-nowrap">
                  Adicionar
                </button>
              </div>

              {/* Multi-select hint */}
              {multiSelectMode && (
                <p className="text-xs text-muted-foreground">
                  Adicione vários temas. Pressione Enter após cada um. Clique no X para remover.
                </p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button onClick={() => setShowThemeModal(false)} className="btn-ghost">
                  Cancelar
                </button>
                <button onClick={handleModalConfirm} disabled={isSaving} className="btn-sun">
                  {isSaving ? "Salvando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
