import { useState, useEffect, useMemo, useCallback } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ListVideo, Loader2, Folder, BookOpen, CheckCircle, Heart, PlusSquare, Layers } from "lucide-react";
import { AulaCard } from "./AulaCard";
import { AulasStyles } from "./AulasStyles";
import { PlayerEmpty } from "./PlayerMock";
import { AulaPlayer } from "./AulaPlayer";
import { useAppUser } from "@/contexts/UserContext";
import { getAulasDoUsuario, atualizarOrdemAula } from "@/services/aulaService";
import { CriarFlashcardAulaModal } from "../CriarFlashcardAulaModal";
import { formatarAula, construirArvore, achatarArvore, primeiraAulaId, type AulaFormatada, type AulaItem } from "./aulasArvore";

export function AulasPage() {
  const { user } = useAppUser();
  const [aulasRaw, setAulasRaw] = useState<AulaFormatada[]>([]);
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

  // Único ponto de recarga: busca no Supabase, formata e atualiza a tela.
  const recarregar = useCallback(async (selecionarPrimeira = false) => {
    if (!user?.id) return;
    const data = await getAulasDoUsuario(user.id);
    const formatadas = data.map(formatarAula);
    setAulasRaw(formatadas);
    if (selecionarPrimeira) {
      setSelectedId(primeiraAulaId(construirArvore(formatadas)));
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    recarregar(true);
  }, [recarregar]);

  // Troca a ordem com a aula vizinha do MESMO grupo (mesmo assunto + mesmo subassunto).
  // O assunto não muda de posição: assunto_ordem não é tocado.
  const handleMover = useCallback(async (aula: AulaItem, grupo: AulaItem[], direcao: -1 | 1) => {
    if (!user?.id) return;

    const posicao = grupo.findIndex((item) => item.id === aula.id);
    const vizinho = grupo[posicao + direcao];
    if (posicao < 0 || !vizinho) return;

    if (aula.ordem === vizinho.ordem) {
      // Empate herdado de dados antigos: renumera o grupo inteiro na ordem desejada.
      const reordenado = [...grupo];
      reordenado.splice(posicao, 1);
      reordenado.splice(posicao + direcao, 0, aula);
      for (let i = 0; i < reordenado.length; i++) {
        const novaOrdem = i + 1;
        if (reordenado[i].ordem !== novaOrdem) {
          await atualizarOrdemAula(reordenado[i].id, novaOrdem);
        }
      }
    } else {
      await atualizarOrdemAula(aula.id, vizinho.ordem);
      await atualizarOrdemAula(vizinho.id, aula.ordem);
    }

    await recarregar();
  }, [user?.id, recarregar]);

  // Mescla com o estado local de concluídas e progresso
  const aulas = useMemo<AulaItem[]>(() => {
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

  const arvore = useMemo(() => construirArvore(aulas), [aulas]);

  // Ordem de navegação = ordem em que a árvore é exibida.
  const listaNavegacao = useMemo(() => achatarArvore(arvore), [arvore]);

  const index = listaNavegacao.findIndex((a) => a.id === selectedId);
  const aula = aulas.find((a) => a.id === selectedId) ?? null;

  const select = (id: string) => {
    setSelectedId(id);
    setMobileView("player");
  };
  const go = (delta: number) => {
    const proxima = listaNavegacao[index + delta];
    if (proxima) setSelectedId(proxima.id);
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
            <div className="lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:pr-2 pb-4">
              {arvore.map((disciplina) => (
                <details key={disciplina.nome} className="mb-3 group" open>
                  <summary className="flex cursor-pointer items-center gap-2 font-semibold text-lg text-foreground hover:text-primary transition-colors list-none [&::-webkit-details-marker]:hidden">
                    <Folder className="h-5 w-5 text-primary group-open:fill-primary/20" />
                    {disciplina.nome}
                  </summary>

                  <div className="ml-4 mt-2 pl-4 border-l border-border/50 flex flex-col gap-2">
                    {disciplina.assuntos.map((assunto) => (
                      <details key={assunto.nome} className="group/assunto" open>
                        <summary className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground list-none [&::-webkit-details-marker]:hidden py-1">
                          <BookOpen className="h-4 w-4" />
                          {assunto.nome}
                        </summary>

                        {assunto.semSubassunto.length > 0 && (
                          <ul className="mt-2 flex flex-col gap-2">
                            {assunto.semSubassunto.map((a, i) => (
                              <li key={a.id} className="rf-fade-in">
                                <AulaCard
                                  aula={a}
                                  active={a.id === selectedId}
                                  onSelect={select}
                                  onMoveUp={() => handleMover(a, assunto.semSubassunto, -1)}
                                  onMoveDown={() => handleMover(a, assunto.semSubassunto, 1)}
                                  isFirst={i === 0}
                                  isLast={i === assunto.semSubassunto.length - 1}
                                />
                              </li>
                            ))}
                          </ul>
                        )}

                        {assunto.subassuntos.length > 0 && (
                          <div className="mt-2 ml-3 pl-3 border-l border-border/40 flex flex-col gap-2">
                            {assunto.subassuntos.map((subassunto) => (
                              <details key={subassunto.nome} className="group/subassunto" open>
                                <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground list-none [&::-webkit-details-marker]:hidden py-1">
                                  <Layers className="h-3.5 w-3.5 text-primary/70" />
                                  {subassunto.nome}
                                </summary>

                                <ul className="mt-2 flex flex-col gap-2">
                                  {subassunto.aulas.map((a, i) => (
                                    <li key={a.id} className="rf-fade-in">
                                      <AulaCard
                                        aula={a}
                                        active={a.id === selectedId}
                                        onSelect={select}
                                        onMoveUp={() => handleMover(a, subassunto.aulas, -1)}
                                        onMoveDown={() => handleMover(a, subassunto.aulas, 1)}
                                        isFirst={i === 0}
                                        isLast={i === subassunto.aulas.length - 1}
                                      />
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ))}
                          </div>
                        )}
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
                    {aula.disciplina} · {aula.assunto}{aula.subassunto ? ` · ${aula.subassunto}` : ""}
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
                teraboxUrl={aula.terabox_url ?? ""}
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
                    disabled={index < 0 || index >= listaNavegacao.length - 1}
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