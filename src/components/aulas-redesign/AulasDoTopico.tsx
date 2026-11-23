// src/components/aulas-redesign/AulasDoTopico.tsx
// Tela 2.5 — o que existe DENTRO de um tópico:
//   • tópico com subtópicos  -> cards dos subtópicos (cada um com % estudado); ao clicar, lista as aulas dele
//   • tópico sem subtópicos  -> lista as aulas direto
// Clicar numa aula abre a tela da aula (vídeo).
//
// Rotas (veja src/router.tsx):
//   /aulas/:disciplinaId/topico/:assuntoSlug
//   /aulas/:disciplinaId/topico/:assuntoSlug/:subSlug

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronRight,
  Heart,
  Layers,
  ListChecks,
  Loader2,
  Play,
  PlayCircle,
  X,
} from "lucide-react";
import type { AulaItem } from "../aulas/aulasArvore";
import { aulaEhNova, useAulasData } from "./AulasDataContext";
import { AulasRedesignStyles } from "./AulasRedesignStyles";
import { aulasDoTopico, resumirTopicos } from "./topicosUtils";

// ---------- Linha de uma aula (igual à que existia na lista antiga) ----------
function AulaLinha({
  aula,
  indice,
  grupo,
  disciplinaSlug,
}: {
  aula: AulaItem;
  indice: number;
  grupo: AulaItem[];
  disciplinaSlug: string;
}) {
  const { toggleConcluida, toggleFavorita, handleMover, offlineAulaIds, downloadProgress } = useAulasData();
  const ok = aula.concluida;
  const baixado = offlineAulaIds.has(aula.id);
  const dl = downloadProgress[aula.id];
  const baixando = dl?.phase === "downloading" || dl?.phase === "paused";

  return (
    <div
      className="rfx-card rfx-card-hover rfx-in group relative flex items-start gap-3 p-4 sm:gap-4 sm:p-5"
      style={{ animationDelay: `${Math.min(indice, 8) * 50}ms` }}
    >
      <Link
        to={`/aulas/${disciplinaSlug}/${aula.id}`}
        className="min-w-0 flex-1 after:absolute after:inset-0 after:content-['']"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-xl font-semibold text-foreground sm:text-2xl">{aula.titulo}</h3>
          {aulaEhNova(aula.created_at) && <span className="rfx-badge-novo">novo</span>}
        </div>
        <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground sm:line-clamp-none">{aula.descricao}</p>
        {!ok && aula.progresso > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div className="rfx-track h-1.5 w-28 overflow-hidden rounded-full">
              <div className="rfx-tone-bar h-full rounded-full" style={{ width: `${aula.progresso}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">{aula.progresso}% assistido</span>
          </div>
        )}
      </Link>

      <div className="relative z-10 flex shrink-0 flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={() => toggleConcluida(aula.id)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground sm:text-sm"
        >
          {ok ? "Estudei" : "Não estudei"}
          <span className="rfx-check" data-checked={ok}>
            {ok && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </span>
        </button>
        {baixado && <span className="rfx-badge-baixado">baixado</span>}
        {!baixado && baixando && <span className="rfx-badge-baixando">baixando {Math.round(dl.percent)}%</span>}
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => toggleFavorita(aula.id)}
            aria-label={aula.favorita ? "Desfavoritar" : "Favoritar"}
            title={aula.favorita ? "Desfavoritar" : "Favoritar"}
            className="rfx-iconbtn"
          >
            <Heart className={`h-3.5 w-3.5 ${aula.favorita ? "fill-rose-500 text-rose-500" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => handleMover(aula, grupo, -1)}
            disabled={indice === 0}
            aria-label="Mover para cima"
            title="Mover para cima"
            className="rfx-iconbtn"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleMover(aula, grupo, 1)}
            disabled={indice === grupo.length - 1}
            aria-label="Mover para baixo"
            title="Mover para baixo"
            className="rfx-iconbtn"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <ChevronRight className="mt-2 hidden h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 sm:block" />
    </div>
  );
}

// ---------- Linha de aula no modo "Escolher aulas" ----------
function AulaSelecionavel({
  aula,
  marcada,
  onToggle,
}: {
  aula: AulaItem;
  marcada: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={marcada}
      className="rfx-card rfx-card-hover flex w-full items-start gap-4 p-4 text-left sm:p-5"
      style={marcada ? { borderColor: "var(--primary)" } : undefined}
    >
      <span className="rfx-check mt-1 shrink-0" data-checked={marcada}>
        {marcada && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg font-semibold text-foreground sm:text-xl">{aula.titulo}</span>
          {aula.concluida && (
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
              estudada
            </span>
          )}
        </span>
        <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{aula.descricao}</span>
      </span>
    </button>
  );
}

function TituloSecao({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </h2>
      <span className="rfx-group-line" />
    </div>
  );
}

// ---------- Tela ----------
export function AulasDoTopico() {
  const { disciplinaId, assuntoSlug, subSlug } = useParams();
  const { loading, getDisciplina, iniciarPlaylist } = useAulasData();
  const navigate = useNavigate();

  // Modo "Escolher aulas": o aluno marca as aulas e toca só elas, como numa lista de reprodução.
  const [selecionando, setSelecionando] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelecionando(false);
    setSelecionadas(new Set());
  }, [disciplinaId, assuntoSlug, subSlug]);

  const disciplina = getDisciplina(disciplinaId);
  const topicos = useMemo(() => (disciplina ? resumirTopicos(disciplina.assuntos) : []), [disciplina]);
  const topico = topicos.find((t) => t.slug === assuntoSlug);
  const subtopico = subSlug ? topico?.subtopicos.find((s) => s.slug === subSlug) : undefined;

  if (loading) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Onde o botão "voltar" leva: de um subtópico volta ao tópico; do tópico volta à disciplina.
  const voltarPara = !disciplina
    ? { to: "/aulas", rotulo: "Todas as disciplinas" }
    : subSlug && topico
      ? { to: `/aulas/${disciplina.slug}/topico/${topico.slug}`, rotulo: topico.nome }
      : { to: `/aulas/${disciplina.slug}`, rotulo: disciplina.nome };

  const naoEncontrado = !disciplina || !topico || (subSlug !== undefined && !subtopico);
  if (naoEncontrado) {
    return (
      <div className="mx-auto w-full max-w-5xl py-2 sm:py-4">
        <AulasRedesignStyles />
        <Link
          to={voltarPara.to}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {voltarPara.rotulo}
        </Link>
        <p className="rfx-card p-6 text-sm text-muted-foreground">
          {subSlug ? "Subtópico não encontrado." : "Tópico não encontrado."}
        </p>
      </div>
    );
  }

  // O que este nível mostra:
  const aberto = subtopico ?? topico; // usado no cabeçalho (nome + progresso)
  const mostrarSubtopicos = !subtopico && topico.subtopicos.length > 0;
  const aulasDaTela: AulaItem[] = subtopico ? subtopico.aulas : topico.aulasSoltas;
  const eyebrow = subtopico ? `${disciplina.nome} · ${topico.nome}` : disciplina.nome;

  // Todas as aulas deste nível (do subtópico, ou do tópico inteiro incluindo os subtópicos).
  const escopo: AulaItem[] = subtopico ? subtopico.aulas : aulasDoTopico(topico);
  const gruposSelecao: { titulo: string | null; aulas: AulaItem[] }[] = subtopico
    ? [{ titulo: null, aulas: subtopico.aulas }]
    : [
        ...(topico.aulasSoltas.length > 0
          ? [{ titulo: topico.subtopicos.length > 0 ? "Aulas sem subtópico" : null, aulas: topico.aulasSoltas }]
          : []),
        ...topico.subtopicos.map((s) => ({ titulo: s.nome, aulas: s.aulas })),
      ];

  const tocarLista = (aulas: AulaItem[], nome: string) => {
    if (aulas.length === 0) return;
    iniciarPlaylist({ nome, ids: aulas.map((a) => a.id) });
    navigate(`/aulas/${disciplina.slug}/${aulas[0].id}`, { state: { autoplay: true } });
  };
  const escolhidas = escopo.filter((a) => selecionadas.has(a.id)); // mantém a ordem do tópico
  const alternar = (id: string) =>
    setSelecionadas((prev) => {
      const prox = new Set(prev);
      if (prox.has(id)) prox.delete(id);
      else prox.add(id);
      return prox;
    });

  return (
    <div className="mx-auto w-full max-w-5xl py-2 sm:py-4" data-tone={disciplina.tone}>
      <AulasRedesignStyles />
      <Link
        to={voltarPara.to}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {voltarPara.rotulo}
      </Link>

      <header className="rfx-card mb-6 p-5 sm:mb-8 sm:p-6">
        <p className="rfx-tone-text text-sm font-semibold uppercase tracking-widest">{eyebrow}</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-foreground sm:text-3xl">{aberto.nome}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {aberto.total} {aberto.total === 1 ? "aula" : "aulas"} · {aberto.concluidas} de {aberto.total} estudadas
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="rfx-track h-2.5 flex-1 overflow-hidden rounded-full">
            <div className="rfx-progress h-full rounded-full" style={{ width: `${aberto.percentual}%` }} />
          </div>
          <span className="shrink-0 text-xs font-bold text-foreground sm:text-sm">
            {aberto.percentual}% estudado
          </span>
        </div>

        {escopo.length > 0 && !selecionando && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => tocarLista(escopo, aberto.nome)}
              className="btn-sun inline-flex items-center gap-2 px-5 py-2.5 text-sm"
            >
              <Play className="h-4 w-4" /> Reproduzir tudo
            </button>
            <button
              type="button"
              onClick={() => setSelecionando(true)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-2"
            >
              <ListChecks className="h-4 w-4 text-primary" /> Escolher aulas
            </button>
          </div>
        )}

        {selecionando && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-semibold text-foreground">
              {escolhidas.length} {escolhidas.length === 1 ? "aula escolhida" : "aulas escolhidas"}
            </span>
            <button
              type="button"
              onClick={() => setSelecionadas(new Set(escopo.map((a) => a.id)))}
              className="rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground hover:bg-surface-2"
            >
              Selecionar todas
            </button>
            <button
              type="button"
              onClick={() => setSelecionadas(new Set())}
              disabled={escolhidas.length === 0}
              className="rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-40"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => tocarLista(escolhidas, `${aberto.nome} (minha lista)`)}
              disabled={escolhidas.length === 0}
              className="btn-sun inline-flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-40"
            >
              <Play className="h-4 w-4" /> Reproduzir lista
            </button>
            <button
              type="button"
              onClick={() => {
                setSelecionando(false);
                setSelecionadas(new Set());
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Cancelar
            </button>
          </div>
        )}
      </header>

      {selecionando ? (
        <div className="space-y-8">
          {gruposSelecao.map((g, gi) => (
            <section key={g.titulo ?? `grupo-${gi}`}>
              {g.titulo && <TituloSecao>{g.titulo}</TituloSecao>}
              <div className="space-y-3">
                {g.aulas.map((a) => (
                  <AulaSelecionavel
                    key={a.id}
                    aula={a}
                    marcada={selecionadas.has(a.id)}
                    onToggle={() => alternar(a.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
      <div className="space-y-8">
        {mostrarSubtopicos && (
          <section>
            <TituloSecao>Subtópicos</TituloSecao>
            <div className="space-y-3">
              {topico.subtopicos.map((s, i) => (
                <Link
                  key={s.slug}
                  to={`/aulas/${disciplina.slug}/topico/${topico.slug}/${s.slug}`}
                  className="rfx-card rfx-card-hover rfx-in group flex items-center gap-4 p-4 sm:p-5"
                  style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                >
                  <span className="rfx-tone-icon hidden h-12 w-12 shrink-0 place-items-center rounded-2xl sm:grid">
                    <Layers className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg font-semibold text-foreground sm:text-xl">{s.nome}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <PlayCircle className="h-3.5 w-3.5" />
                        {s.total} {s.total === 1 ? "aula" : "aulas"}
                      </span>
                      <span>
                        {s.concluidas} de {s.total} estudadas
                      </span>
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="rfx-track h-2 flex-1 overflow-hidden rounded-full">
                        <div className="rfx-tone-bar h-full rounded-full" style={{ width: `${s.percentual}%` }} />
                      </div>
                      <span className="rfx-tone-text w-10 shrink-0 text-right text-xs font-bold sm:text-sm">
                        {s.percentual}%
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {aulasDaTela.length > 0 && (
          <section>
            {/* Só rotula a seção quando ela divide a tela com os subtópicos. */}
            {mostrarSubtopicos && <TituloSecao>Outras aulas deste tópico</TituloSecao>}
            <div className="space-y-3">
              {aulasDaTela.map((a, i) => (
                <AulaLinha key={a.id} aula={a} indice={i} grupo={aulasDaTela} disciplinaSlug={disciplina.slug} />
              ))}
            </div>
          </section>
        )}

        {!mostrarSubtopicos && aulasDaTela.length === 0 && (
          <p className="rfx-card p-6 text-sm text-muted-foreground">Nenhuma aula neste tópico ainda.</p>
        )}
      </div>
      )}
    </div>
  );
}
