import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ListVideo, X, Loader2, Folder, BookOpen } from "lucide-react";
import { AulaCard } from "./AulaCard";
import { AulasStyles } from "./AulasStyles";
import { PlayerEmpty } from "./PlayerMock";
import { AulaPlayer } from "./AulaPlayer";
import { useAppUser } from "@/contexts/UserContext";
import { getAulasDoUsuario } from "@/services/aulaService";

export function AulasPage() {
  const { user } = useAppUser();
  const [aulas, setAulas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"lista" | "player">("lista");

  useEffect(() => {
    if (user?.id) {
      getAulasDoUsuario(user.id).then((data) => {
        const aulasFormatadas = data.map((aula, index) => ({
          id: aula.id,
          numero: index + 1,
          modulo: aula.disciplina || "Geral", // Usa a disciplina como módulo
          titulo: aula.titulo,
          descricao: aula.descricao || "Aula em vídeo",
          duracao: "--:--",
          progresso: 0,
          tone: index % 2 === 0 ? "laranja" : "rosa",
          terabox_url: aula.terabox_url,
          disciplina: aula.disciplina || "Outras Disciplinas",
          assunto: aula.assunto || "Geral"
        }));
        
        setAulas(aulasFormatadas);
        if (aulasFormatadas.length > 0) {
          setSelectedId(aulasFormatadas[0].id);
        }
        setLoading(false);
      });
    }
  }, [user?.id]);

  // ==========================================
  // A MÁGICA ACONTECE AQUI: Agrupando a árvore
  // ==========================================
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
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-10">
      <AulasStyles />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-8">
        
        {/* ===== Lista de aulas em Árvore ===== */}
        <aside className={`${mobileView === "player" ? "hidden lg:block" : "block"} min-w-0`}>
          <div className="lg:sticky lg:top-6">
            <h2 className="rf-au-hand text-5xl text-foreground mb-4">Minhas Aulas</h2>
            
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
                          {aulasDoAssunto.map((a, i) => (
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
              <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">
                    {aula.disciplina} · {aula.assunto}
                  </p>
                  <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">{aula.titulo}</h1>
                </div>
              </div>

              <AulaPlayer teraboxUrl={aula.terabox_url} />

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
    </div>
  );
}