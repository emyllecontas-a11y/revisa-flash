// src/routes/simulados.$id.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAppUser } from "@/contexts/UserContext";
import { AppShell } from "@/components/app-shell";
import { QuestaoCard } from "@/components/QuestaoCard";
import {
  getSimuladoCompleto,
  getProgresso,
  salvarProgresso,
  finalizarSimulado,
  calcularResultado,
  excluirSimulado,
  buscarResultadoSimulado,
} from "@/services/simuladoService";
import {
  getAnotacoesDeQuestoes,
  criarAnotacao,
  removerAnotacao,
  trocarCorAnotacao,
} from "@/services/anotacaoQuestaoService";
import type {
  AnotacaoQuestao,
  CampoAlvo,
  CorGrifo,
  RectGrifo,
} from "@/lib/anotacoes-types";
import {
  ArrowLeft, ArrowRight, Clock, Flag, Grid3X3, X,
  CheckCircle2, XCircle, MinusCircle, RotateCcw, ChevronLeft,
  Loader2, Trash2,
} from "lucide-react";
import type { SimuladoPlayer, QuestaoPlayer, ProgressoPlayer, Alternativa } from "@/lib/simulados-types";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

type Fase = "resolvendo" | "resultado" | "correcao";

function getTipoQuestao(q: QuestaoPlayer): 'multipla_escolha' | 'certo_errado' {
  if (q.alternativas && q.alternativas.length > 0) return 'multipla_escolha';
  return 'certo_errado';
}

function getCorreta(q: QuestaoPlayer): string | null {
  if (getTipoQuestao(q) === 'multipla_escolha') {
    return q.alternativas.find(a => a.correta)?.letra || null;
  }
  if (q.gabarito_ce === true) return 'C';
  if (q.gabarito_ce === false) return 'E';
  return null;
}

// AQUI ESTÁ A CORREÇÃO DO RENDER!
function getAlternativasView(q: QuestaoPlayer): { letra: string; texto: string; sublinhados?: any; negritos?: any; italicos?: any }[] {
  if (getTipoQuestao(q) === 'certo_errado') {
    return [
      { letra: 'C', texto: 'Certo' },
      { letra: 'E', texto: 'Errado' },
    ];
  }
  return q.alternativas.map((a: Alternativa) => ({ 
    letra: a.letra, 
    texto: a.texto,
    sublinhados: a.sublinhados,
    negritos: a.negritos,
    italicos: a.italicos
  }));
}

