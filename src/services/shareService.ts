// src/services/shareService.ts
//
// Compartilhamentos do RevisaFlash (tabela "shares", criada no Pacote 3).
// A segurança de verdade está no banco (RLS):
//  - só a dona cria um compartilhamento, e só de item que é dela;
//  - só para amiga com convite aceito;
//  - a dona remove os que criou; a amiga remove os que recebeu.
// Aqui só montamos as chamadas e traduzimos os erros para português.

import { getSupabaseWithToken } from '@/lib/supabaseClient';
import { FriendError } from '@/services/friendService';

export type ShareItemType =
  | 'discipline'
  | 'topic'
  | 'file'
  | 'question_list'
  | 'simulado';

export interface ShareRow {
  id: string;
  shared_with_id: string;
}

type DbError = { code?: string; message?: string };

function isPermissionError(error: DbError): boolean {
  return error.code === '42501' || /row-level security/i.test(error.message ?? '');
}

/** Com quem EU compartilhei este item. */
export async function listSharesOfItem(
  myId: string,
  itemType: ShareItemType,
  itemId: string,
): Promise<ShareRow[]> {
  const supabase = await getSupabaseWithToken();
  const { data, error } = await supabase
    .from('shares')
    .select('id, shared_with_id')
    .eq('owner_id', myId)
    .eq('item_type', itemType)
    .eq('item_id', itemId);

  if (error) {
    console.error('❌ Erro ao listar compartilhamentos:', error);
    throw new FriendError('Não foi possível ver com quem isso está compartilhado.');
  }
  return (data ?? []) as ShareRow[];
}

/** Compartilha o item com uma amiga. Se já estava compartilhado, não faz nada. */
export async function addShare(
  myId: string,
  friendId: string,
  itemType: ShareItemType,
  itemId: string,
): Promise<void> {
  if (!myId || !friendId || !itemId) {
    throw new FriendError('Não foi possível compartilhar agora.');
  }
  const supabase = await getSupabaseWithToken();
  const { error } = await supabase.from('shares').insert({
    owner_id: myId,
    shared_with_id: friendId,
    item_type: itemType,
    item_id: itemId,
  });

  if (!error) return;

  // 23505 = já existe este compartilhamento (tudo certo)
  if ((error as DbError).code === '23505') return;

  if (isPermissionError(error as DbError)) {
    throw new FriendError(
      'Não foi possível compartilhar. Confira se vocês ainda são amigas e se o item já foi sincronizado (se acabou de criar, espere um pouco e tente de novo).',
    );
  }
  console.error('❌ Erro ao compartilhar:', error);
  throw new FriendError('Não foi possível compartilhar agora.');
}

/** Remove um compartilhamento (a amiga deixa de ver o item no próximo sync dela). */
export async function removeShare(shareId: string): Promise<void> {
  const supabase = await getSupabaseWithToken();
  const { data, error } = await supabase
    .from('shares')
    .delete()
    .eq('id', shareId)
    .select('id');

  if (error) {
    console.error('❌ Erro ao remover compartilhamento:', error);
    throw new FriendError('Não foi possível remover o acesso agora.');
  }
  if (!data || data.length === 0) {
    throw new FriendError('Esse acesso já tinha sido removido.');
  }
}