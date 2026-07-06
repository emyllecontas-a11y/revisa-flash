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
  isDeleted?: boolean; // 🔥 Soft delete flag
}

type AddErrorData = Omit<ErrorRecord, 'id' | 'user_id' | 'createdAt' | 'repetitions' | 'status' | 'flashcardId' | 'isDeleted'>;

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
  // CARREGAR DADOS (com filtro isDeleted: false)
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

      const db = await getDb();

      // 🔥 Carregar erros não deletados
      const errorsResult = await db.errors.find({
        selector: { 
          user_id: userIdFromAuth,
          isDeleted: { $ne: true }
        }
      }).exec();
      const loadedRecords = errorsResult.map((doc: any) => doc.toJSON() as ErrorRecord);
      setRecords(loadedRecords);

      // Carregar áreas não deletadas
      const areasResult = await db.areas?.find({ 
        selector: { 
          user_id: userIdFromAuth,
          isDeleted: { $ne: true }
        }
      }).exec();
      if (areasResult && areasResult.length > 0) {
        const loadedAreas = areasResult.map((doc: any) => doc.toJSON());
        setAreas(loadedAreas);
      } else {
        // Se não houver áreas salvas, salvar as padrão com isDeleted: false
        const db = await getDb();
        if (db.areas) {
          for (const area of DEFAULT_AREAS) {
            await db.areas.insert({
              id: uid(),
              user_id: userIdFromAuth,
              name: area.name,
              icon: area.icon,
              isDeleted: false,
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
  // ADICIONAR ERRO (com isDeleted: false)
  // ============================================================
  const addError = useCallback(async (data: AddErrorData): Promise<ErrorRecord> => {
    if (!userId) throw new Error('Usuário não autenticado');

    const now = new Date().toISOString();
    const newError: ErrorRecord = {
      ...data,
      id: uid(),
      user_id: userId,
      repetitions: 0,
      status: 'ativo',
      flashcardId: undefined,
      createdAt: now,
      updatedAt: now,
      isDeleted: false, // 🔥
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
  }, []);

  // ============================================================
  // EXCLUIR ERRO (SOFT DELETE com isDeleted: true)
  // ============================================================
  const deleteError = useCallback(async (id: string) => {
    if (!userId) return;
    try {
      const db = await getDb();
      const doc = await db.errors.findOne({ selector: { id } }).exec();
      if (!doc) {
        console.warn('⚠️ Erro não encontrado no RxDB:', id);
        return;
      }

      const now = new Date().toISOString();

      // 🔥 SOFT DELETE: marca isDeleted: true em vez de remover
      await doc.incrementalPatch({
        isDeleted: true,
        updatedAt: now,
      });
      
      setRecords(prev => prev.filter(r => r.id !== id));
      console.log('🗑️ Erro marcado como deletado localmente.');

      // Enfileira atualização (não delete) para sincronizar com Supabase
      try {
        const supabaseClient = await getSupabaseWithToken();
        const { error } = await supabaseClient
          .from('errors')
          .update({ isDeleted: true, updatedAt: now })
          .eq('id', id);
        if (error) throw error;
        console.log('✅ [ErrorContext] Erro marcado como deletado no Supabase.');
      } catch (supabaseError) {
        console.warn('⚠️ [ErrorContext] Falha ao sincronizar soft delete (offline?), adicionando à fila.');
        await enqueueOperation('update', 'errors', { id, isDeleted: true, updatedAt: now });
      }
    } catch (error) {
      console.error('❌ [ErrorContext] Erro ao excluir erro:', error);
      throw error;
    }
  }, [userId]);

  // ============================================================
  // GESTÃO DE ÁREAS (COM SOFT DELETE)
  // ============================================================
  const addArea = useCallback(async (name: string, icon: string) => {
    if (!userId) throw new Error('Usuário não autenticado');
    if (areas.some(a => a.name === name)) {
      alert('Área já existe.');
      return;
    }
    
    const newArea = {
      id: uid(),
      user_id: userId,
      name,
      icon,
      isDeleted: false, // 🔥
    };

    try {
      const db = await getDb();
      if (db.areas) {
        await db.areas.insert(newArea);
      }
      setAreas(prev => [...prev, { name, icon }]);
      console.log('📝 Área adicionada localmente:', name);

      try {
        const supabaseClient = await getSupabaseWithToken();
        const { error } = await supabaseClient
          .from('areas')
          .insert(newArea);
        if (error) throw error;
        console.log('✅ [ErrorContext] Área sincronizada com Supabase.');
      } catch (supabaseError) {
        console.warn('⚠️ [ErrorContext] Falha ao sincronizar área (offline?), adicionando à fila.');
        await enqueueOperation('create', 'areas', newArea);
      }
    } catch (error) {
      console.error('❌ [ErrorContext] Erro ao adicionar área:', error);
      throw error;
    }
  }, [userId, areas]);

  // 🔥 REMOVER ÁREA (SOFT DELETE)
  const removeArea = useCallback(async (name: string) => {
    if (!userId) return;
    if (records.some(r => r.area === name)) {
      alert(`Não é possível remover a área "${name}" pois há erros associados.`);
      return;
    }

    try {
      const db = await getDb();
      let areaId: string | null = null;
      if (db.areas) {
        const doc = await db.areas.findOne({ 
          selector: { 
            user_id: userId, 
            name,
            isDeleted: { $ne: true }
          }
        }).exec();
        if (doc) {
          areaId = doc.toJSON().id;
          // 🔥 SOFT DELETE
          await doc.incrementalPatch({
            isDeleted: true,
          });
        }
      }
      setAreas(prev => prev.filter(a => a.name !== name));
      console.log('🗑️ Área marcada como deletada localmente:', name);

      if (areaId) {
        try {
          const supabaseClient = await getSupabaseWithToken();
          const { error } = await supabaseClient
            .from('areas')
            .update({ isDeleted: true })
            .eq('id', areaId);
          if (error) throw error;
          console.log('✅ [ErrorContext] Área marcada como deletada no Supabase.');
        } catch (supabaseError) {
          console.warn('⚠️ [ErrorContext] Falha ao sincronizar soft delete de área, enfileirando.');
          await enqueueOperation('update', 'areas', { id: areaId, isDeleted: true });
        }
      }
    } catch (error) {
      console.error('❌ [ErrorContext] Erro ao remover área:', error);
      throw error;
    }
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