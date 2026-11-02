// src/components/EnviarErrosModal.tsx
import { useState } from "react";
import { X, Check, Loader2, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { useErrors } from "@/contexts/ErrorContext";
import { useErrorSync } from "@/hooks/useErrorSync";
import type { AlternativaErro, TipoQuestao } from "@/contexts/ErrorContext";

export interface QuestaoErrada {
  numero: number;
  enunciado: string;
  suaResposta: string;
  respostaCorreta: string;
  tipo: 'multipla_escolha' | 'certo_errado';
  // ---- Campos enriquecidos (opcionais; se presentes, salvam no caderno) ----
  questao_origem_id?: string;
  alternativas?: AlternativaErro[];
  gabarito_ce?: boolean;
  imagem_url?: string | null;
  comentario_geral?: string | null;
  sublinhados_enunciado?: { inicio: number; fim: number }[] | null;
  sublinhados_comentario?: { inicio: number; fim: number }[] | null;
  negritos_enunciado?: { inicio: number; fim: number }[] | null;
  negritos_comentario?: { inicio: number; fim: number }[] | null;
  italicos_enunciado?: { inicio: number; fim: number }[] | null;
  italicos_comentario?: { inicio: number; fim: number }[] | null;
}

interface Props {
  listaId: string;
  listaTitulo: string;
  /** Pode ser null quando a lista é de um amigo e a disciplina original não existe na sua conta. */
  disciplineId: string | null;
  questoesErradas: QuestaoErrada[];
  onClose: (enviou: boolean) => void;
}

export function EnviarErrosModal({ listaId, listaTitulo, disciplineId, questoesErradas, onClose }: Props) {
  const { addOrIncrementError } = useErrors();
  const { syncAddError } = useErrorSync();

  const [selecionadas, setSelecionadas] = useState<Set<number>>(
    new Set(questoesErradas.map(q => q.numero))
  );
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ criados: number; incrementados: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const toggle = (numero: number) => {
    setSelecionadas(prev => {
      const novo = new Set(prev);
      if (novo.has(numero)) novo.delete(numero);
      else novo.add(numero);
      return novo;
    });
  };

  const handleEnviar = async () => {
    setErro(null);
    setEnviando(true);

    let criados = 0;
    let incrementados = 0;

    try {
      const selecionadasArr = questoesErradas.filter(q => selecionadas.has(q.numero));

      for (const q of selecionadasArr) {
        try {
          const { error, wasIncremented } = await addOrIncrementError({
            question: q.enunciado,
            correctAnswer: q.respostaCorreta,
            yourAnswer: q.suaResposta,
            topic: listaTitulo,
            source: `Lista: ${listaTitulo}`,
            source_lista_id: listaId,
            type: 'Conceito',
            // Quando a lista é de um amigo e não temos disciplina equivalente
            // na conta, salvamos sem discipline_id (vai para "Sem disciplina").
            ...(disciplineId ? { discipline_id: disciplineId } : {}),
            // ---- Campos enriquecidos (só envia os que existirem) ----
            ...(q.questao_origem_id ? { questao_origem_id: q.questao_origem_id } : {}),
            ...(q.tipo ? { tipo_questao: q.tipo as TipoQuestao } : {}),
            ...(q.alternativas ? { alternativas: q.alternativas } : {}),
            ...(typeof q.gabarito_ce === 'boolean' ? { gabarito_ce: q.gabarito_ce } : {}),
            ...(q.imagem_url !== undefined ? { imagem_url: q.imagem_url } : {}),
            ...(q.comentario_geral !== undefined ? { comentario_geral: q.comentario_geral } : {}),
            ...(q.sublinhados_enunciado !== undefined ? { sublinhados_enunciado: q.sublinhados_enunciado } : {}),
            ...(q.sublinhados_comentario !== undefined ? { sublinhados_comentario: q.sublinhados_comentario } : {}),
            ...(q.negritos_enunciado !== undefined ? { negritos_enunciado: q.negritos_enunciado } : {}),
            ...(q.negritos_comentario !== undefined ? { negritos_comentario: q.negritos_comentario } : {}),
            ...(q.italicos_enunciado !== undefined ? { italicos_enunciado: q.italicos_enunciado } : {}),
            ...(q.italicos_comentario !== undefined ? { italicos_comentario: q.italicos_comentario } : {}),
          });

          if (wasIncremented) {
            incrementados++;
          } else {
            criados++;
            await syncAddError(error);
          }
        } catch (e) {
          console.error('Erro ao enviar questão:', q.numero, e);
        }
      }

      setResultado({ criados, incrementados });
    } catch (e: any) {
      setErro(e.message || 'Erro ao enviar erros.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-elevated">
        {resultado ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
            <h3 className="mt-3 font-display text-lg font-semibold">Erros enviados!</h3>
            <p className="mt-1 text-sm text-foreground/60">
              {resultado.criados > 0 && (
                <>{resultado.criados} {resultado.criados === 1 ? 'erro novo' : 'erros novos'}</>
              )}
              {resultado.criados > 0 && resultado.incrementados > 0 && ' · '}
              {resultado.incrementados > 0 && (
                <>{resultado.incrementados} {resultado.incrementados === 1 ? 'reincidência' : 'reincidências'}</>
              )}
            </p>
            <button
              onClick={() => onClose(true)}
              className="mt-5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-lg font-semibold">
                  Enviar erros ao caderno?
                </h3>
                <p className="text-xs text-foreground/50 mt-0.5">
                  {selecionadas.size} de {questoesErradas.length} selecionadas
                </p>
              </div>
              <button
                onClick={() => onClose(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-foreground/50 hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span className="text-foreground/70">
                Cada erro enviado também criará um <strong>flashcard no deck "Erros"</strong> automaticamente.
                Se a questão já estava no caderno, ela será marcada como <strong>reincidência</strong>.
              </span>
            </div>

            <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {questoesErradas.map((q) => {
                const marcada = selecionadas.has(q.numero);
                return (
                  <button
                    key={q.numero}
                    onClick={() => toggle(q.numero)}
                    className={[
                      "w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                      marcada
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-surface/40 hover:bg-surface/60",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors mt-0.5",
                        marcada
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background",
                      ].join(" ")}
                    >
                      {marcada && <Check className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-medium text-foreground/50">
                          Questão {q.numero}
                        </span>
                        <span className={[
                          "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                          q.tipo === 'multipla_escolha'
                            ? "bg-primary/10 text-primary"
                            : "bg-warning/10 text-warning",
                        ].join(" ")}>
                          {q.tipo === 'multipla_escolha' ? 'Múltipla' : 'C/E'}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/80 line-clamp-2 leading-snug">
                        {q.enunciado}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[10px] text-foreground/45">
                        <span>
                          <span className="text-accent">Sua:</span> {q.suaResposta}
                        </span>
                        <span>
                          <span className="text-primary">Correta:</span> {q.respostaCorreta}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {erro && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/10 p-3 text-xs text-accent">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {erro}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => onClose(false)}
                disabled={enviando}
                className="flex-1 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 disabled:opacity-50"
              >
                Não enviar
              </button>
              <button
                onClick={handleEnviar}
                disabled={enviando || selecionadas.size === 0}
                className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {enviando
                  ? <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  : `Enviar ${selecionadas.size} ${selecionadas.size === 1 ? 'erro' : 'erros'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}