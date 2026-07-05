// src/contexts/StudyContext.tsx

import React, { createContext, useContext, useState, useMemo, ReactNode, useCallback, useEffect } from 'react';
import { uid } from '@/utils/helpers';
import { getDb } from '@/lib/db';
import { supabase, getSupabaseWithToken } from '@/lib/supabaseClient';
import { CAMPOS, TIPOS_ESTUDO } from '@/constants';
import { enqueueOperation } from '@/services/queueService';

export type StudyType = 'teorico' | 'pratico';

export interface StudyRecord {
  id: string;
  user_id: string;
  date: string;
  type: StudyType;
  discipline: string;
  topic: string;
  duration: number;
  material?: string;
  questionsCount?: number;
  correctCount?: number;
  wrongCount?: number;
  source?: string;
  observations?: string;
  createdAt: string;
  updated_at?: string;
}

type AddStudyData = Omit<StudyRecord, 'id' | 'user_id' | 'createdAt' | 'updated_at'>;

interface StudyContextType {
  records: StudyRecord[];
  addRecord: (data: AddStudyData) => Promise<void>;
  editRecord: (id: string, data: Partial<Omit<StudyRecord, 'id' | 'user_id' | 'createdAt'>>) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  getRecordsForDate: (date: string) => StudyRecord[];
  getMonthStats: (year: number, month: number) => {
    totalDays: number;
    totalHours: number;
    totalQuestions: number;
    totalCorrect: number;
    totalWrong: number;
    averageCorrectRate: number;
  };
  loading: boolean;
  refresh: () => Promise<void>;
  userId: string | null;
}

const StudyContext = createContext<StudyContextType | undefined>(undefined);

