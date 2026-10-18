// src/services/clerkService.ts
//
// Busca de pessoas (por e-mail e por ID). Agora feita por funções do banco
// (Supabase), protegidas por login e com limite de tentativas, em vez das
// funções de servidor abertas. Os nomes exportados continuam os mesmos, então
// a tela de flashcards e a tela Amigas funcionam sem outras mudanças.
//
// Observação: só encontra quem já entrou no app (o perfil é criado no
// primeiro acesso, com nome e e-mail).

import { getSupabaseWithToken } from '@/lib/supabaseClient';

export interface PessoaEncontrada {
  userId: string;
  name: string | null;
  email: string | null;
}

interface LinhaPessoa {
  pessoa_id: string;
  pessoa_nome: string | null;
  pessoa_email: string | null;
}

/**
 * Busca uma pessoa pelo e-mail, com nome. Devolve null se não achar.
 */
export async function findPersonByEmail(email: string): Promise<PessoaEncontrada | null> {
  const supabase = await getSupabaseWithToken();
  const { data, error } = await supabase.rpc('buscar_pessoa_por_email', {
    p_email: email.trim().toLowerCase(),
  });

  if (error) {
    console.error('❌ Erro ao buscar usuário por e-mail:', error);
    throw new Error(error.message || 'Erro ao buscar usuário');
  }

  const row = (Array.isArray(data) ? data[0] : null) as LinhaPessoa | null;
  if (!row) return null;
  return {
    userId: row.pessoa_id,
    name: row.pessoa_nome ?? null,
    email: row.pessoa_email ?? null,
  };
}

/**
 * Mantida com o mesmo formato de antes (devolve só o ID) para a tela de
 * flashcards continuar funcionando sem alterações.
 */
export async function findUserByEmail(email: string): Promise<string | null> {
  const pessoa = await findPersonByEmail(email);
  return pessoa ? pessoa.userId : null;
}

/**
 * Busca nome/e-mail por IDs. Só devolve pessoas conhecidas de quem pergunta
 * (ela mesma, amigas, convites, compartilhamentos e membros dos próprios decks).
 */
export async function findUsersByIds(
  userIds: string[],
): Promise<{ id: string; email: string | null; name: string | null }[]> {
  if (!userIds || userIds.length === 0) return [];

  const supabase = await getSupabaseWithToken();
  const { data, error } = await supabase.rpc('buscar_pessoas_conhecidas', {
    p_ids: userIds,
  });

  if (error) {
    console.error('❌ Erro ao buscar usuários por IDs:', error);
    throw new Error(error.message || 'Erro ao buscar usuários');
  }

  return ((data ?? []) as LinhaPessoa[]).map((r) => ({
    id: r.pessoa_id,
    name: r.pessoa_nome ?? null,
    email: r.pessoa_email ?? null,
  }));
}