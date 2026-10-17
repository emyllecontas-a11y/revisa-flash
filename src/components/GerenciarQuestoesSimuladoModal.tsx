// src/components/GerenciarQuestoesSimuladoModal.tsx
import { useState, useEffect, useCallback } from "react";
import {
  getSimuladoCompleto,
  removerQuestaoDoSimulado,
} from "@/services/simuladoService";
import type { Simulado, QuestaoPlayer } from "@/lib/simulados-types";
import { EditarQuestaoSimuladoModal } from "@/components/EditarQuestaoSimuladoModal";
import {
  X, Loader2, Trash2, ListChecks, Pencil, Image as ImageIcon, Plus,
  CheckCircle2, AlertCircle, HelpCircle,
} from "lucide-react";

interface Props {
  simulado: Simulado;
  userId: string;
  onClose: () => void;
  onSimuladoAlterado: () => void;
}

type Acao = { tipo: "criar" } | { tipo: "editar"; questaoId: string } | null;

export function GerenciarQuestoesSimuladoModal({
  simulado,
  userId,
  onClose,
  onSimuladoAlterado,
}: Props) {
  const [questoes, setQuestoes] = useState<QuestaoPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const [acao, setAcao] = useState<Acao>(null);

  const loadQuestoes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getSimuladoCompleto(simulado.id);
      if (result.success && result.data) {
        setQuestoes(result.data.questoes || []);
      } else {
        setError(result.error || "Erro ao carregar questões");
      }
    } catch (err: any) {
      setError(err.message || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }, [simulado.id]);

  useEffect(() => {
    loadQuestoes();
  }, [loadQuestoes]);

  const handleRemover = async (q: QuestaoPlayer) => {
    if (!confirm(`Remover a questão ${q.numero} do simulado?`)) return;

    setRemovendo(q.id);
    setFeedback(null);

    const result = await removerQuestaoDoSimulado(simulado.id, q.id, userId);
    setRemovendo(null);

    if (!result.success) {
      setFeedback({ tipo: "erro", msg: result.error || "Erro ao remover questão" });
      return;
    }

    setFeedback({ tipo: "ok", msg: `Questão ${q.numero} removida.` });
    await loadQuestoes();
    onSimuladoAlterado();

    setTimeout(() => setFeedback(null), 2500);
  };

  const handleQuestaoSalva = async () => {
    setAcao(null);
    setFeedback({ tipo: "ok", msg: "Questão salva com sucesso." });
    await loadQuestoes();
    onSimuladoAlterado();
    setTimeout(() => setFeedback(null), 2500);
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
        <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-elevated">
          <div className="flex items-start justify-between mb-5">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold truncate">Gerenciar questões</h2>
              <p className="text-xs text-foreground/50 mt-0.5 truncate">{simulado.titulo}</p>
            </div>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-foreground/50 hover:bg-white/5 hover:text-foreground transition-colors shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {feedback && (
            <div
              className={[
                "mb-4 flex items-center gap-2 rounded-lg border p-3 text-xs",
                feedback.tipo === "ok"
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-accent/20 bg-accent/10 text-accent",
              ].join(" ")}
            >
              {feedback.tipo === "ok" ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              {feedback.msg}
            </div>
          )}

          <button
            onClick={() => setAcao({ tipo: "criar" })}
            className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar questão
          </button>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-accent/20 bg-accent/10 p-4 text-xs text-accent text-center">
              {error}
              <button
                onClick={loadQuestoes}
                className="mt-3 block mx-auto rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Tentar novamente
              </button>
            </div>
          ) : questoes.length === 0 ? (
            <div className="text-center py-12">
              <ListChecks className="mx-auto h-10 w-10 text-foreground/20" />
              <p className="mt-3 text-sm text-foreground/50">Este simulado não tem questões.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {questoes.map((q) => {
                const removendoEsta = removendo === q.id;
                const isCE = !q.alternativas || q.alternativas.length === 0;

                return (
                  <div key={q.id} className="rounded-lg border border-border bg-surface/40 p-3">
                    <div className="flex items-start gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                        {q.numero}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-[10px] font-medium",
                              isCE
                                ? "bg-warning/10 text-warning"
                                : "bg-primary/10 text-primary",
                            ].join(" ")}
                          >
                            {isCE ? "Certo/Errado" : "Múltipla escolha"}
                          </span>
                          {q.area && (
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-foreground/50">
                              {q.area}
                            </span>
                          )}
                          {q.imagem_url && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-foreground/50">
                              <ImageIcon className="h-2.5 w-2.5" /> Imagem
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-foreground/75 line-clamp-2 leading-relaxed">
                          {q.enunciado}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => setAcao({ tipo: "editar", questaoId: q.id })}
                          className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-surface/60 text-foreground/50 hover:text-primary hover:border-primary/40 transition-colors"
                          title="Editar questão"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleRemover(q)}
                          disabled={removendoEsta}
                          className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-surface/60 text-foreground/40 hover:border-accent/40 hover:text-accent transition-colors disabled:opacity-50"
                          title="Remover questão"
                        >
                          {removendoEsta ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
            <p className="text-[11px] text-foreground/40 flex items-center gap-1.5">
              <HelpCircle className="h-3 w-3" />
              Ao remover uma questão, as respostas dela em tentativas antigas continuam salvas.
            </p>
            <button
              onClick={onClose}
              className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-medium text-foreground/70 hover:bg-surface-2 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>

      {acao && (
        <EditarQuestaoSimuladoModal
          modo={acao.tipo}
          simuladoId={simulado.id}
          userId={userId}
          questaoId={acao.tipo === "editar" ? acao.questaoId : undefined}
          onClose={() => setAcao(null)}
          onSuccess={handleQuestaoSalva}
        />
      )}
    </>
  );
}