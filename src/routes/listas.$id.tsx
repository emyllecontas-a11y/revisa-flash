// src/routes/listas.$id.tsx
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppUser } from "@/contexts/UserContext";
import { AppShell } from "@/components/app-shell";
import { getListaCompleta, calcularResultadoLista, calcularAcertosPorArea, salvarResultadoLista } from "@/services/listaService";
import { QuestaoListaPlayer, ResultadoListaCalc } from "@/lib/listas-types";
import { EnviarErrosModal, QuestaoErrada } from "@/components/EnviarErrosModal";
import {
  ArrowLeft, ArrowRight, Bookmark, Check, Clock, Flag, Grid3X3, X,
  CheckCircle2, XCircle, MinusCircle, RotateCcw, ChevronLeft,
  Loader2, ListChecks,
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

export default function ListaPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAppUser();

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
  const [respostas, setRespostas] = useState<Record<number, string>>({});
  const [marcadas, setMarcadas] = useState<number[]>([]);
  const [tempoDecorrido, setTempoDecorrido] = useState(0);
  const [confirmar, setConfirmar] = useState(false);
  const [painel, setPainel] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoListaCalc | null>(null);

  const [errosParaEnviar, setErrosParaEnviar] = useState<QuestaoErrada[] | null>(null);
  const [mostrarModalErros, setMostrarModalErros] = useState(false);
  const [enviadosAoBanco, setEnviadosAoBanco] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

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
      } catch (err: any) {
        setError(err.message || "Erro ao carregar lista");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, user?.id]);

  useEffect(() => {
    if (fase !== "resolvendo" || !lista) return;
    timerRef.current = setInterval(() => {
      setTempoDecorrido(prev => prev + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fase, lista]);

  const responder = (numero: number, letra: string) => {
    setRespostas(prev => ({ ...prev, [numero]: letra }));
  };

  const toggleMarcar = (numero: number) => {
    setMarcadas(prev =>
      prev.includes(numero) ? prev.filter(n => n !== numero) : [...prev, numero]
    );
  };

  const montarErros = (): QuestaoErrada[] => {
    if (!lista) return [];
    const erros: QuestaoErrada[] = [];
    for (const q of lista.questoes) {
      const resp = respostas[q.numero];
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

    const areasMap: Record<number, string> = {};
    lista.questoes.forEach(q => {
      areasMap[q.numero] = q.area || "Não categorizada";
    });

    const result = calcularResultadoLista(lista.questoes, respostas);
    result.listaId = lista.id;
    result.tempoDecorrido = tempoDecorrido;

    const acertosPorArea = calcularAcertosPorArea(lista.questoes, respostas);

    setSalvando(true);
    const save = await salvarResultadoLista(
      lista.id,
      user.id,
      result,
      respostas,
      areasMap,
      acertosPorArea
    );
    setSalvando(false);

    if (!save.success) {
      alert("Erro ao salvar resultado: " + save.error);
      return;
    }

    const erros = montarErros();
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
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            Voltar
          </button>
        </div>
      </AppShell>
    );
  }

  const total = lista.questoes.length;

  if (fase === "resultado" && resultado) {
    const pct = resultado.porcentagem;

    return (
      <AppShell breadcrumb="Listas" title="Resultado da lista">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/simulados")}
            className="inline-flex items-center gap-1.5 text-xs text-foreground/50 hover:text-foreground"
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
            <p className="text-xs text-foreground/50">
              acertos · {pct}% de aproveitamento
            </p>
            <p className="mt-3 text-xs text-foreground/45">{lista.titulo}</p>
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

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setRespostas({});
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
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

  if (fase === "correcao") {
    const q = lista.questoes[idx];
    const resp = respostas[q.numero];
    const correta = getCorreta(q);
    const acertou = resp === correta;

    return (
      <AppShell breadcrumb="Listas" title={`Gabarito — Questão ${q.numero}`}>
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
              disabled={idx === total - 1}
              onClick={() => setIdx(i => Math.min(total - 1, i + 1))}
            >
              Próxima <ArrowRight className="h-3.5 w-3.5" />
            </NavBtn>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rf-card p-5 sm:p-6">
            {q.area && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {q.area}
              </span>
            )}
            <p className="mt-3 text-sm leading-relaxed text-foreground/85">
              <span className="font-display font-semibold">{q.numero}.</span> {q.enunciado}
            </p>

            {q.imagem_url && (
              <div className="mt-4">
                <img
                  src={q.imagem_url}
                  alt={`Imagem da questão ${q.numero}`}
                  className="max-h-80 rounded-lg border border-border"
                />
              </div>
            )}

            {q.tipo === "multipla_escolha" && q.alternativas && (
              <div className="mt-5 space-y-2">
                {q.alternativas.map(a => {
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
                            isCorreta ? "border-primary text-primary" :
                            isSua ? "border-accent text-accent" :
                            "border-border text-foreground/50",
                          ].join(" ")}
                        >
                          {a.letra}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs leading-relaxed text-foreground/80">{a.texto}</p>
                          <p className="mt-1 text-[11px] text-foreground/45">
                            <span className={isCorreta ? "font-semibold text-primary" : "font-semibold text-foreground/60"}>
                              {isCorreta ? "Correta" : "Incorreta"}
                            </span>
                            {a.comentario && ` — ${a.comentario}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {q.tipo === "certo_errado" && (
              <div className="mt-5 grid grid-cols-2 gap-3">
                {["C", "E"].map(letra => {
                  const isCorreta = letra === correta;
                  const isSua = resp === letra;
                  return (
                    <div
                      key={letra}
                      className={[
                        "rounded-xl border p-4 text-center",
                        isCorreta ? "border-primary/50 bg-primary/10" :
                        isSua ? "border-accent/50 bg-accent/10" :
                        "border-border bg-surface/40",
                      ].join(" ")}
                    >
                      <div className={[
                        "font-display text-sm font-semibold",
                        isCorreta ? "text-primary" : isSua ? "text-accent" : "text-foreground/60",
                      ].join(" ")}>
                        {letra === "C" ? "Certo" : "Errado"}
                      </div>
                      <div className="mt-1 text-[10px] text-foreground/45">
                        {isCorreta ? "Correta" : isSua ? "Sua resposta" : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rf-card p-5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/50">Sua resposta</span>
                <span className="font-display text-sm font-semibold">
                  {resp === "C" ? "Certo" : resp === "E" ? "Errado" : resp ?? "—"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-foreground/50">Resposta correta</span>
                <span className="font-display text-sm font-semibold text-primary">
                  {correta === "C" ? "Certo" : correta === "E" ? "Errado" : correta}
                </span>
              </div>
              <div
                className={[
                  "mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold",
                  !resp ? "bg-white/5 text-foreground/50" :
                  acertou ? "bg-primary/15 text-primary" :
                  "bg-accent/15 text-accent",
                ].join(" ")}
              >
                {!resp ? <MinusCircle className="h-3.5 w-3.5" /> :
                 acertou ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                 <XCircle className="h-3.5 w-3.5" />}
                {!resp ? "Não respondida" : acertou ? "Você acertou" : "Você errou"}
              </div>
            </div>

            {q.comentario_geral && (
              <div className="rf-card p-5">
                <h4 className="mb-2 font-display text-sm font-semibold">Comentário</h4>
                <p className="text-xs leading-relaxed text-foreground/60 whitespace-pre-wrap">
                  {q.comentario_geral}
                </p>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  const q = lista.questoes[idx];
  const selecionada = respostas[q.numero];
  const respondidas = Object.keys(respostas).length;
  const progressoPercentual = Math.round(((idx + 1) / total) * 100);

  return (
    <AppShell breadcrumb="Listas">
      <div className="rf-card mb-4 p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <button
              onClick={() => navigate("/simulados")}
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
          <div className="flex shrink-0 items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
              <Clock className="h-3.5 w-3.5 text-accent" />
              <span className="font-display text-xs font-semibold tabular-nums">
                {formatarTempo(tempoDecorrido)}
              </span>
            </div>
            <button
              onClick={() => setPainel(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface"
            >
              <Grid3X3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Questões</span>
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rf-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {q.area ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {q.area}
              </span>
            ) : <span />}
            <button
              onClick={() => toggleMarcar(q.numero)}
              className={[
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors",
                marcadas.includes(q.numero)
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-border bg-surface/60 text-foreground/60 hover:bg-surface",
              ].join(" ")}
            >
              <Bookmark className={["h-3.5 w-3.5", marcadas.includes(q.numero) ? "fill-current" : ""].join(" ")} />
              {marcadas.includes(q.numero) ? "Marcada" : "Marcar"}
            </button>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap">
            <span className="font-display font-semibold">{q.numero}.</span> {q.enunciado}
          </p>

          {q.imagem_url && (
            <div className="mt-4">
              <img
                src={q.imagem_url}
                alt={`Imagem da questão ${q.numero}`}
                className="max-h-80 rounded-lg border border-border"
              />
            </div>
          )}

          {q.tipo === "multipla_escolha" && q.alternativas && (
            <div className="mt-5 space-y-2">
              {q.alternativas.map(a => {
                const ativa = selecionada === a.letra;
                return (
                  <button
                    key={a.letra}
                    type="button"
                    onClick={() => responder(q.numero, a.letra)}
                    className={[
                      "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      ativa
                        ? "border-primary bg-primary/10"
                        : "border-border bg-surface/40 hover:bg-surface/70",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors",
                        ativa
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-foreground/55",
                      ].join(" ")}
                    >
                      {ativa ? <Check className="h-3.5 w-3.5" /> : a.letra}
                    </span>
                    <span className="min-w-0 text-xs leading-relaxed text-foreground/80">
                      {a.texto}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {q.tipo === "certo_errado" && (
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { letra: "C", label: "Certo" },
                { letra: "E", label: "Errado" },
              ].map(opt => {
                const ativa = selecionada === opt.letra;
                return (
                  <button
                    key={opt.letra}
                    type="button"
                    onClick={() => responder(q.numero, opt.letra)}
                    className={[
                      "rounded-xl border p-4 text-center transition-colors",
                      ativa
                        ? "border-primary bg-primary/10"
                        : "border-border bg-surface/40 hover:bg-surface/70",
                    ].join(" ")}
                  >
                    <div className={[
                      "font-display text-sm font-semibold",
                      ativa ? "text-primary" : "text-foreground/70",
                    ].join(" ")}>
                      {opt.label}
                    </div>
                    <div className="mt-1 text-[10px] text-foreground/40">
                      {ativa ? "Selecionado" : "Toque para escolher"}
                    </div>
                  </button>
                );
              })}
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
                <Flag className="h-3.5 w-3.5" /> Finalizar lista
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
              respostas={respostas}
              marcadas={marcadas}
              questoes={lista.questoes}
              onPick={(i) => setIdx(i)}
            />
            <button
              onClick={() => setConfirmar(true)}
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Flag className="h-3.5 w-3.5" /> Finalizar lista
            </button>
          </div>
        </aside>
      </div>

      {painel && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setPainel(false)}
        >
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface p-5"
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
              marcadas={marcadas}
              questoes={lista.questoes}
              onPick={(i) => { setIdx(i); setPainel(false); }}
            />
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
            <div className="mt-5 flex gap-2">
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
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
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
  total, atual, respostas, marcadas, questoes, onPick,
}: {
  total: number;
  atual: number;
  respostas: Record<number, string>;
  marcadas: number[];
  questoes: QuestaoListaPlayer[];
  onPick: (i: number) => void;
}) {
  return (
    <div>
      <h4 className="mb-3 font-display text-sm font-semibold">Painel de questões</h4>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
        {Array.from({ length: total }, (_, i) => {
          const q = questoes[i];
          const numero = q.numero;
          const respondida = !!respostas[numero];
          const marcada = marcadas.includes(numero);
          const isAtual = i === atual;
          return (
            <button
              key={q.id}
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
              {i + 1}
              {marcada && (
                <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
              )}
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
          className="stroke-primary"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
        />
      </svg>
      <div className="absolute grid place-items-center">
        <span className="font-display text-3xl font-semibold tabular-nums">{pct}%</span>
        <span className="text-[10px] uppercase tracking-widest text-foreground/40">aproveit.</span>
      </div>
    </div>
  );
}