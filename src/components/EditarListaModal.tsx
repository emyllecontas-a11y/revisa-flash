// src/components/EditarListaModal.tsx
import { useState } from "react";
import { Lista } from "@/lib/listas-types";
import { atualizarLista } from "@/services/listaService";
import { X, Loader2, CheckCircle2 } from "lucide-react";

interface Props {
  lista: Lista;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditarListaModal({ lista, userId, onClose, onSuccess }: Props) {
  const [titulo, setTitulo] = useState(lista.titulo);
  const [descricao, setDescricao] = useState(lista.descricao || "");
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const handleSalvar = async () => {
    setError(null);

    if (!titulo.trim()) {
      setError("O título é obrigatório");
      return;
    }

    setSalvando(true);
    const result = await atualizarLista(lista.id, userId, {
      titulo,
      descricao: descricao || null,
    });
    setSalvando(false);

    if (!result.success) {
      setError(result.error || "Erro ao salvar");
      return;
    }

    setSucesso(true);
    setTimeout(() => {
      onSuccess();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 max-h-[90vh] overflow-y-auto shadow-elevated">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Editar lista</h3>
          <button
            onClick={onClose}
            className="text-foreground/50 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {sucesso ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
            <p className="mt-3 text-sm font-medium text-foreground">Lista atualizada!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground/70">Título *</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                disabled={salvando}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground/70">Descrição</label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                disabled={salvando}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1 resize-none"
                placeholder="Opcional"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-accent/20 bg-accent/10 p-3 text-xs text-accent">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                disabled={salvando}
                className="flex-1 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={salvando}
                className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {salvando ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Salvar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}