export default function SimuladoPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAppUser();
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [simulado, setSimulado] = useState<SimuladoPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  // Simulado compartilhado por amiga é somente leitura: só a dona pode excluir
  const ehDona = !!simulado && simulado.created_by === user?.id;
  const rotaVoltar = simulado && !ehDona ? "/compartilhados" : "/simulados";

  const [progresso, setProgresso] = useState<ProgressoPlayer>({
    respostas: {},
    eliminadas: {},
    marcadas: [],
    tempo_decorrido: 0,
    status: "em-andamento",
  });

  const [idx, setIdx] = useState(0);
  const [fase, setFase] = useState<Fase>("resolvendo");
  const [painel, setPainel] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [resultadoSalvo, setResultadoSalvo] = useState<any>(null);

  const [anotacoes, setAnotacoes] = useState<Map<string, AnotacaoQuestao[]>>(new Map());

  const [booted, setBooted] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const progressoRef = useRef(progresso);
  useEffect(() => { progressoRef.current = progresso; }, [progresso]);

  const faseRef = useRef(fase);
  useEffect(() => { faseRef.current = fase; }, [fase]);

  const lastSavedRef = useRef<string>('');

  const snapshotDe = (p: ProgressoPlayer) => JSON.stringify({
    r: p.respostas || {},
    m: p.marcadas || [],
    e: p.eliminadas || {},
  });

  useEffect(() => {
    const loadData = async () => {
      if (!id || !user?.id) {
        setLoading(false);
        setError("Usuário não autenticado");
        return;
      }
      setLoading(true);
      setError(null);

      try {
        const simResult = await getSimuladoCompleto(id);
        if (!simResult.success || !simResult.data) {
          setError(simResult.error || "Simulado não encontrado");
          setLoading(false);
          return;
        }

        if (!simResult.data.questoes || simResult.data.questoes.length === 0) {
          setError("Este simulado não possui questões cadastradas.");
          setLoading(false);
          return;
        }

        setSimulado(simResult.data);

        const progResult = await getProgresso(id, user.id);
        if (progResult.success && progResult.data) {
          const p: ProgressoPlayer = {
            respostas: progResult.data.respostas || {},
            eliminadas: progResult.data.eliminadas || {},
            marcadas: progResult.data.marcadas || [],
            tempo_decorrido: progResult.data.tempo_decorrido || 0,
            status: (progResult.data.status as 'em-andamento' | 'concluido') || 'em-andamento',
          };
          setProgresso(p);
          lastSavedRef.current = snapshotDe(p);

          if (p.status === "concluido") {
            setFase("resultado");
          }
        } else {
          lastSavedRef.current = snapshotDe({
            respostas: {}, eliminadas: {}, marcadas: [], tempo_decorrido: 0, status: 'em-andamento',
          });
        }

        const resultResult = await buscarResultadoSimulado(id, user.id);
        if (resultResult.success && resultResult.data) {
          setResultadoSalvo(resultResult.data);
        }

        const searchParams = new URLSearchParams(location.search);
        if (searchParams.get('view') === 'resultado') {
          setFase("resultado");
        }

      } catch (err: any) {
        setError(err.message || "Erro ao carregar simulado");
      } finally {
        setLoading(false);
        setBooted(true);
      }
    };

    loadData();
  }, [id, user?.id, location.search]);

  // Carregar grifos
  useEffect(() => {
    if (!user?.id || !simulado) return;
    const ids = simulado.questoes.map((q) => q.id);
    if (ids.length === 0) return;
    getAnotacoesDeQuestoes(user.id, 'simulado', ids)
      .then(setAnotacoes)
      .catch(() => {});
  }, [user?.id, simulado]);

  useEffect(() => {
    if (fase !== "resolvendo" || !simulado || simulado.questoes.length === 0) return;

    timerRef.current = setInterval(() => {
      setProgresso(prev => ({
        ...prev,
        tempo_decorrido: prev.tempo_decorrido + 1,
      }));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fase, simulado]);

  useEffect(() => {
    if (!id || !user?.id || fase !== "resolvendo" || !simulado) return;
    if (!booted) return;

    const snap = snapshotDe(progresso);
    if (snap === lastSavedRef.current) return;

    salvarProgresso(id, user.id, progresso).then(() => {
      lastSavedRef.current = snap;
    }).catch((e) => {
      console.warn('⚠️ Falha ao salvar progresso (respostas):', e);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progresso.respostas, progresso.marcadas, progresso.eliminadas, id, user?.id, fase, simulado, booted]);

  useEffect(() => {
    if (!id || !user?.id || fase !== "resolvendo" || !simulado) return;
    if (!booted) return;

    const interval = setInterval(() => {
      if (progressoRef.current.tempo_decorrido > 0) {
        salvarProgresso(id, user.id, progressoRef.current).catch(() => {});
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [id, user?.id, fase, simulado, booted]);

  useEffect(() => {
    if (!id || !user?.id) return;

    const persist = () => {
      if (faseRef.current !== "resolvendo") return;
      if (!booted) return;
      salvarProgresso(id, user.id, progressoRef.current).catch(() => {});
    };

    const onBeforeUnload = () => persist();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persist();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [id, user?.id, booted]);

  const toggleEliminada = (letra: string) => {
    if (!simulado || !simulado.questoes[idx]) return;
    const q = simulado.questoes[idx];
    setProgresso(prev => {
      const atual = prev.eliminadas[q.numero] || [];
      const nova = atual.includes(letra) ? atual.filter(l => l !== letra) : [...atual, letra];
      return { ...prev, eliminadas: { ...prev.eliminadas, [q.numero]: nova } };
    });
  };

  const responder = (letra: string) => {
    if (!simulado || !simulado.questoes[idx]) return;
    const q = simulado.questoes[idx];
    setProgresso(prev => ({
      ...prev,
      respostas: { ...prev.respostas, [q.numero]: letra },
    }));
  };

  const toggleMarcar = () => {
    if (!simulado || !simulado.questoes[idx]) return;
    const q = simulado.questoes[idx];
    setProgresso(prev => ({
      ...prev,
      marcadas: prev.marcadas.includes(q.numero)
        ? prev.marcadas.filter(n => n !== q.numero)
        : [...prev.marcadas, q.numero],
    }));
  };

  // Grifos
  const handleGrifar = useCallback(
    async (
      questaoId: string,
      campo: CampoAlvo,
      cor: CorGrifo,
      texto: string,
      rects: RectGrifo[]
    ) => {
      if (!user?.id) return;
      const nova = await criarAnotacao(user.id, 'simulado', questaoId, campo, cor, texto, rects);
      if (!nova) return;
      setAnotacoes((prev) => {
        const next = new Map(prev);
        const atual = next.get(questaoId) ?? [];
        next.set(questaoId, [...atual, nova]);
        return next;
      });
    },
    [user?.id]
  );

  const handleRemoverGrifo = useCallback(async (anotacaoId: string) => {
    const ok = await removerAnotacao(anotacaoId);
    if (!ok) return;
    setAnotacoes((prev) => {
      const next = new Map(prev);
      for (const [qid, lista] of next.entries()) {
        const filtrados = lista.filter((a) => a.id !== anotacaoId);
        if (filtrados.length !== lista.length) next.set(qid, filtrados);
      }
      return next;
    });
  }, []);

  const handleTrocarCorGrifo = useCallback(async (anotacaoId: string, cor: CorGrifo) => {
    const ok = await trocarCorAnotacao(anotacaoId, cor);
    if (!ok) return;
    setAnotacoes((prev) => {
      const next = new Map(prev);
      for (const [qid, lista] of next.entries()) {
        next.set(qid, lista.map((a) => (a.id === anotacaoId ? { ...a, cor } : a)));
      }
      return next;
    });
  }, []);

  const handleFinalizar = async () => {
    if (!id || !user?.id || !simulado) return;
    setConfirmar(false);

    const result = calcularResultado(simulado.questoes, progresso.respostas);
    result.tempoDecorrido = progresso.tempo_decorrido;

    const areasMap: Record<number, string> = {};
    simulado.questoes.forEach(q => {
      areasMap[q.numero] = q.area || 'Não categorizada';
    });

    const respostasParaSalvar = progresso.respostas || {};

    const finalResult = await finalizarSimulado(
      id,
      user.id,
      {
        acertos: result.acertos,
        erros: result.erros,
        naoRespondidas: result.naoRespondidas,
        tempoDecorrido: result.tempoDecorrido,
      },
      respostasParaSalvar,
      areasMap
    );

    if (finalResult.success) {
      const savedResult = await buscarResultadoSimulado(id, user.id);
      if (savedResult.success && savedResult.data) {
        setResultadoSalvo(savedResult.data);
      }
      setFase("resultado");
    } else {
      toast.error("Erro ao finalizar simulado", { description: finalResult.error });
    }
  };

  const handleSair = async () => {
    const ok = await confirmDialog({
      title: "Tem certeza que deseja sair?",
      description: "Você poderá retomar de onde parou se voltar a este simulado.",
      confirmText: "Sair",
      cancelText: "Ficar",
      destructive: true,
    });
    if (ok) navigate(rotaVoltar);
  };

  const handleExcluirSimulado = async () => {
    if (!id || !user?.id || !simulado) return;
    const ok = await confirmDialog({
      title: `Excluir "${simulado.titulo}"?`,
      description: "Essa ação não pode ser desfeita. O simulado e todo o histórico de tentativas serão removidos.",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;

    setExcluindo(true);
    try {
      const result = await excluirSimulado(id, user.id);
      if (result.success) {
        toast.success("Simulado excluído com sucesso!");
        navigate(rotaVoltar);
      } else {
        toast.error("Erro ao excluir", { description: result.error });
      }
    } catch (err: any) {
      toast.error("Erro ao excluir", { description: err.message });
    } finally {
      setExcluindo(false);
    }
  };

  if (loading) {
    return (
      <AppShell breadcrumb="Simulados" title="Carregando...">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (error || !simulado) {
    return (
      <AppShell breadcrumb="Simulados" title="Erro">
        <div className="rf-card p-6 text-center">
          <p className="text-accent">{error || "Simulado não encontrado"}</p>
          <button
            onClick={() => navigate(rotaVoltar)}
            className="btn-sun mt-4 px-4 py-2 text-xs font-bold"
          >
            Voltar para simulados
          </button>
        </div>
      </AppShell>
    );
  }

  if (!simulado.questoes || simulado.questoes.length === 0) {
    return (
      <AppShell breadcrumb="Simulados" title="Erro">
        <div className="rf-card p-6 text-center">
          <p className="text-accent">Este simulado não possui questões.</p>
          <button
            onClick={() => navigate(rotaVoltar)}
            className="btn-sun mt-4 px-4 py-2 text-xs font-bold"
          >
            Voltar para simulados
          </button>
        </div>
      </AppShell>
    );
  }

  // ============================================================
  // RESULTADO
  // ============================================================
  if (fase === "resultado") {
    const questoes = simulado.questoes;
    const total = questoes.length;
    let acertos = 0, erros = 0, naoRespondidas = 0;
    let usarResultadoSalvo = false;
    let tempoExibido = progresso.tempo_decorrido;
    let respostasParaExibir: Record<number, string> = {};

    if (resultadoSalvo) {
      acertos = resultadoSalvo.acertos || 0;
      erros = resultadoSalvo.erros || 0;
      naoRespondidas = resultadoSalvo.nao_respondidas || 0;
      tempoExibido = resultadoSalvo.tempo_segundos || 0;
      respostasParaExibir = resultadoSalvo.respostas || {};
      usarResultadoSalvo = true;
    } else {
      const respostas = progresso.respostas;
      respostasParaExibir = respostas;
      questoes.forEach(q => {
        const resp = respostas[q.numero];
        if (!resp) { naoRespondidas++; return; }
        const correta = getCorreta(q);
        if (resp === correta) acertos++;
        else erros++;
      });
    }

    const pct = total > 0 ? Math.round((acertos / total) * 100) : 0;

    return (
      <AppShell breadcrumb="Simulados" title="Resultado do simulado">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => navigate(rotaVoltar)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Voltar para simulados
          </button>
          {ehDona && (
            <button
              onClick={handleExcluirSimulado}
              disabled={excluindo}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive/80 hover:bg-destructive/20 transition-colors disabled:opacity-50"
            >
              {excluindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Excluir simulado
            </button>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rf-card flex flex-col items-center p-6 text-center">
            <Donut pct={pct} />
            <div className="mt-4 font-display text-2xl font-semibold tabular-nums">
              {acertos} / {total}
            </div>
            <p className="text-xs text-muted-foreground">acertos · {pct}% de aproveitamento</p>
            <p className="mt-3 text-xs text-muted-foreground">{simulado.titulo}</p>
            {usarResultadoSalvo && (
              <span className="mt-2 text-[10px] text-muted-foreground/60">Resultado salvo</span>
            )}
          </div>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Acertos" value={acertos} tone="ok" />
              <Stat label="Erros" value={erros} tone="bad" />
              <Stat label="Não respondidas" value={naoRespondidas} />
              <Stat label="Tempo utilizado" value={`${Math.floor(tempoExibido / 60)}min`} />
            </div>

            <div className="rf-card p-5">
              <h3 className="mb-3 font-display text-sm font-semibold">Questões</h3>
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {questoes.map((q, i) => {
                  const resp = respostasParaExibir[q.numero];
                  const correta = getCorreta(q);
                  const acertou = resp === correta;
                  const status = !resp ? "nao-respondida" : acertou ? "acertou" : "errou";

                  const pillCls =
                    status === "nao-respondida"
                      ? "bg-muted text-muted-foreground"
                      : status === "acertou"
                      ? "bg-green-500/15 text-green-500"
                      : "bg-accent/15 text-accent";

                  return (
                    <button
                      key={q.id}
                      onClick={() => { setIdx(i); setFase("correcao"); }}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-surface/40 px-3 py-2 text-left transition-colors hover:bg-surface"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium">Questão {q.numero}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{q.area || ""}</div>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pillCls}`}
                      >
                        {status === "nao-respondida" ? <MinusCircle className="h-3 w-3" /> :
                         status === "acertou" ? <CheckCircle2 className="h-3 w-3" /> :
                         <XCircle className="h-3 w-3" />}
                        {status === "nao-respondida" ? "Não respondida" :
                         status === "acertou" ? "Acertou" : "Errou"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ============================================================
  // CORREÇÃO
  // ============================================================
  if (fase === "correcao") {
    const q = simulado.questoes[idx];
    const respostasParaExibir = resultadoSalvo?.respostas || progresso.respostas;
    const resp = respostasParaExibir[q.numero];
    const correta = getCorreta(q);
    const acertou = resp === correta;
    const total = simulado.questoes.length;

    return (
      <AppShell breadcrumb="Simulados" title={`Gabarito comentado — Questão ${q.numero}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => setFase("resultado")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Voltar ao resultado
          </button>
          <div className="flex items-center gap-2">
            <NavBtn disabled={idx === 0} onClick={() => setIdx(i => Math.max(0, i - 1))}>
              <ArrowLeft className="h-3.5 w-3.5" /> Anterior
            </NavBtn>
            <NavBtn
              disabled={idx === simulado.questoes.length - 1}
              onClick={() => setIdx(i => Math.min(simulado.questoes.length - 1, i + 1))}
            >
              Próxima <ArrowRight className="h-3.5 w-3.5" />
            </NavBtn>
          </div>
        </div>

        <QuestaoCard
          numero={q.numero}
          total={total}
          area={q.area || null}
          enunciado={q.enunciado}
          sublinhadosEnunciado={q.sublinhados_enunciado ?? null}
          negritosEnunciado={q.negritos_enunciado ?? null}
          italicosEnunciado={q.italicos_enunciado ?? null}
          imagens={q.imagem_url ? [q.imagem_url] : []}
          tipo={getTipoQuestao(q)}
          alternativas={getAlternativasView(q)}
          selecionada={resp ?? null}
          correta={correta ?? null}
          comentario={q.comentario_geral || null}
          sublinhadosComentario={q.sublinhados_comentario ?? null}
          negritosComentario={q.negritos_comentario ?? null}
          italicosComentario={q.italicos_comentario ?? null}
          revelar={true}
          permitirEliminar={false}
          onSelecionar={() => {}}
          anotacoes={anotacoes.get(q.id) ?? []}
          onGrifar={(campo, cor, texto, rects) => handleGrifar(q.id, campo, cor, texto, rects)}
          onRemoverGrifo={handleRemoverGrifo}
          onTrocarCorGrifo={handleTrocarCorGrifo}
          grifarAtivo={true}
        />

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rf-card p-5">
            <h4 className="mb-2 font-display text-sm font-semibold">Status</h4>
            <div
              className={[
                "inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold",
                !resp
                  ? "bg-muted text-muted-foreground"
                  : acertou
                  ? "bg-green-500/15 text-green-500"
                  : "bg-accent/15 text-accent",
              ].join(" ")}
            >
              {!resp ? <MinusCircle className="h-3.5 w-3.5" /> :
               acertou ? <CheckCircle2 className="h-3.5 w-3.5" /> :
               <XCircle className="h-3.5 w-3.5" />}
              {!resp ? "Não respondida" : acertou ? "Você acertou" : "Você errou"}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ============================================================
  // RESOLVENDO
  // ============================================================
  const q = simulado.questoes[idx];
  const elimAtual = progresso.eliminadas[q.numero] || [];
  const selecionada = progresso.respostas[q.numero];
  const respondidas = Object.keys(progresso.respostas).length;
  const total = simulado.questoes.length;
  const progressoPercentual = Math.round(((idx + 1) / total) * 100);
  const tipo = getTipoQuestao(q);

  return (
    <AppShell breadcrumb="Simulados">
      <div className="rf-card mb-4 p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <button
              onClick={handleSair}
              className="inline-flex items-center gap-1.5 text-[11px] text-foreground/45 hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" /> Sair do simulado
            </button>
            <h1 className="truncate font-display text-base font-semibold tracking-tight sm:text-lg">{simulado.titulo}</h1>
            <p className="text-[11px] text-foreground/45">
              Questão {idx + 1} de {total} · {respondidas} respondidas
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
              <Clock className="h-3.5 w-3.5 text-accent" />
              <span className="font-display text-xs font-semibold tabular-nums text-foreground">
                {formatarTempo(progresso.tempo_decorrido)}
              </span>
            </div>
            <button
              onClick={() => setPainel(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface"
              title="Painel de questões"
            >
              <Grid3X3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Questões</span>
            </button>
            {ehDona && (
              <button
                onClick={handleExcluirSimulado}
                disabled={excluindo}
                className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[10px] font-medium text-destructive/80 hover:bg-destructive/20 transition-colors disabled:opacity-50"
                title="Excluir simulado"
              >
                {excluindo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                <span className="hidden sm:inline">Excluir</span>
              </button>
            )}
            <button
              onClick={() => setConfirmar(true)}
              className="btn-sun inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold"
            >
              <Flag className="h-3.5 w-3.5" />
              Finalizar
            </button>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${progressoPercentual}%` }} />
        </div>
      </div>

      <QuestaoCard
        numero={idx + 1}
        total={total}
        area={q.area || null}
        enunciado={q.enunciado}
        sublinhadosEnunciado={q.sublinhados_enunciado ?? null}
        negritosEnunciado={q.negritos_enunciado ?? null}
        italicosEnunciado={q.italicos_enunciado ?? null}
        imagens={q.imagem_url ? [q.imagem_url] : []}
        tipo={tipo}
        alternativas={getAlternativasView(q)}
        selecionada={selecionada ?? null}
        eliminadas={elimAtual}
        marcada={progresso.marcadas.includes(q.numero)}
        permitirEliminar={tipo === 'multipla_escolha'}
        revelar={false}
        onSelecionar={(letra) => responder(letra)}
        onEliminar={(letra) => toggleEliminada(letra)}
        onMarcar={toggleMarcar}
        anotacoes={anotacoes.get(q.id) ?? []}
        onGrifar={(campo, cor, texto, rects) => handleGrifar(q.id, campo, cor, texto, rects)}
        onRemoverGrifo={handleRemoverGrifo}
        onTrocarCorGrifo={handleTrocarCorGrifo}
        grifarAtivo={true}
      />

      {elimAtual.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-foreground/45">
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">
            {elimAtual.length} eliminada{elimAtual.length > 1 ? "s" : ""}: {elimAtual.join(", ")}
          </span>
          <button
            onClick={() => setProgresso(prev => ({
              ...prev,
              eliminadas: { ...prev.eliminadas, [q.numero]: [] },
            }))}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> desfazer todas
          </button>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-2">
        <NavBtn disabled={idx === 0} onClick={() => setIdx(i => Math.max(0, i - 1))}>
          <ArrowLeft className="h-3.5 w-3.5" /> Anterior
        </NavBtn>
        {idx === total - 1 ? (
          <button
            onClick={() => setConfirmar(true)}
            className="btn-sun inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold"
          >
            <Flag className="h-3.5 w-3.5" /> Finalizar simulado
          </button>
        ) : (
          <button
            onClick={() => setIdx(i => i + 1)}
            className="btn-sun inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold"
          >
            Próxima <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {painel && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" onClick={() => setPainel(false)}>
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 sm:max-w-md sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">Painel de questões</h3>
              <button onClick={() => setPainel(false)} className="grid h-7 w-7 place-items-center rounded-md text-foreground/50 hover:bg-white/5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <PainelQuestoes
              total={total}
              atual={idx}
              respostas={progresso.respostas}
              marcadas={progresso.marcadas}
              onPick={(i) => { setIdx(i); setPainel(false); }}
            />
            <button
              onClick={() => { setPainel(false); setConfirmar(true); }}
              className="btn-sun mt-5 inline-flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold"
            >
              <Flag className="h-3.5 w-3.5" /> Finalizar simulado
            </button>
          </div>
        </div>
      )}

      {confirmar && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6">
            <h3 className="font-display text-lg font-semibold tracking-tight">Finalizar simulado?</h3>
            <p className="mt-1 text-xs text-foreground/50">Depois de finalizar você verá o resultado e o gabarito comentado.</p>
            <div className="mt-4 space-y-2">
              <Linha label="Questões respondidas" value={respondidas} tone="ok" />
              <Linha label="Não respondidas" value={total - respondidas} tone="bad" />
              <Linha label="Marcadas para revisão" value={progresso.marcadas.length} />
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmar(false)}
                className="flex-1 rounded-full border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-white/5"
              >
                Voltar
              </button>
              <button
                onClick={handleFinalizar}
                className="btn-sun flex-1 px-3 py-2 text-xs font-bold"
              >
                Finalizar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function PainelQuestoes({ total, atual, respostas, marcadas, onPick }: {
  total: number;
  atual: number;
  respostas: Record<number, string>;
  marcadas: number[];
  onPick: (i: number) => void;
}) {
  return (
    <div>
      <h4 className="mb-3 font-display text-sm font-semibold">Painel de questões</h4>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const respondida = !!respostas[n];
          const marcada = marcadas.includes(n);
          const isAtual = i === atual;

          let cls = "bg-muted text-muted-foreground hover:bg-surface-2";
          if (isAtual) cls = "bg-primary text-primary-foreground";
          else if (marcada) cls = "bg-success text-primary-foreground";
          else if (respondida) cls = "bg-accent text-accent-foreground";

          return (
            <button
              key={n}
              onClick={() => onPick(i)}
              className={`aspect-square rounded-xl text-sm font-bold tabular-nums transition-colors ${cls}`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
        <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-primary" /> Atual</p>
        <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-accent" /> Respondida</p>
        <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-success" /> Marcada para revisão</p>
        <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-muted" /> Não respondida</p>
      </div>
    </div>
  );
}

function NavBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 transition-colors hover:bg-surface disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function Linha({ label, value, tone }: { label: string; value: number; tone?: "ok" | "bad" }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface/40 px-3 py-2">
      <span className="text-xs text-foreground/55">{label}</span>
      <span className={["font-display text-sm font-semibold tabular-nums", tone === "ok" ? "text-primary" : tone === "bad" ? "text-accent" : ""].join(" ")}>
        {value}
      </span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "bad" }) {
  return (
    <div className="rf-card p-4">
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={["mt-1.5 font-display text-2xl font-semibold tabular-nums", tone === "ok" ? "text-green-500" : tone === "bad" ? "text-accent" : "text-foreground"].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function Donut({ pct }: { pct: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid h-36 w-36 place-items-center">
      <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-white/5" />
        <circle
          cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round"
          className="stroke-primary" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100}
        />
      </svg>
      <div className="absolute grid place-items-center">
        <span className="font-display text-3xl font-semibold tabular-nums">{pct}%</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">aproveit.</span>
      </div>
    </div>
  );
}

function formatarTempo(segundos: number): string {
  const mins = Math.floor(segundos / 60);
  const secs = segundos % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}