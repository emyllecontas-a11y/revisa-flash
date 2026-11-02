// src/components/PlayerLivreModal.tsx
import { useState, useEffect, useRef } from "react";
import { QuestaoCard } from "@/components/QuestaoCard";
import { salvarTentativaAvulsa, type QuestaoBanco } from "@/services/bancoQuestoesService";
import { Loader2, Play, CheckCircle2, XCircle, ChevronLeft, X, Send } from "lucide-react";
import { useToast } from "@/hooks/useToast";
import { getAnotacoesDeQuestoes, criarAnotacao, removerAnotacao, trocarCorAnotacao } from "@/services/anotacaoQuestaoService";
import type { AnotacaoQuestao, CampoAlvo, CorGrifo, RectGrifo } from "@/lib/anotacoes-types";
import { EnviarErrosModal, type QuestaoErrada } from "@/components/EnviarErrosModal";

interface Props {
  userId: string;
  questoes: QuestaoBanco[];
  onClose: () => void;
}

export function PlayerLivreModal({ userId, questoes, onClose }: Props) {
  const toast = useToast();
  const [fase, setFase] = useState<"config" | "jogando" | "resultado">("config");
  const [quantidade, setQuantidade] = useState(10);
  const [questoesSorteio, setQuestoesSorteio] = useState<QuestaoBanco[]>([]);
  
  const [idx, setIdx] = useState(0);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [revelar, setRevelar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  
  const [acertos, setAcertos] = useState(0);
  const [erros, setErros] = useState(0);
  
  // Guarda a questão e a resposta do usuário para enviar ao Caderno de Erros
  const [questoesErradas, setQuestoesErradas] = useState<{ q: QuestaoBanco, suaResposta: string, respostaCorreta: string }[]>([]);
  
  const [tempoQuestao, setTempoQuestao] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [eliminadas, setEliminadas] = useState<Record<number, string[]>>({});
  const [anotacoes, setAnotacoes] = useState<Map<string, AnotacaoQuestao[]>>(new Map());
  
  const [modalEnviar, setModalEnviar] = useState(false);

  // Cronômetro da questão
  useEffect(() => {
    if (fase === "jogando" && !revelar) {
      timerRef.current = setInterval(() => setTempoQuestao(p => p + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fase, revelar, idx]);

  // Carregar grifos
  useEffect(() => {
    if (!userId || questoesSorteio.length === 0) return;
    const ids = questoesSorteio.map(q => q.id);
    getAnotacoesDeQuestoes(userId, 'banco' as any, ids)
      .then(setAnotacoes)
      .catch(() => {});
  }, [userId, questoesSorteio]);

  const iniciar = () => {
    const qtd = Math.min(quantidade, questoes.length);
    const embaralhadas = [...questoes].sort(() => Math.random() - 0.5).slice(0, qtd);
    setQuestoesSorteio(embaralhadas);
    setIdx(0);
    setAcertos(0);
    setErros(0);
    setQuestoesErradas([]);
    setTempoQuestao(0);
    setSelecionada(null);
    setRevelar(false);
    setEliminadas({});
    setFase("jogando");
  };

  const handleResponder = async () => {
    if (!selecionada) return;
    setRevelar(true);
    const q = questoesSorteio[idx];
    
    let correta = null;
    if (q.tipo_questao === 'multipla_escolha') correta = q.gabarito_letra?.toUpperCase() || null;
    else correta = q.gabarito_ce ? 'C' : 'E';

    const acertou = selecionada.toUpperCase() === correta;
    
    if (acertou) {
      setAcertos(prev => prev + 1);
    } else {
      setErros(prev => prev + 1);
      setQuestoesErradas(prev => [...prev, { q, suaResposta: selecionada.toUpperCase(), respostaCorreta: correta || '' }]);
    }

    setSalvando(true);
    await salvarTentativaAvulsa(userId, q.id, selecionada, acertou, tempoQuestao);
    setSalvando(false);
  };

  const avancar = () => {
    if (idx === questoesSorteio.length - 1) {
      setFase("resultado");
    } else {
      setIdx(prev => prev + 1);
      setSelecionada(null);
      setRevelar(false);
      setTempoQuestao(0);
    }
  };

  const toggleEliminada = (letra: string) => {
    if (revelar) return;
    setEliminadas(prev => {
      const atual = prev[idx] || [];
      const nova = atual.includes(letra) ? atual.filter(l => l !== letra) : [...atual, letra];
      return { ...prev, [idx]: nova };
    });
    if (selecionada === letra) setSelecionada(null);
  };

  // --- GRIFOS ---
  const handleGrifar = async (questaoId: string, campo: CampoAlvo, cor: CorGrifo, texto: string, rects: RectGrifo[]) => {
    const nova = await criarAnotacao(userId, 'banco' as any, questaoId, campo, cor, texto, rects);
    if (!nova) return;
    setAnotacoes(prev => {
      const next = new Map(prev);
      const atual = next.get(questaoId) ?? [];
      next.set(questaoId, [...atual, nova]);
      return next;
    });
  };

  const handleRemoverGrifo = async (anotacaoId: string) => {
    const ok = await removerAnotacao(anotacaoId);
    if (!ok) return;
    setAnotacoes(prev => {
      const next = new Map(prev);
      for (const [qid, lista] of next.entries()) {
        const filtrados = lista.filter(a => a.id !== anotacaoId);
        if (filtrados.length !== lista.length) next.set(qid, filtrados);
      }
      return next;
    });
  };

  const handleTrocarCorGrifo = async (anotacaoId: string, cor: CorGrifo) => {
    const ok = await trocarCorAnotacao(anotacaoId, cor);
    if (!ok) return;
    setAnotacoes(prev => {
      const next = new Map(prev);
      for (const [qid, lista] of next.entries()) {
        next.set(qid, lista.map(a => a.id === anotacaoId ? { ...a, cor } : a));
      }
      return next;
    });
  };

  // Formatar as questões erradas para o EnviarErrosModal
  const errosFormatados: QuestaoErrada[] = questoesErradas.map((item, index) => {
    const q = item.q;
    const altFormatadas = q.tipo_questao === 'multipla_escolha' ? (q.alternativas || []).map(a => ({
      letra: a.letra,
      texto: a.texto,
      correta: a.letra.toUpperCase() === item.respostaCorreta.toUpperCase(),
      sublinhados: null,
      negritos: null,
      italicos: null
    })) : undefined;

    return {
      numero: index + 1,
      enunciado: q.enunciado,
      suaResposta: item.suaResposta,
      respostaCorreta: item.respostaCorreta,
      tipo: q.tipo_questao,
      questao_origem_id: q.id,
      alternativas: altFormatadas,
      gabarito_ce: q.gabarito_ce ?? undefined,
      imagem_url: q.imagem_url,
      comentario_geral: q.comentario,
    };
  });

  // --- RENDERIZAÇÃO ---
  if (fase === "config") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-elevated">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Praticar Livremente</h3>
            <button onClick={onClose} className="text-foreground/50 hover:text-foreground"><X className="h-5 w-5" /></button>
          </div>
          <p className="text-xs text-foreground/60 mb-4">Você tem {questoes.length} questões filtradas. Quantas deseja responder agora?</p>
          
          <label className="text-sm font-medium text-foreground/70">Quantidade de questões</label>
          <input 
            type="number" 
            min="1" 
            max={questoes.length} 
            value={quantidade}
            onChange={(e) => setQuantidade(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1"
          />

          <div className="mt-6 flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-full border border-border bg-background py-2.5 text-sm font-medium hover:bg-surface-2">Cancelar</button>
            <button onClick={iniciar} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Play className="h-4 w-4" /> Começar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (fase === "jogando") {
    const q = questoesSorteio[idx];
    const total = questoesSorteio.length;
    
    let correta = null;
    if (q.tipo_questao === 'multipla_escolha') correta = q.gabarito_letra?.toUpperCase() || null;
    else correta = q.gabarito_ce ? 'C' : 'E';

    let alternativasView = [];
    if (q.tipo_questao === 'certo_errado') {
      alternativasView = [ { letra: 'C', texto: 'Certo' }, { letra: 'E', texto: 'Errado' } ];
    } else {
      alternativasView = (q.alternativas || []).map(a => ({ 
        letra: a.letra.toUpperCase(), 
        texto: a.texto,
        sublinhados: (a as any).sublinhados,
        negritos: (a as any).negritos,
        italicos: (a as any).italicos
      }));
    }

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-y-auto">
        <div className="sticky top-0 z-10 bg-surface/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
          <button onClick={onClose} className="text-sm font-medium text-foreground/60 hover:text-foreground flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" /> Sair
          </button>
          <div className="text-sm font-semibold">{idx + 1} de {total}</div>
          <div className="text-xs font-medium text-foreground/50 tabular-nums">
            {Math.floor(tempoQuestao / 60)}:{(tempoQuestao % 60).toString().padStart(2, '0')}
          </div>
        </div>

        <div className="flex-1 max-w-3xl mx-auto w-full p-4 sm:p-6 pb-24">
          <QuestaoCard
            numero={idx + 1}
            total={total}
            ano={q.ano}
            area={q.disciplina}
            instituicao={q.banca}
            enunciado={q.enunciado}
            imagens={q.imagem_url ? [q.imagem_url] : []}
            tipo={q.tipo_questao}
            alternativas={alternativasView}
            selecionada={selecionada}
            eliminadas={eliminadas[idx] || []}
            correta={correta}
            revelar={revelar}
            onSelecionar={(letra) => !revelar && setSelecionada(letra)}
            permitirEliminar={!revelar}
            onEliminar={toggleEliminada}
            anotacoes={anotacoes.get(q.id) ?? []}
            onGrifar={(campo, cor, texto, rects) => handleGrifar(q.id, campo, cor, texto, rects)}
            onRemoverGrifo={handleRemoverGrifo}
            onTrocarCorGrifo={handleTrocarCorGrifo}
            grifarAtivo={true}
          />
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-surface/80 backdrop-blur-md border-t border-border p-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            {!revelar ? (
              <button
                onClick={handleResponder}
                disabled={!selecionada || salvando}
                className="w-full max-w-xs mx-auto inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Responder
              </button>
            ) : (
              <button
                onClick={avancar}
                className="w-full max-w-xs mx-auto inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
              >
                {idx === total - 1 ? "Ver Resultado" : "Próxima Questão"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (fase === "resultado") {
    return (
      <>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-elevated text-center">
            <h3 className="font-display text-xl font-bold mb-2">Sessão Concluída!</h3>
            <p className="text-xs text-foreground/60 mb-6">Você respondeu {questoesSorteio.length} questões.</p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <CheckCircle2 className="h-6 w-6 text-primary mx-auto mb-1" />
                <div className="text-2xl font-bold text-primary">{acertos}</div>
                <div className="text-[10px] uppercase tracking-widest text-primary/60">Acertos</div>
              </div>
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                <XCircle className="h-6 w-6 text-accent mx-auto mb-1" />
                <div className="text-2xl font-bold text-accent">{erros}</div>
                <div className="text-[10px] uppercase tracking-widest text-accent/60">Erros</div>
              </div>
            </div>

            {erros > 0 && (
              <button 
                onClick={() => setModalEnviar(true)} 
                className="w-full mb-3 inline-flex items-center justify-center gap-2 rounded-full border border-accent/30 bg-accent/10 py-2.5 text-sm font-semibold text-accent hover:bg-accent/20 transition-colors"
              >
                <Send className="h-4 w-4" /> Enviar {erros} {erros === 1 ? 'erro' : 'erros'} para o Caderno de Erros
              </button>
            )}

            <button onClick={onClose} className="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Voltar ao Banco
            </button>
          </div>
        </div>

        {modalEnviar && (
          <EnviarErrosModal
            listaId="banco-questoes"
            listaTitulo="Banco de Questões"
            // DisciplineId omitido para forçar o select de disciplinas
            questoesErradas={errosFormatados}
            onClose={(enviou) => { setModalEnviar(false); onClose(); }}
          />
        )}
      </>
    );
  }

  return null;
}