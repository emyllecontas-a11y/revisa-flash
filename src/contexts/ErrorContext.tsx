// src/contexts/ErrorContext.tsx

import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode, useEffect } from 'react';
import { uid } from '@/utils/helpers';
import { getDb } from '@/lib/db';
import { supabase } from '@/lib/supabaseClient';
import { enqueueOperation } from '@/services/queueService';

export type ErrorType = 'Conceito' | 'Interpretação' | 'Memória' | 'Atenção';

export interface ErrorRecord {
  id: string;
  user_id: string;
  question: string;
  correctAnswer: string;
  yourAnswer?: string;
  area: string;
  topic?: string;
  type: ErrorType;
  source?: string;
  comment?: string;
  repetitions: number;
  status: 'ativo' | 'resolvido' | 'arquivado';
  flashcardId?: string;
  createdAt: string;
  updatedAt?: string;
}

type AddErrorData = Omit<ErrorRecord, 'id' | 'user_id' | 'createdAt' | 'repetitions' | 'status' | 'flashcardId'>;

interface ErrorContextType {
  records: ErrorRecord[];
  addError: (data: AddErrorData) => Promise<ErrorRecord>;
  editError: (id: string, data: Partial<Omit<ErrorRecord, 'id' | 'user_id' | 'createdAt'>>) => Promise<void>;
  deleteError: (id: string) => Promise<void>;
  getErrorsByArea: (area: string) => ErrorRecord[];
  getAreaStats: () => { name: string; icon: string; total: number; errors: number }[];
  getTotalErrors: () => number;
  userId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  // Gestão de áreas
  areas: { name: string; icon: string }[];
  addArea: (name: string, icon: string) => Promise<void>;
  removeArea: (name: string) => Promise<void>;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

// Áreas padrão
const DEFAULT_AREAS = [
  { name: 'Patologia Oral', icon: '🔬' },
  { name: 'Periodontia', icon: '🦷' },
  { name: 'Cirurgia BMF', icon: '💉' },
  { name: 'Endodontia', icon: '⚙️' },
  { name: 'Ortodontia', icon: '📐' },
  { name: 'Dentística', icon: '🪥' },
  { name: 'Farmacologia', icon: '💊' },
  { name: 'Radiologia', icon: '📷' },
];

export const ErrorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [records, setRecords] = useState<ErrorRecord[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState<{ name: string; icon: string }[]>(DEFAULT_AREAS);

  // ============================================================
  // CARREGAR USER ID, REGISTROS E ÁREAS DO RxDB
  // ============================================================
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      let userIdFromAuth: string | null = null;

      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (user) {
          userIdFromAuth = user.id;
          localStorage.setItem('revisaflash_user_id', userIdFromAuth);
        }
      } catch {
        const cachedId = localStorage.getItem('revisaflash_user_id');
        if (cachedId) {
          userIdFromAuth = cachedId;
        } else {
          console.warn('⚠️ [ErrorContext] Nenhum usuário disponível.');
          setLoading(false);
          return;
        }
      }

      setUserId(userIdFromAuth);

      const db = await getDb();

      // Carregar erros
      const errorsResult = await db.errors.find({
        selector: { user_id: userIdFromAuth }
      }).exec();
      const loadedRecords = errorsResult.map((doc: any) => doc.toJSON() as ErrorRecord);
      setRecords(loadedRecords);

      // Carregar áreas personalizadas (se houver)
      const areasResult = await db.areas?.find({ selector: { user_id: userIdFromAuth } }).exec();
      if (areasResult && areasResult.length > 0) {
        const loadedAreas = areasResult.map((doc: any) => doc.toJSON());
        setAreas(loadedAreas);
      } else {
        // Se não houver áreas salvas, salvar as padrão
        const db = await getDb();
        if (db.areas) {
          for (const area of DEFAULT_AREAS) {
            await db.areas.insert({
              id: uid(),
              user_id: userIdFromAuth,
              name: area.name,
              icon: area.icon,
            });
          }
        }
        setAreas(DEFAULT_AREAS);
      }

