// src/hooks/useStudyRats.ts
//
// Hooks do Study Rats. Sem react-query: estado React + cache simples em memória
// (o queryClient do app existe, mas não é usado em nenhuma tela).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getFeed,
  getProfile,
  getSignedPhotoUrls,
  getStories,
  cleanupExpiredStories,
  getCachedUserId,
  markStoryViewed,
  studyRatsErrorMessage,
  toggleLike,
  toggleSave,
} from '@/services/studyRatsService';
import { useStudyRatsCheckins } from '@/contexts/StudyRatsContext';
import { isDateInMonth } from '@/utils/date';
import type {
  StudyCalendarEntry,
  StudyFeedCursor,
  StudyFeedFilter,
  StudyPost,
  StudyProfileStats,
  StudyStory,
} from '@/types/studyRats';

// ============================================================
// CACHE EM MEMÓRIA DO FEED
// ============================================================

interface FeedCacheEntry {
  posts: StudyPost[];
  nextCursor: StudyFeedCursor | null;
  at: number;
}

const FEED_CACHE_TTL_MS = 60_000;
const feedCache = new Map<string, FeedCacheEntry>();

function cacheKey(filter?: StudyFeedFilter): string {
  return JSON.stringify(filter ?? {});
}

/** Invalida todo o cache do feed em memória (usado após publicar/editar/excluir). */
export function invalidateStudyFeedCache(): void {
  feedCache.clear();
}

// ============================================================
// useStudyFeed — paginação infinita + curtir/salvar otimistas
// ============================================================

