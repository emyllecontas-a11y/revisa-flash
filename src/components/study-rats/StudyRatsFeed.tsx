import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, BookOpen, CalendarCheck, Camera, ChevronLeft, Clock, Flame, Heart, Lightbulb, MessageCircle, MoreHorizontal, X } from "lucide-react";
import { useStudyFeed, useStories, invalidateStudyFeedCache, useStudyProfile } from "@/hooks/useStudyRats";
import { useStudyRatsCheckins } from "@/contexts/StudyRatsContext";
import { getCachedUserId, addComment, getComments, deleteComment, deletePost, studyRatsErrorMessage } from "@/services/studyRatsService";
import { STUDY_RATS, STUDY_RATS_CATEGORIAS } from "@/constants";
import { fmtDuracao, tempoRelativo } from "@/utils/studyRatsFormat";
import { localDateStr } from "@/utils/date";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { StudyRatsStyles } from "./StudyRatsStyles";
import { useConfirm } from "@/components/ConfirmDialog";
import { NovaPublicacaoModal } from "./NovaPublicacaoModal";
import { useAppUser } from "@/contexts/UserContext";
import { StudyRatsPerfil } from "./StudyRatsPerfil";
import type { StudyPost, StudyStory, StudyComment, StudyAuthor } from "@/types/studyRats";

