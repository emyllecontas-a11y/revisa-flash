// src/contexts/StudyRatsContext.tsx
//
// Contexto offline dos CHECK-INS da própria usuária (alimenta calendário, horas e resumo).
// O RxDB é somente um cache de LEITURA: criar/editar/apagar vão ao Supabase pelo
// studyRatsService e, em seguida, atualizam o RxDB e o estado local. Publicar sem
// internet não é permitido (o serviço devolve erro amigável).

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getDb } from '@/lib/db';
import { STUDY_RATS } from '@/constants';
import { localDateStr, localTimeStr } from '@/utils/date';
import {
  createPost,
  deletePost,
  getCachedUserId,
  updatePost,
} from '@/services/studyRatsService';
import type {
  CreateStudyPostInput,
  CreatedStudyPost,
  StudyCheckinRecord,
  StudyPostKind,
  UpdateStudyPostInput,
} from '@/types/studyRats';

interface StudyRatsContextType {
  /** Check-ins da própria usuária (não apagados), mais recentes primeiro. */
  checkins: StudyCheckinRecord[];
  loading: boolean;
  userId: string | null;
  /** Publica um check-in (feed ou story) e grava o cache local. */
  createCheckin: (input: CreateStudyPostInput) => Promise<CreatedStudyPost>;
  updateCheckin: (id: string, data: UpdateStudyPostInput) => Promise<void>;
  deleteCheckin: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const StudyRatsContext = createContext<StudyRatsContextType | undefined>(undefined);

function sortCheckins(list: StudyCheckinRecord[]): StudyCheckinRecord[] {
  return [...list].sort((a, b) => {
    const dataA = `${a.study_date ?? ''} ${a.study_time ?? ''}`;
    const dataB = `${b.study_date ?? ''} ${b.study_time ?? ''}`;
    if (dataA !== dataB) return dataB.localeCompare(dataA);
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });
}

export const StudyRatsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [checkins, setCheckins] = useState<StudyCheckinRecord[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const cachedId = getCachedUserId();
      if (!cachedId) {
        console.warn('⚠️ [StudyRatsContext] Nenhum usuário disponível.');
        setLoading(false);
        return;
      }

      setUserId(cachedId);

      const db = await getDb();
      const docs = await db.study_posts.find({
        selector: {
          user_id: cachedId,
          isDeleted: { $ne: true },
        },
      }).exec();

      const loaded = sortCheckins(docs.map((doc: any) => doc.toJSON() as StudyCheckinRecord));
      setCheckins(loaded);
      console.log(`🐭 [StudyRatsContext] ${loaded.length} check-in(s) carregado(s) do cache local.`);
    } catch (error) {
      console.error('❌ [StudyRatsContext] Erro ao carregar check-ins:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isSubscribed = true;
    let subscription: { unsubscribe: () => void } | null = null;

    const subscribe = async () => {
      try {
        const db = await getDb();
        if (!db.collections?.study_posts) return;

        subscription = db.study_posts.$.subscribe(() => {
          if (timeoutId) clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            if (isSubscribed) {
              console.log('🔄 [StudyRatsContext] Mudança nos check-ins; recarregando…');
              loadData();
            }
            timeoutId = null;
          }, 500);
        });
      } catch (error) {
        console.warn('⚠️ [StudyRatsContext] Não foi possível observar a coleção study_posts:', error);
      }
    };

    subscribe();

