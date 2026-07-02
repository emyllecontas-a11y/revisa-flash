// src/lib/supabaseClient.ts
// Cliente Supabase para operações com autenticação via Clerk

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://driayoaxyrpfdaqugvmx.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyaWF5b2F4eXJwZmRhcXVndm14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MzE3MjIsImV4cCI6MjA5NzQwNzcyMn0.iAZZ2J7sXthYj8UQYEAwuJGbbLt2cudDpp0D2HaxHPI';

// ============================================================
// CLIENTE SUPABASE BASE
// ============================================================
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const supabaseReady = true;

console.log('✅ Supabase client inicializado!');

// ============================================================
// FUNÇÃO PARA OBTER O TOKEN DO CLERK (com fallback)
// ============================================================
export const getClerkToken = async (): Promise<string | null> => {
  try {
    // Verifica se estamos no navegador
    if (typeof window === 'undefined') return null;
    
    // Importa dinamicamente para evitar dependência circular
    const { getToken } = await import("@clerk/clerk-react");
    const token = await getToken({ template: 'supabase' })
    console.log('🔑 Token do Clerk obtido com sucesso!');
    return token;
  } catch (error) {
    console.warn('⚠️ Erro ao obter token do Clerk:', error);
    return null;
  }
};

// ============================================================
// FUNÇÃO PARA CRIAR UM CLIENTE SUPABASE COM O TOKEN DO CLERK
// ============================================================
export const getSupabaseWithToken = async () => {
  const token = await getClerkToken();
  if (!token) {
    console.warn('⚠️ Nenhum token do Clerk disponível. Usando cliente anônimo.');
    return supabase;
  }

  console.log('✅ Criando cliente Supabase com token do Clerk');
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
};
// ============================================================
// WRAPPERS PARA OPERAÇÕES COM AUTENTICAÇÃO
// ============================================================

/**
 * Executa uma operação Supabase com o token do Clerk
 */
export const withAuth = async <T>(
  fn: (client: any) => Promise<T>
): Promise<T> => {
  const client = await getSupabaseWithToken();
  return fn(client);
};

// ============================================================
// AUTENTICAÇÃO (legado - mantido para compatibilidade)
// ============================================================
export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return { success: true, user };
  } catch (error: any) {
    console.error('Erro ao buscar usuário:', error);
    return { success: false, error: error.message };
  }
};

export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Erro ao fazer logout:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// 📚 DISCIPLINAS
// ============================================================
export const getDisciplines = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('disciplines')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao buscar disciplinas:', error);
    return { success: false, error: error.message };
  }
};

