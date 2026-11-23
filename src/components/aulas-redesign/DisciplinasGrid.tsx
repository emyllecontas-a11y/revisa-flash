// src/components/aulas-redesign/DisciplinasGrid.tsx
// Tela 1 — lista de disciplinas. Cada card leva para os tópicos da disciplina.

import { Link } from "react-router-dom";
import { BookOpen, CheckCircle2, ChevronRight, HardDrive, PlayCircle } from "lucide-react";
import { useAulasData } from "./AulasDataContext";
import { AulasRedesignStyles } from "./AulasRedesignStyles";

export function DisciplinasGrid() {
  const { disciplinas, totalAulas, setVideosOfflineAberto } = useAulasData();

  return (
    <div className="mx-auto w-full max-w-6xl py-2 sm:py-4">
      <AulasRedesignStyles />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Minhas aulas</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-foreground sm:text-4xl">
            Escolha uma disciplina
          </h1>
          <p className="mt-2 text-muted-foreground">
            Entre em uma disciplina para ver os tópicos e assistir às aulas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVideosOfflineAberto(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-surface-2"
          title="Gerenciar vídeos offline"
        >
          <HardDrive className="h-3.5 w-3.5 text-primary" />
          Vídeos offline
        </button>
      </header>

      {totalAulas === 0 ? (
        <p className="rfx-card p-6 text-sm text-muted-foreground">Nenhuma aula cadastrada ainda.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {disciplinas.map((d, i) => (
            <Link
              key={d.slug}
              to={`/aulas/${d.slug}`}
              data-tone={d.tone}
              className="rfx-card rfx-card-hover rfx-in group flex flex-col gap-5 p-5"
              style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="rfx-tone-icon grid h-12 w-12 place-items-center rounded-2xl">
                  <BookOpen className="h-6 w-6" />
                </span>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">{d.nome}</h2>
                <p className="text-sm text-muted-foreground">
                  {d.assuntos.length} {d.assuntos.length === 1 ? "assunto" : "assuntos"}
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-1">
                  <PlayCircle className="h-3.5 w-3.5" />
                  {d.totalAulas} {d.totalAulas === 1 ? "aula" : "aulas"}
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {d.totalConcluidas} {d.totalConcluidas === 1 ? "estudada" : "estudadas"}
                </span>
              </div>
              <div>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="rfx-tone-text font-bold">{d.progresso}%</span>
                </div>
                <div className="rfx-track h-2 overflow-hidden rounded-full">
                  <div className="rfx-tone-bar h-full rounded-full" style={{ width: `${d.progresso}%` }} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
