import { useState, useMemo, useEffect, useCallback } from "react";
import { Plus, Trash2, X, Calendar, CalendarDays, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/useToast";
import { useThemeTimeline } from "@/hooks/useThemeTimeline";
import { ContentTreeSelector } from "./ContentTreeSelector";
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
  initialTopicIds?: string[];
  initialThemes?: string[];
  isLegacy?: boolean;
  onConfirm: (topicIds: string[], themes: string[]) => void;
}

function ThemeTimelineModal({
  userId,
  isOpen,
  onClose,
  initialTopicIds = [],
  initialThemes = [],
  isLegacy = false,
  onConfirm,
}: ThemeTimelineModalProps) {
  const toast = useToast();
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(initialTopicIds);
  const [selectedThemeNames, setSelectedThemeNames] = useState<string[]>(initialThemes);

  // Sync theme names when topic IDs change (we don't have topic name mapping here,
  // so we just keep the names that were initially passed)
  // The ContentTreeSelector returns topic IDs; we need to also get names.
  // For now, the names are preserved from initialThemes or entered manually.

  const handleTopicChange = (topicIds: string[]) => {
    setSelectedTopicIds(topicIds);
  };

  const handleConfirm = () => {
    if (selectedTopicIds.length === 0) {
      toast.error("Selecione pelo menos um tópico");
      return;
    }
    onConfirm(selectedTopicIds, selectedThemeNames);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-lg rf-card rounded-2xl p-6 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between mb-6">
          <h3 className="font-display text-lg font-bold">Selecionar Tópicos</h3>
          <button onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </header>

        {isLegacy && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <strong>Período legado:</strong> este período foi criado antes da integração com Conteúdos.
              Selecione os assuntos correspondentes abaixo para vinculá-los.
            </div>
          </div>
        )}

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Escolha os tópicos das suas disciplinas. Você pode selecionar múltiplos.
          </p>

          <ContentTreeSelector
            userId={userId}
            selectedTopicIds={selectedTopicIds}
            onChange={handleTopicChange}
            allowMultiple={true}
          />

          {selectedTopicIds.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground">
                {selectedTopicIds.length} tópico{selectedTopicIds.length !== 1 ? "s" : ""} selecionado{selectedTopicIds.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={handleConfirm}
                className="btn-sun"
                disabled={selectedTopicIds.length === 0}
              >
                Confirmar
              </button>
            </div>
          )}

          {selectedTopicIds.length === 0 && (
            <button
              onClick={handleConfirm}
              className="btn-sun w-full"
              disabled={true}
            >
              Selecione pelo menos um tópico
            </button>
          )}
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
  const [modalInitialTopicIds, setModalInitialTopicIds] = useState<string[]>([]);
  const [modalInitialThemes, setModalInitialThemes] = useState<string[]>([]);
  const [modalIsLegacy, setModalIsLegacy] = useState(false);

  // Initialize current period to current month/week
  const getCurrentPeriodStart = useCallback((type: PeriodType): string => {
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
  }, []);

  // Load themes when period changes
  const themes = useMemo(() => {
    if (!currentPeriodStart) return [];
    return getThemesForPeriod(periodType, currentPeriodStart);
  }, [periodType, currentPeriodStart, getThemesForPeriod]);

  // Initialize on mount
  useEffect(() => {
    if (timelines.length > 0 && !currentPeriodStart) {
      setCurrentPeriodStart(getCurrentPeriodStart(periodType));
    }
  }, [timelines, currentPeriodStart, periodType, getCurrentPeriodStart]);

  const handlePeriodTypeChange = (type: PeriodType) => {
    setPeriodType(type);
    setCurrentPeriodStart(getCurrentPeriodStart(type));
    setEditingThemes([]);
    setShowThemeModal(false);
  };

  const handlePeriodChange = (date: string) => {
    setCurrentPeriodStart(date);
    setEditingThemes([]);
    setShowThemeModal(false);
  };

  const handleAddTheme = () => {
    // Find existing timeline for this period to get topic_ids
    const existing = timelines.find(
      (t) => t.period_type === periodType && t.period_start === currentPeriodStart,
    );
    const isLegacy = existing && (!existing.topic_ids || existing.topic_ids.length === 0) && existing.themes.length > 0;

    if (existing) {
      setModalInitialTopicIds(existing.topic_ids || []);
      setModalInitialThemes(existing.themes);
      setModalIsLegacy(!!isLegacy);
    } else {
      setModalInitialTopicIds([]);
      setModalInitialThemes([]);
      setModalIsLegacy(false);
    }
    setShowThemeModal(true);
  };

  const handleModalConfirm = async (topicIds: string[], themeNames: string[]) => {
    if (topicIds.length === 0) {
      toast.error("Selecione pelo menos um tópico");
      return;
    }

    setIsSaving(true);
    try {
      await upsert({
        period_type: periodType,
        period_start: currentPeriodStart,
        themes: themeNames,
        topic_ids: topicIds,
      });
      toast.success("Temas salvos");
      setShowThemeModal(false);
      setEditingThemes(themeNames);
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
    // Also need to remove corresponding topic_id, but we don't have the mapping here
    // For simplicity, just update themes; topic_ids will be managed via modal
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
          <button onClick={handleAddTheme} disabled={isSaving} className="btn-sun">
            {isSaving ? "Salvando..." : "Editar tópicos deste período"}
          </button>
        </div>
      )}

      {/* Theme modal */}
      {showThemeModal && (
        <ThemeTimelineModal
          userId={userId}
          isOpen={showThemeModal}
          onClose={() => setShowThemeModal(false)}
          initialTopicIds={modalInitialTopicIds}
          initialThemes={modalInitialThemes}
          isLegacy={modalIsLegacy}
          onConfirm={handleModalConfirm}
        />
      )}
    </div>
  );
}