// src/contexts/ErrorContext.tsx

import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode, useEffect } from 'react';
import { uid } from '@/utils/helpers';
import { getDb } from '@/lib/db';
import { supabase, getSupabaseWithToken } from '@/lib/supabaseClient';
import { enqueueOperation } from '@/services/queueService';

export type ErrorType = 'Conceito' | 'Interpretação' | 'Memória' | 'Atenção';

export interface ErrorRecord {
  id: string;
  user_id: string;
  question: string;
  correctAnswer: string;
  yourAnswer?: string;
  /** @deprecated Campo legado. */
  area?: string;
  /** Vínculo com a tabela `disciplines`. */
  discipline_id?: string;
  topic?: string;
  type: ErrorType;
  source?: string;
  /** ID da lista de origem (se veio de uma lista de questões). */
  source_lista_id?: string;
  comment?: string;
  repetitions: number;
  status: 'ativo' | 'resolvido' | 'arquivado';
  flashcardId?: string;
  createdAt: string;
  updated_at?: string;
  isDeleted?: boolean;
}

export interface Discipline {
  id: string;
  name: string;
}

type AddErrorData = Omit<
  ErrorRecord,
  'id' | 'user_id' | 'createdAt' | 'repetitions' | 'status' | 'flashcardId' | 'isDeleted' | 'updated_at'
>;

