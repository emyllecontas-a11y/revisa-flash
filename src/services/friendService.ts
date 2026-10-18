// src/services/friendService.ts
//
// Amizades do RevisaFlash (convite -> aceite). Usa a tabela "friendships"
// criada no Pacote 3. A segurança de verdade está no banco (RLS):
//  - cada pessoa só enxerga as linhas em que participa;
//  - só quem convida cria (sempre como "pending");
//  - só a pessoa convidada aceita;
//  - qualquer das duas pode apagar (recusar, cancelar ou desfazer a amizade).
// Ao desfazer a amizade o banco também apaga os compartilhamentos entre as duas.

import { getSupabaseWithToken } from '@/lib/supabaseClient';
import {
  findPersonByEmail,
  findUsersByIds,
  type PessoaEncontrada,
} from '@/services/clerkService';

export type FriendshipStatus = 'pending' | 'accepted';

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  responded_at: string | null;
}

export interface PessoaInfo {
  id: string;
  name: string | null;
  email: string | null;
}

export interface FriendEntry {
  friendshipId: string;
  pessoa: PessoaInfo;
  createdAt: string;
}

export interface FriendsOverview {
  /** amizades aceitas */
  amigas: FriendEntry[];
  /** convites que outras pessoas me mandaram (posso aceitar ou recusar) */
  recebidos: FriendEntry[];
  /** convites que eu mandei (posso cancelar) */
  enviados: FriendEntry[];
}

export type Relation = 'none' | 'friend' | 'sent' | 'received';

/** Erro com mensagem já pronta para mostrar na tela. */
export class FriendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FriendError';
  }
}

/** Transforma qualquer erro em uma frase amigável em português. */
export function friendErrorMessage(e: unknown): string {
  if (e instanceof FriendError) return e.message;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Sem conexão com a internet. Conecte-se e tente de novo.';
  }
  const msg = e instanceof Error ? e.message : '';
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Não foi possível conectar. Verifique a internet e tente de novo.';
  }
  if (/muitas tentativas/i.test(msg)) {
    return 'Muitas buscas seguidas. Aguarde um pouco e tente novamente.';
  }
  if (/não autenticado/i.test(msg)) {
    return 'Sua sessão expirou. Entre novamente.';
  }
  return 'Algo deu errado. Tente novamente em instantes.';
}

function fallbackPessoa(id: string): PessoaInfo {
  return { id, name: null, email: null };
}

/**
 * Carrega todas as amizades e convites da pessoa logada, já separados em
 * amigas / convites recebidos / convites enviados, com nome e e-mail.
 */
export async function loadFriendsOverview(myId: string): Promise<FriendsOverview> {
  const supabase = await getSupabaseWithToken();
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at, responded_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Erro ao carregar amizades:', error);
    throw new FriendError('Não foi possível carregar suas amigas agora.');
  }

  const rows = (data ?? []) as Friendship[];
  const otherIds = Array.from(
    new Set(rows.map((r) => (r.requester_id === myId ? r.addressee_id : r.requester_id))),
  );

  // Nomes e e-mails. Se falhar, mostramos o que der (a tela não quebra).
  const byId = new Map<string, PessoaInfo>();
  if (otherIds.length > 0) {
    try {
      const people = await findUsersByIds(otherIds);
      for (const p of people) byId.set(p.id, { id: p.id, name: p.name, email: p.email });
    } catch (e) {
      console.warn('⚠️ Não foi possível buscar nomes das amigas:', e);
    }
  }

  const overview: FriendsOverview = { amigas: [], recebidos: [], enviados: [] };
  for (const r of rows) {
    const iAmRequester = r.requester_id === myId;
    const otherId = iAmRequester ? r.addressee_id : r.requester_id;
    const entry: FriendEntry = {
      friendshipId: r.id,
      pessoa: byId.get(otherId) ?? fallbackPessoa(otherId),
      createdAt: r.created_at,
    };
    if (r.status === 'accepted') overview.amigas.push(entry);
    else if (iAmRequester) overview.enviados.push(entry);
    else overview.recebidos.push(entry);
  }
  return overview;
}

/** Procura uma pessoa pelo e-mail (null = não encontrada). */
export async function searchPerson(email: string): Promise<PessoaEncontrada | null> {
  return findPersonByEmail(email.trim().toLowerCase());
}

/** Descobre a relação atual com uma pessoa, para decidir o que mostrar. */
export function relationWith(
  overview: FriendsOverview | null,
  personId: string,
): { relation: Relation; friendshipId?: string } {
  if (!overview) return { relation: 'none' };
  const amiga = overview.amigas.find((e) => e.pessoa.id === personId);
  if (amiga) return { relation: 'friend', friendshipId: amiga.friendshipId };
  const enviado = overview.enviados.find((e) => e.pessoa.id === personId);
  if (enviado) return { relation: 'sent', friendshipId: enviado.friendshipId };
  const recebido = overview.recebidos.find((e) => e.pessoa.id === personId);
  if (recebido) return { relation: 'received', friendshipId: recebido.friendshipId };
  return { relation: 'none' };
}

/** Envia um convite de amizade. */
export async function sendInvite(myId: string, otherId: string): Promise<void> {
  if (!myId || !otherId) throw new FriendError('Não foi possível enviar o convite.');
  if (myId === otherId) throw new FriendError('Você não pode convidar a si mesma.');

  const supabase = await getSupabaseWithToken();
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: myId, addressee_id: otherId, status: 'pending' });

  if (error) {
    // 23505 = já existe uma linha para esse par (A->B ou B->A)
    if ((error as { code?: string }).code === '23505') {
      throw new FriendError(
        'Já existe um convite ou uma amizade com essa pessoa. Confira as listas abaixo.',
      );
    }
    console.error('❌ Erro ao enviar convite:', error);
    throw new FriendError('Não foi possível enviar o convite agora.');
  }
}

/** A pessoa convidada aceita o convite. */
export async function acceptInvite(friendshipId: string): Promise<void> {
  const supabase = await getSupabaseWithToken();
  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
    .select('id');

  if (error) {
    console.error('❌ Erro ao aceitar convite:', error);
    throw new FriendError('Não foi possível aceitar o convite agora.');
  }
  if (!data || data.length === 0) {
    throw new FriendError('Esse convite não existe mais. Atualize a lista.');
  }
}

/**
 * Apaga a linha da amizade. Serve para: recusar um convite recebido,
 * cancelar um convite enviado e desfazer uma amizade.
 * (Ao desfazer, o banco apaga também os compartilhamentos entre as duas.)
 */
export async function removeFriendship(friendshipId: string): Promise<void> {
  const supabase = await getSupabaseWithToken();
  const { data, error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .select('id');

  if (error) {
    console.error('❌ Erro ao remover amizade/convite:', error);
    throw new FriendError('Não foi possível concluir agora.');
  }
  if (!data || data.length === 0) {
    throw new FriendError('Isso já tinha sido removido. Atualize a lista.');
  }
}

/** Lista só de amigas aceitas (será usada pelo botão "Compartilhar"). */
export async function listAcceptedFriends(myId: string): Promise<PessoaInfo[]> {
  const overview = await loadFriendsOverview(myId);
  return overview.amigas.map((e) => e.pessoa);
}