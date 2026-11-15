// src/services/aulaService.ts
import { supabase } from '@/lib/supabaseClient';

export interface Aula {
  id: string;
  user_id: string;
  titulo: string;
  descricao: string;
  terabox_url: string;
  disciplina?: string; // Nova coluna
  assunto?: string;    // Nova coluna
  ordem?: number;      // Nova coluna para ordenação
  created_at: string;
}

export async function getAulasDoUsuario(userId: string): Promise<Aula[]> {
  const { data, error } = await supabase
    .from('aulas')
    .select('*')
    .eq('user_id', userId)
    .order('ordem', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro ao buscar aulas no Supabase:', error);
    return [];
  }
  return data || [];
}

export async function atualizarOrdemAula(aulaId: string, novaOrdem: number): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('aulas')
      .update({ ordem: novaOrdem })
      .eq('id', aulaId);

    if (error) {
      console.error('Erro ao atualizar ordem da aula:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao atualizar ordem.' };
  }
}