    return () => {
      isSubscribed = false;
      if (timeoutId) clearTimeout(timeoutId);
      subscription?.unsubscribe();
    };
  }, [loadData]);

  const createCheckin = useCallback(
    async (input: CreateStudyPostInput): Promise<CreatedStudyPost> => {
      const kind: StudyPostKind = input.kind;
      if (kind !== STUDY_RATS.TIPOS.CHECKIN) {
        throw new Error('O StudyRatsContext só grava check-ins.');
      }

      const ownerId = userId ?? getCachedUserId();
      if (!ownerId) throw new Error('Usuário não autenticado');

      const result = await createPost(input);
      if (!result.postId) return result;

      const subject = input.subject?.trim() || null;
      const record: StudyCheckinRecord = {
        id: result.postId,
        user_id: ownerId,
        kind: STUDY_RATS.TIPOS.CHECKIN,
        category: null,
        title: result.title ?? (subject ? `Check-in de ${subject}` : 'Check-in de estudo'),
        caption: input.caption?.trim() || null,
        subject,
        duration_min: result.durationMin ?? Number(input.durationMin ?? 0),
        study_date: result.studyDate ?? input.studyDate ?? localDateStr(),
        study_time: result.studyTime ?? localTimeStr(),
        in_feed: input.destination === STUDY_RATS.DESTINOS.FEED,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        isDeleted: false,
        photos: result.photos.map((photo) => ({
          id: photo.id,
          path: photo.path,
          position: photo.position,
        })),
      };

      try {
        const db = await getDb();
        const existing = await db.study_posts.findOne({ selector: { id: record.id } }).exec();
        if (existing) {
          await existing.patch(record);
        } else {
          await db.study_posts.insert(record);
        }
      } catch (rxError) {
        console.warn('⚠️ [StudyRatsContext] Falha ao gravar check-in no cache local (já publicado no servidor):', rxError);
      }

      setCheckins((prev) =>
        sortCheckins([record, ...prev.filter((item) => item.id !== record.id)]),
      );
      console.log('✅ [StudyRatsContext] Check-in publicado e salvo no cache local:', record.id);

      return result;
    },
    [userId],
  );

  const updateCheckin = useCallback(
    async (id: string, data: UpdateStudyPostInput): Promise<void> => {
      await updatePost(id, data);

      const patch: Partial<StudyCheckinRecord> = { updated_at: new Date().toISOString() };
      if (data.title !== undefined) patch.title = data.title.trim() || null;
      if (data.caption !== undefined) patch.caption = data.caption.trim() || null;
      if (data.category !== undefined) patch.category = data.category ?? null;
      if (data.subject !== undefined) patch.subject = data.subject.trim() || null;
      if (data.durationMin !== undefined) patch.duration_min = Number(data.durationMin);

      try {
        const db = await getDb();
        const doc = await db.study_posts.findOne({ selector: { id } }).exec();
        if (doc) await doc.patch(patch);
      } catch (rxError) {
        console.warn('⚠️ [StudyRatsContext] Falha ao atualizar check-in no cache local:', rxError);
      }

      setCheckins((prev) =>
        sortCheckins(prev.map((item) => (item.id === id ? { ...item, ...patch } : item))),
      );
      console.log('✏️ [StudyRatsContext] Check-in atualizado:', id);
    },
    [],
  );

  const deleteCheckin = useCallback(async (id: string): Promise<void> => {
    await deletePost(id);

    try {
      const db = await getDb();
      const doc = await db.study_posts.findOne({ selector: { id } }).exec();
      if (doc) {
        await doc.patch({ isDeleted: true, updated_at: new Date().toISOString() });
      }
    } catch (rxError) {
      console.warn('⚠️ [StudyRatsContext] Falha ao marcar check-in como excluído no cache local:', rxError);
    }

    setCheckins((prev) => prev.filter((item) => item.id !== id));
    console.log('🗑️ [StudyRatsContext] Check-in excluído:', id);
  }, []);

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const value = useMemo(
    () => ({
      checkins,
      loading,
      userId,
      createCheckin,
      updateCheckin,
      deleteCheckin,
      refresh,
    }),
    [checkins, loading, userId, createCheckin, updateCheckin, deleteCheckin, refresh],
  );

  return <StudyRatsContext.Provider value={value}>{children}</StudyRatsContext.Provider>;
};

export const useStudyRatsCheckins = () => {
  const context = useContext(StudyRatsContext);
  if (!context) {
    throw new Error('useStudyRatsCheckins deve ser usado dentro de StudyRatsProvider');
  }
  return context;
};