interface ErrorContextType {
  records: ErrorRecord[];
  addError: (data: AddErrorData) => Promise<ErrorRecord>;
  addOrIncrementError: (data: AddErrorData) => Promise<{ error: ErrorRecord; wasIncremented: boolean }>;
  editError: (
    id: string,
    data: Partial<Omit<ErrorRecord, 'id' | 'user_id' | 'createdAt'>>
  ) => Promise<void>;
  deleteError: (id: string) => Promise<void>;
  getErrorsByDiscipline: (disciplineId: string | null) => ErrorRecord[];
  getDisciplineStats: () => { id: string | null; name: string; errors: number }[];
  getTotalErrors: () => number;
  userId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  disciplines: Discipline[];
  disciplinesLoading: boolean;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

export const ErrorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [records, setRecords] = useState<ErrorRecord[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [disciplinesLoading, setDisciplinesLoading] = useState(true);

  // ============================================================
  // CARREGAR DISCIPLINAS DO SUPABASE (só as ativas)
  // ============================================================
  const loadDisciplines = useCallback(async (uid: string) => {
    try {
      setDisciplinesLoading(true);
      const client = await getSupabaseWithToken();
      const { data, error } = await client
        .from('disciplines')
        .select('id, name')
        .eq('user_id', uid)
        .eq('isDeleted', false)
        .order('name', { ascending: true });

      if (error) throw error;
      setDisciplines((data || []) as Discipline[]);
      console.log(`✅ [ErrorContext] ${data?.length || 0} disciplinas carregadas.`);
    } catch (e) {
      console.warn('⚠️ [ErrorContext] Erro ao carregar disciplinas:', e);
      setDisciplines([]);
    } finally {
      setDisciplinesLoading(false);
    }
  }, []);

  // ============================================================
  // CARREGAR ERROS (RxDB local)
  // ============================================================
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      let userIdFromAuth: string | null = null;

      const cachedId = localStorage.getItem('revisaflash_user_id');
      if (cachedId) {
        userIdFromAuth = cachedId;
        console.log('✅ [ErrorContext] Usuário recuperado do cache local (Clerk):', userIdFromAuth);
      } else {
        console.warn('⚠️ [ErrorContext] Nenhum usuário disponível.');
        setLoading(false);
        return;
      }

      setUserId(userIdFromAuth);

      loadDisciplines(userIdFromAuth);

      const db = await getDb();

      const errorsResult = await db.errors.find({
        selector: {
          user_id: userIdFromAuth,
          isDeleted: { $ne: true },
        },
      }).exec();
      const loadedRecords = errorsResult.map((doc: any) => doc.toJSON() as ErrorRecord);
      setRecords(loadedRecords);
      console.log(`✅ [ErrorContext] ${loadedRecords.length} erros carregados.`);
    } catch (error) {
      console.error('❌ [ErrorContext] Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  }, [loadDisciplines]);

  // ============================================================
  // LISTENER
  // ============================================================
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    let isSubscribed = true;

    const loadAndSubscribe = async () => {
      if (!isSubscribed) return;
      await loadData();

      try {
        const db = await getDb();
        if (db.collections?.errors) {
          const subscription = db.collections.errors.$.subscribe(() => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
              if (isSubscribed) {
                console.log('🔄 Mudança detectada na coleção errors, recarregando...');
                loadData();
              }
              timeoutId = null;
            }, 500);
          });
          return () => {
            isSubscribed = false;
            if (timeoutId) clearTimeout(timeoutId);
            subscription.unsubscribe();
          };
        }
      } catch (e) {
        console.warn('Erro ao configurar listener de errors:', e);
      }
    };

    loadAndSubscribe();
  }, [loadData]);

  // ============================================================
  // ADICIONAR ERRO
  // ============================================================
  const addError = useCallback(
    async (data: AddErrorData): Promise<ErrorRecord> => {
      if (!userId) throw new Error('Usuário não autenticado');

      const now = new Date().toISOString();
      const newError: ErrorRecord = {
        ...data,
        area: data.area ?? '',
        id: uid(),
        user_id: userId,
        repetitions: 0,
        status: 'ativo',
        flashcardId: undefined,
        createdAt: now,
        updated_at: now,
        isDeleted: false,
      };

      try {
        const db = await getDb();
        await db.errors.insert(newError);
        setRecords(prev => [...prev, newError]);
        console.log('📝 Erro registrado e salvo no RxDB:', newError);

        try {
          const supabaseClient = await getSupabaseWithToken();
          const { error } = await supabaseClient
            .from('errors')
            .insert(newError);
          if (error) throw error;
          console.log('✅ [ErrorContext] Erro sincronizado com Supabase.');
        } catch (supabaseError) {
          console.warn('⚠️ [ErrorContext] Falha ao sincronizar (offline?), adicionando à fila.');
          await enqueueOperation('create', 'errors', newError);
        }

        return newError;
      } catch (error) {
        console.error('❌ [ErrorContext] Erro ao salvar erro:', error);
        throw error;
      }
    },
    [userId]
  );

  // ============================================================
  // EDITAR ERRO
  // ============================================================
  const editError = useCallback(
    async (
      id: string,
      data: Partial<Omit<ErrorRecord, 'id' | 'user_id' | 'createdAt'>>
    ) => {
      try {
        const db = await getDb();
        const doc = await db.errors.findOne({ selector: { id } }).exec();
        if (!doc) {
          console.warn('⚠️ Erro não encontrado no RxDB:', id);
          return;
        }

        const updatedData = {
          ...data,
          updated_at: new Date().toISOString(),
        };
        await doc.incrementalPatch(updatedData);

        setRecords(prev => prev.map(r => (r.id === id ? { ...r, ...updatedData } : r)));

        try {
          const supabaseClient = await getSupabaseWithToken();
          const { error } = await supabaseClient
            .from('errors')
            .update(updatedData)
            .eq('id', id);
          if (error) throw error;
          console.log('✅ [ErrorContext] Erro atualizado no Supabase.');
        } catch (supabaseError) {
          console.warn('⚠️ [ErrorContext] Falha ao sincronizar (offline?), adicionando à fila.');
          await enqueueOperation('update', 'errors', { id, ...updatedData });
        }
      } catch (error) {
        console.error('❌ [ErrorContext] Erro ao editar erro:', error);
        throw error;
      }
    },
    []
  );

  // ============================================================
  // ADICIONAR OU INCREMENTAR (depois de editError!)
  // ============================================================
  const addOrIncrementError = useCallback(
    async (data: AddErrorData): Promise<{ error: ErrorRecord; wasIncremented: boolean }> => {
      if (!userId) throw new Error('Usuário não autenticado');

      const existente = records.find(r =>
        r.question.trim().toLowerCase() === data.question.trim().toLowerCase() &&
        (r.discipline_id || null) === (data.discipline_id || null)
      );

      if (existente) {
        const updated = {
          repetitions: (existente.repetitions || 0) + 1,
          yourAnswer: data.yourAnswer || existente.yourAnswer,
          updated_at: new Date().toISOString(),
        };
        await editError(existente.id, updated);
        console.log(`♻️ Erro existente incrementado: ${existente.id} (rep: ${updated.repetitions})`);
        return { error: { ...existente, ...updated }, wasIncremented: true };
      }

      const novo = await addError(data);
      return { error: novo, wasIncremented: false };
    },
    [userId, records, addError, editError]
  );

  // ============================================================
  // EXCLUIR ERRO
  // ============================================================
  const deleteError = useCallback(
    async (id: string) => {
      if (!userId) return;
      try {
        const db = await getDb();
        const doc = await db.errors.findOne({ selector: { id } }).exec();
        if (!doc) {
          console.warn('⚠️ Erro não encontrado no RxDB:', id);
          return;
        }

        const now = new Date().toISOString();
        await doc.incrementalPatch({ isDeleted: true, updated_at: now });
        setRecords(prev => prev.filter(r => r.id !== id));
        console.log('🗑️ Erro marcado como deletado localmente.');

        try {
          const supabaseClient = await getSupabaseWithToken();
          const { error } = await supabaseClient
            .from('errors')
            .update({ isDeleted: true, updated_at: now })
            .eq('id', id);
          if (error) throw error;
          console.log('✅ [ErrorContext] Erro marcado como deletado no Supabase.');
        } catch (supabaseError) {
          console.warn('⚠️ [ErrorContext] Falha ao sincronizar soft delete, enfileirando.');
          await enqueueOperation('update', 'errors', { id, isDeleted: true, updated_at: now });
        }
      } catch (error) {
        console.error('❌ [ErrorContext] Erro ao excluir erro:', error);
        throw error;
      }
    },
    [userId]
  );

  // ============================================================
  // GETTERS
  // ============================================================
  const getErrorsByDiscipline = useCallback(
    (disciplineId: string | null) => {
      if (disciplineId === null) {
        return records.filter(r => !r.discipline_id);
      }
      return records.filter(r => r.discipline_id === disciplineId);
    },
    [records]
  );

  const getDisciplineStats = useCallback(() => {
    const stats: { id: string | null; name: string; errors: number }[] = [];

    for (const d of disciplines) {
      const errors = records.filter(r => r.discipline_id === d.id).length;
      stats.push({ id: d.id, name: d.name, errors });
    }

    const orphans = records.filter(r => !r.discipline_id).length;
    if (orphans > 0) {
      stats.push({ id: null, name: 'Sem disciplina', errors: orphans });
    }

    return stats;
  }, [disciplines, records]);

  const getTotalErrors = useCallback(() => records.length, [records]);

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const value = useMemo(
    () => ({
      records,
      addError,
      addOrIncrementError,
      editError,
      deleteError,
      getErrorsByDiscipline,
      getDisciplineStats,
      getTotalErrors,
      userId,
      loading,
      refresh,
      disciplines,
      disciplinesLoading,
    }),
    [
      records,
      addError,
      addOrIncrementError,
      editError,
      deleteError,
      getErrorsByDiscipline,
      getDisciplineStats,
      getTotalErrors,
      userId,
      loading,
      refresh,
      disciplines,
      disciplinesLoading,
    ]
  );

  return <ErrorContext.Provider value={value}>{children}</ErrorContext.Provider>;
};

export const useErrors = () => {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useErrors deve ser usado dentro de ErrorProvider');
  }
  return context;
};