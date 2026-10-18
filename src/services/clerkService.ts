// src/services/clerkService.ts
//
// Agora as funções de busca exigem login: enviamos o token do Clerk
// (o mesmo que o app já usa para falar com o Supabase).

import { getClerkToken } from '@/lib/supabaseClient';

const SUPABASE_URL = 'https://driayoaxyrpfdaqugvmx.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface PessoaEncontrada {
  userId: string;
  name: string | null;
  email: string | null;
}

async function chamarFuncao(nome: string, corpo: unknown): Promise<any> {
  const token = await getClerkToken();
  if (!token) throw new Error('Usuário não autenticado');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${nome}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(corpo),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || 'Erro ao consultar usuários');
  }
  return data;
}

/**
 * Busca uma pessoa pelo e-mail, com nome. Devolve null se não achar.
 * (Usada pela futura tela "Amigas".)
 */
export async function findPersonByEmail(email: string): Promise<PessoaEncontrada | null> {
  try {
    const data = await chamarFuncao('clerk-search-user', { email });
    if (!data?.found || !data?.userId) return null;
    return { userId: data.userId, name: data.name ?? null, email: data.email ?? null };
  } catch (error) {
    console.error('❌ Erro ao buscar usuário por e-mail:', error);
    throw error;
  }
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

  try {
    const data = await chamarFuncao('clerk-users-batch', { userIds });
    return data.users || [];
  } catch (error) {
    console.error('❌ Erro ao buscar usuários por IDs:', error);
    throw error;
  }
}