import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Loader2, CheckCircle2, XCircle, MinusCircle, RotateCcw, BarChart3, Pencil, Trash2, Play, Share2 } from "lucide-react";
import { QuestaoCard, type AlternativaView } from "@/components/QuestaoCard";
import { getQuestoesDoCaderno, getUltimoResultadoCaderno, getTentativasDoCaderno } from "@/services/cadernoService";
import { getAnotacoesDeQuestoes, criarAnotacao, removerAnotacao, trocarCorAnotacao } from "@/services/anotacaoQuestaoService";
import type { AnotacaoQuestao, CampoAlvo, CorGrifo, RectGrifo } from "@/lib/anotacoes-types";
import { useToast } from "@/hooks/useToast";
import { useConfirm } from "@/components/ConfirmDialog";
import { CadernoDetalhesModal } from "./CadernoDetalhesModal";
import { RelatorioDesempenhoModal } from "./RelatorioDesempenhoModal";
import { CompartilharCadernoModal } from "./CompartilharCadernoModal";
import { PlayerLivreModal } from "./PlayerLivreModal";
import type { Caderno } from "@/services/cadernoService";
import type { CadernoResultado, CadernoTentativa } from "@/services/cadernoService";
import type { QuestaoBanco } from "@/services/bancoQuestoesService";

type Fase = "resumo" | "lista" | "gabarito";

function stripHtml(html: string) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || "";
}

function getTipoQuestao(q: QuestaoBanco): 'multipla_escolha' | 'certo_errado' {
  if (q.tipo_questao === 'certo_errado') return 'certo_errado';
  return 'multipla_escolha';
}

function getCorreta(q: QuestaoBanco): string | null {
  if (getTipoQuestao(q) === 'multipla_escolha') return q.gabarito_letra?.toUpperCase() || null;
  return q.gabarito_ce === true ? 'C' : q.gabarito_ce === false ? 'E' : null;
}

function getAlternativasView(q: QuestaoBanco): AlternativaView[] {
  if (getTipoQuestao(q) === 'certo_errado') {
    return [{ letra: 'C', texto: 'Certo' }, { letra: 'E', texto: 'Errado' }];
  }
  return (q.alternativas || []).map((a: { letra: string; texto: string; sublinhados?: any; negritos?: any; italicos?: any }) => ({
    letra: a.letra.toUpperCase(),
    texto: a.texto,
    sublinhados: a.sublinhados,
    negritos: a.negritos,
    italicos: a.italicos
  }));
}

