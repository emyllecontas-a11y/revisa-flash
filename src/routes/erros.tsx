// src/routes/erros.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import {
  Plus, X, AlertTriangle, Filter, ChevronLeft, Pencil, Trash2,
  RotateCw, Sparkles, Loader2, FolderOpen,
} from "lucide-react";
import { useErrors } from "@/contexts/ErrorContext";
import { useErrorSync } from "@/hooks/useErrorSync";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import type { ErrorType, ErrorRecord } from "@/contexts/ErrorContext";

const CARD_COLORS = [
  '#E8A87C',
  '#E0A5C0',
  '#D4A88E',
  '#E8A87C',
  '#E0A5C0',
  '#D9A57E',
];
const getCardColor = (i: number) => CARD_COLORS[i % CARD_COLORS.length];

export default function ErrosPage() {
  const navigate = useNavigate();
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [selectedDiscipline, setSelectedDiscipline] = useState<{ id: string | null; name: string } | null>(null);
  const [filterType, setFilterType] = useState<string>("Todos");

  const [isSavingCreate, setIsSavingCreate] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [incrementingId, setIncrementingId] = useState<string | null>(null);

  const {
    records,
    addError,
    editError,
    deleteError,
    getErrorsByDiscipline,
    getDisciplineStats,
    getTotalErrors,
    disciplines,
    disciplinesLoading,
  } = useErrors();

  const { syncAddError, syncEditError, syncDeleteError } = useErrorSync();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingError, setEditingError] = useState<ErrorRecord | null>(null);

  const [newError, setNewError] = useState({
    discipline_id: '',
    question: '',
    correctAnswer: '',
    yourAnswer: '',
    type: 'Conceito' as ErrorType,
    topic: '',
    source: '',
    comment: '',
    createFlashcard: true,
  });

  const [editForm, setEditForm] = useState({
    discipline_id: '',
    question: '',
    correctAnswer: '',
    yourAnswer: '',
    type: 'Conceito' as ErrorType,
    topic: '',
    comment: '',
  });

  // ============================================================
  // FUNÇÕES
  // ============================================================
  const handleCreateError = async () => {
    if (isSavingCreate) return;
    if (!newError.question.trim() || !newError.correctAnswer.trim()) {
      toast.warning('Preencha a questão e a resposta correta.');
      return;
    }
    setIsSavingCreate(true);
    try {
      const createdError = await addError({
        question: newError.question.trim(),
        correctAnswer: newError.correctAnswer.trim(),
        yourAnswer: newError.yourAnswer.trim() || undefined,
        discipline_id: newError.discipline_id || undefined,
        topic: newError.topic.trim() || undefined,
        type: newError.type,
        source: newError.source.trim() || undefined,
        comment: newError.comment.trim() || undefined,
      });
      if (newError.createFlashcard) {
        const syncedError = await syncAddError(createdError);
        if (syncedError.flashcardId) {
          await editError(syncedError.id, { flashcardId: syncedError.flashcardId });
        }
      }
      setIsCreateModalOpen(false);
      setNewError({
        discipline_id: '', question: '', correctAnswer: '', yourAnswer: '',
        type: 'Conceito', topic: '', source: '', comment: '', createFlashcard: true,
      });
      toast.success("Erro registrado com sucesso!");
    } catch (error) {
      console.error('Erro ao criar erro:', error);
      toast.error('Erro ao salvar', { description: 'Tente novamente.' });
    } finally {
      setIsSavingCreate(false);
    }
  };

  const handleEditError = async () => {
    if (isSavingEdit || !editingError) return;
    if (!editForm.question.trim() || !editForm.correctAnswer.trim()) {
      toast.warning('Preencha a questão e a resposta correta.');
      return;
    }
    setIsSavingEdit(true);
    try {
      const updatedData = {
        question: editForm.question.trim(),
        correctAnswer: editForm.correctAnswer.trim(),
        yourAnswer: editForm.yourAnswer.trim() || undefined,
        discipline_id: editForm.discipline_id || undefined,
        type: editForm.type,
        topic: editForm.topic.trim() || undefined,
        comment: editForm.comment.trim() || undefined,
      };
      await editError(editingError.id, updatedData);
      const updatedError = { ...editingError, ...updatedData };
      await syncEditError(updatedError);
      setIsEditModalOpen(false);
      setEditingError(null);
      toast.success("Erro atualizado");
    } catch (error) {
      console.error('Erro ao editar erro:', error);
      toast.error('Erro ao salvar alterações', { description: 'Tente novamente.' });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteError = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir este erro?",
      description: "O erro será removido permanentemente do caderno.",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    const errorToDelete = records.find(e => e.id === id);
    if (errorToDelete) {
      await syncDeleteError(errorToDelete);
      await deleteError(id);
      if (editingError?.id === id) {
        setIsEditModalOpen(false);
        setEditingError(null);
      }
      toast.success("Erro excluído");
    }
  };

  const handleIncrementRepetition = async (id: string) => {
    if (incrementingId === id) return;
    setIncrementingId(id);
    try {
      const error = records.find(e => e.id === id);
      if (error) {
        await editError(id, { repetitions: (error.repetitions || 0) + 1 });
      }
    } catch (error) {
      console.error('Erro ao incrementar repetição:', error);
    } finally {
      setIncrementingId(null);
    }
  };

  const openEditModal = (error: ErrorRecord) => {
    setEditingError(error);
    setEditForm({
      discipline_id: error.discipline_id || '',
      question: error.question,
      correctAnswer: error.correctAnswer,
      yourAnswer: error.yourAnswer || '',
      type: error.type,
      topic: error.topic || '',
      comment: error.comment || '',
    });
    setIsEditModalOpen(true);
  };

  const openCreateModal = (disciplineId?: string | null) => {
    setNewError({
      discipline_id: disciplineId || '',
      question: '', correctAnswer: '', yourAnswer: '',
      type: 'Conceito', topic: '', source: '', comment: '', createFlashcard: true,
    });
    setIsCreateModalOpen(true);
  };

  // ============================================================
  // RENDER: LISTA DE DISCIPLINAS
  // ============================================================
  if (!selectedDiscipline) {
    const stats = getDisciplineStats();
    const totalErrors = getTotalErrors();
    const comErro = stats.filter(s => s.errors > 0).length;
    const criticas = stats.filter(s => s.errors >= 10).length;
    const resolvidos = records.filter(r => r.status === 'resolvido').length;
    const sortedStats = [...stats].sort((a, b) => b.errors - a.errors);

    return (
      <>
        <AppShell breadcrumb="Erros" title="Caderno de erros">
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Total ativos" value={totalErrors} tone="accent" />
            <Kpi label="Disciplinas com erro" value={comErro} />
            <Kpi label="Críticas" value={criticas} tone="accent" />
            <Kpi label="Resolvidos" value={resolvidos} />
          </div>

          <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 text-xs text-foreground/55">
              <Filter className="h-3.5 w-3.5" /> Ordenado por incidência
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/conteudo')}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface-2"
              >
                <FolderOpen className="h-3.5 w-3.5" /> Gerenciar disciplinas
              </button>
              <button
                onClick={() => openCreateModal()}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" /> Registrar erro
              </button>
            </div>
          </div>

          {disciplinesLoading ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : sortedStats.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-white/10">
              <div className="text-center">
                <p className="text-sm text-foreground/50">Nenhuma disciplina cadastrada.</p>
                <button
                  onClick={() => navigate('/conteudo')}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> Criar disciplina
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedStats.map((d, index) => {
                const critico = d.errors >= 10;
                const pct = totalErrors > 0 ? Math.round((d.errors / totalErrors) * 100) : 0;
                const cor = getCardColor(index);
                return (
                  <button
                    key={d.id ?? 'sem-disciplina'}
                    onClick={() => { setSelectedDiscipline({ id: d.id, name: d.name }); setFilterType("Todos"); }}
                    className="card-lip p-5 text-left flex flex-col min-h-[170px]"
                    style={{ '--lip': cor } as React.CSSProperties}
                  >
                    <header className="mb-3 flex items-start justify-between">
                      <div
                        className="grid h-12 w-12 shrink-0 place-items-center"
                        style={{ color: cor }}
                      >
                        <AlertTriangle
                          className="h-8 w-8"
                          strokeWidth={2.4}
                          fill={`color-mix(in oklab, ${cor} 35%, transparent)`}
                        />
                      </div>
                      {critico && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                          <AlertTriangle className="h-3 w-3" /> Crítico
                        </span>
                      )}
                    </header>

                    <h3 className="font-display text-base font-semibold tracking-tight line-clamp-2">{d.name}</h3>
                    <p className="mt-1 text-xs text-foreground/45">
                      {d.errors} {d.errors === 1 ? 'erro ativo' : 'erros ativos'} · {pct}% do total
                    </p>

                    <div className="mt-auto pt-4">
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(pct * 2, 100)}%`, background: cor }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </AppShell>

        {isCreateModalOpen && (
          <CreateErrorModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onSave={handleCreateError}
            newError={newError}
            setNewError={setNewError}
            lockedDisciplineId={null}
            disciplines={disciplines}
            isSaving={isSavingCreate}
          />
        )}
      </>
    );
  }

  // ============================================================
  // RENDER: DETALHE DA DISCIPLINA
  // ============================================================
  const areaErrors = getErrorsByDiscipline(selectedDiscipline.id);
  const activeErrors = areaErrors.filter(e => e.status === 'ativo').length;
  const reincidentes = areaErrors.filter(e => e.repetitions > 1).length;
  const conceitoErrors = areaErrors.filter(e => e.type === 'Conceito').length;

  const filteredErrors = filterType === "Todos"
    ? areaErrors
    : areaErrors.filter(e => e.type === filterType);

  const sortedErrors = [...filteredErrors].sort((a, b) => b.repetitions - a.repetitions);

  return (
    <>
      <AppShell breadcrumb={`Erros · ${selectedDiscipline.name}`}>
        <button
          onClick={() => { setSelectedDiscipline(null); setFilterType("Todos"); }}
          className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-foreground/55 hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Voltar para disciplinas
        </button>

        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-widest text-foreground/40">
              Disciplina
            </span>
            <h1 className="font-display text-2xl font-bold capitalize tracking-tight sm:text-3xl">
              {selectedDiscipline.name}
            </h1>
            <p className="mt-1 text-sm text-foreground/55">
              Todos os erros registrados nesta disciplina.
            </p>
          </div>
          <button
            onClick={() => openCreateModal(selectedDiscipline.id)}
            className="inline-flex items-center gap-1.5 self-start rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 sm:self-auto"
          >
            <Plus className="h-3.5 w-3.5" /> Registrar erro
          </button>
        </header>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Erros ativos" value={activeErrors} tone="accent" />
          <Kpi label="Reincidentes" value={reincidentes} />
          <Kpi label="Conceito" value={conceitoErrors} />
          <Kpi label="Resolvidos" value={areaErrors.filter(e => e.status === 'resolvido').length} />
        </div>

        <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
          <div className="inline-flex items-center gap-2 text-xs text-foreground/55">
            <Filter className="h-3.5 w-3.5" /> Ordenado por reincidência
          </div>
          <div className="flex flex-wrap gap-1">
            {["Todos", "Conceito", "Interpretação", "Memória", "Atenção"].map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={[
                  "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
                  filterType === t
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-surface text-foreground/65 hover:bg-surface-2",
                ].join(" ")}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {sortedErrors.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedErrors.map((error, index) => {
              const cor = getCardColor(index);
              return (
                <article
                  key={error.id}
                  className="card-lip p-5 flex flex-col min-h-[190px]"
                  style={{ '--lip': cor } as React.CSSProperties}
                >
                  <header className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: `color-mix(in oklab, ${cor} 22%, transparent)`,
                          color: cor,
                        }}
                      >
                        {selectedDiscipline.name}
                      </span>
                      <TipoBadge t={error.type} />
                    </div>
                    <button
                      onClick={() => openEditModal(error)}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-foreground/40 hover:bg-white/5 hover:text-foreground transition-colors"
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </header>

                  <p className="text-sm font-semibold leading-snug text-foreground line-clamp-3">
                    {error.question}
                  </p>

                  <div className="mt-auto pt-4 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-foreground/45">
                      Errou {error.repetitions}x
                    </span>
                    <button
                      onClick={() => handleIncrementRepetition(error.id)}
                      disabled={incrementingId === error.id}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-80 transition-opacity disabled:opacity-50"
                    >
                      {incrementingId === error.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCw className="h-3.5 w-3.5" />
                      )}
                      Errei de novo
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[150px] items-center justify-center rounded-2xl border border-dashed border-white/10">
            <p className="text-sm text-foreground/40">
              {filterType === "Todos"
                ? "Nenhum erro registrado nesta disciplina."
                : `Nenhum erro do tipo "${filterType}" registrado.`}
            </p>
          </div>
        )}
      </AppShell>

      {isCreateModalOpen && (
        <CreateErrorModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSave={handleCreateError}
          newError={newError}
          setNewError={setNewError}
          lockedDisciplineId={selectedDiscipline.id}
          disciplines={disciplines}
          isSaving={isSavingCreate}
        />
      )}

      {isEditModalOpen && editingError && (
        <EditErrorModal
          isOpen={isEditModalOpen}
          onClose={() => { setIsEditModalOpen(false); setEditingError(null); }}
          onSave={handleEditError}
          onDelete={() => handleDeleteError(editingError.id)}
          editForm={editForm}
          setEditForm={setEditForm}
          editingError={editingError}
          disciplines={disciplines}
          isSaving={isSavingEdit}
        />
      )}
    </>
  );
}

function CreateErrorModal({
  isOpen, onClose, onSave, newError, setNewError,
  lockedDisciplineId, disciplines, isSaving,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  newError: any;
  setNewError: (data: any) => void;
  lockedDisciplineId: string | null | undefined;
  disciplines: { id: string; name: string }[];
  isSaving: boolean;
}) {
  if (!isOpen) return null;

  const locked = lockedDisciplineId !== null && lockedDisciplineId !== undefined;
  const lockedName = locked ? disciplines.find(d => d.id === lockedDisciplineId)?.name || 'Disciplina' : '';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm rf-fade-in" role="dialog">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated">
        <header className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h3 className="font-display text-base font-semibold">Registrar novo erro</h3>
            <p className="text-xs text-foreground/45">Será adicionado ao caderno.</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/5 hover:bg-white/10" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-3 p-5">
          <Field label="Disciplina">
            {locked ? (
              <input type="text" value={lockedName} disabled className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-foreground/70 outline-none cursor-not-allowed" />
            ) : (
              <select
                value={newError.discipline_id}
                onChange={(e) => setNewError({ ...newError, discipline_id: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Sem disciplina</option>
                {disciplines.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
              </select>
            )}
          </Field>
          <Field label="Questão / enunciado">
            <textarea
              rows={3}
              value={newError.question}
              onChange={(e) => setNewError({ ...newError, question: e.target.value })}
              placeholder="Cole o enunciado…"
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Resposta correta">
            <input
              value={newError.correctAnswer}
              onChange={(e) => setNewError({ ...newError, correctAnswer: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Sua resposta (opcional)">
            <input
              value={newError.yourAnswer}
              onChange={(e) => setNewError({ ...newError, yourAnswer: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Tipo de erro">
            <div className="flex flex-wrap gap-2">
              {["Conceito", "Interpretação", "Atenção", "Memória"].map((t) => (
                <button
                  key={t}
                  onClick={() => setNewError({ ...newError, type: t as ErrorType })}
                  className={[
                    "rounded-full border px-3 py-1 text-xs",
                    newError.type === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:border-primary hover:text-primary",
                  ].join(" ")}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="createFlashcard"
              checked={newError.createFlashcard}
              onChange={(e) => setNewError({ ...newError, createFlashcard: e.target.checked })}
              className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
            />
            <label htmlFor="createFlashcard" className="text-xs font-medium text-foreground/70 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Criar flashcard automaticamente no deck "Erros"
            </label>
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border bg-background/30 p-4">
          <button onClick={onClose} className="rounded-full px-3 py-2 text-sm text-foreground/65 hover:bg-white/5" disabled={isSaving}>
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isSaving ? (<><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>) : ('Salvar erro')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function EditErrorModal({
  isOpen, onClose, onSave, onDelete, editForm, setEditForm,
  editingError, disciplines, isSaving,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  editForm: any;
  setEditForm: (data: any) => void;
  editingError: ErrorRecord;
  disciplines: { id: string; name: string }[];
  isSaving: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm rf-fade-in" role="dialog">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated max-h-[95vh] flex flex-col">
        <header className="flex items-center justify-between border-b border-border p-5 flex-shrink-0">
          <div>
            <h3 className="font-display text-base font-semibold">Editar erro</h3>
            <p className="text-xs text-foreground/45">Atualize as informações do erro.</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/5 hover:bg-white/10" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
              <AlertTriangle className="h-3 w-3" /> ×{editingError.repetitions} reincidências
            </span>
          </div>

          <Field label="Disciplina">
            <select
              value={editForm.discipline_id}
              onChange={(e) => setEditForm({ ...editForm, discipline_id: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="">Sem disciplina</option>
              {disciplines.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
            </select>
          </Field>

          <Field label="Questão / enunciado">
            <textarea
              rows={4}
              value={editForm.question}
              onChange={(e) => setEditForm({ ...editForm, question: e.target.value })}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>

          <Field label="Resposta correta">
            <input
              value={editForm.correctAnswer}
              onChange={(e) => setEditForm({ ...editForm, correctAnswer: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>

          <Field label="Sua resposta (opcional)">
            <input
              value={editForm.yourAnswer}
              onChange={(e) => setEditForm({ ...editForm, yourAnswer: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tipo de erro">
              <select
                value={editForm.type}
                onChange={(e) => setEditForm({ ...editForm, type: e.target.value as ErrorType })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option>Conceito</option>
                <option>Interpretação</option>
                <option>Memória</option>
                <option>Atenção</option>
              </select>
            </Field>
            <Field label="Tópico">
              <input
                value={editForm.topic}
                onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>

          <Field label="Observações / Comentário">
            <textarea
              rows={4}
              value={editForm.comment}
              onChange={(e) => setEditForm({ ...editForm, comment: e.target.value })}
              placeholder="O que você aprendeu com esse erro?"
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border bg-background/30 p-4 flex-shrink-0">
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"
            disabled={isSaving}
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-full px-3 py-2 text-sm text-foreground/65 hover:bg-white/5" disabled={isSaving}>
              Cancelar
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {isSaving ? (<><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>) : ('Salvar alterações')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "accent" }) {
  return (
    <div className="rf-card p-4">
      <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">{label}</div>
      <div className={["mt-1 font-display text-2xl font-bold tabular-nums", tone === "accent" ? "text-accent" : "text-foreground"].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground/70">{label}</span>
      {children}
    </label>
  );
}

function TipoBadge({ t }: { t: ErrorType | string }) {
  const map: Record<string, string> = {
    "Conceito": "bg-primary/10 text-primary",
    "Interpretação": "bg-warning/15 text-warning",
    "Memória": "bg-white/5 text-foreground/65",
    "Atenção": "bg-accent/10 text-accent",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${map[t] ?? ''}`}>{t}</span>;
}