export const StudyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ============================================================
  // CARREGAR DADOS
  // ============================================================
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      let userIdFromAuth: string | null = null;

      const cachedId = localStorage.getItem('revisaflash_user_id');
      if (cachedId) {
        userIdFromAuth = cachedId;
        console.log('✅ [StudyContext] Usuário recuperado do cache local (Clerk):', userIdFromAuth);
      } else {
        console.warn('⚠️ [StudyContext] Nenhum usuário disponível.');
        setLoading(false);
        return;
      }

      setUserId(userIdFromAuth);

      const db = await getDb();
      const result = await db.study_records.find({
        selector: { user_id: userIdFromAuth }
      }).exec();

      const loadedRecords = result.map((doc: any) => doc.toJSON() as StudyRecord);
      setRecords(loadedRecords);
      console.log(`✅ [StudyContext] ${loadedRecords.length} registros carregados.`);
    } catch (error) {
      console.error('❌ [StudyContext] Erro ao carregar registros:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ============================================================
  // ADICIONAR REGISTRO
  // ============================================================
  const addRecord = useCallback(async (data: AddStudyData) => {
    if (!userId) {
      console.error('❌ [StudyContext] Usuário não autenticado');
      throw new Error('Usuário não autenticado');
    }

    const now = new Date().toISOString();
    const newRecord: StudyRecord = {
      ...data,
      id: uid(),
      user_id: userId,
      createdAt: now,
      updated_at: now,
    };

    try {
      const db = await getDb();
      await db.study_records.insert(newRecord);
      setRecords(prev => [...prev, newRecord]);
      console.log('📚 [StudyContext] Registro adicionado e salvo no RxDB:', newRecord);

      try {
        const supabaseClient = await getSupabaseWithToken();
        const { error } = await supabaseClient
          .from('study_records')
          .insert(newRecord);
        if (error) throw error;
        console.log('✅ [StudyContext] Registro sincronizado com Supabase.');
      } catch (supabaseError) {
        console.warn('⚠️ [StudyContext] Falha ao sincronizar (offline?), adicionando à fila.');
        await enqueueOperation('create', 'study_records', newRecord);
      }
    } catch (error) {
      console.error('❌ [StudyContext] Erro ao salvar registro:', error);
      throw error;
    }
  }, [userId]);

  // ============================================================
  // 🔥 EDITAR REGISTRO (NOVO)
  // ============================================================
  const editRecord = useCallback(async (id: string, data: Partial<Omit<StudyRecord, 'id' | 'user_id' | 'createdAt'>>) => {
    try {
      const db = await getDb();
      const doc = await db.study_records.findOne({ selector: { id } }).exec();
      if (!doc) {
        console.warn('⚠️ [StudyContext] Registro não encontrado no RxDB:', id);
        return;
      }

      const updatedData = {
        ...data,
        updated_at: new Date().toISOString()
      };
      await doc.incrementalPatch(updatedData);

      setRecords(prev => prev.map(r =>
        r.id === id ? { ...r, ...updatedData } : r
      ));

      console.log('✏️ [StudyContext] Registro atualizado localmente:', id);

      try {
        const supabaseClient = await getSupabaseWithToken();
        const { error } = await supabaseClient
          .from('study_records')
          .update(updatedData)
          .eq('id', id);
        if (error) throw error;
        console.log('✅ [StudyContext] Registro atualizado no Supabase.');
      } catch (supabaseError) {
        console.warn('⚠️ [StudyContext] Falha ao sincronizar (offline?), adicionando à fila.');
        await enqueueOperation('update', 'study_records', { id, ...updatedData });
      }
    } catch (error) {
      console.error('❌ [StudyContext] Erro ao editar registro:', error);
      throw error;
    }
  }, []);

  // ============================================================
  // EXCLUIR REGISTRO (COM FILA)
  // ============================================================
  const deleteRecord = useCallback(async (id: string) => {
    console.log('🔍 [StudyContext] Tentando excluir registro com id:', id);
    if (!userId) {
      console.warn('⚠️ [StudyContext] userId não disponível');
      return;
    }

    try {
      const db = await getDb();
      const doc = await db.study_records.findOne({ selector: { id } }).exec();
      if (!doc) {
        console.warn('⚠️ [StudyContext] Registro não encontrado no RxDB:', id);
        return;
      }

      // Remover localmente
      await doc.remove();
      setRecords(prev => prev.filter(r => r.id !== id));
      console.log('🗑️ [StudyContext] Registro removido localmente.');

      // Enfileirar exclusão (mesmo se online, para garantir)
      try {
        const supabaseClient = await getSupabaseWithToken();
        const { error } = await supabaseClient
          .from('study_records')
          .delete()
          .eq('id', id);
        if (error) throw error;
        console.log('✅ [StudyContext] Registro excluído do Supabase.');
      } catch (supabaseError) {
        console.warn('⚠️ [StudyContext] Falha ao excluir no Supabase (offline?), adicionando à fila.');
        await enqueueOperation('delete', 'study_records', { id });
      }

      console.log('✅ [StudyContext] Registro excluído com sucesso (localmente)');

    } catch (error) {
      console.error('❌ [StudyContext] Erro ao excluir registro:', error);
      alert('Erro ao excluir registro. Verifique o console.');
    }
  }, [userId]);

  // ============================================================
  // GETTERS
  // ============================================================
  const getRecordsForDate = useCallback((date: string) => {
    return records.filter(r => r.date === date);
  }, [records]);

  const getMonthStats = useCallback((year: number, month: number) => {
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthRecords = records.filter(r => r.date.startsWith(monthStr));
    const totalDays = new Set(monthRecords.map(r => r.date)).size;
    const totalHours = monthRecords.reduce((acc, r) => acc + r.duration, 0) / 60;
    const totalQuestions = monthRecords.reduce((acc, r) => acc + (r.questionsCount || 0), 0);
    const totalCorrect = monthRecords.reduce((acc, r) => acc + (r.correctCount || 0), 0);
    const totalWrong = totalQuestions - totalCorrect;
    const averageCorrectRate = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    return {
      totalDays,
      totalHours: Math.round(totalHours * 10) / 10,
      totalQuestions,
      totalCorrect,
      totalWrong,
      averageCorrectRate,
    };
  }, [records]);

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const value = useMemo(() => ({
    records,
    addRecord,
    editRecord,
    deleteRecord,
    getRecordsForDate,
    getMonthStats,
    loading,
    refresh,
    userId,
  }), [records, addRecord, editRecord, deleteRecord, getRecordsForDate, getMonthStats, loading, refresh, userId]);

  return (
    <StudyContext.Provider value={value}>
      {children}
    </StudyContext.Provider>
  );
};

export const useStudy = () => {
  const context = useContext(StudyContext);
  if (!context) {
    throw new Error('useStudy deve ser usado dentro de StudyProvider');
  }
  return context;
};