// src/components/aulas-redesign/TopicosLista.tsx
// Tela 2 — assuntos e aulas de UMA disciplina.

import { Link, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, Heart, Loader2 } from "lucide-react";
import type { AulaItem } from "../aulas/aulasArvore";
import { aulaEhNova, useAulasData } from "./AulasDataContext";
import { AulasRedesignStyles } from "./AulasRedesignStyles";

export function TopicosLista() {
  const { disciplinaId } = useParams();
  const {
    loading,
    getDisciplina,
    toggleConcluida,
    toggleFavorita,
    handleMover,
    offlineAulaIds,
    downloadProgress,
  } = useAulasData();

  const disciplina = getDisciplina(disciplinaId);

  if (loading) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!disciplina) {
    return (
      <div className="mx-auto w-full max-w-5xl py-2 sm:py-4">
        <AulasRedesignStyles />
        <Link to="/aulas" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Todas as disciplinas
        </Link>
        <p className="rfx-card p-6 text-sm text-muted-foreground">Disciplina não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl py-2 sm:py-4" data-tone={disciplina.tone}>
      <AulasRedesignStyles />
      <Link
        to="/aulas"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Todas as disciplinas
      </Link>

      <header className="rfx-card mb-6 p-5 sm:mb-8 sm:p-6">
        <p className="rfx-tone-text text-sm font-semibold uppercase tracking-widest">
          {disciplina.totalAulas} {disciplina.totalAulas === 1 ? "aula" : "aulas"}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-foreground sm:text-3xl">{disciplina.nome}</h1>
        <div className="mt-5 flex items-center gap-4">
          <div className="rfx-track h-2.5 flex-1 overflow-hidden rounded-full">
            <div className="rfx-progress h-full rounded-full" style={{ width: `${disciplina.progresso}%` }} />
          </div>
          <span className="shrink-0 text-xs font-bold text-foreground sm:text-sm">
            {disciplina.progresso}% estudado
          </span>
        </div>
      </header>

      <div className="space-y-8">
        {disciplina.assuntos.map((assunto) => {
          // Cada grupo (sem subassunto, ou um subassunto) é reordenado separadamente.
          const grupos: AulaItem[][] = [
            assunto.semSubassunto,
            ...assunto.subassuntos.map((s) => s.aulas),
          ].filter((g) => g.length > 0);

          return (
            <section key={assunto.nome}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {assunto.nome}
                </h2>
                <span className="rfx-group-line" />
              </div>
              <div className="space-y-3">
                {grupos.flatMap((grupo) =>
                  grupo.map((a, i) => {
                    const ok = a.concluida;
                    const baixado = offlineAulaIds.has(a.id);
                    const dl = downloadProgress[a.id];
                    const baixando = dl?.phase === "downloading" || dl?.phase === "paused";
                    return (
                      <div
                        key={a.id}
                        className="rfx-card rfx-card-hover rfx-in group relative flex items-start gap-3 p-4 sm:gap-4 sm:p-5"
                        style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                      >
                        <Link
                          to={`/aulas/${disciplina.slug}/${a.id}`}
                          className="min-w-0 flex-1 after:absolute after:inset-0 after:content-['']"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
                              {a.titulo}
                            </h3>
                            {a.subassunto && (
                              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                                {a.subassunto}
                              </span>
                            )}
                            {aulaEhNova(a.created_at) && <span className="rfx-badge-novo">novo</span>}
                          </div>
                          <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground sm:line-clamp-none">
                            {a.descricao}
                          </p>
                          {!ok && a.progresso > 0 && (
                            <div className="mt-3 flex items-center gap-2">
                              <div className="rfx-track h-1.5 w-28 overflow-hidden rounded-full">
                                <div className="rfx-tone-bar h-full rounded-full" style={{ width: `${a.progresso}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground">{a.progresso}% assistido</span>
                            </div>
                          )}
                        </Link>

                        <div className="relative z-10 flex shrink-0 flex-col items-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleConcluida(a.id)}
                            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground sm:text-sm"
                          >
                            {ok ? "Estudei" : "Não estudei"}
                            <span className="rfx-check" data-checked={ok}>
                              {ok && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                            </span>
                          </button>
                          {baixado && <span className="rfx-badge-baixado">baixado</span>}
                          {!baixado && baixando && (
                            <span className="rfx-badge-baixando">baixando {Math.round(dl.percent)}%</span>
                          )}
                          <div className="mt-1 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleFavorita(a.id)}
                              aria-label={a.favorita ? "Desfavoritar" : "Favoritar"}
                              title={a.favorita ? "Desfavoritar" : "Favoritar"}
                              className="rfx-iconbtn"
                            >
                              <Heart className={`h-3.5 w-3.5 ${a.favorita ? "fill-rose-500 text-rose-500" : ""}`} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMover(a, grupo, -1)}
                              disabled={i === 0}
                              aria-label="Mover para cima"
                              title="Mover para cima"
                              className="rfx-iconbtn"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMover(a, grupo, 1)}
                              disabled={i === grupo.length - 1}
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
                  }),
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