/** Feed do Study Rats — usa hooks reais (Fase 3). */
export function StudyRatsFeed() {
  const [filtro, setFiltro] = useState<string>("Tudo");
  const [storyFila, setStoryFila] = useState<string[] | null>(null);
  const [storyPos, setStoryPos] = useState(0);
  const [comentando, setComentando] = useState<string | null>(null);
  const [criando, setCriando] = useState<"checkin" | "post" | "escolher" | null>(null);
  const [trendingPosts, setTrendingPosts] = useState<StudyPost[]>([]);
  const [feedError, setFeedError] = useState<string | null>(null);

  // Estados para navegação Feed ↔ Perfil
  const [view, setView] = useState<"feed" | "perfil">("feed");
  const [perfilUserId, setPerfilUserId] = useState<string | null>(null);
  const [perfilKey, setPerfilKey] = useState(0);

  // Meus check-ins (do contexto local) — para "Seu dia"
  const { checkins: meusCheckins, userId, deleteCheckin } = useStudyRatsCheckins();
  const { user: appUser } = useAppUser();

  // Avatar real da usuária atual — useStudyProfile() sem argumentos
  const { profile: meuPerfil } = useStudyProfile();
  const currentUserAvatar = {
    nome: meuPerfil?.name ?? appUser?.fullName ?? "Você",
    fotoUrl: meuPerfil?.avatarUrl ?? null,
    avatarTipo: meuPerfil?.avatarTipo ?? null,
    avatarId: meuPerfil?.avatarId ?? null,
  };

  // Feed paginado - A1: corrigir filtro por categoria (usar value, não label)
  const categoriaDoFiltro = STUDY_RATS_CATEGORIAS.find(c => c.label === filtro)?.value;
  const filter = filtro === "Tudo"
    ? undefined
    : filtro === "Check-ins"
      ? { kind: STUDY_RATS.TIPOS.CHECKIN }
      : categoriaDoFiltro
        ? { category: categoriaDoFiltro }
        : undefined;
  const { posts, loading, loadingMore, error, hasMore, refresh, loadMore, likePost, savePost, updateCommentsCount } = useStudyFeed(filter);

  // Stories
  const { stories, refresh: refreshStories, markViewed: markStoryViewedHook } = useStories();

  // Confirmação para exclusão
  const confirmDialog = useConfirm();

  // Refs para carregar mais ao chegar no fim (intersection observer)
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadMoreObserver = useRef<IntersectionObserver | null>(null);

  // Agrupar stories por autor (um anel por pessoa)
  const groupedStories = useMemo(() => {
    const byAuthor = new Map<string, StudyStory[]>();
    for (const story of stories) {
      const list = byAuthor.get(story.author.id) ?? [];
      list.push(story);
      byAuthor.set(story.author.id, list);
    }

    // Ordenar dentro de cada grupo: cronológico (mais antigo primeiro) para assistir
    const myId = getCachedUserId();
    const groups = Array.from(byAuthor.entries()).map(([authorId, authorStories]) => ({
      authorId,
      stories: authorStories.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
      author: authorStories[0].author,
      isMe: authorId === myId,
    }));

    // Separar meu grupo dos demais
    const meuGrupo = groups.find(g => g.isMe);
    const amigas = groups.filter(g => !g.isMe);

    // Ordenar amigas: não vistas primeiro, depois por data do story mais recente
    amigas.sort((a, b) => {
      const aHasUnviewed = a.stories.some(s => !s.viewedByMe);
      const bHasUnviewed = b.stories.some(s => !s.viewedByMe);
      if (aHasUnviewed !== bHasUnviewed) return aHasUnviewed ? -1 : 1;
      // Mais recentes primeiro para ordenação dos anéis
      const aLatest = Math.max(...a.stories.map(s => new Date(s.createdAt).getTime()));
      const bLatest = Math.max(...b.stories.map(s => new Date(s.createdAt).getTime()));
      return bLatest - aLatest;
    });

    // Reconstruir array com meu grupo primeiro
    const result = meuGrupo ? [meuGrupo, ...amigas] : amigas;
    return result;
  }, [stories]);

  // Calcular horas de hoje (soma dos check-ins da própria usuária com data de hoje)
  const hoje = localDateStr();
  const minHoje = useMemo(() => {
    return meusCheckins
      .filter(c => c.study_date === hoje)
      .reduce((s, c) => s + c.duration_min, 0);
  }, [meusCheckins, hoje]);

  // Calcular "Em alta na comunidade" — posts do feed "Tudo" de outras autoras, últimos 7 dias, com likes > 0
  useEffect(() => {
    if (filtro !== "Tudo") return;

    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
    const seteDiasAtrasISO = seteDiasAtras.toISOString();

    const myId = getCachedUserId();
    const trending = posts
      .filter(p => p.author.id !== myId)
      .filter(p => p.likesCount > 0)
      .filter(p => new Date(p.createdAt).toISOString() >= seteDiasAtrasISO)
      .sort((a, b) => b.likesCount - a.likesCount)
      .slice(0, 3);

    setTrendingPosts(trending);
  }, [posts, filtro]);

  // Intersection observer para loadMore
  useEffect(() => {
    if (loadMoreObserver.current) loadMoreObserver.current.disconnect();

    loadMoreObserver.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        loadMore();
      }
    }, { threshold: 0.1, rootMargin: "100px" });

    if (loadMoreRef.current) loadMoreObserver.current.observe(loadMoreRef.current);

    return () => {
      if (loadMoreObserver.current) loadMoreObserver.current.disconnect();
    };
  }, [hasMore, loadingMore, loadMore]);

  // A2: Fila fixa de stories — snapshot dos authorIds ao abrir
  const abrirStory = useCallback((groupIndex: number, storyIndex: number = 0) => {
    const group = groupedStories[groupIndex];
    if (!group) return;
    const story = group.stories[storyIndex];
    if (!story) return;
    const fila = groupedStories.map(g => g.authorId);
    setStoryFila(fila);
    setStoryPos(groupIndex);
  }, [groupedStories]);

  // Ações do feed
  const handleLike = useCallback(async (postId: string, onlyLike = false) => {
    await likePost(postId, onlyLike);
  }, [likePost]);

  const handleSave = useCallback(async (postId: string) => {
    await savePost(postId);
  }, [savePost]);

  const handleComment = useCallback((postId: string) => {
    setComentando(postId);
  }, []);

  const handleDeletePost = useCallback(async (post: StudyPost) => {
    const ok = await confirmDialog({
      title: "Excluir publicação?",
      description: "Esta ação não pode ser desfeita.",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;

    try {
      if (post.kind === "checkin") {
        await deleteCheckin(post.id);
      } else {
        await deletePost(post.id);
      }
    } catch (err) {
      setFeedError(studyRatsErrorMessage(err));
      return;
    }

    // Invalidar cache e atualizar
    invalidateStudyFeedCache();
    refresh();
    refreshStories();
  }, [confirmDialog, refresh, refreshStories, deleteCheckin]);

  const [editando, setEditando] = useState<StudyPost | null>(null);

  const handleEditPost = useCallback((post: StudyPost) => {
    setEditando(post);
  }, []);

  // Callback para abrir perfil do autor
  const handleOpenProfile = useCallback((authorId: string) => {
    const myId = getCachedUserId();
    if (authorId === myId) {
      setView("perfil");
      setPerfilUserId(null); // null = meu perfil
    } else {
      setView("perfil");
      setPerfilUserId(authorId);
    }
  }, []);

  // Variável para o post que está sendo comentado (movida para fora do JSX - fix F2)
  const postComentando = posts.find(p => p.id === comentando);

  // Renderização
  const filtros = ["Tudo", "Check-ins", ...STUDY_RATS_CATEGORIAS.map(c => c.label)];
  // Coluna lateral só aparece no desktop quando há algo "Em alta" para mostrar
  const mostrarLateral = view === "feed" && trendingPosts.length > 0;

  return (
    <div className={`mx-auto grid gap-8 ${mostrarLateral ? "max-w-[1000px] lg:grid-cols-[minmax(0,560px)_320px] lg:justify-center" : view === "feed" ? "max-w-[560px]" : "max-w-[1000px]"}`}>
      <StudyRatsStyles />
      <div className="min-w-0 space-y-5">
        {/* Seletor Feed / Perfil */}
        <div className="flex justify-center">
          <div className="srx-seg">
            <button
              onClick={() => { setView("feed"); setPerfilUserId(null); }}
              data-on={view === "feed"}
              className="text-sm font-semibold"
            >
              Feed
            </button>
            <button
              onClick={() => { setView("perfil"); setPerfilUserId(null); }}
              data-on={view === "perfil" && perfilUserId === null}
              className="text-sm font-semibold"
            >
              Meu perfil
            </button>
          </div>
        </div>

        {view === "feed" ? (
          <>
            {/* Hero */}
            <section className="srx-hero p-5 text-primary-foreground">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                  <BookOpen className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold leading-tight">Study Rats</h2>
                  <p className="text-sm opacity-80">A comunidade de quem estuda junto.</p>
                </div>
                {/* Seu dia */}
                <div className="ml-auto shrink-0 rounded-2xl bg-background/25 px-3 py-1.5 text-right">
                  <p className="text-lg font-bold leading-tight">{fmtDuracao(minHoje) || "0min"}</p>
                  <p className="text-[11px] font-medium opacity-80">estudadas hoje</p>
                </div>
              </div>
              <button onClick={() => setCriando("escolher")} className="mt-4 flex w-full items-center gap-3 rounded-full bg-background/25 p-2 pr-4 text-left text-sm transition hover:bg-background/35">
                <UserAvatar
                  fotoUrl={currentUserAvatar.fotoUrl}
                  avatarTipo={currentUserAvatar.avatarTipo}
                  avatarId={currentUserAvatar.avatarId}
                  nome={currentUserAvatar.nome}
                  className="h-8 w-8"
                />
                <span className="opacity-85">Compartilhe algo com a comunidade…</span>
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => setCriando("checkin")} className="flex items-center justify-center gap-2 rounded-2xl bg-background/25 py-2.5 text-sm font-semibold hover:bg-background/35">
                  <CalendarCheck className="h-4 w-4 text-accent" /> Check-in
                </button>
                <button onClick={() => setCriando("post")} className="flex items-center justify-center gap-2 rounded-2xl bg-background/25 py-2.5 text-sm font-semibold hover:bg-background/35">
                  <Lightbulb className="h-4 w-4 text-accent" /> Publicação
                </button>
              </div>
            </section>

            {/* Stories */}
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Flame className="h-3.5 w-3.5 text-accent" /> Stories
              </p>
              <div className="flex gap-4 overflow-x-auto pb-1">
                {/* Meu story */}
                {(() => {
                  const meuGrupo = groupedStories.find(g => g.isMe);
                  const hasStory = !!meuGrupo;
                  const seen = hasStory ? meuGrupo.stories.every((s: StudyStory) => s.viewedByMe) : false;

                  return (
                    <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                      <div className="relative">
                        {/* Botão principal - clica no círculo abre story se existir */}
                        <button
                          onClick={() => {
                            if (hasStory) {
                              const idx = groupedStories.findIndex(g => g.isMe);
                              if (idx >= 0) abrirStory(idx);
                            } else {
                              setCriando("escolher");
                            }
                          }}
                        >
                          <span className={`relative ${hasStory ? "srx-ring" : "grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-border bg-surface"} `} data-seen={seen}>
                            <UserAvatar
                              fotoUrl={currentUserAvatar.fotoUrl}
                              avatarTipo={currentUserAvatar.avatarTipo}
                              avatarId={currentUserAvatar.avatarId}
                              nome={currentUserAvatar.nome}
                              className="h-[58px] w-[58px]"
                            />
                          </span>
                        </button>

                        {/* Botão "+" DENTRO da div relative (irmão do botão do avatar) */}
                        <button
                          onClick={() => setCriando("escolher")}
                          aria-label="Novo story"
                          className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-background bg-accent text-xs font-bold text-accent-foreground"
                        >
                          +
                        </button>
                      </div>

                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">Seu story</span>
                    </div>
                  );
                })()}

                {/* Stories das amizades */}
                {groupedStories.filter(g => !g.isMe).map((group) => (
                  <button
                    key={group.authorId}
                    onClick={() => {
                      const idx = groupedStories.findIndex(g => g.authorId === group.authorId);
                      if (idx >= 0) abrirStory(idx);
                    }}
                    className="flex w-16 shrink-0 flex-col items-center gap-1.5"
                  >
                    <span className="srx-ring" data-seen={group.stories.every(s => s.viewedByMe)}>
                      <UserAvatar
                        fotoUrl={group.author.avatarUrl}
                        avatarTipo={group.author.avatarTipo}
                        avatarId={group.author.avatarId}
                        nome={group.author.name}
                        className="h-[58px] w-[58px]"
                      />
                    </span>
                    <span className={`text-[11px] ${group.stories.every(s => s.viewedByMe) ? "text-muted-foreground" : "font-semibold text-foreground"}`}>
                      {group.author.name}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* Filtros */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {filtros.map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${filtro === f ? "bg-foreground text-background" : "bg-surface text-muted-foreground hover:text-foreground"}`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Feed Error - logo acima da lista */}
            {feedError && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                {feedError}
                <button onClick={() => setFeedError(null)} className="ml-2 text-xs underline">Dispensar</button>
              </div>
            )}

            {/* Feed */}
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="srx-card animate-pulse h-48" />
                ))}
              </div>
            ) : error ? (
              <div className="srx-card p-6 text-center">
                <p className="text-sm text-destructive mb-3">{error}</p>
                <button onClick={refresh} className="text-sm font-semibold text-accent">Tentar de novo</button>
              </div>
            ) : posts.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nada por aqui ainda. Que tal ser a primeira? ✨</p>
            ) : (
              <>
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onLike={handleLike}
                    onSave={handleSave}
                    onComment={handleComment}
                    onDelete={handleDeletePost}
                    onEdit={handleEditPost}
                    currentUserId={getCachedUserId()}
                    onOpenProfile={handleOpenProfile}
                  />
                ))}
                <div ref={loadMoreRef} className="h-4" />
                {loadingMore && <p className="py-4 text-center text-sm text-muted-foreground">Carregando mais…</p>}
                {!hasMore && <p className="py-4 text-center text-xs text-muted-foreground">Você está em dia ✨ — volte mais tarde para ver novos registros.</p>}
              </>
            )}
          </>
        ) : (
          // VIEW === "perfil"
          <div className="space-y-4">
            {perfilUserId !== null && (
              <button
                onClick={() => { setView("feed"); setPerfilUserId(null); }}
                className="flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
              >
                <ChevronLeft className="h-4 w-4" /> Voltar ao feed
              </button>
            )}
            <StudyRatsPerfil
              key={`${perfilUserId ?? "me"}-${perfilKey}`}
              userId={perfilUserId ?? undefined}
              onNovaPublicacao={() => setCriando("escolher")}
            />
          </div>
        )}
      </div>

      {/* Lateral (desktop) - irmão direto da coluna do feed */}
      {mostrarLateral && (
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            {/* Em alta na comunidade */}
            <div className="srx-card p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Em alta na comunidade</p>
              {trendingPosts.map((post) => (
                <p key={post.id} className="flex justify-between gap-3 py-1 text-sm">
                  <span className="truncate font-semibold text-foreground">{post.title ?? post.caption?.slice(0, 30) ?? "Post"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{post.likesCount} curtidas</span>
                </p>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* A2: Story Viewer usando fila fixa */}
      {storyFila !== null && storyPos < storyFila.length && (
        (() => {
          const currentAuthorId = storyFila[storyPos];
          const group = groupedStories.find(g => g.authorId === currentAuthorId);
          if (!group) {
            // Story expirou ou foi removido - avançar ou fechar
            return null;
          }
          return (
            <StoryViewer
              key={group.authorId}
              group={group}
              groupIndex={storyPos}
              totalGroups={storyFila.length}
              onClose={() => { setStoryFila(null); setStoryPos(0); }}
              onNextGroup={() => storyPos + 1 < storyFila.length ? setStoryPos(p => p + 1) : setStoryFila(null)}
              onPrevGroup={() => storyPos > 0 ? setStoryPos(p => p - 1) : setStoryFila(null)}
              markViewed={markStoryViewedHook}
            />
          );
        })()
      )}

      {/* Modais */}
      {(criando || editando) && (
        <NovaPublicacaoModal
          tipoInicial={criando === "escolher" || criando === null ? undefined : criando}
          onClose={() => { setCriando(null); setEditando(null); }}
          onPublicado={() => {
            refresh();
            refreshStories();
            setPerfilKey(k => k + 1); // forçar recarregar o perfil
          }}
          editPost={editando}
        />
      )}

      {comentando && postComentando && (
        <ComentariosSheet
          post={postComentando}
          onClose={() => setComentando(null)}
          onEnviar={async (texto) => {
            await addComment(comentando, texto);
            // Otimista: incrementar contador de comentários
            updateCommentsCount(comentando, 1);
            invalidateStudyFeedCache();
          }}
          onDeleteComment={(postId) => updateCommentsCount(postId, -1)}
          currentUser={currentUserAvatar}
        />
      )}
    </div>
  );
}

// ============================================================
// PostCard
// ============================================================

interface PostCardProps {
  post: StudyPost;
  onLike: (postId: string, onlyLike?: boolean) => void;
  onSave: (postId: string) => void;
  onComment: (postId: string) => void;
  onDelete: (post: StudyPost) => void;
  onEdit: (post: StudyPost) => void;
  currentUserId: string | null;
  onOpenProfile: (authorId: string) => void;
}

function PostCard({ post, onLike, onSave, onComment, onDelete, onEdit, currentUserId, onOpenProfile }: PostCardProps) {
  const [idx, setIdx] = useState(0);
  const [burst, setBurst] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isAuthor = post.author.id === currentUserId;

  const duploToque = () => {
    onLike(post.id, true);
    setBurst((b) => b + 1);
  };

  // Fechar menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <article className="srx-card overflow-hidden">
      <header className="flex items-center gap-3 p-3.5">
        <button
          onClick={() => onOpenProfile(post.author.id)}
          className="srx-ring flex-shrink-0"
          aria-label={`Ver perfil de ${post.author.name}`}
        >
          <UserAvatar
            fotoUrl={post.author.avatarUrl}
            avatarTipo={post.author.avatarTipo}
            avatarId={post.author.avatarId}
            nome={post.author.name}
            className="h-9 w-9"
          />
        </button>
        <div className="min-w-0 leading-tight">
          <button
            onClick={() => onOpenProfile(post.author.id)}
            className="text-sm font-semibold text-foreground hover:underline"
          >
            {post.author.name}
          </button>
          <p className="text-xs text-muted-foreground">
            {tempoRelativo(post.createdAt)} · {post.kind === "checkin" ? "Check-in" : post.category ? STUDY_RATS_CATEGORIAS.find(c => c.value === post.category)?.label ?? post.category : "Post"}
          </p>
        </div>
        {isAuthor && (
          <div className="relative" ref={menuRef}>
            <button
              aria-label="Mais opções"
              className="srx-icon ml-auto text-muted-foreground"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-10 srx-card rounded-xl shadow-lg border py-1 min-w-[140px]">
                <button onClick={() => { onEdit(post); setMenuOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-surface-2">
                  Editar
                </button>
                <button onClick={() => { onDelete(post); setMenuOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-surface-2">
                  Excluir
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {post.kind === "post" && (
        <div className="relative mx-3.5 rounded-2xl bg-surface-2 p-4" onDoubleClick={duploToque}>
          {post.category && (
            <span className="srx-chip">
              {STUDY_RATS_CATEGORIAS.find(c => c.value === post.category)?.emoji} {STUDY_RATS_CATEGORIAS.find(c => c.value === post.category)?.label}
            </span>
          )}
          <p className="mt-2 text-base font-bold text-foreground">{post.title}</p>
          <p className="mt-1 text-[15px] leading-relaxed text-foreground/90">{post.caption}</p>
          {burst > 0 && post.photos.length === 0 && <div key={burst} className="srx-burst"><Heart className="h-16 w-16" fill="currentColor" /></div>}
        </div>
      )}

      {post.photos.length > 0 && (
        <div className={`relative ${post.kind === "post" ? "mx-3.5 mt-2 overflow-hidden rounded-2xl" : ""}`} onDoubleClick={duploToque}>
          <div
            ref={ref}
            className="srx-scroll aspect-[4/5] bg-surface-2"
            onScroll={(e) => setIdx(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          >
            {post.photos.map((photo, i) => (
              <div key={i} className="h-full w-full flex-shrink-0 flex items-center justify-center bg-surface-2">
                {photo.url ? (
                  <img
                    src={photo.url}
                    alt=""
                    draggable={false}
                    className="h-full w-full select-none object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23e5e7eb' width='100' height='100'/%3E%3Ctext x='50' y='55' dominant-baseline='middle' text-anchor='middle' font-size='12' fill='%239ca3af'%3EImagem%3C/text%3E%3C/svg%3E"; }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full w-full bg-surface-2 text-muted-foreground">
                    <Camera className="h-12 w-12" />
                  </div>
                )}
              </div>
            ))}
          </div>
          {post.kind === "checkin" && <span className="srx-badge absolute left-3 top-3"><CalendarCheck className="h-3.5 w-3.5 text-accent" /> Check-in · {fmtDuracao(post.durationMin)}</span>}
          {post.photos.length > 1 && <span className="srx-badge absolute right-3 top-3">{idx + 1}/{post.photos.length}</span>}
          {burst > 0 && <div key={burst} className="srx-burst"><Heart className="h-24 w-24" fill="currentColor" /></div>}
        </div>
      )}

      <div className="flex items-center gap-4 px-3.5 pt-3 text-foreground">
        <button
          aria-label="Curtir"
          onClick={() => onLike(post.id)}
          className="srx-icon"
        >
          <Heart key={String(post.likedByMe)} className={`h-6 w-6 ${post.likedByMe ? "srx-liked" : ""}`} fill={post.likedByMe ? "currentColor" : "none"} />
        </button>
        <button aria-label="Comentar" onClick={() => onComment(post.id)} className="srx-icon">
          <MessageCircle className="h-6 w-6" />
        </button>
        {post.photos.length > 1 && (
          <div className="mx-auto flex gap-1">
            {post.photos.map((_, i) => (
              <span key={i} className="srx-dot" data-on={i === idx} />
            ))}
          </div>
        )}
        <button
          aria-label="Salvar"
          onClick={() => onSave(post.id)}
          className={`srx-icon ${post.photos.length > 1 ? "" : "ml-auto"} ${post.savedByMe ? "srx-saved" : ""}`}
        >
          <Bookmark className="h-6 w-6" fill={post.savedByMe ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="space-y-1 px-3.5 pb-4 pt-2 text-sm">
        <p className="text-foreground">
          {post.likesCount === 0
            ? "Seja a primeira a curtir"
            : post.friendLikerId
            ? <>Curtido por <b>{post.friendLikerName}</b>{post.likesCount > 1 && <> e <b>outras {post.likesCount - 1} pessoas</b></>}</>
            : <><b>{post.likesCount}</b> curtida(s)</>}
        </p>
        {post.kind === "checkin" && (
          <>
            <p className="font-bold text-foreground">{post.title}</p>
            {post.subject && (
              <div><span className="srx-chip"><BookOpen className="h-3 w-3" /> {post.subject}</span></div>
            )}
            {post.caption && (
              <p className="text-foreground/90"><b>{(post.author.name.split(" ")[0] ?? post.author.name).toLowerCase()}</b> {post.caption}</p>
            )}
          </>
        )}
        <button onClick={() => onComment(post.id)} className="text-muted-foreground">
          {post.commentsCount > 0 ? `Ver todos os ${post.commentsCount} comentários` : "Adicionar um comentário…"}
        </button>
      </div>
    </article>
  );
}

// ============================================================
// StoryViewer
// ============================================================

interface StoryViewerProps {
  group: { authorId: string; stories: StudyStory[]; author: Omit<StudyAuthor, 'bio'>; isMe: boolean };
  groupIndex: number;
  totalGroups: number;
  onClose: () => void;
  onNextGroup: () => void;
  onPrevGroup: () => void;
  markViewed: (storyId: string) => Promise<void>;
}

function StoryViewer({ group, groupIndex, totalGroups, onClose, onNextGroup, onPrevGroup, markViewed }: StoryViewerProps) {
  const [storyIndex, setStoryIndex] = useState(0);
  const story = group.stories[storyIndex];

  // Refs para callbacks estáveis no timer
  const onNextGroupRef = useRef(onNextGroup);
  const onPrevGroupRef = useRef(onPrevGroup);
  onNextGroupRef.current = onNextGroup;
  onPrevGroupRef.current = onPrevGroup;

  // Auto-advance - timer reinicia apenas quando story.id muda
  useEffect(() => {
    if (!story) return;
    const t = setTimeout(() => {
      if (storyIndex + 1 < group.stories.length) {
        setStoryIndex(i => i + 1);
      } else {
        onNextGroupRef.current();
      }
    }, 5000);
    return () => clearTimeout(t);
  }, [story?.id, storyIndex, group.stories.length]);

  // Marcar como visto ao abrir
  useEffect(() => {
    if (story && !story.viewedByMe && !group.isMe) {
      markViewed(story.id);
    }
  }, [story?.id, group.isMe, markViewed]);

  if (!story) return null;

  // Singular/plural para viewedCount
  const viewedText = story.viewedCount === 1 ? "pessoa" : "pessoas";

  return (
    <div className="srx-overlay fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="srx-sheet relative aspect-[9/16] w-[min(100%,calc(min(88vh,760px)*0.5625))] overflow-hidden rounded-3xl bg-surface" onClick={(e) => e.stopPropagation()}>
        {story.photoUrl ? (
          <img src={story.photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="srx-hero absolute inset-0 grid place-items-center !rounded-none p-8 text-center text-primary-foreground">
            <div>
              {story.category && (
                <span className="srx-chip !bg-background/30">
                  {STUDY_RATS_CATEGORIAS.find(c => c.value === story.category)?.emoji} {STUDY_RATS_CATEGORIAS.find(c => c.value === story.category)?.label}
                </span>
              )}
              <p className="mt-4 text-2xl font-bold leading-snug">{story.text}</p>
            </div>
          </div>
        )}

        {/* Progress bars */}
        <div className="absolute inset-x-0 top-0 space-y-3 bg-gradient-to-b from-background/80 to-transparent p-3">
          <div className="flex gap-1">
            {group.stories.map((_, i) => (
              <div key={i} className="srx-progress flex-1">
                {i < storyIndex ? <i style={{ animation: "none", width: "100%" }} /> : i === storyIndex ? <i key={story.id} /> : null}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <UserAvatar
              fotoUrl={group.author.avatarUrl}
              avatarTipo={group.author.avatarTipo}
              avatarId={group.author.avatarId}
              nome={group.author.name}
              className="h-8 w-8"
            />
            <b>{group.author.name}</b>
            <span className="text-foreground/70">{tempoRelativo(story.createdAt)}</span>
            <button aria-label="Fechar" onClick={onClose} className="ml-auto"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {/* Áreas de toque */}
        <button aria-label="Anterior" onClick={() => storyIndex > 0 ? setStoryIndex(i => i - 1) : onPrevGroupRef.current()} className="absolute inset-y-0 left-0 w-1/3" />
        <button aria-label="Próximo" onClick={() => storyIndex + 1 < group.stories.length ? setStoryIndex(i => i + 1) : onNextGroupRef.current()} className="absolute inset-y-0 right-0 w-1/3" />

        {/* Info inferior */}
        <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-background/90 to-transparent p-4">
          {story.kind !== "post" && story.durationMin > 0 && (
            <span className="srx-badge"><Clock className="h-3.5 w-3.5 text-accent" /> {fmtDuracao(story.durationMin)} de {story.subject}</span>
          )}
          {story.photoUrl && story.text && <p className="text-sm font-semibold text-foreground">{story.text}</p>}
          {group.isMe ? (
            <p className="text-xs text-foreground/80">👁 Visto por {story.viewedCount} {viewedText} · some em 24h</p>
          ) : (
            <p className="text-xs text-foreground/80">{group.author.name}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ComentariosSheet
// ============================================================

interface ComentariosSheetProps {
  post: StudyPost;
  onClose: () => void;
  onEnviar: (texto: string) => Promise<void>;
  onDeleteComment?: (postId: string) => void;
  currentUser: { nome: string; fotoUrl: string | null; avatarTipo: string | null; avatarId: string | null };
}

function ComentariosSheet({ post, onClose, onEnviar, onDeleteComment, currentUser }: ComentariosSheetProps) {
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [comentarios, setComentarios] = useState<StudyComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const confirmDialog = useConfirm();

  useEffect(() => {
    let cancelled = false;
    const loadComments = async () => {
      try {
        const data = await getComments(post.id);
        if (!cancelled) setComentarios(data);
      } catch (err) {
        if (!cancelled) setError(studyRatsErrorMessage(err));
      }
    };
    loadComments();
    return () => { cancelled = true; };
  }, [post.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onEnviar(texto.trim());
      setTexto("");
      // Recarregar comentários
      const data = await getComments(post.id);
      setComentarios(data);
    } catch (err) {
      setError(studyRatsErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const ok = await confirmDialog({
      title: "Excluir comentário?",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;

    setError(null);
    try {
      await deleteComment(commentId);
      const data = await getComments(post.id);
      setComentarios(data);
      invalidateStudyFeedCache();
      onDeleteComment?.(post.id);
    } catch (err) {
      setError(studyRatsErrorMessage(err));
    }
  };

  return createPortal(
    <div className="srx-overlay fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="srx-sheet srx-card flex max-h-[85dvh] w-full max-w-md flex-col p-4" onClick={(e) => e.stopPropagation()}>
        <div className="relative mb-3 flex items-center justify-center">
          <h3 className="text-center text-sm font-bold text-foreground">Comentários</h3>
          <button onClick={onClose} aria-label="Fechar" className="absolute right-0 text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {comentarios.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Ainda não há comentários. Seja a primeira! 💬</p>}
          {comentarios.map((c) => (
            <div key={c.id} className="flex gap-3">
              <UserAvatar
                fotoUrl={c.author.avatarUrl}
                avatarTipo={c.author.avatarTipo}
                avatarId={c.author.avatarId}
                nome={c.author.name}
                className="h-8 w-8"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground"><b>{c.author.name}</b> {c.text}</p>
              </div>
              {c.userId === getCachedUserId() && (
                <button
                  onClick={() => handleDeleteComment(c.id)}
                  className="srx-icon text-muted-foreground"
                  aria-label="Excluir comentário"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          ))}
        </div>
        {error && (
          <div className="mb-2 p-2 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 text-xl">
          {["🔥", "👏", "📚", "💪", "🙏", "❤️"].map((e) => (
            <button key={e} onClick={() => setTexto((t) => t + e)} className="srx-icon">{e}</button>
          ))}
        </div>
        <form className="mt-2 flex items-center gap-2" onSubmit={handleSubmit}>
          <UserAvatar
            fotoUrl={currentUser.fotoUrl}
            avatarTipo={currentUser.avatarTipo}
            avatarId={currentUser.avatarId}
            nome={currentUser.nome}
            className="h-8 w-8"
          />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Adicione um comentário…"
            className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm text-foreground"
            disabled={loading}
          />
          <button
            disabled={!texto.trim() || loading}
            className="text-sm font-bold text-accent disabled:opacity-40"
            type="submit"
          >
            {loading ? "Publicando…" : "Publicar"}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}