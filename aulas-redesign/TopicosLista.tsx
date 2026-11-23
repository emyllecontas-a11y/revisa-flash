import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { progresso, type AulaMock, type DisciplinaMock } from "./mock-data";
import { AulasRedesignStyles } from "./AulasRedesignStyles";

/** Tela 2 — tópicos/subtópicos de UMA disciplina (estilo do card "Aula 00"). */
export function TopicosLista({ disciplina }: { disciplina: DisciplinaMock }) {
  // Estado só visual. No app real: vem do banco (ver PROMPT_FUNCIONAL.md).
  const [estudadas, setEstudadas] = useState<Record<string, boolean>>(
    Object.fromEntries(disciplina.aulas.map((a) => [a.id, a.estudada])),
  );

  const grupos = disciplina.aulas.reduce<Record<string, AulaMock[]>>((acc, a) => {
    (acc[a.assunto] ??= []).push(a);
    return acc;
  }, {});
  const p = progresso({ ...disciplina, aulas: disciplina.aulas.map((a) => ({ ...a, estudada: !!estudadas[a.id] })) });

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 sm:py-8 sm:px-6" data-tone={disciplina.tone}>
      <AulasRedesignStyles />
      <Link to="/aulas" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Todas as disciplinas
      </Link>

      <header className="rfx-card mb-6 p-5 sm:mb-8 sm:p-6">
        <p className="rfx-tone-text text-sm font-semibold uppercase tracking-widest">{disciplina.professor}</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-foreground sm:text-3xl">{disciplina.nome}</h1>
        <div className="mt-5 flex items-center gap-4">
          <div className="rfx-track h-2.5 flex-1 overflow-hidden rounded-full">
            <div className="rfx-progress h-full rounded-full" style={{ width: `${p}%` }} />
          </div>
          <span className="shrink-0 text-xs font-bold text-foreground sm:text-sm">{p}% estudado</span>
        </div>
      </header>

      <div className="space-y-8">
        {Object.entries(grupos).map(([assunto, aulas]) => (
          <section key={assunto}>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">{assunto}</h2>
              <span className="rfx-group-line" />
            </div>
            <div className="space-y-3">
              {aulas.map((a, i) => {
                const ok = !!estudadas[a.id];
                return (
                  <div key={a.id} className="rfx-card rfx-card-hover rfx-in group relative flex items-start gap-3 p-4 sm:gap-4 sm:p-5" style={{ animationDelay: `${i * 50}ms` }}>
                    <Link to="/aulas/$disciplinaId/$aulaId" params={{ disciplinaId: disciplina.id, aulaId: a.id }} className="min-w-0 flex-1 after:absolute after:inset-0 after:content-['']">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-xl font-semibold text-foreground sm:text-2xl">{a.titulo}</h3>
                        {a.subassunto && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">{a.subassunto}</span>}
                      </div>
                      <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground sm:line-clamp-none">{a.descricao}</p>
                    </Link>
                    <div className="relative z-10 flex shrink-0 flex-col items-end gap-1.5">
                      <button type="button" onClick={() => setEstudadas((s) => ({ ...s, [a.id]: !ok }))} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground sm:text-sm">
                        {ok ? "Estudei" : "Não estudei"}
                        <span className="rfx-check" data-checked={ok}>{ok && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
                      </button>
                      {a.baixada && <span className="rfx-badge-baixado">baixado</span>}
                    </div>
                    <ChevronRight className="mt-2 hidden h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 sm:block" />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