      console.log(`✅ [ErrorContext] ${loadedRecords.length} erros carregados.`);
    } catch (error) {
      console.error('❌ [ErrorContext] Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ============================================================
  // ADICIONAR ERRO
  // ============================================================
  const addError = useCallback(async (data: AddErrorData): Promise<ErrorRecord> => {
    if (!userId) throw new Error('Usuário não autenticado');

    const newError: ErrorRecord = {
      ...data,
      id: uid(),
      user_id: userId,
      repetitions: 0,
      status: 'ativo',
      flashcardId: undefined,
      createdAt: new Date().toISOString(),
    };

    try {
      const db = await getDb();
      await db.errors.insert(newError);
      setRecords(prev => [...prev, newError]);
      console.log('📝 Erro registrado e salvo no RxDB:', newError);

      // Tenta sincronizar com Supabase
      try {
        const { error } = await supabase
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
  }, [userId]);

  // ============================================================
  // EDITAR ERRO
  // ============================================================
  const editError = useCallback(async (id: string, data: Partial<Omit<ErrorRecord, 'id' | 'user_id' | 'createdAt'>>) => {
    try {
      const db = await getDb();
      const doc = await db.errors.findOne({ selector: { id } }).exec();
      if (!doc) {
        console.warn('⚠️ Erro não encontrado no RxDB:', id);
        return;
      }

      const updatedData = {
        ...data,
        updatedAt: new Date().toISOString()
      };
      await doc.incrementalPatch(updatedData);

      setRecords(prev => prev.map(r =>
        r.id === id ? { ...r, ...updatedData } : r
      ));

      // Tenta sincronizar com Supabase
      try {
        const { error } = await supabase
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
  }, []);

  // ============================================================
  // EXCLUIR ERRO (com fila)
  // ============================================================
  const deleteError = useCallback(async (id: string) => {
    if (!userId) return;
    try {
      const db = await getDb();
      const doc = await db.errors.findOne({ selector: { id } }).exec();
      if (doc) {
        // Remover localmente
        await doc.remove();
        setRecords(prev => prev.filter(r => r.id !== id));
        console.log('🗑️ Erro removido localmente.');

        // Tentar excluir no Supabase
        try {
          const { error } = await supabase
            .from('errors')
            .delete()
            .eq('id', id);
          if (error) throw error;
          console.log('✅ [ErrorContext] Erro excluído do Supabase.');
        } catch (supabaseError) {
          console.warn('⚠️ [ErrorContext] Falha ao excluir no Supabase (offline?), adicionando à fila.');
          await enqueueOperation('delete', 'errors', { id });
        }
      } else {
        console.warn('⚠️ Erro não encontrado no RxDB:', id);
      }
    } catch (error) {
      console.error('❌ [ErrorContext] Erro ao excluir erro:', error);
      throw error;
    }
  }, [userId]);

  // ============================================================
  // GESTÃO DE ÁREAS
  // ============================================================
  const addArea = useCallback(async (name: string, icon: string) => {
    if (!userId) throw new Error('Usuário não autenticado');
    if (areas.some(a => a.name === name)) {
      alert('Área já existe.');
      return;
    }
    const db = await getDb();
    if (db.areas) {
      await db.areas.insert({
        id: uid(),
        user_id: userId,
        name,
        icon,
      });
    }
    setAreas(prev => [...prev, { name, icon }]);
  }, [userId, areas]);

  const removeArea = useCallback(async (name: string) => {
    if (!userId) return;
    // Verifica se há erros com essa área
    if (records.some(r => r.area === name)) {
      alert(`Não é possível remover a área "${name}" pois há erros associados.`);
      return;
    }
    const db = await getDb();
    if (db.areas) {
      const doc = await db.areas.findOne({ selector: { user_id: userId, name } }).exec();
      if (doc) {
        await doc.remove();
      }
    }
    setAreas(prev => prev.filter(a => a.name !== name));
  }, [userId, records]);

  // ============================================================
  // GETTERS
  // ============================================================
  const getErrorsByArea = useCallback((area: string) => {
    return records.filter(r => r.area === area);
  }, [records]);

  const getAreaStats = useCallback(() => {
    return areas.map(area => {
      const areaRecords = records.filter(r => r.area === area.name);
      const erroCount = areaRecords.length;
      const total = Math.max(erroCount + Math.floor(Math.random() * 20) + 5, 10);
      return {
        name: area.name,
        icon: area.icon,
        total,
        errors: erroCount,
      };
    });
  }, [areas, records]);

  const getTotalErrors = useCallback(() => {
    return records.length;
  }, [records]);

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const value = useMemo(() => ({
    records,
    addError,
    editError,
    deleteError,
    getErrorsByArea,
    getAreaStats,
    getTotalErrors,
    userId,
    loading,
    refresh,
    areas,
    addArea,
    removeArea,
  }), [records, addError, editError, deleteError, getErrorsByArea, getAreaStats, getTotalErrors, userId, loading, refresh, areas, addArea, removeArea]);

  return (
    <ErrorContext.Provider value={value}>
      {children}
    </ErrorContext.Provider>
  );
};

export const useErrors = () => {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useErrors deve ser usado dentro de ErrorProvider');
  }
  return context;
};