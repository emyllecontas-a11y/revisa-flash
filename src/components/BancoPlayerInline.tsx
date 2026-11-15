import { useState, useEffect, useRef, useCallback } from "react";
import { QuestaoCard } from "@/components/QuestaoCard";
import { salvarTentativaAvulsa, type QuestaoBanco, buscarComentarioSobDemanda } from "@/services/bancoQuestoesService";
import { getAnotacoesDeQuestoes, criarAnotacao, removerAnotacao, trocarCorAnotacao } from "@/services/anotacaoQuestaoService";
import type { AnotacaoQuestao, CampoAlvo, CorGrifo, RectGrifo } from "@/lib/anotacoes-types";
import { EnviarErrosModal, type QuestaoErrada } from "@/components/EnviarErrosModal";
import { useToast } from "@/hooks/useToast";
import { Loader2, Play, CheckCircle2, XCircle, ChevronLeft, ArrowLeft, ArrowRight, X, Send, Clock, Shuffle, Grid, Check, X as XIcon } from "lucide-react";

interface Props {
  userId: string;
  questoes: QuestaoBanco[];
  startIndex?: number;
  resumoFiltro?: string;
  onSair: () => void;
}

function formatarTempo(segundos: number): string {
  const mins = Math.floor(segundos / 60);
  const secs = segundos % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function BancoPlayerInline({ userId, questoes, startIndex = 0, resumoFiltro, onSair }: Props) {
  const toast = useToast();
  const [idx, setIdx] = useState(startIndex);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [respostasConfirmadas, setRespostasConfirmadas] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [acertos, setAcertos] = useState(0);
  const [erros, setErros] = useState(0);
  const [questoesErradas, setQuestoesErradas] = useState<{ q: QuestaoBanco, suaResposta: string, respostaCorreta: string }[]>([]);
  const [tempoQuestao, setTempoQuestao] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [eliminadas, setEliminadas] = useState<Record<number, string[]>>({});
  const [anotacoes, setAnotacoes] = useState<Map<string, AnotacaoQuestao[]>>(new Map());
  const [modalEnviar, setModalEnviar] = useState(false);
  const [vistas, setVistas] = useState<Set<number>>(new Set());

  const questaoAtual = questoes[idx];
  const respondida = questaoAtual ? !!respostasConfirmadas[questaoAtual.id] : false;
  const total = questoes.length;
  const respondidas = Object.keys(respostasConfirmadas).length;

  // Carregar anotações das questões
  useEffect(() => {
    if (!userId || questoes.length === 0) return;
    const ids = questoes.map(q => q.id);
    getAnotacoesDeQuestoes(userId, 'banco' as any, ids).then(setAnotacoes).catch(() => {});
  }, [userId, questoes]);

  // Timer
  useEffect(() => {
    if (!respondida && questaoAtual) {
      timerRef.current = setInterval(() => setTempoQuestao(p => p + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [respondida, questaoAtual]);

  // Marcar questão atual como vista
  useEffect(() => {
    if (questaoAtual) {
      setVistas(prev => new Set([...prev, idx]));
    }
  }, [idx]);

  const getCorreta = (q: QuestaoBanco): string | null => {
    if (q.tipo_questao === 'multipla_escolha') return q.gabarito_letra?.toUpperCase() || null;
    return q.gabarito_ce ? 'C' : 'E';
  };

  const handleResponder = async () => {
    if (!selecionada || respondida || !questaoAtual) return;

    setRespostasConfirmadas(prev => ({ ...prev, [questaoAtual.id]: selecionada }));

    const correta = getCorreta(questaoAtual);
    const acertou = selecionada.toUpperCase() === (correta || '');

    if (acertou) setAcertos(prev => prev + 1);
    else {
      setErros(prev => prev + 1);
      setQuestoesErradas(prev => [...prev, { q: questaoAtual, suaResposta: selecionada.toUpperCase(), respostaCorreta: correta || '' }]);
    }

    setSalvando(true);
    await salvarTentativaAvulsa(userId, questaoAtual.id, selecionada, acertou, tempoQuestao);
    setSalvando(false);
  };

  const avancar = () => {
    if (idx === total - 1) {
      setIdx(0);
    } else {
      setIdx(prev => prev + 1);
    }
    setSelecionada(null);
    setTempoQuestao(0);
  };

  const voltar = () => {
    if (idx > 0) {
      setIdx(prev => prev - 1);
      setSelecionada(null);
      setTempoQuestao(0);
    }
  };

  const proximaAleatoria = () => {
    const naoVistas = Array.from({ length: total }, (_, i) => i).filter(i => !vistas.has(i));
    if (naoVistas.length === 0) {
      // Todas vistas, reiniciar ciclo
      setVistas(new Set());
      const proximo = Math.floor(Math.random() * total);
      setIdx(proximo);
    } else {
      const proximo = naoVistas[Math.floor(Math.random() * naoVistas.length)];
      setIdx(proximo);
    }
    setSelecionada(null);
    setTempoQuestao(0);
  };

  const toggleEliminada = (letra: string) => {
    if (respondida) return;
    setEliminadas(prev => {
      const atual = prev[idx] || [];
      const nova = atual.includes(letra) ? atual.filter(l => l !== letra) : [...atual, letra];
      return { ...prev, [idx]: nova };
    });
    if (selecionada === letra) setSelecionada(null);
  };

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

  // Buscar comentário sob demanda quando a questão é revelada
  useEffect(() => {
    if (respondida && questaoAtual && !questaoAtual.comentario) {
      buscarComentarioSobDemanda(questaoAtual.id).then(res => {
        if (res.success && res.comentario) {
          // O QuestaoCard já usa useComentarioQuestao que faz isso automaticamente
          // quando revelar=true, então não precisamos fazer nada extra aqui
        }
      }).catch(() => {});
    }
  }, [respondida, questaoAtual]);

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

  // Atalhos de teclado
  useEffect(() => {
    if (!questaoAtual) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      const tecla = e.key.toUpperCase();
      const numeros = ["1", "2", "3", "4", "5"];
      const letras = ["A", "B", "C", "D", "E"];

      if (!respondida && questaoAtual.tipo_questao === 'multipla_escolha' && questaoAtual.alternativas) {
        let letraAlvo = null;
        const idxNum = numeros.indexOf(tecla);
        if (idxNum >= 0) letraAlvo = letras[idxNum];
        else if (letras.includes(tecla)) letraAlvo = tecla;

        if (letraAlvo) {
          const existe = questaoAtual.alternativas.some(a => a.letra === letraAlvo);
          const elims = eliminadas[idx] || [];
          if (existe && !elims.includes(letraAlvo)) {
            e.preventDefault();
            setSelecionada(letraAlvo);
            return;
          }
        }
      } else if (!respondida && questaoAtual.tipo_questao === 'certo_errado') {
        if (tecla === "1" || tecla === "C") { e.preventDefault(); setSelecionada("C"); return; }
        if (tecla === "2" || tecla === "E") { e.preventDefault(); setSelecionada("E"); return; }
      }

      if (e.key === "Enter" && selecionada && !respondida) {
        e.preventDefault();
        handleResponder();
        return;
      }

      if (e.key === "ArrowLeft") { e.preventDefault(); voltar(); return; }
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        if (respondida) avancar();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [idx, respondida, selecionada, questaoAtual, eliminadas, handleResponder, avancar, voltar]);

  // Preparar alternativasView igual ao PlayerLivreModal
  const correta = getCorreta(questaoAtual!);
  const eliminadasAtuais = eliminadas[idx] || [];
  const respostaConfirmada = questaoAtual ? respostasConfirmadas[questaoAtual.id] : null;
  const selecionadaAtual = respostaConfirmada || selecionada;

  let alternativasView: { letra: string; texto: string; sublinhados?: any; negritos?: any; italicos?: any }[] = [];
  if (questaoAtual) {
    if (questaoAtual.tipo_questao === 'certo_errado') {
      alternativasView = [ { letra: 'C', texto: 'Certo' }, { letra: 'E', texto: 'Errado' } ];
    } else {
      alternativasView = (questaoAtual.alternativas || []).map(a => ({
        letra: a.letra.toUpperCase(),
        texto: a.texto,
        sublinhados: (a as any).sublinhados,
        negritos: (a as any).negritos,
        italicos: (a as any).italicos
      }));
    }
  }

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-200px)] bg-background">
      {/* Cabeçalho do player */}
      <header className="shrink-0 bg-surface/80 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Título + status */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{questaoAtual ? `Questão ${idx + 1} de ${total}` : "Carregando..."}</span>
              <span className="text-xs text-foreground/50 hidden sm:inline">|</span>
              <span className="text-xs text-foreground/60">
                {respondidas} respondida{respondidas !== 1 ? "s" : ""} · {acertos} acerto{acertos !== 1 ? "s" : ""} · {erros} erro{erros !== 1 ? "s" : ""}
              </span>
            </div>
            {resumoFiltro && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[10px] font-medium text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {resumoFiltro}
              </span>
            )}
          </div>

          {/* Timer + botão Sair */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs font-medium text-foreground/50 tabular-nums">
              <Clock className="h-3.5 w-3.5" />
              {formatarTempo(tempoQuestao)}
            </div>
            <button
              onClick={onSair}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface-2 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Corpo: QuestaoCard */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full p-4 sm:p-6 pb-8">
          {questaoAtual && (
            <QuestaoCard
              numero={idx + 1}
              total={total}
              ano={questaoAtual.ano}
              area={questaoAtual.disciplina}
              instituicao={questaoAtual.banca}
              enunciado={questaoAtual.enunciado}
              imagens={questaoAtual.imagem_url ? [questaoAtual.imagem_url] : []}
              tipo={questaoAtual.tipo_questao}
              alternativas={alternativasView}
              selecionada={selecionadaAtual}
              eliminadas={eliminadasAtuais}
              correta={respondida ? correta : null}
              comentario={respondida ? questaoAtual.comentario : null}
              revelar={respondida}
              permitirEliminar={!respondida}
              onSelecionar={(letra) => !respondida && setSelecionada(letra)}
              onEliminar={toggleEliminada}
              questaoId={questaoAtual.id}
              anotacoes={anotacoes.get(questaoAtual.id) ?? []}
              onGrifar={(campo, cor, texto, rects) => handleGrifar(questaoAtual.id, campo, cor, texto, rects)}
              onRemoverGrifo={handleRemoverGrifo}
              onTrocarCorGrifo={handleTrocarCorGrifo}
              grifarAtivo={true}
            />
          )}
        </div>
      </main>

      {/* Rodapé: controles de navegação */}
      <footer className="shrink-0 bg-surface/80 backdrop-blur-md border-t border-border p-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={voltar}
              disabled={idx === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground/70 hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="h-4 w-4" /> Anterior
            </button>

            {!respondida ? (
              <button
                onClick={handleResponder}
                disabled={!selecionada || salvando}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Responder
              </button>
            ) : (
              <button
                onClick={avancar}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
              >
                Próxima Questão
              </button>
            )}

            <button
              onClick={avancar}
              disabled={!respondida || (idx === total - 1 && vistas.size === total)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground/70 hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Próxima <ArrowRight className="h-4 w-4" />
            </button>

            <button
              onClick={proximaAleatoria}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground/70 hover:bg-surface-2 hover:border-primary hover:text-primary transition-colors"
              title="Próxima aleatória (não repete enquanto houver não vistas)"
            >
              <Shuffle className="h-4 w-4" /> Aleatória
            </button>

            <button
              onClick={() => {}}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground/70 hover:bg-surface-2"
              title="Painel de navegação (em breve)"
            >
              <Grid className="h-4 w-4" /> Painel
            </button>

            {erros > 0 && (
              <button
                onClick={() => setModalEnviar(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent hover:bg-accent/20 transition-colors"
              >
                <Send className="h-4 w-4" /> Enviar {erros} erro{erros > 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Modal Enviar Erros */}
      {modalEnviar && (
        <EnviarErrosModal
          listaId="banco-questoes"
          listaTitulo="Banco de Questões"
          questoesErradas={errosFormatados}
          onClose={(enviou) => { setModalEnviar(false); if (enviou) onSair(); }}
        />
      )}
    </div>
  );
}