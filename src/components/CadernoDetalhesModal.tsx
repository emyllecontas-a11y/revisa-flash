// src/components/CadernoDetalhesModal.tsx
import { useState, useEffect } from "react";
import { getQuestoesDoCaderno, removerQuestaoDoCaderno, type Caderno } from "@/services/cadernoService";
import type { QuestaoBanco } from "@/services/bancoQuestoesService";
import { PlayerLivreModal } from "@/components/PlayerLivreModal";
import { Loader2, Play, Trash2, X, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/useToast";
import { useConfirm } from "@/components/ConfirmDialog";

interface Props {
  caderno: Caderno;
  userId: string;
  onClose: () => void;
  onUpdate: () => void; // Para atualizar a contagem na tela anterior
}

export function CadernoDetalhesModal({ caderno, userId, onClose, onUpdate }: Props) {
  const toast = useToast();
  const confirmDialog = useConfirm();
  
  const [questoes, setQuestoes] = useState<QuestaoBanco[]>([]);
  const [loading, setLoading] = useState(true);
  const [praticando, setPraticando] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await getQuestoesDoCaderno(caderno.id);
    if (res.success && res.data) setQuestoes(res.data);
    else toast.error("Erro ao carregar questões do caderno");
    setLoading(false);
  };

  useEffect(() => { load(); }, [caderno.id]);

  const handleRemover = async (q: QuestaoBanco) => {
    const ok = await confirmDialog({
      title: "Remover questão?",
      description: "Ela será retirada deste caderno, mas continuará salva no seu Banco de Questões.",
      confirmText: "Remover",
      destructive: true
    });
    if (!ok) return;

    const res = await removerQuestaoDoCaderno(caderno.id, q.id);
    if (res.success) {
      setQuestoes(prev => prev.filter(x => x.id !== q.id));
      onUpdate(); // Atualiza o contador do cartão do caderno
      toast.success("Questão removida do caderno");
    } else {
      toast.error("Erro ao remover", { description: res.error });
    }
  };

  if (praticando) {
    return (
      <PlayerLivreModal
        userId={userId}
        questoes={questoes}
        onClose={() => { setPraticando(false); onClose(); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-elevated">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-lg font-bold font-display">{caderno.nome}</h3>
            <p className="text-xs text-foreground/50">{questoes.length} questões neste caderno</p>
          </div>
          <button onClick={onClose} className="text-foreground/50 hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background/50">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : questoes.length === 0 ? (
            <div className="text-center py-10">
              <BookOpen className="h-10 w-10 text-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-foreground/50">Nenhuma questão neste caderno.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {questoes.map((q) => (
                <li key={q.id} className="rf-card p-4 flex gap-3 items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      <span className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded-full">{q.banca}</span>
                      <span className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded-full">{q.ano}</span>
                      <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{q.disciplina}</span>
                    </div>
                    <p className="text-sm text-foreground/80 line-clamp-2">{q.enunciado}</p>
                  </div>
                  <button onClick={() => handleRemover(q)} className="shrink-0 p-2 text-foreground/30 hover:text-accent transition-colors" title="Remover do caderno">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 px-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-5 py-2.5 rounded-full border border-border bg-surface text-sm font-medium hover:bg-surface-2">
            Fechar
          </button>
          <button 
            onClick={() => setPraticando(true)} 
            disabled={questoes.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Play className="h-4 w-4" /> Praticar Caderno
          </button>
        </div>
      </div>
    </div>
  );
}