export const createDiscipline = async (userId: string, name: string) => {
  try {
    const id = Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('disciplines')
      .insert({
        id,
        user_id: userId,
        name,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao criar disciplina:', error);
    return { success: false, error: error.message };
  }
};

export const updateDiscipline = async (id: string, data: any) => {
  try {
    const { data: result, error } = await supabase
      .from('disciplines')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: result };
  } catch (error: any) {
    console.error('Erro ao atualizar disciplina:', error);
    return { success: false, error: error.message };
  }
};

export const deleteDiscipline = async (id: string) => {
  try {
    const { error } = await supabase
      .from('disciplines')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Erro ao deletar disciplina:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// 📚 TÓPICOS
// ============================================================
export const getTopics = async (disciplineId: string) => {
  try {
    const { data, error } = await supabase
      .from('topics')
      .select('*')
      .eq('discipline_id', disciplineId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao buscar tópicos:', error);
    return { success: false, error: error.message };
  }
};

export const createTopic = async (disciplineId: string, name: string, status: string = 'nao_estudado', plannedDate?: string) => {
  try {
    const id = Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('topics')
      .insert({
        id,
        discipline_id: disciplineId,
        name,
        status,
        planned_date: plannedDate || null,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao criar tópico:', error);
    return { success: false, error: error.message };
  }
};

export const updateTopic = async (id: string, data: any) => {
  try {
    const { data: result, error } = await supabase
      .from('topics')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: result };
  } catch (error: any) {
    console.error('Erro ao atualizar tópico:', error);
    return { success: false, error: error.message };
  }
};

export const deleteTopic = async (id: string) => {
  try {
    const { error } = await supabase
      .from('topics')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Erro ao deletar tópico:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// ❌ ERROS
// ============================================================
export const createError = async (userId: string, errorData: {
  question: string;
  area: string;
  correctAnswer: string;
  tipoErro: string;
  observacao?: string;
}) => {
  try {
    const id = Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('errors')
      .insert({
        id,
        user_id: userId,
        question: errorData.question,
        area: errorData.area,
        correct_answer: errorData.correctAnswer,
        tipo_erro: errorData.tipoErro,
        observacao: errorData.observacao || '',
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao criar erro:', error);
    return { success: false, error: error.message };
  }
};

export const getErrors = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('errors')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao buscar erros:', error);
    return { success: false, error: error.message };
  }
};

export const updateError = async (id: string, data: any) => {
  try {
    const { data: result, error } = await supabase
      .from('errors')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: result };
  } catch (error: any) {
    console.error('Erro ao atualizar erro:', error);
    return { success: false, error: error.message };
  }
};

export const deleteError = async (id: string) => {
  try {
    const { error } = await supabase
      .from('errors')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Erro ao deletar erro:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// 🃏 FLASHCARDS
// ============================================================
export const createFlashcard = async (userId: string, flashcardData: {
  frente: string;
  verso: string;
  deckId?: string | null;
}) => {
  try {
    const id = Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);

    const { data, error } = await supabase
      .from('flashcards')
      .insert({
        id,
        user_id: userId,
        frente: flashcardData.frente,
        verso: flashcardData.verso,
        deck_id: flashcardData.deckId || null,
        interval_days: 1,
        repetitions: 0,
        ease_factor: 2.5,
        review_level: 1,
        next_review: nextDate.toISOString(),
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao criar flashcard:', error);
    return { success: false, error: error.message };
  }
};

export const getFlashcards = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao buscar flashcards:', error);
    return { success: false, error: error.message };
  }
};

export const updateFlashcard = async (id: string, data: any) => {
  try {
    const { data: result, error } = await supabase
      .from('flashcards')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: result };
  } catch (error: any) {
    console.error('Erro ao atualizar flashcard:', error);
    return { success: false, error: error.message };
  }
};

export const deleteFlashcard = async (id: string) => {
  try {
    const { error } = await supabase
      .from('flashcards')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Erro ao deletar flashcard:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// 🔄 REVISÕES
// ============================================================
export const createRevisao = async (userId: string, revisaoData: {
  topicoId: string;
  topicoNome: string;
  disciplina: string;
  reviewLevel?: number;
  nextReviewDate?: string;
}) => {
  try {
    const id = Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);

    const { data, error } = await supabase
      .from('revisoes')
      .insert({
        id,
        user_id: userId,
        topico_id: revisaoData.topicoId,
        topico_nome: revisaoData.topicoNome,
        disciplina: revisaoData.disciplina,
        review_level: revisaoData.reviewLevel || 1,
        next_review_date: revisaoData.nextReviewDate || nextDate.toISOString(),
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao criar revisão:', error);
    return { success: false, error: error.message };
  }
};

export const getRevisoes = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('revisoes')
      .select('*')
      .eq('user_id', userId)
      .order('next_review_date', { ascending: true });

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao buscar revisões:', error);
    return { success: false, error: error.message };
  }
};

export const updateRevisao = async (id: string, data: any) => {
  try {
    const { data: result, error } = await supabase
      .from('revisoes')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: result };
  } catch (error: any) {
    console.error('Erro ao atualizar revisão:', error);
    return { success: false, error: error.message };
  }
};

export const deleteRevisao = async (id: string) => {
  try {
    const { error } = await supabase
      .from('revisoes')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Erro ao deletar revisão:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// 📅 REGISTROS DE ESTUDO
// ============================================================
export const createStudyRecord = async (userId: string, recordData: {
  data: string;
  tempo: number;
  materia: string;
  topico: string;
  tipo: string;
  questoesFeitas?: number;
  questoesAcertos?: number;
  resumo?: string;
}) => {
  try {
    const id = Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('study_records')
      .insert({
        id,
        user_id: userId,
        data: recordData.data,
        tempo: recordData.tempo,
        materia: recordData.materia,
        topico: recordData.topico,
        tipo: recordData.tipo,
        questoes_feitas: recordData.questoesFeitas || 0,
        questoes_acertos: recordData.questoesAcertos || 0,
        resumo: recordData.resumo || '',
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao criar registro de estudo:', error);
    return { success: false, error: error.message };
  }
};

export const getStudyRecords = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('study_records')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao buscar registros de estudo:', error);
    return { success: false, error: error.message };
  }
};

export const updateStudyRecord = async (id: string, data: any) => {
  try {
    const { data: result, error } = await supabase
      .from('study_records')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: result };
  } catch (error: any) {
    console.error('Erro ao atualizar registro de estudo:', error);
    return { success: false, error: error.message };
  }
};

export const deleteStudyRecord = async (id: string) => {
  try {
    const { error } = await supabase
      .from('study_records')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Erro ao deletar registro de estudo:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// 📤 UPLOAD DE ARQUIVOS
// ============================================================
export const uploadArquivo = async (file: File, disciplina: string, topicoId: string) => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${topicoId}_${Date.now()}.${fileExt}`;
    const filePath = `${disciplina}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('arquivos')
      .upload(filePath, file);

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('arquivos')
      .getPublicUrl(filePath);

    return {
      success: true,
      url: urlData.publicUrl,
      path: filePath,
      fileName: file.name
    };
  } catch (error: any) {
    console.error('Erro no upload:', error);
    return {
      success: false,
      error: error.message || 'Erro ao fazer upload'
    };
  }
};

export const deleteArquivo = async (filePath: string) => {
  try {
    const { error } = await supabase.storage
      .from('arquivos')
      .remove([filePath]);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Erro ao deletar arquivo:', error);
    return { success: false, error: error.message };
  }
};

export const getArquivos = async (disciplina: string) => {
  try {
    const { data, error } = await supabase.storage
      .from('arquivos')
      .list(disciplina);

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao listar arquivos:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// 🛠️ SYNC COM RETRY
// ============================================================
export const syncWithRetry = async (fn: () => Promise<any>, retries = 3, delay = 1000) => {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  throw lastError;
};