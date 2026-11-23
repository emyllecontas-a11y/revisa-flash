import { Link } from "@tanstack/react-router";
import { BookOpen, ChevronRight, PlayCircle } from "lucide-react";
import { DISCIPLINAS, progresso } from "./mock-data";
import { AulasRedesignStyles } from "./AulasRedesignStyles";

/** Tela 1 — lista de disciplinas. Cada card leva para os tópicos da disciplina. */
export function DisciplinasGrid() {
  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-6 sm:py-8 sm:px-6">
      <AulasRedesignStyles />
      <header className="mb-6 sm:mb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Minhas aulas</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-foreground sm:text-4xl">Escolha uma disciplina</h1>
        <p className="mt-2 text-muted-foreground">Entre em uma disciplina para ver os tópicos e assistir às aulas.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DISCIPLINAS.map((d, i) => {
          const p = progresso(d);
          const videos = d.aulas.reduce((n, a) => n + a.videos.length, 0);
          return (
            <Link
              key={d.id}
              to="/aulas/$disciplinaId"
              params={{ disciplinaId: d.id }}
              data-tone={d.tone}
              className="rfx-card rfx-card-hover rfx-in group flex flex-col gap-5 p-5"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="rfx-tone-icon grid h-12 w-12 place-items-center rounded-2xl">
                  <BookOpen className="h-6 w-6" />
                </span>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">{d.nome}</h2>
                <p className="text-sm text-muted-foreground">{d.professor}</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                <span>{d.aulas.length} aulas</span>
                <span className="flex items-center gap-1"><PlayCircle className="h-3.5 w-3.5" />{videos} vídeos</span>
              </div>
              <div>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="rfx-tone-text font-bold">{p}%</span>
                </div>
                <div className="rfx-track h-2 overflow-hidden rounded-full">
                  <div className="rfx-tone-bar h-full rounded-full" style={{ width: `${p}%` }} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
