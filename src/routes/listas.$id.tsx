// src/routes/listas.$id.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppUser } from "@/contexts/UserContext";
import { AppShell } from "@/components/app-shell";
import { QuestaoCard } from "@/components/QuestaoCard";
import {
  getListaCompleta,
  calcularResultadoLista,
  calcularAcertosPorArea,
  salvarResultadoLista,
  getProgressoLista,
  salvarProgressoLista,
} from "@/services/listaService";
import { QuestaoListaPlayer, ResultadoListaCalc } from "@/lib/listas-types";
import { EnviarErrosModal, QuestaoErrada } from "@/components/EnviarErrosModal";
import { useToast } from "@/hooks/useToast";
import { useConfirm } from "@/components/ConfirmDialog";
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
  Loader2, Keyboard, Scissors,
} from "lucide-react";

type Fase = "resolvendo" | "resultado" | "correcao";

function formatarTempo(segundos: number): string {
  const mins = Math.floor(segundos / 60);
  const secs = segundos % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getCorreta(q: QuestaoListaPlayer): string | null {
  if (q.tipo === "multipla_escolha") {
    return q.alternativas?.find(a => a.correta)?.letra || null;
  }
  if (q.tipo === "certo_errado") {
    return q.gabarito_ce ? "C" : "E";
  }
  return null;
}

// AQUI ESTÁ A CORREÇÃO! Agora repassamos sublinhados, negritos e italicos!
function getAlternativasView(q: QuestaoListaPlayer) {
  if (q.tipo === "certo_errado") {
    return [
      { letra: "C", texto: "Certo" },
      { letra: "E", texto: "Errado" },
    ];
  }
  return (q.alternativas || []).map(a => ({ 
    letra: a.letra, 
    texto: a.texto,
    sublinhados: a.sublinhados,
    negritos: a.negritos,
    italicos: a.italicos
  }));
}

export default function ListaPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAppUser();
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [lista, setLista] = useState<{
    id: string;
    titulo: string;
    questoes: QuestaoListaPlayer[];
    discipline_id: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fase, setFase] = useState<Fase>("resolvendo");
  const [idx, setIdx] = useState(0);

  // Respostas já confirmadas
  const [respostas, setRespostas] = useState<Record<number, string>>({});
  // Selecionadas (ainda não confirmadas)
  const [selecionadas, setSelecionadas] = useState<Record<number, string>>({});
  // Riscadas
  const [eliminadas, setEliminadas] = useState<Record<number, string[]>>({});
  const [marcadas, setMarcadas] = useState<number[]>([]);

  const [tempoDecorrido, setTempoDecorrido] = useState(0);
  const [confirmar, setConfirmar] = useState(false);
  const [painel, setPainel] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoListaCalc | null>(null);

  const [errosParaEnviar, setErrosParaEnviar] = useState<QuestaoErrada[] | null>(null);
  const [mostrarModalErros, setMostrarModalErros] = useState(false);
  const [enviadosAoBanco, setEnviadosAoBanco] = useState(false);
  const [mostrarAtalhos, setMostrarAtalhos] = useState(false);

  // Grifos
  const [anotacoes, setAnotacoes] = useState<Map<string, AnotacaoQuestao[]>>(new Map());

  const [booted, setBooted] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const respostasRef = useRef(respostas);
  useEffect(() => { respostasRef.current = respostas; }, [respostas]);

  const selecionadasRef = useRef(selecionadas);
  useEffect(() => { selecionadasRef.current = selecionadas; }, [selecionadas]);

  const eliminadasRef = useRef(eliminadas);
  useEffect(() => { eliminadasRef.current = eliminadas; }, [eliminadas]);

  const marcadasRef = useRef(marcadas);
  useEffect(() => { marcadasRef.current = marcadas; }, [marcadas]);

  const tempoRef = useRef(tempoDecorrido);
  useEffect(() => { tempoRef.current = tempoDecorrido; }, [tempoDecorrido]);

  const faseRef = useRef(fase);
  useEffect(() => { faseRef.current = fase; }, [fase]);

  const lastSavedRef = useRef<string>('');

  const snapshotDe = (r: Record<number, string>, m: number[]) =>
    JSON.stringify({ r, m });

  // ============================================================
  // CARREGAMENTO
  // ============================================================
  useEffect(() => {
    const load = async () => {
      if (!id || !user?.id) {
        setLoading(false);
        setError("Usuário não autenticado");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await getListaCompleta(id, user.id);
        if (!result.success || !result.data) {
          setError(result.error || "Lista não encontrada");
          setLoading(false);
          return;
        }
        if (!result.data.questoes || result.data.questoes.length === 0) {
          setError("Esta lista não tem questões.");
          setLoading(false);
          return;
        }
        setLista({
          id: result.data.id,
          titulo: result.data.titulo,
          questoes: result.data.questoes,
          discipline_id: result.data.discipline_id ?? null,
        });

        const prog = await getProgressoLista(id, user.id);
        if (prog.success && prog.data) {
          const respostasSalvas = prog.data.respostas || {};
          const marcadasSalvas = prog.data.marcadas || [];
          setRespostas(respostasSalvas);
          setMarcadas(marcadasSalvas);
          setTempoDecorrido(prog.data.tempo_decorrido || 0);
          lastSavedRef.current = snapshotDe(respostasSalvas, marcadasSalvas);
        } else {
          lastSavedRef.current = snapshotDe({}, []);
        }
      } catch (err: any) {
        setError(err.message || "Erro ao carregar lista");
      } finally {
        setLoading(false);
        setBooted(true);
      }
    };
    load();
  }, [id, user?.id]);

  // ============================================================
  // CARREGAR GRIFOS
  // ============================================================
  useEffect(() => {
    if (!user?.id || !lista) return;
    const ids = lista.questoes.map((q) => q.id);
    if (ids.length === 0) return;
    getAnotacoesDeQuestoes(user.id, 'lista', ids)
      .then(setAnotacoes)
      .catch(() => {});
  }, [user?.id, lista]);

  // ============================================================
  // CRONÔMETRO
  // ============================================================
  useEffect(() => {
    if (fase !== "resolvendo" || !lista) return;
    timerRef.current = setInterval(() => {
      setTempoDecorrido(prev => prev + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fase, lista]);

  // ============================================================
  // AUTOSAVE
  // ============================================================
  useEffect(() => {
    if (!id || !user?.id || fase !== "resolvendo" || !lista) return;
    if (!booted) return;

    const snap = snapshotDe(respostas, marcadas);
    if (snap === lastSavedRef.current) return;

    salvarProgressoLista(id, user.id, {
      respostas,
      marcadas,
      tempo_decorrido: tempoRef.current,
      status: 'em-andamento',
    }).then(() => {
      lastSavedRef.current = snap;
    }).catch((e) => {
      console.warn('⚠️ Falha ao salvar progresso:', e);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respostas, marcadas, id, user?.id, fase, lista, booted]);

  useEffect(() => {
    if (!id || !user?.id || fase !== "resolvendo" || !lista) return;
    if (!booted) return;

    const interval = setInterval(() => {
      if (tempoRef.current > 0) {
        salvarProgressoLista(id, user.id, {
          respostas: respostasRef.current,
          marcadas: marcadasRef.current,
          tempo_decorrido: tempoRef.current,
          status: 'em-andamento',
        }).catch(() => {});
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [id, user?.id, fase, lista, booted]);

  useEffect(() => {
    if (!id || !user?.id) return;

    const persist = () => {
      if (faseRef.current !== "resolvendo") return;
      if (!booted) return;
      salvarProgressoLista(id, user.id, {
        respostas: respostasRef.current,
        marcadas: marcadasRef.current,
        tempo_decorrido: tempoRef.current,
        status: 'em-andamento',
      }).catch(() => {});
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
  // AÇÕES
  // ============================================================
  const selecionar = useCallback((numero: number, letra: string) => {
    if (respostasRef.current[numero]) return;
    const elims = eliminadasRef.current[numero] || [];
    if (elims.includes(letra)) return;
    setSelecionadas(prev => ({ ...prev, [numero]: letra }));
  }, []);

  const confirmarResposta = useCallback((numero: number) => {
    if (respostasRef.current[numero]) return;
    const letra = selecionadasRef.current[numero];
    if (!letra) return;
    setRespostas(prev => ({ ...prev, [numero]: letra }));
    setSelecionadas(prev => {
      const next = { ...prev };
      delete next[numero];
      return next;
    });
  }, []);

  const toggleEliminada = useCallback((numero: number, letra: string) => {
    if (respostasRef.current[numero]) return;
    setEliminadas(prev => {
      const atual = prev[numero] || [];
      const nova = atual.includes(letra) ? atual.filter(l => l !== letra) : [...atual, letra];
      return { ...prev, [numero]: nova };
    });
    setSelecionadas(prev => {
      if (prev[numero] === letra) {
        const next = { ...prev };
        delete next[numero];
        return next;
      }
      return prev;
    });
  }, []);

  const toggleMarcar = useCallback((numero: number) => {
    setMarcadas(prev =>
      prev.includes(numero) ? prev.filter(n => n !== numero) : [...prev, numero]
    );
  }, []);

  // ============================================================
  // GRIFOS
  // ============================================================
  const handleGrifar = useCallback(
    async (
      questaoId: string,
      campo: CampoAlvo,
      cor: CorGrifo,
      texto: string,
      rects: RectGrifo[]
    ) => {
      if (!user?.id) return;
      const nova = await criarAnotacao(user.id, 'lista', questaoId, campo, cor, texto, rects);
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

  // ============================================================
  // ATALHOS
  // ============================================================
  useEffect(() => {
    if (fase !== "resolvendo" || !lista) return;

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const q = lista.questoes[idx];
      if (!q) return;

      if (confirmar) {
        if (e.key === "Enter") { e.preventDefault(); handleFinalizar(); }
        else if (e.key === "Escape") { e.preventDefault(); setConfirmar(false); }
        return;
      }

      if (painel) {
        if (e.key === "Escape") { e.preventDefault(); setPainel(false); }
        return;
      }

      const jaConfirmada = !!respostas[q.numero];
      const temSelecao = !!selecionadas[q.numero];
      const tecla = e.key.toUpperCase();
      const numeros = ["1", "2", "3", "4", "5"];
      const letras = ["A", "B", "C", "D", "E"];

      if (!jaConfirmada && q.tipo === "multipla_escolha" && q.alternativas) {
        let letraAlvo: string | null = null;
        const idxNum = numeros.indexOf(tecla);
        if (idxNum >= 0) letraAlvo = letras[idxNum];
        else if (letras.includes(tecla)) letraAlvo = tecla;

        if (letraAlvo) {
          const existe = q.alternativas.some(a => a.letra === letraAlvo);
          const elims = eliminadas[q.numero] || [];
          if (existe && !elims.includes(letraAlvo)) {
            e.preventDefault();
            selecionar(q.numero, letraAlvo);
            return;
          }
        }
      } else if (!jaConfirmada && q.tipo === "certo_errado") {
        if (tecla === "1" || tecla === "C") { e.preventDefault(); selecionar(q.numero, "C"); return; }
        if (tecla === "2" || tecla === "E") { e.preventDefault(); selecionar(q.numero, "E"); return; }
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (!jaConfirmada && temSelecao) {
          confirmarResposta(q.numero);
          return;
        }
        if (idx === lista.questoes.length - 1) setConfirmar(true);
        else setIdx(i => i + 1);
        return;
      }

      if (e.key === "ArrowLeft") { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); return; }
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        if (idx === lista.questoes.length - 1) setConfirmar(true);
        else setIdx(i => i + 1);
        return;
      }
      if (tecla === "M") { e.preventDefault(); toggleMarcar(q.numero); return; }
      if (tecla === "F") { e.preventDefault(); setConfirmar(true); return; }
      if (e.key === "?") { e.preventDefault(); setMostrarAtalhos(v => !v); return; }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fase, lista, idx, confirmar, painel, respostas, selecionadas, eliminadas, selecionar, confirmarResposta, toggleMarcar]);

  // ============================================================
  // ERROS + FINALIZAR
  // ============================================================
  const montarErros = (respostasFinais: Record<number, string>): QuestaoErrada[] => {
    if (!lista) return [];
    const erros: QuestaoErrada[] = [];
    for (const q of lista.questoes) {
      const resp = respostasFinais[q.numero];
      if (!resp) continue;
      const correta = getCorreta(q);
      if (resp === correta) continue;

      let textoUsuario = resp;
      if (q.tipo === 'multipla_escolha' && q.alternativas) {
        const alt = q.alternativas.find(a => a.letra === resp);
        if (alt) textoUsuario = `${resp}) ${alt.texto}`;
      } else if (q.tipo === 'certo_errado') {
        textoUsuario = resp === 'C' ? 'Certo' : 'Errado';
      }

      let textoCorreta = correta || '';
      if (q.tipo === 'multipla_escolha' && q.alternativas && correta) {
        const alt = q.alternativas.find(a => a.letra === correta);
        if (alt) textoCorreta = `${correta}) ${alt.texto}`;
      } else if (q.tipo === 'certo_errado') {
        textoCorreta = correta === 'C' ? 'Certo' : 'Errado';
      }

      erros.push({
        numero: q.numero,
        enunciado: q.enunciado,
        suaResposta: textoUsuario,
        respostaCorreta: textoCorreta,
        tipo: q.tipo,
      });
    }
    return erros;
  };

  const handleFinalizar = async () => {
    if (!lista || !user?.id) return;
    setConfirmar(false);

    const respostasFinais: Record<number, string> = { ...respostas };
    for (const [numStr, letra] of Object.entries(selecionadas)) {
      const num = parseInt(numStr, 10);
      if (!Number.isNaN(num) && !respostasFinais[num]) {
        respostasFinais[num] = letra;
      }
    }
    setRespostas(respostasFinais);
    setSelecionadas({});

    const areasMap: Record<number, string> = {};
    lista.questoes.forEach(q => {
      areasMap[q.numero] = q.area || "Não categorizada";
    });

    const result = calcularResultadoLista(lista.questoes, respostasFinais);
    result.listaId = lista.id;
    result.tempoDecorrido = tempoDecorrido;

    const acertosPorArea = calcularAcertosPorArea(lista.questoes, respostasFinais);

    setSalvando(true);
    const save = await salvarResultadoLista(
      lista.id,
      user.id,
      result,
      respostasFinais,
      areasMap,
      acertosPorArea
    );

    await salvarProgressoLista(lista.id, user.id, {
      respostas: respostasFinais,
      marcadas,
      tempo_decorrido: tempoDecorrido,
      status: 'concluido',
    });
    setSalvando(false);

    if (!save.success) {
      toast.error("Erro ao salvar resultado", { description: save.error });
      return;
    }

    const erros = montarErros(respostasFinais);
    if (erros.length > 0) {
      setErrosParaEnviar(erros);
      setMostrarModalErros(false);
      setEnviadosAoBanco(false);
    } else {
      setErrosParaEnviar(null);
    }

    setResultado(result);
    setFase("resultado");
  };

  const handleSair = async () => {
    const ok = await confirmDialog({
      title: "Tem certeza que deseja sair?",
      description: "Você poderá retomar de onde parou se voltar a esta lista.",
      confirmText: "Sair",
      cancelText: "Ficar",
      destructive: true,
    });
    if (ok) navigate("/simulados");
  };

  // ============================================================
  // LOADING / ERRO
  // ============================================================
  if (loading) {
    return (
      <AppShell breadcrumb="Listas" title="Carregando...">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (error || !lista) {
    return (
      <AppShell breadcrumb="Listas" title="Erro">
        <div className="rf-card p-6 text-center">
          <p className="text-accent">{error || "Lista não encontrada"}</p>
          <button
            onClick={() => navigate("/simulados")}
            className="btn-sun mt-4 px-4 py-2 text-xs font-bold"
          >
            Voltar
          </button>
        </div>
      </AppShell>
    );
  }

  const total = lista.questoes.length;

  // ============================================================
  // RESULTADO
  // ============================================================
  if (fase === "resultado" && resultado) {
    const pct = resultado.porcentagem;

    return (
      <AppShell breadcrumb="Listas" title="Resultado da lista">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => navigate("/simulados")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Voltar para listas
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rf-card flex flex-col items-center p-6 text-center">
            <Donut pct={pct} />
            <div className="mt-4 font-display text-2xl font-semibold tabular-nums">
              {resultado.acertos} / {resultado.totalQuestoes}
            </div>
            <p className="text-xs text-muted-foreground">
              acertos · {pct}% de aproveitamento
            </p>
            <p className="mt-3 text-xs text-muted-foreground">{lista.titulo}</p>
          </div>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Acertos" value={resultado.acertos} tone="ok" />
              <Stat label="Erros" value={resultado.erros} tone="bad" />
              <Stat label="Não respondidas" value={resultado.naoRespondidas} />
              <Stat label="Tempo" value={`${Math.floor(tempoDecorrido / 60)}min`} />
            </div>

            <div className="rf-card p-5">
              <h3 className="mb-3 font-display text-sm font-semibold">Questões</h3>
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {lista.questoes.map((q, i) => {
                  const resp = respostas[q.numero];
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

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setRespostas({});
                  setSelecionadas({});
                  setEliminadas({});
                  setMarcadas([]);
                  setTempoDecorrido(0);
                  setResultado(null);
                  setIdx(0);
                  setFase("resolvendo");
                  setErrosParaEnviar(null);
                  setEnviadosAoBanco(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-4 py-2 text-xs font-medium text-foreground/70 hover:bg-surface"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Refazer lista
              </button>
              {errosParaEnviar && errosParaEnviar.length > 0 && !enviadosAoBanco && (
                <button
                  onClick={() => setMostrarModalErros(true)}
                  className="btn-sun inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold"
                >
                  📥 Enviar {errosParaEnviar.length} {errosParaEnviar.length === 1 ? 'erro' : 'erros'} ao caderno
                </button>
              )}
              {enviadosAoBanco && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-medium text-primary">
                  ✅ Enviado ao caderno
                </span>
              )}
            </div>
          </div>
        </div>

        {mostrarModalErros && errosParaEnviar && lista.discipline_id && (
          <EnviarErrosModal
            listaId={lista.id}
            listaTitulo={lista.titulo}
            disciplineId={lista.discipline_id}
            questoesErradas={errosParaEnviar}
            onClose={(enviou) => {
              setMostrarModalErros(false);
              if (enviou) setEnviadosAoBanco(true);
            }}
          />
        )}
      </AppShell>
    );
  }

  // ============================================================
  // CORREÇÃO
  // ============================================================
  if (fase === "correcao") {
    const q = lista.questoes[idx];
    const resp = respostas[q.numero];
    const correta = getCorreta(q);
    const acertou = resp === correta;
    const elims = eliminadas[q.numero] || [];

    return (
      <AppShell breadcrumb="Listas" title={`Gabarito — Questão ${q.numero}`}>
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
              disabled={idx === total - 1}
              onClick={() => setIdx(i => Math.min(total - 1, i + 1))}
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
          tipo={q.tipo === "certo_errado" ? "certo_errado" : "multipla_escolha"}
          alternativas={getAlternativasView(q)}
          selecionada={resp ?? null}
          eliminadas={elims}
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
  const q = lista.questoes[idx];
  const respostaConfirmada = respostas[q.numero];
  const respostaPendente = selecionadas[q.numero];
  const respondida = !!respostaConfirmada;
  const selecionadaAtual = respondida ? respostaConfirmada : (respostaPendente ?? null);
  const eliminadasAtuais = eliminadas[q.numero] || [];
  const respondidas = Object.keys(respostas).length;
  const progressoPercentual = Math.round(((idx + 1) / total) * 100);
  const correta = getCorreta(q);

  return (
    <AppShell breadcrumb="Listas">
      <div className="rf-card mb-4 p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <button
              onClick={handleSair}
              className="inline-flex items-center gap-1.5 text-[11px] text-foreground/45 hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" /> Sair da lista
            </button>
            <h1 className="truncate font-display text-base font-semibold tracking-tight sm:text-lg">
              {lista.titulo}
            </h1>
            <p className="text-[11px] text-foreground/45">
              Questão {idx + 1} de {total} · {respondidas} respondidas
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
              <Clock className="h-3.5 w-3.5 text-accent" />
              <span className="font-display text-xs font-semibold tabular-nums">
                {formatarTempo(tempoDecorrido)}
              </span>
            </div>
            <button
              onClick={() => setMostrarAtalhos(v => !v)}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface"
              title="Atalhos de teclado"
            >
              <Keyboard className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPainel(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface"
              title="Painel de questões"
            >
              <Grid3X3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Questões</span>
            </button>
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
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all"
            style={{ width: `${progressoPercentual}%` }}
          />
        </div>
      </div>

      {mostrarAtalhos && (
        <div className="rf-card mb-4 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-display text-sm font-semibold">Atalhos de teclado</h4>
            <button
              onClick={() => setMostrarAtalhos(false)}
              className="grid h-6 w-6 place-items-center rounded-md text-foreground/50 hover:bg-white/5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-4">
            <Shortcut keys={["1", "2", "3"]} label="Selecionar alternativa" />
            <Shortcut keys={["Enter"]} label="Responder · próxima" />
            <Shortcut keys={["←", "→"]} label="Navegar questões" />
            <Shortcut keys={["Espaço"]} label="Próxima questão" />
            <Shortcut keys={["M"]} label="Marcar para revisão" />
            <Shortcut keys={["F"]} label="Finalizar lista" />
            <Shortcut keys={["?"]} label="Mostrar / esconder atalhos" />
            <Shortcut keys={["Esc"]} label="Fechar painéis" />
          </div>
        </div>
      )}

      <QuestaoCard
        numero={idx + 1}
        total={total}
        area={q.area || null}
        enunciado={q.enunciado}
        sublinhadosEnunciado={q.sublinhados_enunciado ?? null}
        negritosEnunciado={q.negritos_enunciado ?? null}
        italicosEnunciado={q.italicos_enunciado ?? null}
        imagens={q.imagem_url ? [q.imagem_url] : []}
        tipo={q.tipo === "certo_errado" ? "certo_errado" : "multipla_escolha"}
        alternativas={getAlternativasView(q)}
        selecionada={selecionadaAtual}
        eliminadas={eliminadasAtuais}
        correta={respondida ? correta : null}
        comentario={respondida ? (q.comentario_geral || null) : null}
        sublinhadosComentario={respondida ? (q.sublinhados_comentario ?? null) : null}
        negritosComentario={respondida ? (q.negritos_comentario ?? null) : null}
        italicosComentario={respondida ? (q.italicos_comentario ?? null) : null}
        revelar={respondida}
        permitirEliminar={!respondida}
        marcada={marcadas.includes(q.numero)}
        onSelecionar={(letra) => selecionar(q.numero, letra)}
        onEliminar={(letra) => toggleEliminada(q.numero, letra)}
        onMarcar={() => toggleMarcar(q.numero)}
        anotacoes={anotacoes.get(q.id) ?? []}
        onGrifar={(campo, cor, texto, rects) => handleGrifar(q.id, campo, cor, texto, rects)}
        onRemoverGrifo={handleRemoverGrifo}
        onTrocarCorGrifo={handleTrocarCorGrifo}
        grifarAtivo={true}
      />

      {!respondida && eliminadasAtuais.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-foreground/45">
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">
            <Scissors className="h-3 w-3" />
            {eliminadasAtuais.length} eliminada{eliminadasAtuais.length > 1 ? "s" : ""}: {eliminadasAtuais.join(", ")}
          </span>
          <button
            onClick={() => setEliminadas(prev => ({ ...prev, [q.numero]: [] }))}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> desfazer todas
          </button>
        </div>
      )}

      {!respondida && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            onClick={() => confirmarResposta(q.numero)}
            disabled={!respostaPendente}
            className="btn-sun inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="h-4 w-4" />
            Responder
          </button>
          <p className="text-[11px] text-foreground/40">
            {respostaPendente
              ? "Clique em Responder para ver o gabarito"
              : "Selecione uma alternativa para poder responder"}
          </p>
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
            <Flag className="h-3.5 w-3.5" /> Finalizar lista
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
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
          onClick={() => setPainel(false)}
        >
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 sm:max-w-md sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">Painel de questões</h3>
              <button
                onClick={() => setPainel(false)}
                className="grid h-7 w-7 place-items-center rounded-md text-foreground/50 hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <PainelQuestoes
              total={total}
              atual={idx}
              respostas={respostas}
              selecionadas={selecionadas}
              marcadas={marcadas}
              onPick={(i) => { setIdx(i); setPainel(false); }}
            />
            <button
              onClick={() => { setPainel(false); setConfirmar(true); }}
              className="btn-sun mt-5 inline-flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold"
            >
              <Flag className="h-3.5 w-3.5" /> Finalizar lista
            </button>
          </div>
        </div>
      )}

      {confirmar && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6">
            <h3 className="font-display text-lg font-semibold tracking-tight">Finalizar lista?</h3>
            <p className="mt-1 text-xs text-foreground/50">
              Depois de finalizar, você verá o resultado e o gabarito comentado.
            </p>
            <div className="mt-4 space-y-2">
              <Linha label="Questões respondidas" value={respondidas} tone="ok" />
              <Linha label="Não respondidas" value={total - respondidas} tone="bad" />
              <Linha label="Marcadas para revisão" value={marcadas.length} />
            </div>
            <p className="mt-3 text-center text-[10px] text-foreground/35">
              Pressione <kbd className="rounded border border-border px-1">Enter</kbd> para confirmar
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmar(false)}
                disabled={salvando}
                className="flex-1 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-white/5 disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                onClick={handleFinalizar}
                disabled={salvando}
                className="btn-sun flex-1 px-3 py-2 text-xs font-bold disabled:opacity-50"
              >
                {salvando ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "Finalizar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function PainelQuestoes({
  total, atual, respostas, selecionadas, marcadas, onPick,
}: {
  total: number;
  atual: number;
  respostas: Record<number, string>;
  selecionadas: Record<number, string>;
  marcadas: number[];
  onPick: (i: number) => void;
}) {
  return (
    <div>
      <h4 className="mb-3 font-display text-sm font-semibold">Painel de questões</h4>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const confirmada = !!respostas[n];
          const pendente = !confirmada && !!selecionadas[n];
          const marcada = marcadas.includes(n);
          const isAtual = i === atual;

          let cls = "bg-muted text-muted-foreground hover:bg-surface-2";
          if (isAtual) cls = "bg-primary text-primary-foreground";
          else if (marcada) cls = "bg-success text-primary-foreground";
          else if (confirmada) cls = "bg-accent text-accent-foreground";
          else if (pendente) cls = "bg-warning/30 text-foreground";

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
        <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-warning/30" /> Selecionada (não respondida)</p>
        <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-success" /> Marcada para revisão</p>
        <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-muted" /> Não respondida</p>
      </div>
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {keys.map((k) => (
          <kbd
            key={k}
            className="rounded border border-border bg-background px-1.5 py-0.5 font-display text-[10px] font-semibold text-foreground/70"
          >
            {k}
          </kbd>
        ))}
      </div>
      <span className="text-foreground/55">{label}</span>
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
      <span className={["font-display text-sm font-semibold tabular-nums", tone === "ok" ? "text-green-500" : tone === "bad" ? "text-accent" : ""].join(" ")}>
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