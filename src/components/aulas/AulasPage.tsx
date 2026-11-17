import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ListVideo,
  Loader2,
  Folder,
  BookOpen,
  CheckCircle,
  Heart,
  PlusSquare,
  Layers,
  Download,
  WifiOff,
  HardDrive,
  Database,
  RefreshCw,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { AulaCard } from "./AulaCard";
import { AulasStyles } from "./AulasStyles";
import { PlayerEmpty } from "./PlayerMock";
import { AulaPlayer } from "./AulaPlayer";
import { AulaMateriais } from "./AulaMateriais";
import { VideoOfflineButton } from "./VideoOfflineButton";
import { Button } from "@/components/ui/button";
import { useAppUser } from "@/contexts/UserContext";
import { getAulasDoUsuario, atualizarOrdemAula } from "@/services/aulaService";
import { CriarFlashcardAulaModal } from "../CriarFlashcardAulaModal";
import {
  formatarAula,
  construirArvore,
  achatarArvore,
  primeiraAulaId,
  type AulaFormatada,
  type AulaItem,
} from "./aulasArvore";
import {
  getOfflineAulaIds,
  listOfflineVideos,
  getStorageInfo,
  removeVideo,
  clearAllVideos,
  subscribeToDownloads,
  getPlayableObjectUrl,
  type DownloadState,
} from "@/services/videoOfflineService";
import { useToast } from "@/hooks/useToast";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatBytes } from "@/utils/helpers";

