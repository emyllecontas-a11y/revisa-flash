// src/components/SubtopicoModal.tsx
// Modal de gerenciamento dos subtópicos de um tópico.
// Permite: criar em massa (colar lista), criar um por vez, reordenar e excluir.
// O status NÃO é alterado aqui — é na lista do SubtopicoCard.

import { useState } from "react";
import { X, Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import {
  criarSubtopicos,
  excluirSubtopico,
  moverSubtopico,
  type Subtopico,
  type SubtopicoStatus,
} from "@/services/subtopicService";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

const STATUS_LABEL: Record<SubtopicoStatus, string> = {
  nao_estudado: "Não iniciado",
  estudando: "Estudando",
  revisado: "Revisado",
  dominado: "Dominado",
};

const STATUS_STYLE: Record<SubtopicoStatus, string> = {
  nao_estudado: "bg-foreground/10 text-foreground/70",
  estudando: "bg-primary/15 text-primary",
  revisado: "bg-accent/15 text-accent",
  dominado: "bg-success/15 text-success",
};

export function SubtopicoModal({
  topicoId,
  subtopicos,
  userId,
  onClose,
  onChanged,
}: {
  topicoId: string;
  subtopicos: Subtopico[];
  userId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [bulkText, setBulkText] = useState("");
  const [individualName, setIndividualName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const handleBulkCreate = async () => {
    const nomes = bulkText
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    if (nomes.length === 0) return;
    setSaving(true);
    try {
      await criarSubtopicos(topicoId, userId, nomes);
      await onChanged();
      setBulkText("");
      toast.success(
        `${nomes.length} subtópico${nomes.length > 1 ? "s" : ""} adicionado${nomes.length > 1 ? "s" : ""}.`
      );
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível adicionar.");
    } finally {
      setSaving(false);
    }
  };

  const handleIndividualCreate = async () => {
    if (!individualName.trim()) return;
    setSaving(true);
    try {
      await criarSubtopicos(topicoId, userId, [individualName.trim()]);
      await onChanged();
      setIndividualName("");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível adicionar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirmDialog({
      title: "Excluir subtópico?",
      description: `"${name}" e suas revisões serão removidos.`,
      confirmText: "Excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      await excluirSubtopico(id);
      await onChanged();
      toast.success("Subtópico excluído.");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível excluir.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleMove = async (id: string, direcao: "up" | "down") => {
    setMoving(true);
    try {
      await moverSubtopico(subtopicos, id, direcao);
      await onChanged();
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível reordenar.");
    } finally {
      setMoving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 overflow-y-auto backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl my-8 space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Gerenciar subtópicos</h2>
          <button onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Criar em massa */}
        <section className="space-y-2">
          <label className="block text-xs font-medium text-foreground/70">
            Colar vários (uma linha = um subtópico)
          </label>
          <textarea
            rows={4}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"Aula 1 - Introdução\nAula 2 - Anatomia\nAula 3 - Fisiologia"}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary placeholder:text-foreground/40"
            disabled={saving}
          />
          <div className="flex justify-end">
            <button
              onClick={handleBulkCreate}
              disabled={saving || !bulkText.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Adicionar todos
            </button>
          </div>
        </section>

        {/* Criar um */}
        <section className="space-y-2">
          <label className="block text-xs font-medium text-foreground/70">
            Adicionar um
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={individualName}
              onChange={(e) => setIndividualName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleIndividualCreate();
              }}
              placeholder="Ex: Aula 4 - Sistema Cardiovascular"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary placeholder:text-foreground/40"
              disabled={saving}
            />
            <button
              onClick={handleIndividualCreate}
              disabled={saving || !individualName.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </button>
          </div>
        </section>

        {/* Lista */}
        <section className="space-y-2">
          <label className="block text-xs font-medium text-foreground/70">
            Existentes ({subtopicos.length})
          </label>
          {subtopicos.length === 0 ? (
            <p className="py-4 text-center text-xs text-foreground/40">
              Nenhum subtópico.
            </p>
          ) : (
            <ul className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {subtopicos.map((s, idx) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background/40 p-2.5"
                >
                  <div className="flex flex-col">
                    <button
                      onClick={() => handleMove(s.id, "up")}
                      disabled={idx === 0 || moving}
                      className="text-foreground/40 hover:text-foreground disabled:opacity-30"
                      aria-label="Mover para cima"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleMove(s.id, "down")}
                      disabled={idx === subtopicos.length - 1 || moving}
                      className="text-foreground/40 hover:text-foreground disabled:opacity-30"
                      aria-label="Mover para baixo"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1 text-sm">{s.name}</div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[s.status]}`}
                  >
                    {STATUS_LABEL[s.status]}
                  </span>
                  <button
                    onClick={() => handleDelete(s.id, s.name)}
                    disabled={deletingId === s.id}
                    className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                    aria-label="Excluir"
                  >
                    {deletingId === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}