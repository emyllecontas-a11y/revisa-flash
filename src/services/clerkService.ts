// src/services/clerkService.ts

const SUPABASE_URL = 'https://driayoaxyrpfdaqugvmx.supabase.co';

/**
 * Busca um usuário no Clerk pelo e-mail.
 */
export async function findUserByEmail(email: string): Promise<string | null> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/clerk-search-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Erro ao buscar usuário');
    }

    const data = await response.json();
    return data.userId || null;
  } catch (error) {
    console.error('❌ Erro ao buscar usuário por e-mail:', error);
    throw error;
  }
}

/**
 * Busca múltiplos usuários no Clerk pelos IDs.
 */
export async function findUsersByIds(userIds: string[]): Promise<{ id: string; email: string | null; name: string | null }[]> {
  if (!userIds || userIds.length === 0) return [];

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/clerk-users-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Erro ao buscar usuários');
    }

    const data = await response.json();
    return data.users || [];
  } catch (error) {
    console.error('❌ Erro ao buscar usuários por IDs:', error);
    throw error;
  }
}