function formatarTempo(segundos: number): string {
  const mins = Math.floor(segundos / 60);
  const secs = segundos % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

interface Props {
  caderno: Caderno;
  userId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function CadernoRevisao({ caderno, userId, onClose, onUpdate }: Props) {
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [fase, setFase] = useState<Fase>("resumo");
  const [idxQuestao, setIdxQuestao] = useState(0);
  const [loading, setLoading] = useState(true);
  const [questoes, setQuestoes] = useState<QuestaoBanco[]>([]);
  const [resultado, setResultado] = useState<CadernoResultado | undefined>(undefined);
  const [tentativas, setTentativas] = useState<CadernoTentativa[]>([]);
  const [praticando, setPraticando] = useState(false);
  const [modalRelatorio, setModalRelatorio] = useState(false);
  const [modalCompartilhar, setModalCompartilhar] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);

  const [anotacoes, setAnotacoes] = useState<Map<string, AnotacaoQuestao[]>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resQ, resR, resT] = await Promise.all([
        getQuestoesDoCaderno(caderno.id),
        getUltimoResultadoCaderno(caderno.id, userId),
        getTentativasDoCaderno(caderno.id, userId),
      ]);
      if (resQ.success && resQ.data) setQuestoes(resQ.data);
      if (resR.success && resR.data) setResultado(resR.data);
      if (resT.success && resT.data) setTentativas(resT.data);

      // Carregar grifos
      const ids = (resQ.data || []).map(q => q.id);
      if (ids.length > 0) {
        getAnotacoesDeQuestoes(userId, 'caderno', ids).then(setAnotacoes).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, [caderno.id, userId]);

  useEffect(() => { load(); }, [load]);

  const handleGrifar = useCallback(async (campo: CampoAlvo, cor: CorGrifo, texto: string, rects: RectGrifo[], questaoId: string) => {
    const nova = await criarAnotacao(userId, 'caderno', questaoId, campo, cor, texto, rects);
    if (!nova) return;
    setAnotacoes(prev => {
      const next = new Map(prev);
      const atual = next.get(questaoId) ?? [];
      next.set(questaoId, [...atual, nova]);
      return next;
    });
  }, [userId]);

  const handleRemoverGrifo = useCallback(async (anotacaoId: string) => {
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
  }, []);

  const handleTrocarCorGrifo = useCallback(async (anotacaoId: string, cor: CorGrifo) => {
    const ok = await trocarCorAnotacao(anotacaoId, cor);
    if (!ok) return;
    setAnotacoes(prev => {
      const next = new Map(prev);
      for (const [qid, lista] of next.entries()) {
        next.set(qid, lista.map(a => a.id === anotacaoId ? { ...a, cor } : a));
      }
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Estado vazio - nunca praticou
  if (!resultado) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-background">
        <div className="shrink-0 bg-surface/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
          <button onClick={onClose} className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/60 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <h1 className="font-display text-lg font-bold">{caderno.nome}</h1>
          <div className="w-20" />
        </div>

        <div className="flex-1 overflow-y-auto flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="mx-auto mb-4 rounded-full bg-primary/10 p-4">
              <BookOpen className="h-10 w-10 text-primary mx-auto" />
            </div>
            <h2 className="font-display text-xl font-bold">Você ainda não praticou este caderno</h2>
            <p className="mt-2 text-sm text-foreground/50">Comece uma sessão para ver seu desempenho aqui.</p>
            <button
              onClick={() => setPraticando(true)}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
              <Play className="h-4 w-4" /> Praticar agora
            </button>
          </div>
        </div>

        {praticando && (
          <PlayerLivreModal
            userId={userId}
            questoes={questoes}
            onClose={() => { setPraticando(false); load(); }}
          />
        )}
      </div>
    );
  }

  const total = questoes.length;
  const acertos = resultado.acertos;
  const erros = resultado.erros;
  const naoRespondidas = resultado.nao_respondidas;
  const pct = resultado.porcentagem;
  const tempoExibido = resultado.tempo_segundos;
  const respostasSalvas = resultado.respostas || {};

  const qAtual = fase === "gabarito" ? questoes[idxQuestao] : null;
  const respAtual = qAtual ? respostasSalvas[qAtual.numero ?? 0] : null;
  const corretaAtual = qAtual ? getCorreta(qAtual) : null;
  const acertouAtual = qAtual && respAtual && corretaAtual ? respAtual.toUpperCase() === corretaAtual.toUpperCase() : false;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 bg-surface/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
        <button onClick={onClose} className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/60 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <h1 className="font-display text-lg font-bold truncate max-w-[300px]">{caderno.nome}</h1>
        <div className="flex items-center gap-2">
          {fase !== "resumo" && (
            <button onClick={() => setFase("resumo")} className="px-3 py-1.5 text-xs font-medium rounded-full bg-surface text-foreground/70 hover:bg-surface-2">
              Resumo
            </button>
          )}
          {fase !== "lista" && total > 0 && (
            <button onClick={() => { setFase("lista"); setIdxQuestao(0); }} className="px-3 py-1.5 text-xs font-medium rounded-full bg-surface text-foreground/70 hover:bg-surface-2">
              Questões
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ===== FASE 1: RESUMO ===== */}
        {fase === "resumo" && (
          <div className="p-4 sm:p-6 max-w-3xl mx-auto">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="64" cy="64" r="58"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-muted"
                  />
                  <circle
                    cx="64" cy="64" r="58"
                    stroke="url(#grad)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={`${(pct / 100) * 364.4} 364.4`}
                    className="text-primary"
                  />
                  <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="currentColor" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0.3" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="font-display text-3xl font-bold tabular-nums">{acertos} / {total}</div>
                    <div className="text-xs text-muted-foreground">{pct}% de aproveitamento</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
              <StatCard label="Acertos" value={acertos} tone="ok" icon={CheckCircle2} />
              <StatCard label="Erros" value={erros} tone="bad" icon={XCircle} />
              <StatCard label="Não respondidas" value={naoRespondidas} icon={MinusCircle} />
              <StatCard label="Tempo" value={formatarTempo(tempoExibido)} icon={RotateCcw} />
            </div>

            <div className="rf-card p-4 mb-6">
              <h3 className="mb-3 font-display text-sm font-semibold">Últimas tentativas</h3>
              {tentativas.length === 0 ? (
                <p className="text-sm text-foreground/50">Nenhuma tentativa registrada.</p>
              ) : (
                <ul className="space-y-2 max-h-60 overflow-y-auto">
                  {tentativas.slice(0, 10).map((t, i) => (
                    <li key={t.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-foreground/40">#{i + 1}</span>
                        <div>
                          <div className="text-sm font-medium">{t.acertos} / {total} · {t.porcentagem}%</div>
                          <div className="text-[11px] text-foreground/50">{new Date(t.created_at).toLocaleDateString('pt-BR')}</div>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        t.porcentagem >= 70 ? "bg-green-500/15 text-green-500" :
                        t.porcentagem >= 50 ? "bg-warning/15 text-warning" : "bg-accent/15 text-accent"
                      }`}>
                        {t.porcentagem}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => setPraticando(true)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
              >
                <Play className="h-4 w-4" /> Praticar Caderno
              </button>
              <button
                onClick={() => setModalEditar(true)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-6 py-3 text-sm font-bold text-foreground hover:bg-surface-2"
              >
                <Pencil className="h-4 w-4" /> Editar
              </button>
              <button
                onClick={() => setModalRelatorio(true)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground/70 hover:bg-surface-2"
              >
                <BarChart3 className="h-4 w-4" /> Estatísticas
              </button>
              <button
                onClick={() => setModalCompartilhar(true)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground/70 hover:bg-surface-2"
              >
                <Share2 className="h-4 w-4" /> Compartilhar
              </button>
            </div>
          </div>
        )}

        {/* ===== FASE 2: LISTA DE QUESTÕES ===== */}
        {fase === "lista" && (
          <div className="p-4 sm:p-6 max-w-3xl mx-auto">
            <div className="mb-4 rf-card p-4">
              <h3 className="mb-3 font-display text-sm font-semibold">Questões do caderno</h3>
              <div className="max-h-[500px] space-y-1.5 overflow-y-auto pr-1">
                {questoes.map((q, i) => {
                  const qNum = q.numero ?? 0;
                  const resp = respostasSalvas[qNum];
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
                      onClick={() => { setIdxQuestao(i); setFase("gabarito"); }}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-surface/40 px-3 py-2 text-left transition-colors hover:bg-surface"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium">Questão {qNum}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{q.disciplina || q.area || ""}</div>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pillCls}`}>
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
        )}

        {/* ===== FASE 3: GABARITO COMENTADO ===== */}
        {fase === "gabarito" && qAtual && (
          <div className="max-w-3xl mx-auto p-4 sm:p-6 pb-20">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <button onClick={() => setFase("lista")} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface">
                <ChevronLeft className="h-3.5 w-3.5" /> Voltar à lista
              </button>
              <div className="text-sm font-semibold">{(qAtual.numero ?? 0)} de {total}</div>
              <div className="flex gap-2">
                <button onClick={() => { if (idxQuestao > 0) setIdxQuestao(idxQuestao - 1); }} disabled={idxQuestao === 0} className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2 disabled:opacity-30">
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </button>
                <button onClick={() => { if (idxQuestao < total - 1) setIdxQuestao(idxQuestao + 1); }} disabled={idxQuestao >= total - 1} className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2 disabled:opacity-30">
                  Próxima <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <QuestaoCard
              numero={qAtual.numero ?? 0}
              total={total}
              ano={qAtual.ano}
              area={qAtual.disciplina}
              instituicao={qAtual.banca}
              enunciado={qAtual.enunciado}
              imagens={qAtual.imagem_url ? [qAtual.imagem_url] : []}
              tipo={getTipoQuestao(qAtual)}
              alternativas={getAlternativasView(qAtual)}
              selecionada={respAtual}
              eliminadas={[]}
              correta={corretaAtual}
              comentario={qAtual.comentario}
              revelar={true}
              permitirEliminar={false}
              onSelecionar={() => {}}
              questaoId={qAtual.id}
              anotacoes={anotacoes.get(qAtual.id) ?? []}
              onGrifar={(campo, cor, texto, rects) => handleGrifar(campo, cor, texto, rects, qAtual.id)}
              onRemoverGrifo={handleRemoverGrifo}
              onTrocarCorGrifo={handleTrocarCorGrifo}
              grifarAtivo={true}
            />
          </div>
        )}

      </div>

      {/* Modals */}
      {praticando && (
        <PlayerLivreModal
          userId={userId}
          questoes={questoes}
          onClose={() => { setPraticando(false); load(); }}
        />
      )}

      {modalEditar && (
        <CadernoDetalhesModal
          caderno={caderno}
          userId={userId}
          onClose={() => { setModalEditar(false); load(); onUpdate(); }}
          onUpdate={() => { load(); onUpdate(); }}
        />
      )}

      {modalRelatorio && (
        <RelatorioDesempenhoModal
          userId={userId}
          cadernoId={caderno.id}
          titulo={caderno.nome}
          onClose={() => setModalRelatorio(false)}
        />
      )}

      {modalCompartilhar && (
        <CompartilharCadernoModal
          open={modalCompartilhar}
          onClose={() => setModalCompartilhar(false)}
          userId={userId}
          cadernoId={caderno.id}
          cadernoNome={caderno.nome}
          onChanged={() => toast.success("Compartilhamento atualizado")}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone, icon: Icon }: { label: string; value: number | string; tone?: "ok" | "bad"; icon: React.ComponentType<{ className?: string }> }) {
  const toneClass = tone === "ok" ? "text-green-500" : tone === "bad" ? "text-accent" : "";
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-4 text-center">
      <Icon className={`h-5 w-5 mx-auto mb-1 ${toneClass}`} />
      <div className="font-display text-xl font-bold tabular-nums {toneClass}">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}