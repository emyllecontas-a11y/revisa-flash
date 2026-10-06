// src/routes/simulados.$id.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAppUser } from "@/contexts/UserContext";
import { AppShell } from "@/components/app-shell";
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
  ArrowLeft, ArrowRight, Bookmark, Check, Clock, Flag, Grid3X3, X,
  CheckCircle2, XCircle, MinusCircle, RotateCcw, Undo2, ChevronLeft,
  Loader2, Trash2
} from "lucide-react";
import type { SimuladoPlayer, QuestaoPlayer, ProgressoPlayer, Alternativa } from "@/lib/simulados-types";

type Fase = "resolvendo" | "resultado" | "correcao";

// ============================================================
// PÁGINA DO PLAYER
// ============================================================
export default function SimuladoPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAppUser();

  const [simulado, setSimulado] = useState<SimuladoPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

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

  // NOVO: bloqueia autosave até o boot terminar
  const [booted, setBooted] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs para acesso em listeners / intervalos (sempre o valor mais recente)
  const progressoRef = useRef(progresso);
  useEffect(() => { progressoRef.current = progresso; }, [progresso]);

  const faseRef = useRef(fase);
  useEffect(() => { faseRef.current = fase; }, [fase]);

  // Snapshot do que já foi salvo — evita salvar o que acabou de vir do banco
  const lastSavedRef = useRef<string>('');

  // ============================================================
  // HELPERS DE PERSISTÊNCIA
  // ============================================================
  const snapshotDe = (p: ProgressoPlayer) => JSON.stringify({
    r: p.respostas || {},
    m: p.marcadas || [],
    e: p.eliminadas || {},
  });

  // ============================================================
  // CARREGAR DADOS INICIAIS
  // ============================================================
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

        // 1. Buscar progresso do usuário (local-first)
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
          // Sem progresso anterior — registra snapshot vazio
          lastSavedRef.current = snapshotDe({
            respostas: {}, eliminadas: {}, marcadas: [], tempo_decorrido: 0, status: 'em-andamento',
          });
        }

        // 2. Buscar resultado salvo (se existir)
        const resultResult = await buscarResultadoSimulado(id, user.id);
        if (resultResult.success && resultResult.data) {
          setResultadoSalvo(resultResult.data);
        }

        // 3. Verificar se veio com view=resultado
        const searchParams = new URLSearchParams(location.search);
        if (searchParams.get('view') === 'resultado') {
          setFase("resultado");
        }

      } catch (err: any) {
        setError(err.message || "Erro ao carregar simulado");
      } finally {
        setLoading(false);
        // Marca como pronto para salvar — só depois de tudo carregado
        setBooted(true);
      }
    };

    loadData();
  }, [id, user?.id, location.search]);

  // ============================================================
  // CRONÔMETRO
  // ============================================================
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

  // ============================================================
  // AUTOSAVE — RESPOSTAS/MARCADAS/ELIMINADAS (imediato)
  // ============================================================
  useEffect(() => {
    if (!id || !user?.id || fase !== "resolvendo" || !simulado) return;
    if (!booted) return;   // guarda contra race no boot

    const snap = snapshotDe(progresso);
    if (snap === lastSavedRef.current) return;

    salvarProgresso(id, user.id, progresso).then(() => {
      lastSavedRef.current = snap;
    }).catch((e) => {
      console.warn('⚠️ Falha ao salvar progresso (respostas):', e);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progresso.respostas, progresso.marcadas, progresso.eliminadas, id, user?.id, fase, simulado, booted]);

  // ============================================================
  // AUTOSAVE — TEMPO DECORRIDO (a cada 10s)
  // ============================================================
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

  // ============================================================
  // AUTOSAVE — BEFOREUNLOAD + VISIBILITYCHANGE
  // ============================================================
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

  // ============================================================
  // FUNÇÕES DE INTERAÇÃO
  // ============================================================
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
      alert("Erro ao finalizar simulado: " + finalResult.error);
    }
  };

  const handleExcluirSimulado = async () => {
    if (!id || !user?.id || !simulado) return;
    if (!confirm(`Tem certeza que deseja excluir o simulado "${simulado.titulo}"?`)) return;
    if (!confirm(`Esta ação não pode ser desfeita. Confirmar exclusão?`)) return;

    setExcluindo(true);
    try {
      const result = await excluirSimulado(id, user.id);
      if (result.success) {
        alert("Simulado excluído com sucesso!");
        navigate("/simulados");
      } else {
        alert("Erro ao excluir: " + result.error);
      }
    } catch (err: any) {
      alert("Erro ao excluir: " + err.message);
    } finally {
      setExcluindo(false);
    }
  };

  // ============================================================
  // RENDER: LOADING / ERRO
  // ============================================================
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
            onClick={() => navigate("/simulados")}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
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
            onClick={() => navigate("/simulados")}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            Voltar para simulados
          </button>
        </div>
      </AppShell>
    );
  }

  // ============================================================
  // RENDER: FASE RESULTADO
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
        const correta = q.alternativas.find(a => a.correta)?.letra;
        if (resp === correta) acertos++;
        else erros++;
      });
    }

    const pct = total > 0 ? Math.round((acertos / total) * 100) : 0;

    return (
      <AppShell breadcrumb="Simulados" title="Resultado do simulado">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/simulados")}
            className="inline-flex items-center gap-1.5 text-xs text-foreground/50 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Voltar para simulados
          </button>
          <button
            onClick={handleExcluirSimulado}
            disabled={excluindo}
            className="inline-flex items-center gap-1.5 text-xs text-accent/70 hover:text-accent transition-colors disabled:opacity-50"
          >
            {excluindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Excluir simulado
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rf-card flex flex-col items-center p-6 text-center">
            <Donut pct={pct} />
            <div className="mt-4 font-display text-2xl font-semibold tabular-nums">
              {acertos} / {total}
            </div>
            <p className="text-xs text-foreground/50">acertos · {pct}% de aproveitamento</p>
            <p className="mt-3 text-xs text-foreground/45">{simulado.titulo}</p>
            {usarResultadoSalvo && (
              <span className="mt-2 text-[10px] text-foreground/30">Resultado salvo</span>
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
                  const correta = q.alternativas.find(a => a.correta)?.letra;
                  const acertou = resp === correta;
                  const status = !resp ? "nao-respondida" : acertou ? "acertou" : "errou";

                  return (
                    <button
                      key={q.id}
                      onClick={() => { setIdx(i); setFase("correcao"); }}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-surface/40 px-3 py-2 text-left transition-colors hover:bg-surface"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium">Questão {q.numero}</div>
                        <div className="truncate text-[11px] text-foreground/40">{q.area || ""}</div>
                      </div>
                      <span
                        className={[
                          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          status === "nao-respondida" ? "bg-white/5 text-foreground/45" :
                          status === "acertou" ? "bg-primary/15 text-primary" :
                          "bg-accent/15 text-accent",
                        ].join(" ")}
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
  // FASE CORREÇÃO
  // ============================================================
  if (fase === "correcao") {
    const q = simulado.questoes[idx];
    const respostasParaExibir = resultadoSalvo?.respostas || progresso.respostas;
    const resp = respostasParaExibir[q.numero];
    const correta = q.alternativas.find(a => a.correta)?.letra;
    const acertou = resp === correta;

    return (
      <AppShell breadcrumb="Simulados" title={`Gabarito comentado — Questão ${q.numero}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => setFase("resultado")}
            className="inline-flex items-center gap-1.5 text-xs text-foreground/50 hover:text-foreground"
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

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rf-card p-5 sm:p-6">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{q.area || ""}</span>
            <p className="mt-3 text-sm leading-relaxed text-foreground/85">
              <span className="font-display font-semibold">{q.numero}.</span> {q.enunciado}
            </p>

            <div className="mt-5 space-y-2">
              {q.alternativas.map((a: Alternativa) => {
                const isCorreta = !!a.correta;
                const isSua = resp === a.letra;
                return (
                  <div
                    key={a.letra}
                    className={[
                      "rounded-xl border p-3",
                      isCorreta
                        ? "border-primary/50 bg-primary/10"
                        : isSua
                          ? "border-accent/50 bg-accent/10"
                          : "border-border bg-surface/40",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={[
                          "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
                          isCorreta ? "border-primary text-primary" : isSua ? "border-accent text-accent" : "border-border text-foreground/50",
                        ].join(" ")}
                      >
                        {a.letra}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs leading-relaxed text-foreground/80">{a.texto}</p>
                        <p className="mt-1 text-[11px] text-foreground/45">
                          <span className={isCorreta ? "font-semibold text-primary" : "font-semibold text-foreground/60"}>
                            {isCorreta ? "Correta" : "Incorreta"}
                          </span>{" "}
                          — {a.comentario || "Comentário disponível em breve."}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rf-card p-5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/50">Sua resposta</span>
                <span className="font-display text-sm font-semibold">{resp ?? "—"}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-foreground/50">Resposta correta</span>
                <span className="font-display text-sm font-semibold text-primary">{correta}</span>
              </div>
              <div
                className={[
                  "mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold",
                  !resp ? "bg-white/5 text-foreground/50" : acertou ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent",
                ].join(" ")}
              >
                {!resp ? <MinusCircle className="h-3.5 w-3.5" /> : acertou ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {!resp ? "Não respondida" : acertou ? "Você acertou" : "Você errou"}
              </div>
            </div>

            <div className="rf-card p-5">
              <h4 className="mb-2 font-display text-sm font-semibold">Comentário</h4>
              <p className="text-xs leading-relaxed text-foreground/60">{q.comentario_geral || "Sem comentário adicional."}</p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ============================================================
  // RENDER: FASE RESOLVENDO
  // ============================================================
  const q = simulado.questoes[idx];
  const elimAtual = progresso.eliminadas[q.numero] || [];
  const selecionada = progresso.respostas[q.numero];
  const respondidas = Object.keys(progresso.respostas).length;
  const total = simulado.questoes.length;
  const progressoPercentual = Math.round(((idx + 1) / total) * 100);

  return (
    <AppShell breadcrumb="Simulados">
      <div className="rf-card mb-4 p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <button
              onClick={() => navigate("/simulados")}
              className="inline-flex items-center gap-1.5 text-[11px] text-foreground/45 hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" /> Sair do simulado
            </button>
            <h1 className="truncate font-display text-base font-semibold tracking-tight sm:text-lg">{simulado.titulo}</h1>
            <p className="text-[11px] text-foreground/45">
              Questão {idx + 1} de {total} · {respondidas} respondidas
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
              <Clock className="h-3.5 w-3.5 text-accent" />
              <span className="font-display text-xs font-semibold tabular-nums text-foreground">
                {formatarTempo(progresso.tempo_decorrido)}
              </span>
            </div>
            <button
              onClick={() => setPainel(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface"
            >
              <Grid3X3 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Questões</span>
            </button>
            <button
              onClick={handleExcluirSimulado}
              disabled={excluindo}
              className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2 py-1.5 text-[10px] font-medium text-accent/80 hover:bg-accent/20 transition-colors disabled:opacity-50"
              title="Excluir simulado"
            >
              {excluindo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              <span className="hidden sm:inline">Excluir</span>
            </button>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${progressoPercentual}%` }} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rf-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{q.area || ""}</span>
            <button
              onClick={toggleMarcar}
              className={[
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors",
                progresso.marcadas.includes(q.numero)
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-border bg-surface/60 text-foreground/60 hover:bg-surface",
              ].join(" ")}
            >
              <Bookmark className={["h-3.5 w-3.5", progresso.marcadas.includes(q.numero) ? "fill-current" : ""].join(" ")} />
              {progresso.marcadas.includes(q.numero) ? "Marcada" : "Marcar"}
            </button>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-foreground/85">
            <span className="font-display font-semibold">{q.numero}.</span> {q.enunciado}
          </p>

          <p className="mt-5 text-[11px] text-foreground/40">
            Toque na alternativa para responder · use o <X className="inline h-3 w-3" /> para eliminar
          </p>

          <div className="mt-2 space-y-2">
            {q.alternativas.map((a: Alternativa) => {
              const eliminada = elimAtual.includes(a.letra);
              const ativa = selecionada === a.letra;
              return (
                <div
                  key={a.letra}
                  className={[
                    "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border p-3 transition-colors",
                    ativa ? "border-primary bg-primary/10" : "border-border bg-surface/40 hover:bg-surface/70",
                    eliminada ? "opacity-45" : "",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => !eliminada && responder(a.letra)}
                    disabled={eliminada}
                    className="flex min-w-0 items-start gap-3 text-left"
                  >
                    <span
                      className={[
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors",
                        ativa ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/55",
                      ].join(" ")}
                    >
                      {ativa ? <Check className="h-3.5 w-3.5" /> : a.letra}
                    </span>
                    <span className={["min-w-0 text-xs leading-relaxed text-foreground/80", eliminada ? "line-through decoration-accent/70" : ""].join(" ")}>
                      {a.texto}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleEliminada(a.letra)}
                    className={[
                      "grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition-colors",
                      eliminada
                        ? "border-accent/50 bg-accent/10 text-accent"
                        : "border-border text-foreground/35 hover:border-accent/40 hover:text-accent",
                    ].join(" ")}
                  >
                    {eliminada ? <Undo2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>

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
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <Flag className="h-3.5 w-3.5" /> Finalizar simulado
              </button>
            ) : (
              <button
                onClick={() => setIdx(i => i + 1)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Próxima <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="rf-card sticky top-20 p-5">
            <PainelQuestoes
              total={total}
              atual={idx}
              respostas={progresso.respostas}
              marcadas={progresso.marcadas}
              onPick={(i) => setIdx(i)}
            />
            <button
              onClick={() => setConfirmar(true)}
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Flag className="h-3.5 w-3.5" /> Finalizar simulado
            </button>
          </div>
        </aside>
      </div>

      {painel && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setPainel(false)}>
          <div className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
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
                className="flex-1 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-white/5"
              >
                Voltar
              </button>
              <button
                onClick={handleFinalizar}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
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

// ============================================================
// SUBCOMPONENTES
// ============================================================

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
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const respondida = !!respostas[n];
          const marcada = marcadas.includes(n);
          const isAtual = i === atual;
          return (
            <button
              key={n}
              onClick={() => onPick(i)}
              className={[
                "relative grid aspect-square place-items-center rounded-lg border text-[11px] font-semibold tabular-nums transition-colors",
                isAtual
                  ? "border-primary bg-primary text-primary-foreground"
                  : respondida
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-surface/40 text-foreground/45 hover:bg-surface",
              ].join(" ")}
            >
              {n}
              {marcada && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px] text-foreground/45">
        <Legenda className="bg-primary" label="Atual" />
        <Legenda className="bg-primary/30" label="Respondida" />
        <Legenda className="bg-white/10" label="Não respondida" />
        <Legenda className="bg-accent" label="Para revisar" />
      </div>
    </div>
  );
}

function Legenda({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={["h-2 w-2 rounded-full", className].join(" ")} /> {label}
    </span>
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
      <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">{label}</div>
      <div className={["mt-1.5 font-display text-2xl font-semibold tabular-nums", tone === "ok" ? "text-primary" : tone === "bad" ? "text-accent" : "text-foreground"].join(" ")}>
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
        <span className="text-[10px] uppercase tracking-widest text-foreground/40">aproveit.</span>
      </div>
    </div>
  );
}

// ============================================================
// AUXILIAR
// ============================================================
function formatarTempo(segundos: number): string {
  const mins = Math.floor(segundos / 60);
  const secs = segundos % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}