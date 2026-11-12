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
  created_at: string;
}

export async function getAulasDoUsuario(userId: string): Promise<Aula[]> {
  const { data, error } = await supabase
    .from('aulas')
    .select('*')
    .eq('user_id', userId)
    .order('titulo', { ascending: true });

  if (error) {
    console.error('Erro ao buscar aulas no Supabase:', error);
    return [];
  }
  return data || [];
}