import { useEffect, useState } from "react";
import { Bookmark, CalendarCheck, Clock, Heart, Lightbulb, MessageCircle, Plus, User, X } from "lucide-react";
import { useStudyProfile } from "@/hooks/useStudyRats";
import { updateBio, getProfilePosts, getSavedPosts, studyRatsErrorMessage } from "@/services/studyRatsService";
import { loadFriendsOverview } from "@/services/friendService";
import { STUDY_RATS, STUDY_RATS_CATEGORIAS } from "@/constants";
import { fmtDuracao, tempoRelativo } from "@/utils/studyRatsFormat";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { StudyRatsStyles } from "./StudyRatsStyles";
import { useToast } from "@/hooks/useToast";
import type { StudyPost } from "@/types/studyRats";

interface StudyRatsPerfilProps {
  /** ID do usuário cujo perfil está sendo visualizado. Se omitido, usa o usuário atual. */
  userId?: string;
  /** Callback ao clicar em "Nova publicação" (apenas no próprio perfil). */
  onNovaPublicacao?: () => void;
}

export function StudyRatsPerfil({ userId, onNovaPublicacao }: StudyRatsPerfilProps) {
  const { profile, loading, error, isMe, refresh } = useStudyProfile(userId);
  const toast = useToast();

  const [aba, setAba] = useState<"checkins" | "posts" | "salvos">("checkins");
  const [bioEditando, setBioEditando] = useState(false);
  const [bioValor, setBioValor] = useState("");
  const [salvandoBio, setSalvandoBio] = useState(false);
  const [aberto, setAberto] = useState<StudyPost | null>(null);

  // Estados para carregamento do grid
  const [gridPosts, setGridPosts] = useState<StudyPost[]>([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);
  const [gridReload, setGridReload] = useState(0);

  // Amizades (apenas no próprio perfil)
  const [amizadesCount, setAmizadesCount] = useState<number | null>(null);
  const [amizadesError, setAmizadesError] = useState(false);

  // Carregar posts do grid conforme a aba e o perfil
  useEffect(() => {
    if (!profile) return;

    const cancelled = { current: false };
    const targetId = profile.userId;

    const carregar = async () => {
      setGridLoading(true);
      setGridError(null);
      setGridPosts([]);

      try {
        let posts: StudyPost[] = [];
        if (aba === "checkins") {
          posts = await getProfilePosts(targetId, STUDY_RATS.TIPOS.CHECKIN);
        } else if (aba === "posts") {
          posts = await getProfilePosts(targetId, STUDY_RATS.TIPOS.POST);
        } else if (aba === "salvos" && isMe) {
          posts = await getSavedPosts();
        }

        if (!cancelled.current) {
          setGridPosts(posts);
        }
      } catch (err) {
        if (!cancelled.current) {
          setGridError(studyRatsErrorMessage(err));
        }
      } finally {
        if (!cancelled.current) {
          setGridLoading(false);
        }
      }
    };

    carregar();

    return () => {
      cancelled.current = true;
    };
  }, [aba, profile?.userId, isMe, gridReload]);

  // Carregar contagem de amizades (apenas no próprio perfil)
  useEffect(() => {
    if (!profile || !isMe) return;

    const cancelled = { current: false };

    loadFriendsOverview(profile.userId)
      .then((overview) => {
        if (!cancelled.current) {
          const aceitas = overview.amigas?.length ?? 0;
          setAmizadesCount(aceitas);
        }
      })
      .catch(() => {
        if (!cancelled.current) {
          setAmizadesError(true);
        }
      });

    return () => {
      cancelled.current = true;
    };
  }, [profile?.userId, isMe]);

  const handleSalvarBio = async () => {
    if (!profile || salvandoBio) return;
    const novaBio = bioValor.trim().slice(0, STUDY_RATS.LIMITES.MAX_BIO);
    setSalvandoBio(true);
    try {
      await updateBio(novaBio);
      setBioEditando(false);
      refresh(); // recarrega perfil
      toast.success("Bio atualizada");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível salvar a bio.";
      toast.error(msg);
    } finally {
      setSalvandoBio(false);
    }
  };

  const handleCancelarBio = () => {
    setBioValor(profile?.bio ?? "");
    setBioEditando(false);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[620px] space-y-5">
        <StudyRatsStyles />
        <div className="srx-card p-8 text-center">
          <div className="animate-pulse space-y-3">
            <div className="h-20 w-20 mx-auto rounded-full bg-surface-2" />
            <div className="h-6 w-48 mx-auto bg-surface-2 rounded" />
            <div className="h-4 w-64 mx-auto bg-surface-2 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-[620px] space-y-5">
        <StudyRatsStyles />
        <div className="srx-card p-8 text-center">
          <User className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-foreground">Perfil não encontrado</p>
          <p className="text-sm text-muted-foreground mt-1">
            {isMe ? "Tente recarregar a página." : "Este perfil não está acessível ou a amizade não foi aceita."}
          </p>
        </div>
      </div>
    );
  }

  const horas = Math.round(profile.hours);
  const isOwnProfile = isMe;

  return (
    <div className="mx-auto max-w-[620px] space-y-5">
      <StudyRatsStyles />

      {/* Cabeçalho do perfil */}
      <section className="flex items-center gap-5 sm:gap-8">
        <span className="srx-ring shrink-0">
          <UserAvatar
            fotoUrl={profile.avatarUrl}
            avatarTipo={profile.avatarTipo}
            avatarId={profile.avatarId}
            nome={profile.name}
            className="h-20 w-20 sm:h-24 sm:w-24"
          />
        </span>
        <div className={`grid flex-1 text-center ${isOwnProfile ? "grid-cols-3" : "grid-cols-2"}`}>
          {[
            [profile.postsCount, "publicações"],
            [`${horas}h`, "estudadas"],
            ...(isOwnProfile ? [[amizadesError ? "—" : amizadesCount ?? "—", "amizades"]] : []),
          ].map(([v, l], idx) => (
            <div key={`${l}-${idx}`}>
              <p className="text-lg font-bold text-foreground">{v}</p>
              <p className="text-xs text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Nome, bio */}
      <div className="space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <p className="font-bold text-foreground">{profile.name}</p>
        </div>
        {!bioEditando && profile.bio && (
          <p className="text-foreground/90 line-clamp-2">{profile.bio}</p>
        )}
        {!bioEditando && !profile.bio && isMe && (
          <p className="text-muted-foreground text-sm">Sem bio ainda. Toque em "Editar perfil" para adicionar.</p>
        )}
        {bioEditando && isMe && (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={bioValor}
              onChange={(e) => setBioValor(e.target.value)}
              maxLength={STUDY_RATS.LIMITES.MAX_BIO}
              className="flex-1 rounded-xl border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Sua bio..."
            />
            <span className="text-xs text-muted-foreground shrink-0">{bioValor.length}/{STUDY_RATS.LIMITES.MAX_BIO}</span>
          </div>
        )}
        {bioEditando && isMe && (
          <div className="flex gap-2">
            <button
              onClick={handleSalvarBio}
              disabled={salvandoBio}
              className="srx-fab flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold"
            >
              {salvandoBio ? "Salvando..." : "Salvar"}
            </button>
            <button
              onClick={handleCancelarBio}
              disabled={salvandoBio}
              className="flex-1 rounded-xl bg-surface-2 py-2 text-sm font-semibold text-foreground hover:bg-surface transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
        {/* Streak: não vem no RPC atual; reaproveitar do app-shell quando disponível */}
      </div>

      {/* Botões de ação (apenas no próprio perfil) */}
      {isMe && (
        <div className="flex gap-2">
          <button
            onClick={() => {
              setBioValor(profile.bio ?? "");
              setBioEditando(true);
            }}
            className="flex-1 rounded-xl bg-surface-2 py-2 text-sm font-semibold text-foreground hover:bg-surface transition-colors"
          >
            Editar perfil
          </button>
          <button
            onClick={onNovaPublicacao}
            className="srx-fab flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold"
            disabled={!onNovaPublicacao}
          >
            <Plus className="h-4 w-4" /> Nova publicação
          </button>
        </div>
      )}

      {/* Abas do grid */}
      <div className="flex border-t border-border">
        {([
          ["checkins", CalendarCheck, "Check-ins"],
          ["posts", Lightbulb, "Publicações"],
          ["salvos", Bookmark, "Salvos"],
        ] as const).map(([k, I, l]) => {
          const isSalvos = k === "salvos";
          if (isSalvos && !isMe) return null; // esconder aba Salvos em perfil de outro
          return (
            <button
              key={k}
              onClick={() => setAba(k as "checkins" | "posts" | "salvos")}
              className={`-mt-px flex flex-1 items-center justify-center gap-1.5 border-t-2 py-3 text-xs font-semibold uppercase tracking-wider ${aba === k ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
            >
              <I className="h-4 w-4" /> {l}
            </button>
          );
        })}
      </div>

      {/* Grid de 3 colunas */}
      <div className="-mt-4 grid grid-cols-3 gap-0.5">
        {(() => {
          let items = gridPosts;

          if (gridLoading) {
            return (
              <div className="col-span-3 py-10 text-center text-sm text-muted-foreground">
                <div className="flex justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                </div>
              </div>
            );
          }

          if (gridError) {
            return (
              <div className="col-span-3 py-10 text-center text-sm text-destructive">
                <p>{gridError}</p>
                <button
                  onClick={() => {
                    setGridError(null);
                    setGridLoading(true);
                    setGridReload(n => n + 1);
                  }}
                  className="mt-2 text-sm font-semibold text-accent"
                >
                  Tentar de novo
                </button>
              </div>
            );
          }

          if (items.length === 0) {
            return (
              <div className="col-span-3 py-10 text-center text-sm text-muted-foreground">
                {aba === "checkins"
                  ? "Nenhum check-in no feed ainda. Faça um check-in na Comunidade!"
                  : aba === "posts"
                    ? "Compartilhe dicas e curiosidades com a comunidade 💡"
                    : "Publicações que você salvar no feed aparecem aqui (só você vê)."}
              </div>
            );
          }

          return items.map((p) => (
            <button
              key={p.id}
              onClick={() => setAberto(p)}
              className="srx-tile"
            >
              {p.photos[0]?.url ? (
                <img src={p.photos[0].url} alt={p.title ?? ""} />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl bg-surface-2">
                  {STUDY_RATS_CATEGORIAS.find((c) => c.value === p.category)?.emoji ?? "📸"}
                </span>
              )}
              <span className="srx-badge absolute bottom-1 left-1 !px-1.5 !py-0.5 !text-[10px]">
                <Clock className="h-2.5 w-2.5 text-accent" />{fmtDuracao(p.durationMin)}
              </span>
              <span className="srx-tile-info">
                <Heart className="h-4 w-4" fill="currentColor" /> {p.likesCount}
                <MessageCircle className="ml-2 h-4 w-4" fill="currentColor" /> {p.commentsCount}
              </span>
            </button>
          ));
        })()}
      </div>

      {/* Visualizador de publicação do feed (PostCard existente) */}
      {aberto && (
        <div className="srx-overlay fixed inset-0 z-50 grid place-items-center p-4" onClick={() => setAberto(null)}>
          <div className="srx-sheet srx-card w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
              {aberto.photos[0]?.url ? (
                <img src={aberto.photos[0].url} alt="" className="aspect-[4/5] w-full object-cover" />
              ) : (
                <div className="aspect-[4/5] w-full flex items-center justify-center bg-surface-2">
                  <span className="text-6xl">{STUDY_RATS_CATEGORIAS.find((c) => c.value === aberto.category)?.emoji ?? "📸"}</span>
                </div>
              )}
              <button aria-label="Fechar" onClick={() => setAberto(null)} className="srx-badge absolute right-3 top-3">
                <X className="h-4 w-4" />
              </button>
              {aberto.kind === "checkin" && (
                <span className="srx-badge absolute left-3 top-3">
                  <Clock className="h-3.5 w-3.5 text-accent" /> {fmtDuracao(aberto.durationMin)}
                </span>
              )}
            </div>
            <div className="space-y-1 p-4 text-sm">
              <div className="flex gap-4 text-foreground"><Heart className="h-6 w-6" /><MessageCircle className="h-6 w-6" /></div>
              <p className="font-bold text-foreground">{aberto.title}</p>
              <p className="text-accent">
                {aberto.kind === STUDY_RATS.TIPOS.CHECKIN
                  ? aberto.subject
                  : STUDY_RATS_CATEGORIAS.find((c) => c.value === aberto.category)?.label ?? "Post"}
              </p>
              <p className="text-muted-foreground">{tempoRelativo(aberto.createdAt)} · {aberto.kind === "checkin" ? (isOwnProfile ? "também no seu calendário" : "no feed") : "no feed"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}