import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, FileText, Layers, Play, Video } from "lucide-react";
import type { AulaMock, DisciplinaMock } from "./mock-data";
import { AulasRedesignStyles } from "./AulasRedesignStyles";

/** Tela 3 — página da aula (estilo da imagem maior): cabeçalho, ações, player e lista de vídeos. */
export function AulaDetalhe({ disciplina, aula }: { disciplina: DisciplinaMock; aula: AulaMock }) {
  const [ativo, setAtivo] = useState(0);
  const [estudada, setEstudada] = useState(aula.estudada);
  const video = aula.videos[ativo];
  const pct = Math.round(((ativo + 1) / aula.videos.length) * 100);

  const acoes = [
    { icon: FileText, titulo: "Baixar PDF", sub: "versão simplificada", badge: aula.novo ? "novo" : undefined },
    { icon: FileText, titulo: "Baixar PDF", sub: "versão original", topo: aula.baixada ? "Baixado" : undefined },
    { icon: Layers, titulo: "Criar flashcards", sub: "desta aula" },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-6 sm:py-8 sm:px-6" data-tone={disciplina.tone}>
      <AulasRedesignStyles />
      <Link to="/aulas/$disciplinaId" params={{ disciplinaId: disciplina.id }} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {disciplina.nome}
      </Link>

      <div className="rfx-topbar mb-5"><span style={{ width: `${pct}%` }} /></div>

      <section className="rfx-card p-4 sm:p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold text-foreground sm:text-4xl">{aula.titulo}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{aula.descricao}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <button type="button" onClick={() => setEstudada(!estudada)} className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground hover:text-foreground">
              {estudada ? "Estudei" : "Não estudei"}
              <span className="rfx-check" data-checked={estudada}>{estudada && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
            </button>
            {aula.baixada && <span className="rfx-badge-baixado">baixado</span>}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-3">
          {acoes.map((a, i) => (
            <button key={i} type="button" className="rfx-card rfx-card-hover rfx-action flex flex-col items-center justify-center gap-1 px-2 pb-4 pt-6 text-center sm:gap-1.5 sm:px-4 sm:py-6">
              {a.badge && <span className="rfx-badge-novo absolute right-1.5 top-1.5 sm:right-3 sm:top-3">{a.badge}</span>}
              {a.topo && <span className="absolute left-2 top-1.5 hidden text-xs sm:block text-muted-foreground">{a.topo}</span>}
              <a.icon className="rfx-action-icon h-6 w-6 text-primary sm:h-7 sm:w-7" />
              <span className="text-xs font-semibold leading-tight text-foreground sm:text-base">{a.titulo}</span>
              <span className="text-[0.7rem] font-medium leading-tight text-accent sm:text-sm">{a.sub}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-5 sm:mt-6 sm:gap-6 lg:grid-cols-[1fr_340px]">
          <div className="rfx-player relative aspect-video">
            <div className="absolute inset-0 grid place-items-center">
              <button type="button" aria-label="Reproduzir vídeo" className="rfx-play grid h-14 w-14 place-items-center sm:h-20 sm:w-20 rounded-full">
                <Play className="ml-1 h-6 w-6 sm:h-8 sm:w-8" fill="currentColor" />
              </button>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Vídeo {ativo + 1} · {video?.duracao}</p>
              <p className="truncate font-display text-sm font-semibold text-foreground sm:text-lg">{video?.titulo}</p>
            </div>
          </div>

          <aside>
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-foreground">
              <Video className="h-5 w-5 text-primary" /> Vídeos<sup className="text-xs text-muted-foreground">{aula.videos.length}</sup>
            </h2>
            <div className="space-y-2.5">
              {aula.videos.map((v, i) => (
                <button key={v.id} type="button" onClick={() => setAtivo(i)} data-active={i === ativo} className="rfx-video flex w-full items-center gap-3 px-4 py-3 text-left">
                  <Play className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="rfx-video-sub block text-xs text-muted-foreground">Vídeo {i + 1} · {v.duracao}</span>
                    <span className="block text-sm font-medium">{v.titulo}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
