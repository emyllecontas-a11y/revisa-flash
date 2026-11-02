// src/components/CadernoDetalhesModal.tsx
import { useState, useEffect } from "react";
import { getQuestoesDoCaderno, removerQuestaoDoCaderno, adicionarQuestoesAoCaderno, type Caderno } from "@/services/cadernoService";
import { getQuestoesDoBanco, type QuestaoBanco } from "@/services/bancoQuestoesService";
import { PlayerLivreModal } from "@/components/PlayerLivreModal";
import { Loader2, Play, Trash2, X, BookOpen, Plus, Search, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/useToast";
import { useConfirm } from "@/components/ConfirmDialog";

interface Props {
  caderno: Caderno;
  userId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function CadernoDetalhesModal({ caderno, userId, onClose, onUpdate }: Props) {
  const toast = useToast();
  const confirmDialog = useConfirm();
  
  const [questoes, setQuestoes] = useState<QuestaoBanco[]>([]);
  const [loading, setLoading] = useState(true);
  const [praticando, setPraticando] = useState(false);

  // Estado para o Modal de Adicionar Questões
  const [modalAdicionar, setModalAdicionar] = useState(false);
  const [todasQuestoesBanco, setTodasQuestoesBanco] = useState<QuestaoBanco[]>([]);
  const [selecionadasParaAdicionar, setSelecionadasParaAdicionar] = useState<Set<string>>(new Set());
  const [buscaAdicionar, setBuscaAdicionar] = useState("");
  const [salvandoAdicionar, setSalvandoAdicionar] = useState(false);

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
      onUpdate();
      toast.success("Questão removida do caderno");
    } else {
      toast.error("Erro ao remover", { description: res.error });
    }
  };

  // --- AÇÕES DO MODAL ADICIONAR ---
  const abrirModalAdicionar = async () => {
    setModalAdicionar(true);
    setSelecionadasParaAdicionar(new Set());
    setBuscaAdicionar("");
    const res = await getQuestoesDoBanco(userId);
    if (res.success && res.data) setTodasQuestoesBanco(res.data);
  };

  const handleAdicionar = async () => {
    if (selecionadasParaAdicionar.size === 0) return;
    setSalvandoAdicionar(true);
    const res = await adicionarQuestoesAoCaderno(caderno.id, Array.from(selecionadasParaAdicionar));
    setSalvandoAdicionar(false);
    
    if (res.success) {
      toast.success(`${selecionadasParaAdicionar.size} questões adicionadas!`);
      setModalAdicionar(false);
      load();
      onUpdate();
    } else {
      toast.error("Erro ao adicionar", { description: res.error });
    }
  };

  const toggleSelecaoAdicionar = (id: string) => {
    setSelecionadasParaAdicionar(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const questoesFiltradasParaAdicionar = todasQuestoesBanco.filter(q => {
    if (questoes.some(existente => existente.id === q.id)) return false; // Não mostra as que já estão
    if (!buscaAdicionar.trim()) return true;
    return q.enunciado.toLowerCase().includes(buscaAdicionar.toLowerCase());
  });

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
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
        <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-elevated">
          
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h3 className="text-lg font-bold font-display">{caderno.nome}</h3>
              <p className="text-xs text-foreground/50">{questoes.length} questões neste caderno</p>
            </div>
            <button onClick={onClose} className="text-foreground/50 hover:text-foreground"><X className="h-5 w-5" /></button>
          </div>

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

          <div className="border-t border-border p-4 px-6 flex flex-wrap justify-between items-center gap-2">
            <button onClick={abrirModalAdicionar} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground/70 hover:bg-surface-2 transition-colors">
              <Plus className="h-4 w-4" /> Adicionar Questões
            </button>
            <div className="flex gap-2 ml-auto">
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
      </div>

      {/* MODAL DE ADICIONAR QUESTÕES */}
      {modalAdicionar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-elevated">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h3 className="text-lg font-bold font-display">Adicionar Questões</h3>
                <p className="text-xs text-foreground/50">Selecione do seu banco para incluir neste caderno</p>
              </div>
              <button onClick={() => setModalAdicionar(false)} className="text-foreground/50 hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            
            <div className="p-4 border-b border-border bg-surface">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                <input type="text" placeholder="Buscar questão..." value={buscaAdicionar} onChange={(e) => setBuscaAdicionar(e.target.value)} className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background/50">
              {questoesFiltradasParaAdicionar.length === 0 ? (
                <p className="text-center text-sm text-foreground/50 py-8">Nenhuma questão nova encontrada para adicionar.</p>
              ) : (
                <ul className="space-y-2">
                  {questoesFiltradasParaAdicionar.map(q => (
                    <li key={q.id} className="rf-card p-3 flex gap-3 items-start cursor-pointer hover:border-primary/50" onClick={() => toggleSelecaoAdicionar(q.id)}>
                      <input type="checkbox" checked={selecionadasParaAdicionar.has(q.id)} readOnly className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          <span className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded-full">{q.banca}</span>
                          <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{q.disciplina}</span>
                        </div>
                        <p className="text-sm text-foreground/80 line-clamp-2">{q.enunciado}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border p-4 px-6 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/60">{selecionadasParaAdicionar.size} questões selecionadas</span>
              <div className="flex gap-2">
                <button onClick={() => setModalAdicionar(false)} className="px-4 py-2 rounded-full border border-border bg-surface text-sm font-medium hover:bg-surface-2">
                  Cancelar
                </button>
                <button onClick={handleAdicionar} disabled={selecionadasParaAdicionar.size === 0 || salvandoAdicionar} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {salvandoAdicionar ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}