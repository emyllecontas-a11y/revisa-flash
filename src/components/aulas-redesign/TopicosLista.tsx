// src/components/aulas-redesign/TopicosLista.tsx
// Tela 2 — TÓPICOS de UMA disciplina, cada um com sua barra de progresso.
// Clicar num tópico abre a tela 2.5 (AulasDoTopico): subtópicos ou aulas.

import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, FolderOpen, Layers, Loader2, PlayCircle } from "lucide-react";
import { useAulasData } from "./AulasDataContext";
import { AulasRedesignStyles } from "./AulasRedesignStyles";
import { resumirTopicos } from "./topicosUtils";

export function TopicosLista() {
  const { disciplinaId } = useParams();
  const { loading, getDisciplina } = useAulasData();

  const disciplina = getDisciplina(disciplinaId);
  const topicos = useMemo(() => (disciplina ? resumirTopicos(disciplina.assuntos) : []), [disciplina]);

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
          {" · "}
          {topicos.length} {topicos.length === 1 ? "tópico" : "tópicos"}
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

      <div className="mb-3 flex items-center gap-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Tópicos
        </h2>
        <span className="rfx-group-line" />
      </div>

      <div className="space-y-3">
        {topicos.map((t, i) => (
          <Link
            key={t.slug}
            to={`/aulas/${disciplina.slug}/topico/${t.slug}`}
            className="rfx-card rfx-card-hover rfx-in group flex items-center gap-4 p-4 sm:p-5"
            style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
          >
            <span className="rfx-tone-icon hidden h-12 w-12 shrink-0 place-items-center rounded-2xl sm:grid">
              <FolderOpen className="h-6 w-6" />
            </span>

            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-semibold text-foreground sm:text-xl">{t.nome}</h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-1">
                  <PlayCircle className="h-3.5 w-3.5" />
                  {t.total} {t.total === 1 ? "aula" : "aulas"}
                </span>
                {t.subtopicos.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" />
                    {t.subtopicos.length} {t.subtopicos.length === 1 ? "subtópico" : "subtópicos"}
                  </span>
                )}
                <span>
                  {t.concluidas} de {t.total} estudadas
                </span>
              </p>
              <div className="mt-3 flex items-center gap-3">
                <div className="rfx-track h-2 flex-1 overflow-hidden rounded-full">
                  <div className="rfx-tone-bar h-full rounded-full" style={{ width: `${t.percentual}%` }} />
                </div>
                <span className="rfx-tone-text w-10 shrink-0 text-right text-xs font-bold sm:text-sm">
                  {t.percentual}%
                </span>
              </div>
            </div>

            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </Link>
        ))}
      </div>
    </div>
  );
}
