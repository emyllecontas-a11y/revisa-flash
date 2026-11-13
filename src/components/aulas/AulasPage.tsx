import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ListVideo, X, Loader2, Folder, BookOpen, CheckCircle, Heart, PlusSquare } from "lucide-react";
import { AulaCard } from "./AulaCard";
import { AulasStyles } from "./AulasStyles";
import { PlayerEmpty } from "./PlayerMock";
import { AulaPlayer } from "./AulaPlayer";
import { useAppUser } from "@/contexts/UserContext";
import { getAulasDoUsuario } from "@/services/aulaService";
import { CriarFlashcardAulaModal } from "../CriarFlashcardAulaModal";

export function AulasPage() {
  const { user } = useAppUser();
  const [aulasRaw, setAulasRaw] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"lista" | "player">("lista");
  const [isFlashcardModalOpen, setIsFlashcardModalOpen] = useState(false);

  // Estados salvos em localStorage por usuário
  const storageKeyConcluidas = `unavox_aulas_concluidas_${user?.id || 'anon'}`;
  const storageKeyFavoritas = `unavox_aulas_favoritas_${user?.id || 'anon'}`;
  const storageKeyProgresso = `unavox_aulas_progresso_${user?.id || 'anon'}`;

  const [concluidas, setConcluidas] = useState<Record<string, boolean>>({});
  const [favoritas, setFavoritas] = useState<Record<string, boolean>>({});
  const [tempos, setTempos] = useState<Record<string, { current: number; total: number }>>({});

  useEffect(() => {
    try {
      const c = localStorage.getItem(storageKeyConcluidas);
      if (c) setConcluidas(JSON.parse(c));
      const f = localStorage.getItem(storageKeyFavoritas);
      if (f) setFavoritas(JSON.parse(f));
      const t = localStorage.getItem(storageKeyProgresso);
      if (t) setTempos(JSON.parse(t));
    } catch (e) {
      console.error(e);
    }
  }, [user?.id]);

  const toggleConcluida = (id: string) => {
    const updated = { ...concluidas, [id]: !concluidas[id] };
    setConcluidas(updated);
    try { localStorage.setItem(storageKeyConcluidas, JSON.stringify(updated)); } catch (e) {}
  };

  const toggleFavorita = (id: string) => {
    const updated = { ...favoritas, [id]: !favoritas[id] };
    setFavoritas(updated);
    try { localStorage.setItem(storageKeyFavoritas, JSON.stringify(updated)); } catch (e) {}
  };

  const handleTimeUpdate = (id: string, current: number, total: number) => {
    setTempos((prev) => {
      const next = { ...prev, [id]: { current, total } };
      try { localStorage.setItem(storageKeyProgresso, JSON.stringify(next)); } catch (e) {}
      return next;
    });
  };

  useEffect(() => {
    if (user?.id) {
      getAulasDoUsuario(user.id).then((data) => {
        const aulasFormatadas = data.map((aula, index) => ({
          id: aula.id,
          numero: index + 1,
          modulo: aula.disciplina || "Geral",
          titulo: aula.titulo,
          descricao: aula.descricao || "Aula em vídeo",
          duracao: "--:--",
          tone: index % 2 === 0 ? "laranja" : "rosa",
          terabox_url: aula.terabox_url,
          disciplina: aula.disciplina || "Outras Disciplinas",
          assunto: aula.assunto || "Geral"
        }));

        setAulasRaw(aulasFormatadas);
        if (aulasFormatadas.length > 0) {
          setSelectedId(aulasFormatadas[0].id);
        }
        setLoading(false);
      });
    }
  }, [user?.id]);

  // Mescla com o estado local de concluídas e progresso
  const aulas = useMemo(() => {
    return aulasRaw.map((a) => {
      const isConcluida = !!concluidas[a.id];
      const progresso = isConcluida ? 100 : (tempos[a.id]?.total ? Math.round((tempos[a.id].current / tempos[a.id].total) * 100) : 0);
      return {
        ...a,
        concluida: isConcluida,
        favorita: !!favoritas[a.id],
        progresso: Math.min(100, Math.max(0, progresso))
      };
    });
  }, [aulasRaw, concluidas, favoritas, tempos]);

  const arvore = useMemo(() => {
    return aulas.reduce((acc, aula) => {
      const disc = aula.disciplina;
      const assunto = aula.assunto;

      if (!acc[disc]) acc[disc] = {};
      if (!acc[disc][assunto]) acc[disc][assunto] = [];

      acc[disc][assunto].push(aula);
      return acc;
    }, {} as Record<string, Record<string, any[]>>);
  }, [aulas]);

  const index = aulas.findIndex((a) => a.id === selectedId);
  const aula = index >= 0 ? aulas[index] : null;

  const select = (id: string) => {
    setSelectedId(id);
    setMobileView("player");
  };
  const go = (delta: number) => {
    const next = aulas[index + delta];
    if (next) setSelectedId(next.id);
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="w-full px-2 py-2 sm:px-4 lg:py-4">
      <AulasStyles />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-8">

        {/* ===== Lista de aulas em Árvore ===== */}
        <aside className={`${mobileView === "player" ? "hidden lg:block" : "block"} min-w-0`}>
          <div className="lg:sticky lg:top-6">
            <h2 className="font-display text-lg font-bold text-foreground mb-4">Minhas Aulas</h2>

            <div className="lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:pr-2 pb-4">
              {Object.entries(arvore).map(([disciplina, assuntos]) => (
                <details key={disciplina} className="mb-3 group" open>
                  <summary className="flex cursor-pointer items-center gap-2 font-semibold text-lg text-foreground hover:text-primary transition-colors list-none [&::-webkit-details-marker]:hidden">
                    <Folder className="h-5 w-5 text-primary group-open:fill-primary/20" />
                    {disciplina}
                  </summary>

                  <div className="ml-4 mt-2 pl-4 border-l border-border/50 flex flex-col gap-2">
                    {Object.entries(assuntos).map(([assunto, aulasDoAssunto]) => (
                      <details key={assunto} className="group/assunto" open>
                        <summary className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground list-none [&::-webkit-details-marker]:hidden py-1">
                          <BookOpen className="h-4 w-4" />
                          {assunto}
                        </summary>

                        <ul className="mt-2 flex flex-col gap-2">
                          {aulasDoAssunto.map((a) => (
                            <li key={a.id} className="rf-fade-in">
                              <AulaCard aula={a} active={a.id === selectedId} onSelect={select} />
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </div>
                </details>
              ))}

              {aulas.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma aula cadastrada ainda.</p>
              )}
            </div>
          </div>
        </aside>

        {/* ===== Player ===== */}
        <main className={`${mobileView === "lista" ? "hidden lg:block" : "block"} min-w-0`}>
          <button
            type="button"
            onClick={() => setMobileView("lista")}
            className="mb-4 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar à lista
          </button>

          {aula ? (
            <div key={aula.id} className="rf-fade-in">
              <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">
                    {aula.disciplina} · {aula.assunto}
                  </p>
                  <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">{aula.titulo}</h1>
                </div>

                {/* Botões de Ação do Topo (Marcar concluída, Favoritar, Criar flashcard) */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => toggleConcluida(aula.id)}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                      aula.concluida
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "border border-border bg-surface text-foreground hover:bg-surface-2"
                    }`}
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    {aula.concluida ? "Concluída" : "Marcar como concluída"}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleFavorita(aula.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
                      aula.favorita
                        ? "bg-rose-500/10 text-rose-500 border border-rose-500/30"
                        : "border border-border bg-surface text-foreground/70 hover:bg-surface-2"
                    }`}
                  >
                    <Heart className={`h-3.5 w-3.5 ${aula.favorita ? "fill-rose-500 text-rose-500" : ""}`} />
                    Favoritar
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsFlashcardModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground hover:bg-surface-2 transition-colors shadow-sm"
                  >
                    <PlusSquare className="h-3.5 w-3.5 text-primary" />
                    Criar flashcard
                  </button>
                </div>
              </div>

              <AulaPlayer
                teraboxUrl={aula.terabox_url}
                aulaId={aula.id}
                initialTime={tempos[aula.id]?.current || 0}
                onTimeUpdate={(curr, dur) => handleTimeUpdate(aula.id, curr, dur)}
              />

              <div className="mt-6 flex justify-between items-center">
                <div className="rf-card min-w-0 p-5 flex-1 mr-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">Sobre esta aula</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-foreground">{aula.descricao}</p>
                </div>
                <div className="flex gap-2 sm:flex-col">
                  <button
                    type="button"
                    disabled={index <= 0}
                    onClick={() => go(-1)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-surface-2 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </button>
                  <button
                    type="button"
                    disabled={index >= aulas.length - 1}
                    onClick={() => go(1)}
                    className="btn-sun inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm disabled:opacity-40"
                  >
                    Próxima <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rf-fade-in">
              <div className="mb-4 flex items-center gap-2 text-muted-foreground">
                <ListVideo className="h-5 w-5" />
                <span className="text-sm font-semibold">Nenhuma aula selecionada</span>
              </div>
              <PlayerEmpty />
            </div>
          )}
        </main>
      </div>

      {/* Modal de Criar Flashcard Vinculado */}
      <CriarFlashcardAulaModal
        open={isFlashcardModalOpen}
        onClose={() => setIsFlashcardModalOpen(false)}
        aulaTitulo={aula?.titulo}
        aulaDisciplina={aula?.disciplina}
      />
    </div>
  );
}
