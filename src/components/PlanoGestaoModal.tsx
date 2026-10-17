// src/components/PlanoGestaoModal.tsx
import { useState } from "react";
import { X, Trash2, Edit3 } from "lucide-react";
import { excluirPlano, type Plano } from "@/services/planoService";
import { useToast } from "@/hooks/useToast";
import { useConfirm } from "@/components/ConfirmDialog";
import { PlanoWizard } from "@/components/PlanoWizard";
import { PlanoImportCsv } from "@/components/PlanoImportCsv";
import { PlanoEditorSemanas } from "@/components/PlanoEditorSemanas";

export function PlanoGestaoModal({
  userId,
  plano,
  onClose,
  onChanged,
}: {
  userId: string;
  plano: Plano | null;
  feitosCount?: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirmDialog = useConfirm();
  
  // Se já tem plano, abre na aba Editar. Se não, abre no Excel.
  const [abaAtiva, setAbaAtiva] = useState<"editar" | "excel" | "wizard">(
    plano ? "editar" : "excel"
  );
  const [excluindo, setExcluindo] = useState(false);

  const handleExcluir = async () => {
    if (!plano) return;
    const ok = await confirmDialog({
      title: "Excluir plano?",
      description: "O plano atual será removido completamente. Você pode criar um novo depois.",
      confirmText: "Sim, excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    
    setExcluindo(true);
    try {
      await excluirPlano(plano.id);
      toast.success("Plano excluído.");
      onChanged();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível excluir o plano.");
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-background/80 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl my-8 rounded-3xl rf-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold">
            {plano ? "Gerenciar plano de estudos" : "Criar plano de estudos"}
          </h2>
          <button onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4">
          {/* Abas */}
          <div className="flex gap-1 rounded-xl bg-muted p-1 overflow-x-auto">
            {plano && (
              <button
                onClick={() => setAbaAtiva("editar")}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors flex items-center justify-center gap-2 ${
                  abaAtiva === "editar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/5"
                }`}
              >
                <Edit3 className="h-3.5 w-3.5" /> Editar Plano
              </button>
            )}
            <button
              onClick={() => setAbaAtiva("excel")}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                abaAtiva === "excel" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/5"
              }`}
            >
              {plano ? "Substituir (Excel)" : "Importar Excel"}
            </button>
            <button
              onClick={() => setAbaAtiva("wizard")}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                abaAtiva === "wizard" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/5"
              }`}
            >
              {plano ? "Substituir (Passo a Passo)" : "Criar Passo a Passo"}
            </button>
          </div>

          {/* Conteúdo das Abas */}
          {abaAtiva === "editar" && plano && (
            <PlanoEditorSemanas
              plano={plano}
              onCancel={onClose}
              onSuccess={() => {
                onChanged();
                onClose();
              }}
            />
          )}

          {abaAtiva === "excel" && (
            <PlanoImportCsv
              userId={userId}
              onCancel={onClose}
              onSuccess={() => {
                onChanged();
                onClose();
              }}
            />
          )}

          {abaAtiva === "wizard" && (
            <PlanoWizard
              userId={userId}
              onCancel={onClose}
              onSuccess={() => {
                onChanged();
                onClose();
              }}
            />
          )}

          {/* Botão de excluir */}
          {plano && (
            <div className="flex justify-center pt-4 border-t border-border/50">
              <button
                onClick={handleExcluir}
                disabled={excluindo}
                className="inline-flex items-center gap-1.5 text-xs text-foreground/50 hover:text-destructive transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> 
                {excluindo ? "Excluindo..." : "Apagar o plano atual"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}