// Nome do arquivo no download do vídeo: sem \ / : * ? " < > | e com até 120 caracteres.
function nomeSeguroArquivo(titulo: string): string {
  const limpo = (titulo || "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (limpo || "aula").slice(0, 120);
}

export function AulasPage() {
  const { user } = useAppUser();
  const toast = useToast();
  const confirm = useConfirm();
  const [aulasRaw, setAulasRaw] = useState<AulaFormatada[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"lista" | "player">("lista");
  const [isFlashcardModalOpen, setIsFlashcardModalOpen] = useState(false);

  // Estados salvos em localStorage por usuário
  const storageKeyConcluidas = `unavox_aulas_concluidas_${user?.id || "anon"}`;
  const storageKeyFavoritas = `unavox_aulas_favoritas_${user?.id || "anon"}`;
  const storageKeyProgresso = `unavox_aulas_progresso_${user?.id || "anon"}`;

  const [concluidas, setConcluidas] = useState<Record<string, boolean>>({});
  const [favoritas, setFavoritas] = useState<Record<string, boolean>>({});
  const [tempos, setTempos] = useState<Record<string, { current: number; total: number }>>({});

  // Offline video state
  const [offlineAulaIds, setOfflineAulaIds] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<Record<string, DownloadState>>({});
  const [offlineVideosDialogOpen, setOfflineVideosDialogOpen] = useState(false);
  const [offlineVideosLoading, setOfflineVideosLoading] = useState(false);
  const [offlineVideosList, setOfflineVideosList] = useState<
    Array<{ aulaId: string; title: string; size: number }>
  >([]);
  const [storageInfo, setStorageInfo] = useState<{
    usage: number;
    quota: number;
    persisted: boolean;
    supported: boolean;
  }>({ usage: 0, quota: 0, persisted: false, supported: false });
  const [currentOfflineObjectUrl, setCurrentOfflineObjectUrl] = useState<string | null>(null);
  const currentObjectUrlRef = useRef<string | null>(null);

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

  // Acompanha conexão para liberar/bloquear o download do vídeo.
  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  // Carrega IDs de aulas disponíveis offline
  const loadOfflineAulaIds = useCallback(async () => {
    const ids = await getOfflineAulaIds();
    setOfflineAulaIds(ids);
  }, []);

  useEffect(() => {
    loadOfflineAulaIds();
  }, [loadOfflineAulaIds]);

  // Revoga object URL ao trocar de aula ou desmontar
  useEffect(() => {
    return () => {
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
        currentObjectUrlRef.current = null;
      }
    };
  }, []);

  // Subscreve progresso de downloads para mostrar na árvore
  useEffect(() => {
    const unsubscribe = subscribeToDownloads((states) => {
      const progress: Record<string, DownloadState> = {};
      states.forEach((state, aulaId) => {
        progress[aulaId] = state;
      });
      setDownloadProgress(progress);
      // Atualiza offlineAulaIds quando algum completa
      const newOfflineIds = new Set(offlineAulaIds);
      states.forEach((state, aulaId) => {
        if (state.phase === "complete") newOfflineIds.add(aulaId);
        else if (state.phase === "idle" || state.phase === "error") newOfflineIds.delete(aulaId);
      });
      setOfflineAulaIds(newOfflineIds);
    });
    return unsubscribe;
  }, [offlineAulaIds]);

  // Carrega object URL offline quando a aula selecionada muda
  useEffect(() => {
    if (!selectedId) {
      setCurrentOfflineObjectUrl(null);
      return;
    }
    let cancelled = false;
    getPlayableObjectUrl(selectedId).then((url) => {
      if (!cancelled) {
        setCurrentOfflineObjectUrl(url);
        if (url) currentObjectUrlRef.current = url;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const toggleConcluida = (id: string) => {
    const updated = { ...concluidas, [id]: !concluidas[id] };
    setConcluidas(updated);
    try {
      localStorage.setItem(storageKeyConcluidas, JSON.stringify(updated));
    } catch (e) {}
  };

  const toggleFavorita = (id: string) => {
    const updated = { ...favoritas, [id]: !favoritas[id] };
    setFavoritas(updated);
    try {
      localStorage.setItem(storageKeyFavoritas, JSON.stringify(updated));
    } catch (e) {}
  };

  const handleTimeUpdate = (id: string, current: number, total: number) => {
    setTempos((prev) => {
      const next = { ...prev, [id]: { current, total } };
      try {
        localStorage.setItem(storageKeyProgresso, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // Único ponto de recarga: busca no Supabase, formata e atualiza a tela.
  const recarregar = useCallback(
    async (selecionarPrimeira = false) => {
      if (!user?.id) return;
      const data = await getAulasDoUsuario(user.id);
      const formatadas = data.map(formatarAula);
      setAulasRaw(formatadas);
      if (selecionarPrimeira) {
        setSelectedId(primeiraAulaId(construirArvore(formatadas)));
      }
      setLoading(false);
    },
    [user?.id],
  );

  useEffect(() => {
    recarregar(true);
  }, [recarregar]);

  // Troca a ordem com a aula vizinha do MESMO grupo (mesmo assunto + mesmo subassunto).
  // O assunto não muda de posição: assunto_ordem não é tocado.
  const handleMover = useCallback(
    async (aula: AulaItem, grupo: AulaItem[], direcao: -1 | 1) => {
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
    },
    [user?.id, recarregar],
  );

  // Mescla com o estado local de concluídas e progresso
  const aulas = useMemo<AulaItem[]>(() => {
    return aulasRaw.map((a) => {
      const isConcluida = !!concluidas[a.id];
      const progresso = isConcluida
        ? 100
        : tempos[a.id]?.total
          ? Math.round((tempos[a.id].current / tempos[a.id].total) * 100)
          : 0;
      return {
        ...a,
        concluida: isConcluida,
        favorita: !!favoritas[a.id],
        progresso: Math.min(100, Math.max(0, progresso)),
      };
    });
  }, [aulasRaw, concluidas, favoritas, tempos]);

  const arvore = useMemo(() => construirArvore(aulas), [aulas]);

  // Ordem de navegação = ordem em que a árvore é exibida.
  const listaNavegacao = useMemo(() => achatarArvore(arvore), [arvore]);

  const index = listaNavegacao.findIndex((a) => a.id === selectedId);
  const aula = aulas.find((a) => a.id === selectedId) ?? null;

  // URL do vídeo só vale para download se for http(s) de verdade.
  const videoUrl =
    aula?.terabox_url && /^https?:\/\//i.test(aula.terabox_url) ? aula.terabox_url : null;
  const nomeVideo = nomeSeguroArquivo(aula?.titulo ?? "");

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
                                  isOffline={offlineAulaIds.has(a.id)}
                                  offlineProgress={
                                    downloadProgress[a.id]?.phase === "downloading"
                                      ? downloadProgress[a.id].percent
                                      : downloadProgress[a.id]?.phase === "paused"
                                        ? downloadProgress[a.id].percent
                                        : undefined
                                  }
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
                                        isOffline={offlineAulaIds.has(a.id)}
                                        offlineProgress={
                                          downloadProgress[a.id]?.phase === "downloading"
                                            ? downloadProgress[a.id].percent
                                            : downloadProgress[a.id]?.phase === "paused"
                                              ? downloadProgress[a.id].percent
                                              : undefined
                                        }
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
                  <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{aula.titulo}</h1>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {aula.disciplina}
                    {aula.assunto ? ` · ${aula.assunto}` : ""}
                    {aula.subassunto ? ` · ${aula.subassunto}` : ""}
                  </p>
                </div>

                {/* Botões de Ação do Topo (Concluída, Favoritar, Criar flashcard, Baixar vídeo) */}
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
                    <Heart
                      className={`h-3.5 w-3.5 ${aula.favorita ? "fill-rose-500 text-rose-500" : ""}`}
                    />
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

                  {videoUrl ? (
                    <>
                      <a
                        href={videoUrl}
                        download={`${nomeVideo}.mp4`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={isOnline ? "Baixar vídeo" : "Sem internet para baixar o vídeo"}
                        aria-disabled={!isOnline}
                        className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground hover:bg-surface-2 transition-colors shadow-sm ${
                          isOnline ? "" : "pointer-events-none opacity-50"
                        }`}
                      >
                        <Download className="h-3.5 w-3.5 text-primary" />
                        Baixar vídeo
                      </a>
                      <VideoOfflineButton
                        aulaId={aula.id}
                        videoUrl={videoUrl}
                        title={aula.titulo}
                        isOnline={isOnline}
                      />
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="Vídeo indisponível"
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground/40 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Baixar vídeo
                    </button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setOfflineVideosLoading(true);
                      const [videos, info] = await Promise.all([
                        listOfflineVideos(),
                        getStorageInfo(),
                      ]);
                      setOfflineVideosList(
                        videos.map((v) => ({
                          aulaId: v.aulaId,
                          title: v.title,
                          size: v.totalBytes,
                        })),
                      );
                      setStorageInfo(info);
                      setOfflineVideosLoading(false);
                      setOfflineVideosDialogOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground hover:bg-surface-2 transition-colors shadow-sm"
                    title="Gerenciar vídeos offline"
                  >
                    <HardDrive className="h-3.5 w-3.5 text-primary" />
                    <span className="hidden sm:inline">Vídeos offline</span>
                  </Button>
                </div>
              </div>

              {!isOnline && videoUrl ? (
                <p className="-mt-2 mb-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <WifiOff className="h-3.5 w-3.5 shrink-0" />
                  Sem internet para baixar o vídeo
                </p>
              ) : null}

              <AulaPlayer
                teraboxUrl={aula.terabox_url ?? ""}
                aulaId={aula.id}
                initialTime={tempos[aula.id]?.current || 0}
                onTimeUpdate={(curr, dur) => handleTimeUpdate(aula.id, curr, dur)}
                offlineObjectUrl={currentOfflineObjectUrl}
                isOnline={isOnline}
              />

              <div className="mt-6">
                <AulaMateriais aulaId={aula.id} />

                <div className="mt-4 flex gap-2 sm:justify-end">
                  <button
                    type="button"
                    disabled={index <= 0}
                    onClick={() => go(-1)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-surface-2 disabled:opacity-40 sm:flex-none"
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </button>
                  <button
                    type="button"
                    disabled={index < 0 || index >= listaNavegacao.length - 1}
                    onClick={() => go(1)}
                    className="btn-sun inline-flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 text-sm disabled:opacity-40 sm:flex-none"
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

      {/* Dialog Vídeos Offline */}
      <Dialog open={offlineVideosDialogOpen} onOpenChange={setOfflineVideosDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              Vídeos offline
            </DialogTitle>
            <DialogDescription>
              Gerencie os vídeos baixados neste aparelho. Eles ficam disponíveis para assistir sem
              internet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Resumo de armazenamento */}
            <div className="rounded-lg bg-secondary p-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Espaço usado</p>
                  <p className="font-semibold">{formatBytes(storageInfo.usage)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cota do navegador</p>
                  <p className="font-semibold">
                    {storageInfo.quota ? formatBytes(storageInfo.quota) : "Desconhecida"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Armazenamento</p>
                  <p
                    className={`font-semibold ${storageInfo.persisted ? "text-green-600" : "text-amber-600"}`}
                  >
                    {storageInfo.persisted ? "Permanente" : "Temporário"}
                  </p>
                </div>
              </div>
              {!storageInfo.persisted && storageInfo.supported && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={async () => {
                    try {
                      await navigator.storage.persist();
                      const info = await getStorageInfo();
                      setStorageInfo(info);
                      toast.success("Armazenamento permanente solicitado");
                    } catch {
                      toast.error("Não foi possível solicitar armazenamento permanente");
                    }
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Pedir armazenamento permanente
                </Button>
              )}
            </div>

            {/* Lista de vídeos */}
            {offlineVideosLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Carregando…</span>
              </div>
            ) : offlineVideosList.length === 0 ? (
              <div className="text-center py-8">
                <Database className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Nenhum vídeo baixado neste aparelho.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {offlineVideosList.map((video) => (
                  <div
                    key={video.aulaId}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{video.title}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(video.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const confirmed = await confirm({
                          title: "Remover vídeo do aparelho?",
                          description: "Você pode baixá-lo de novo depois.",
                          confirmText: "Remover",
                          cancelText: "Cancelar",
                          destructive: true,
                        });
                        if (confirmed) {
                          await removeVideo(video.aulaId);
                          setOfflineVideosList((prev) =>
                            prev.filter((v) => v.aulaId !== video.aulaId),
                          );
                          setOfflineAulaIds((prev) => {
                            const next = new Set(prev);
                            next.delete(video.aulaId);
                            return next;
                          });
                          const info = await getStorageInfo();
                          setStorageInfo(info);
                          toast.success("Vídeo removido");
                        }
                      }}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Remover</span>
                    </Button>
                  </div>
                ))}

                {offlineVideosList.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 text-destructive border-destructive/50 hover:bg-destructive/10"
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: "Remover TODOS os vídeos offline?",
                        description:
                          "Esta ação não pode ser desfeita. Todos os vídeos baixados serão apagados do aparelho.",
                        confirmText: "Remover todos",
                        cancelText: "Cancelar",
                        destructive: true,
                      });
                      if (confirmed) {
                        await clearAllVideos();
                        setOfflineVideosList([]);
                        setOfflineAulaIds(new Set());
                        const info = await getStorageInfo();
                        setStorageInfo(info);
                        toast.success("Todos os vídeos removidos");
                      }
                    }}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Remover todos ({offlineVideosList.length})
                  </Button>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOfflineVideosDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