export function useStudyFeed(filter?: StudyFeedFilter) {
  const key = cacheKey(filter);
  const cached = feedCache.get(key);

  const [posts, setPosts] = useState<StudyPost[]>(cached?.posts ?? []);
  const [nextCursor, setNextCursor] = useState<StudyFeedCursor | null>(
    cached?.nextCursor ?? null,
  );
  const [loading, setLoading] = useState(!cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const postsRef = useRef<StudyPost[]>(posts);
  const filterRef = useRef<StudyFeedFilter | undefined>(filter);
  filterRef.current = filter;
  const keyRef = useRef(key);
  keyRef.current = key;

  const commit = useCallback(
    (next: StudyPost[], cursor?: StudyFeedCursor | null) => {
      postsRef.current = next;
      setPosts(next);

      const previous = feedCache.get(key);
      const nextCursorValue = cursor === undefined ? previous?.nextCursor ?? null : cursor;
      feedCache.set(key, { posts: next, nextCursor: nextCursorValue, at: Date.now() });
      setNextCursor(nextCursorValue);
    },
    [key],
  );

  useEffect(() => {
    const entry = feedCache.get(key);
    if (entry && Date.now() - entry.at < FEED_CACHE_TTL_MS) {
      postsRef.current = entry.posts;
      setPosts(entry.posts);
      setNextCursor(entry.nextCursor);
      setError(null);
      setLoading(false);
      return;
    }

    // Reset antes de buscar: evita lista antiga na tela e ações no filtro errado
    postsRef.current = [];
    setPosts([]);
    setNextCursor(null);

    let cancelled = false;
    setLoading(true);
    setError(null);

    getFeed({ filter: filterRef.current })
      .then((page) => {
        if (cancelled) return;
        postsRef.current = page.posts;
        setPosts(page.posts);
        setNextCursor(page.nextCursor);
        feedCache.set(key, { posts: page.posts, nextCursor: page.nextCursor, at: Date.now() });
      })
      .catch((err) => {
        if (!cancelled) setError(studyRatsErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await getFeed({ filter: filterRef.current });
      commit(page.posts, page.nextCursor);
    } catch (err) {
      setError(studyRatsErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [commit]);

  const loadingMoreRef = useRef(false);

  const loadMore = useCallback(async () => {
    const cursor = nextCursor;
    const fetchKey = key; // guarda a chave antes do await
    if (!cursor || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await getFeed({ cursor, filter: filterRef.current });
      // Se o filtro mudou durante o fetch, descarta o resultado
      if (fetchKey !== keyRef.current) return;
      const existing = new Set(postsRef.current.map((post) => post.id));
      const merged = [...postsRef.current, ...page.posts.filter((post) => !existing.has(post.id))];
      commit(merged, page.nextCursor);
    } catch (err) {
      if (fetchKey === keyRef.current) setError(studyRatsErrorMessage(err));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [nextCursor, commit]);

  const likePost = useCallback(
    async (postId: string, onlyLike = false) => {
      const current = postsRef.current.find((post) => post.id === postId);
      if (!current) return;
      if (onlyLike && current.likedByMe) return;

      const nextLiked = onlyLike ? true : !current.likedByMe;
      const optimistic = postsRef.current.map((post) =>
        post.id === postId
          ? {
              ...post,
              likedByMe: nextLiked,
              likesCount: Math.max(0, post.likesCount + (nextLiked ? 1 : -1)),
            }
          : post,
      );
      commit(optimistic);

      try {
        const result = await toggleLike(postId, { onlyLike });
        if (result.liked !== nextLiked) {
          commit(
            postsRef.current.map((post) =>
              post.id === postId
                ? {
                    ...post,
                    likedByMe: result.liked,
                    likesCount: Math.max(0, post.likesCount + (result.liked ? 1 : -1)),
                  }
                : post,
            ),
          );
        }
      } catch (err) {
        commit(
          postsRef.current.map((post) =>
            post.id === postId
              ? { ...post, likedByMe: current.likedByMe, likesCount: current.likesCount }
              : post,
          ),
        );
        setError(studyRatsErrorMessage(err));
      }
    },
    [commit],
  );

  const savePost = useCallback(
    async (postId: string) => {
      const current = postsRef.current.find((post) => post.id === postId);
      if (!current) return;

      const nextSaved = !current.savedByMe;
      commit(
        postsRef.current.map((post) =>
          post.id === postId ? { ...post, savedByMe: nextSaved } : post,
        ),
      );

      try {
        const result = await toggleSave(postId);
        if (result.saved !== nextSaved) {
          commit(
            postsRef.current.map((post) =>
              post.id === postId ? { ...post, savedByMe: result.saved } : post,
            ),
          );
        }
      } catch (err) {
        commit(
          postsRef.current.map((post) =>
            post.id === postId ? { ...post, savedByMe: current.savedByMe } : post,
          ),
        );
        setError(studyRatsErrorMessage(err));
      }
    },
    [commit],
  );

  return {
    posts,
    loading,
    loadingMore,
    error,
    hasMore: Boolean(nextCursor),
    refresh,
    loadMore,
    likePost,
    savePost,
    /** Atualiza o contador de comentários de um post (otimista). */
    updateCommentsCount: useCallback(
      (postId: string, delta: number) => {
        commit(
          postsRef.current.map((post) =>
            post.id === postId
              ? { ...post, commentsCount: Math.max(0, post.commentsCount + delta) }
              : post,
          ),
        );
      },
      [commit],
    ),
  };
}

// ============================================================
// useStories
// ============================================================

export function useStories() {
  const [stories, setStories] = useState<StudyStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getStories();
      setStories(list);
    } catch (err) {
      setError(studyRatsErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Limpeza em segundo plano; não trava a tela e ignora erros.
    void cleanupExpiredStories();
  }, [load]);

  const markViewed = useCallback(async (storyId: string) => {
    setStories((prev) =>
      prev.map((story) => (story.id === storyId ? { ...story, viewedByMe: true } : story)),
    );
    try {
      await markStoryViewed(storyId);
    } catch {
      // O anel de "visto" nunca deve quebrar a visualização.
    }
  }, []);

  return { stories, loading, error, refresh: load, markViewed };
}

// ============================================================
// useStudyProfile
// ============================================================

export function useStudyProfile(userId?: string) {
  const currentUserId = getCachedUserId();
  const targetId = userId ?? currentUserId;

  const [profile, setProfile] = useState<StudyProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadAt, setReloadAt] = useState(0);

  useEffect(() => {
    if (!targetId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getProfile(targetId)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch((err) => {
        if (!cancelled) setError(studyRatsErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [targetId, reloadAt]);

  const refresh = useCallback(() => {
    setReloadAt((value) => value + 1);
  }, []);

  return {
    profile,
    loading,
    error,
    refresh,
    userId: targetId,
    isMe: Boolean(targetId && currentUserId && targetId === currentUserId),
  };
}

// ============================================================
// useCalendarCheckins — lê do cache local (RxDB) e assina as fotos
// ============================================================

export function useCalendarCheckins(year: number, month: number) {
  const { checkins, loading: contextLoading, refresh } = useStudyRatsCheckins();
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [urlsLoading, setUrlsLoading] = useState(false);

  const entries = useMemo<StudyCalendarEntry[]>(() => {
    return checkins
      .filter((checkin) => isDateInMonth(checkin.study_date, year, month))
      .map((checkin) => ({
        id: checkin.id,
        studyDate: checkin.study_date,
        studyTime: checkin.study_time,
        subject: checkin.subject,
        durationMin: checkin.duration_min,
        title: checkin.title,
        caption: checkin.caption,
        inFeed: checkin.in_feed,
        createdAt: checkin.created_at,
        photos: [...(checkin.photos ?? [])]
          .sort((a, b) => a.position - b.position)
          .map((photo) => ({
            path: photo.path,
            position: photo.position,
            url: urls.get(photo.path) ?? null,
          })),
      }))
      .sort((a, b) => {
        const da = `${a.studyDate} ${a.studyTime ?? ''}`;
        const db = `${b.studyDate} ${b.studyTime ?? ''}`;
        return da.localeCompare(db);
      });
  }, [checkins, year, month, urls]);

  const paths = useMemo(
    () => entries.flatMap((entry) => entry.photos.map((photo) => photo.path)),
    [entries],
  );
  const pathsKey = paths.join('|');

  useEffect(() => {
    if (!pathsKey) {
      setUrls(new Map());
      return;
    }

    let cancelled = false;
    setUrlsLoading(true);

    getSignedPhotoUrls(pathsKey.split('|'))
      .then((map) => {
        if (!cancelled) setUrls(map);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setUrlsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pathsKey]);

  const byDate = useMemo(() => {
    const grouped: Record<string, StudyCalendarEntry[]> = {};
    for (const entry of entries) {
      (grouped[entry.studyDate] ??= []).push(entry);
    }
    return grouped;
  }, [entries]);

  const totalMinutes = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.durationMin, 0),
    [entries],
  );

  return {
    entries,
    byDate,
    totalMinutes,
    daysCount: Object.keys(byDate).length,
    loading: contextLoading || urlsLoading,
    refresh,
  };
}
