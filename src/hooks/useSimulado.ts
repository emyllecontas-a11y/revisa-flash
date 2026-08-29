// src/hooks/useSimulado.ts
import { useState, useEffect, useCallback } from 'react';
import {
  getSimulados,
  getSimuladoCompleto,
  getProgresso,
  salvarProgresso,
  finalizarSimulado,
  calcularResultado,
} from '@/services/simuladoService';
import {
  Simulado,
  SimuladoPlayer,
  ProgressoPlayer,
  QuestaoPlayer,
  ResultadoSimulado,
} from '@/lib/simulados-types';
import { useAppUser } from '@/contexts/UserContext';

interface UseSimuladoReturn {
  // Listagem
  simulados: Simulado[];
  loadingSimulados: boolean;
  carregarSimulados: () => Promise<void>;

  // Player
  simuladoAtual: SimuladoPlayer | null;
  loadingSimulado: boolean;
  progresso: ProgressoPlayer;
  questoes: QuestaoPlayer[];
  questaoAtual: QuestaoPlayer | null;
  indiceAtual: number;
  resultado: ResultadoSimulado | null;

  // Ações do player
  carregarSimulado: (id: string) => Promise<void>;
  responderQuestao: (numero: number, letra: string) => Promise<void>;
  eliminarAlternativa: (numero: number, letra: string) => Promise<void>;
  desfazerEliminacao: (numero: number, letra: string) => Promise<void>;
  marcarParaRevisao: (numero: number) => Promise<void>;
  desmarcarRevisao: (numero: number) => Promise<void>;
  irParaQuestao: (indice: number) => void;
  proximaQuestao: () => void;
  questaoAnterior: () => void;
  finalizar: () => Promise<ResultadoSimulado | null>;
  resetarProgresso: () => void;

  // Estado
  salvando: boolean;
  erro: string | null;
}

export function useSimulado(): UseSimuladoReturn {
  const { userId } = useAppUser();
  const [userIdState] = useState(userId);

  // Listagem
  const [simulados, setSimulados] = useState<Simulado[]>([]);
  const [loadingSimulados, setLoadingSimulados] = useState(false);

  // Player
  const [simuladoAtual, setSimuladoAtual] = useState<SimuladoPlayer | null>(null);
  const [loadingSimulado, setLoadingSimulado] = useState(false);
  const [indiceAtual, setIndiceAtual] = useState(0);
  const [progresso, setProgresso] = useState<ProgressoPlayer>({
    respostas: {},
    eliminadas: {},
    marcadas: [],
    tempo_decorrido: 0,
    status: 'em-andamento',
  });
  const [resultado, setResultado] = useState<ResultadoSimulado | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Computados
  const questoes = simuladoAtual?.questoes || [];
  const questaoAtual = questoes[indiceAtual] || null;

  // ============================================================
  // CARREGAR LISTA DE SIMULADOS
  // ============================================================
  const carregarSimulados = useCallback(async () => {
    setLoadingSimulados(true);
    setErro(null);
    try {
      const result = await getSimulados();
      if (result.success && result.data) {
        setSimulados(result.data);
      } else if (result.error) {
        setErro(result.error);
      }
    } catch (err) {
      setErro('Erro ao carregar simulados');
      console.error(err);
    } finally {
      setLoadingSimulados(false);
    }
  }, []);

  // ============================================================
  // CARREGAR SIMULADO COMPLETO (com progresso)
  // ============================================================
  const carregarSimulado = useCallback(async (id: string) => {
    setLoadingSimulado(true);
    setErro(null);
    setResultado(null);
    try {
      // Busca o simulado completo
      const result = await getSimuladoCompleto(id);
      if (!result.success || !result.data) {
        setErro(result.error || 'Erro ao carregar simulado');
        setLoadingSimulado(false);
        return;
      }

      setSimuladoAtual(result.data);

      // Busca progresso do usuário
      if (userIdState) {
        const progressoResult = await getProgresso(id, userIdState);
        if (progressoResult.success && progressoResult.data) {
          const p = progressoResult.data;
          setProgresso({
            respostas: p.respostas || {},
            eliminadas: p.eliminadas || {},
            marcadas: p.marcadas || [],
            tempo_decorrido: p.tempo_decorrido || 0,
            status: p.status || 'em-andamento',
          });

          // Se já estiver concluído, calcula resultado
          if (p.status === 'concluido') {
            const resultadoCalc = calcularResultado(
              result.data.questoes,
              p.respostas || {}
            );
            resultadoCalc.tempoDecorrido = p.tempo_decorrido || 0;
            setResultado(resultadoCalc);
          }
        }
      }

      // Restaura o índice para a primeira questão não respondida (ou última)
      if (result.data.questoes.length > 0) {
        const respostas = progresso.respostas || {};
        let primeiroNaoRespondido = 0;
        for (let i = 0; i < result.data.questoes.length; i++) {
          const q = result.data.questoes[i];
          if (!respostas[q.numero]) {
            primeiroNaoRespondido = i;
            break;
          }
        }
        setIndiceAtual(primeiroNaoRespondido);
      }
    } catch (err) {
      setErro('Erro ao carregar simulado');
      console.error(err);
    } finally {
      setLoadingSimulado(false);
    }
  }, [userIdState]);

  // ============================================================
  // SALVAR PROGRESSO (automaticamente após mudanças)
  // ============================================================
  const salvarProgressoAutomatico = useCallback(async () => {
    if (!simuladoAtual || !userIdState || progresso.status === 'concluido') return;

    setSalvando(true);
    try {
      await salvarProgresso(simuladoAtual.id, userIdState, {
        respostas: progresso.respostas,
        eliminadas: progresso.eliminadas,
        marcadas: progresso.marcadas,
        tempo_decorrido: progresso.tempo_decorrido,
        status: progresso.status,
      });
    } catch (err) {
      console.warn('Erro ao salvar progresso:', err);
    } finally {
      setSalvando(false);
    }
  }, [simuladoAtual, userIdState, progresso]);

  // Salva automaticamente sempre que o progresso mudar (com debounce)
  useEffect(() => {
    if (!simuladoAtual || !userIdState) return;
    const timer = setTimeout(() => {
      salvarProgressoAutomatico();
    }, 2000);
    return () => clearTimeout(timer);
  }, [progresso, simuladoAtual, userIdState, salvarProgressoAutomatico]);

  // ============================================================
  // AÇÕES DO USUÁRIO
  // ============================================================
  const responderQuestao = useCallback(async (numero: number, letra: string) => {
    setProgresso(prev => ({
      ...prev,
      respostas: { ...prev.respostas, [numero]: letra },
    }));
  }, []);

  const eliminarAlternativa = useCallback(async (numero: number, letra: string) => {
    setProgresso(prev => {
      const atuais = prev.eliminadas[numero] || [];
      if (atuais.includes(letra)) return prev;
      return {
        ...prev,
        eliminadas: { ...prev.eliminadas, [numero]: [...atuais, letra] },
      };
    });
  }, []);

  const desfazerEliminacao = useCallback(async (numero: number, letra: string) => {
    setProgresso(prev => {
      const atuais = prev.eliminadas[numero] || [];
      if (!atuais.includes(letra)) return prev;
      return {
        ...prev,
        eliminadas: { ...prev.eliminadas, [numero]: atuais.filter(l => l !== letra) },
      };
    });
  }, []);

  const marcarParaRevisao = useCallback(async (numero: number) => {
    setProgresso(prev => {
      if (prev.marcadas.includes(numero)) return prev;
      return {
        ...prev,
        marcadas: [...prev.marcadas, numero],
      };
    });
  }, []);

  const desmarcarRevisao = useCallback(async (numero: number) => {
    setProgresso(prev => ({
      ...prev,
      marcadas: prev.marcadas.filter(n => n !== numero),
    }));
  }, []);

  const irParaQuestao = useCallback((indice: number) => {
    if (indice >= 0 && indice < questoes.length) {
      setIndiceAtual(indice);
    }
  }, [questoes]);

  const proximaQuestao = useCallback(() => {
    if (indiceAtual < questoes.length - 1) {
      setIndiceAtual(indiceAtual + 1);
    }
  }, [indiceAtual, questoes]);

  const questaoAnterior = useCallback(() => {
    if (indiceAtual > 0) {
      setIndiceAtual(indiceAtual - 1);
    }
  }, [indiceAtual]);

  // ============================================================
  // FINALIZAR SIMULADO
  // ============================================================
  const finalizar = useCallback(async (): Promise<ResultadoSimulado | null> => {
    if (!simuladoAtual || !userIdState) return null;

    setSalvando(true);
    try {
      const total = questoes.length;
      const respostas = progresso.respostas;
      let acertos = 0;
      let erros = 0;
      let naoRespondidas = 0;

      for (const q of questoes) {
        const resposta = respostas[q.numero];
        if (!resposta) {
          naoRespondidas++;
          continue;
        }
        const correta = q.alternativas.find(a => a.correta)?.letra;
        if (resposta === correta) {
          acertos++;
        } else {
          erros++;
        }
      }

      const resultadoCalc = {
        simuladoId: simuladoAtual.id,
        totalQuestoes: total,
        respondidas: acertos + erros,
        acertos,
        erros,
        naoRespondidas,
        porcentagem: total > 0 ? Math.round((acertos / total) * 100) : 0,
        tempoDecorrido: progresso.tempo_decorrido,
      };

      // Salva no banco
      const finalResult = await finalizarSimulado(
        simuladoAtual.id,
        userIdState,
        {
          acertos,
          erros,
          naoRespondidas,
          tempoDecorrido: progresso.tempo_decorrido,
        }
      );

      if (!finalResult.success) {
        throw new Error(finalResult.error || 'Erro ao finalizar simulado');
      }

      // Atualiza o estado local
      setProgresso(prev => ({ ...prev, status: 'concluido' }));
      setResultado(resultadoCalc);

      return resultadoCalc;
    } catch (err) {
      console.error('Erro ao finalizar:', err);
      setErro('Erro ao finalizar simulado');
      return null;
    } finally {
      setSalvando(false);
    }
  }, [simuladoAtual, userIdState, questoes, progresso]);

  // ============================================================
  // RESETAR PROGRESSO
  // ============================================================
  const resetarProgresso = useCallback(() => {
    setProgresso({
      respostas: {},
      eliminadas: {},
      marcadas: [],
      tempo_decorrido: 0,
      status: 'em-andamento',
    });
    setResultado(null);
    setIndiceAtual(0);
  }, []);

  // ============================================================
  // CARREGAR SIMULADOS NA INICIALIZAÇÃO
  // ============================================================
  useEffect(() => {
    carregarSimulados();
  }, [carregarSimulados]);

  return {
    // Listagem
    simulados,
    loadingSimulados,
    carregarSimulados,

    // Player
    simuladoAtual,
    loadingSimulado,
    progresso,
    questoes,
    questaoAtual,
    indiceAtual,
    resultado,

    // Ações
    carregarSimulado,
    responderQuestao,
    eliminarAlternativa,
    desfazerEliminacao,
    marcarParaRevisao,
    desmarcarRevisao,
    irParaQuestao,
    proximaQuestao,
    questaoAnterior,
    finalizar,
    resetarProgresso,

    // Estado
    salvando,
    erro,
  };
}