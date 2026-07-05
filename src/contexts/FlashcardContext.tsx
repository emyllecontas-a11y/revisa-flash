// src/contexts/FlashcardContext.tsx

import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode, useEffect } from 'react';
import { getDb, syncWithSupabase } from '@/lib/db';
import { supabase, getSupabaseWithToken } from '@/lib/supabaseClient';
import { uid } from '@/utils/helpers';
import { FSRSScheduler } from '@/lib/fsrs/scheduler';
import type { CardState, Rating } from '@/lib/fsrs/types';
import { enqueueOperation } from '@/services/queueService';
import { findUserByEmail } from '@/services/clerkService';

// ============================================================
// TIPOS (ATUALIZADOS)
// ============================================================

interface Deck {
  id: string;
  name: string;
  description: string;
  user_id: string;
  createdAt: string;
  color?: string;
  deletedAt?: string | null;
  is_shared: boolean;
  owner_id: string;
  shared_with: string[];
}

interface Card {
  id: string;
  deck_id: string;
  user_id: string;
  front: string;
  back: string;
  difficulty: number;
  stability: number;
  retrievability?: number;
  dueDate: string;
  reps: number;
  lapses: number;
  lastReview: string | null;
  state: number;
  elapsed_days: number;
  scheduled_days: number;
  createdAt: string;
  updatedAt: string;
  shared_card_id?: string | null;
}

interface DeckMeta {
  disciplina?: string;
}

interface CardMeta {
  topico?: string;
  errorId?: string;
}

interface FlashcardContextType {
  refreshFlashcards: () => void;
  dueCards: Card[];
  decks: Deck[];
  stats: {
    totalCards: number;
    dueCards: number;
    reviewedToday: number;
    averageRetrievability: number;
  };
  loading: boolean;
  reviewCard: (cardId: string, rating: Rating) => Promise<any>;
  createDeck: (name: string, description: string, color?: string, isShared?: boolean, sharedWith?: string[]) => Promise<void>;
  getOrCreateErrorDeck: () => Promise<Deck>;
  addCard: (deckId: string, front: string, back: string, meta?: Partial<CardMeta>) => Promise<string>;
  deleteDeck: (deckId: string) => Promise<void>;
  deleteCard: (cardId: string) => Promise<void>;
  renameDeck: (deckId: string, name: string, description: string, color?: string) => Promise<void>;
  editCard: (cardId: string, front: string, back: string, meta?: Partial<CardMeta>) => Promise<void>;
  updateCardMeta: (cardId: string, meta: Partial<CardMeta>) => Promise<void>;
  getDeckMeta: (deckId: string) => DeckMeta;
  setDeckMeta: (deckId: string, meta: DeckMeta) => void;
  getCardMeta: (cardId: string) => CardMeta;
  setCardMeta: (cardId: string, meta: CardMeta) => void;
  getCardHistory: (cardId: string) => any[];
  getAllCardsByDeck: (deckId: string) => Promise<any[]>;
  getAllFlashcards: () => Card[];
  addMemberToDeck: (deckId: string, newUserId: string, onProgress?: (current: number, total: number) => void) => Promise<void>;
  removeMemberFromDeck: (deckId: string, userIdToRemove: string) => Promise<void>;
  addMemberByEmail: (deckId: string, email: string) => Promise<void>;
}

const FlashcardContext = createContext<FlashcardContextType | undefined>(undefined);

// ============================================================
// PROVIDER
// ============================================================

export const FlashcardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [version, setVersion] = useState(0);
  const [decksData, setDecksData] = useState<Deck[]>([]);
  const [allFlashcards, setAllFlashcards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  const scheduler = useMemo(() => new FSRSScheduler(), []);

  // ============================================================
  // METADADOS (LOCALSTORAGE)
  // ============================================================
  const [deckMetas, setDeckMetas] = useState<Record<string, DeckMeta>>(() => {
    if (typeof window === 'undefined') return {};
    const saved = localStorage.getItem('eot_deck_metas');
    if (saved) {
      try { return JSON.parse(saved); } catch { return {}; }
    }
    return {};
  });

  const [cardMetas, setCardMetas] = useState<Record<string, CardMeta>>(() => {
    if (typeof window === 'undefined') return {};
    const saved = localStorage.getItem('eot_card_metas');
    if (saved) {
      try { return JSON.parse(saved); } catch { return {}; }
    }
    return {};
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('eot_deck_metas', JSON.stringify(deckMetas));
    }
  }, [deckMetas]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('eot_card_metas', JSON.stringify(cardMetas));
    }
  }, [cardMetas]);

  const getDeckMeta = useCallback((deckId: string): DeckMeta => {
    return deckMetas[deckId] || {};
  }, [deckMetas]);

  const setDeckMeta = useCallback((deckId: string, meta: DeckMeta) => {
    setDeckMetas(prev => ({ ...prev, [deckId]: { ...prev[deckId], ...meta } }));
  }, []);

  const getCardMeta = useCallback((cardId: string): CardMeta => {
    return cardMetas[cardId] || {};
  }, [cardMetas]);

  const setCardMeta = useCallback((cardId: string, meta: CardMeta) => {
    setCardMetas(prev => ({ ...prev, [cardId]: { ...prev[cardId], ...meta } }));
  }, []);

  // ============================================================
  // CARREGAR DADOS LOCAIS
  // ============================================================
  const loadLocalData = useCallback(async (db: any, userId: string) => {
    try {
      console.log('📥 [loadLocalData] Buscando decks do usuário ou compartilhados com ele:', userId);

      const decksResult = await db.decks.find({
        selector: {
          $or: [
            { user_id: userId },
            { shared_with: { $elemMatch: { $eq: userId } } }
          ],
          deletedAt: { $eq: null }
        }
      }).exec();

      const decksData = decksResult.map((doc: any) => doc.toJSON());
      console.log(`📊 [loadLocalData] Encontrados ${decksData.length} decks (próprios + compartilhados).`);
      setDecksData(decksData);

      console.log('📥 [loadLocalData] Buscando flashcards do usuário...');
      const cardsResult = await db.flashcards.find({
        selector: {
          user_id: userId
        }
      }).exec();
      const cardsData = cardsResult.map((doc: any) => doc.toJSON());

      const deckIds = new Set(decksData.map(d => d.id));
      const filteredCards = cardsData.filter(c => deckIds.has(c.deck_id));

      console.log(`📊 [loadLocalData] Encontrados ${filteredCards.length} flashcards (dos decks acessíveis).`);
      setAllFlashcards(filteredCards);

      console.log('✅ Dados carregados do banco local');
    } catch (error) {
      console.error('❌ Erro ao carregar dados locais:', error);
      setDecksData([]);
      setAllFlashcards([]);
    }
  }, []);

  // ============================================================
  // FUNÇÕES AUXILIARES
  // ============================================================
  const getAllFlashcards = useCallback(() => {
    return allFlashcards;
  }, [allFlashcards]);

  const getAllCardsByDeck = useCallback(async (deckId: string): Promise<any[]> => {
    if (!userId) return [];
    try {
      const db = await getDb();
      const result = await db.flashcards.find({
        selector: {
          deck_id: deckId,
          user_id: userId
        }
      }).exec();
      return result.map((doc: any) => doc.toJSON());
    } catch (error) {
      console.error('❌ Erro ao buscar cards do deck:', error);
      return [];
    }
  }, [userId]);

  // ============================================================
  // CARREGAR USUÁRIO
  // ============================================================
  useEffect(() => {
    let isMounted = true;
    const loadUser = async () => {
      try {
        console.log('🔍 [FlashcardContext] Iniciando carregamento do usuário...');

        let userId: string | null = null;
        const cachedId = localStorage.getItem('revisaflash_user_id');
        if (cachedId) {
          userId = cachedId;
          console.log('✅ Usuário recuperado do cache local (Clerk):', userId);
        } else {
          console.warn('⚠️ Nenhum usuário disponível.');
        }

        if (isMounted && userId) {
          setUserId(userId);
          const db = await getDb();
          await loadLocalData(db, userId);
          console.log('✅ Dados locais carregados.');
        } else if (isMounted) {
          console.log('⚠️ Nenhum usuário encontrado (modo visitante).');
        }
      } catch (e) {
        console.error('❌ Erro ao carregar usuário:', e);
      } finally {
        if (isMounted) {
          setIsLoadingUser(false);
          setLoading(false);
          console.log('🔚 Carregamento finalizado.');
        }
      }
    };
    loadUser();
    return () => { isMounted = false; };
  }, [loadLocalData]);

  // ============================================================
  // REFRESH
  // ============================================================
  const refreshFlashcards = useCallback(() => {
    setVersion(prev => prev + 1);
    const reload = async () => {
      const db = await getDb();
      if (userId) {
        await loadLocalData(db, userId);
      }
    };
    reload();
  }, [userId, loadLocalData]);

  // ============================================================
  // DERIVADOS
  // ============================================================
  const dueCards = useMemo(() => {
    if (!allFlashcards || !decksData) return [];
    const deckIds = new Set(decksData.map(d => d.id));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return allFlashcards
      .filter(c => {
        if (!deckIds.has(c.deck_id)) return false;
        if ((c.reps || 0) === 0) return true;
        const due = new Date(c.dueDate);
        due.setHours(0, 0, 0, 0);
        return due <= today;
      })
      .map(c => ({
        ...c,
        front: c.front || '',
        back: c.back || '',
        deck_id: c.deck_id,
        dueDate: c.dueDate || new Date().toISOString(),
        stability: c.stability || 0,
        difficulty: c.difficulty || 0,
        state: c.state || 0,
        elapsed_days: c.elapsed_days || 0,
        scheduled_days: c.scheduled_days || 0,
        reps: c.reps || 0,
        lapses: c.lapses || 0,
        lastReview: c.lastReview || null,
        createdAt: c.createdAt || new Date().toISOString(),
        updatedAt: c.updatedAt || new Date().toISOString(),
      }));
  }, [allFlashcards, decksData]);

  const stats = useMemo(() => {
    const totalCards = dueCards.length;
    const todayStr = new Date().toISOString().split('T')[0];
    const reviewedToday = dueCards.filter(c =>
      c.lastReview && c.lastReview.startsWith(todayStr)
    ).length;
    const dueCount = dueCards.length;
    const avgRetrievability = dueCards.length > 0
      ? dueCards.reduce((acc, c) => acc + (c.stability > 0 ? 0.9 : 0), 0) / dueCards.length
      : 0;

    return {
      totalCards,
      dueCards: dueCount,
      reviewedToday,
      averageRetrievability: avgRetrievability,
    };
  }, [dueCards]);

  // ============================================================
  // CRUD
  // ============================================================

  const createDeck = useCallback(async (
    name: string,
    description: string,
    color?: string,
    isShared: boolean = false,
    sharedWith: string[] = []
  ) => {
    if (!userId) throw new Error('Usuário não autenticado');
    const now = new Date().toISOString();
    const deckId = uid();
    const db = await getDb();

    const newDeck: Deck = {
      id: deckId,
      user_id: userId,
      owner_id: userId,
      name: name.trim(),
      description: description.trim() || '',
      createdAt: now,
      color: color || '#14B8A6',
      deletedAt: null,
      is_shared: isShared,
      shared_with: isShared ? sharedWith : []
    };

    await db.decks.insert(newDeck);
    refreshFlashcards();
    console.log('📚 [FlashcardContext] Deck criado localmente:', deckId, 'compartilhado:', isShared);

    try {
      const supabaseClient = await getSupabaseWithToken();
      const { error } = await supabaseClient
        .from('decks')
        .insert(newDeck);
      if (error) throw error;
      console.log('✅ [FlashcardContext] Deck sincronizado com Supabase.');
    } catch (supabaseError) {
      console.warn('⚠️ [FlashcardContext] Falha ao sincronizar (offline?), enfileirando.');
      await enqueueOperation('create', 'decks', newDeck);
    }
  }, [userId, refreshFlashcards]);

  const getOrCreateErrorDeck = useCallback(async (): Promise<Deck> => {
    if (!userId) throw new Error('Usuário não autenticado');
    const db = await getDb();

    const existing = await db.decks.findOne({
      selector: {
        user_id: userId,
        name: 'Erros',
        is_shared: false
      }
    }).exec();

    if (existing) {
      return existing.toJSON() as Deck;
    }

    const now = new Date().toISOString();
    const deckId = uid();
    const newDeck = {
      id: deckId,
      user_id: userId,
      owner_id: userId,
      name: 'Erros',
      description: 'Flashcards gerados a partir do banco de erros',
      createdAt: now,
      color: '#FB7185',
      deletedAt: null,
      is_shared: false,
      shared_with: []
    };

    await db.decks.insert(newDeck);
    refreshFlashcards();

    try {
      const supabaseClient = await getSupabaseWithToken();
      const { error } = await supabaseClient
        .from('decks')
        .insert(newDeck);
      if (error) throw error;
      console.log('✅ [FlashcardContext] Deck "Erros" sincronizado.');
    } catch (supabaseError) {
      console.warn('⚠️ [FlashcardContext] Falha ao sincronizar deck "Erros", enfileirando.');
      await enqueueOperation('create', 'decks', newDeck);
    }

    return {
      id: deckId,
      user_id: userId,
      owner_id: userId,
      name: 'Erros',
      createdAt: now,
      color: '#FB7185',
      description: 'Flashcards gerados a partir do banco de erros',
      is_shared: false,
      shared_with: []
    };
  }, [userId, refreshFlashcards]);

  // --- ADD CARD (COM VERIFICAÇÃO GLOBAL DE DUPLICATA) ---
  const addCard = useCallback(async (deckId: string, front: string, back: string, meta?: Partial<CardMeta>): Promise<string> => {
    if (!userId) throw new Error('Usuário não autenticado');
    const now = new Date().toISOString();
    const db = await getDb();

    // Verifica se já existe algum card com o mesmo conteúdo em QUALQUER usuário neste deck
    const existingGlobal = await db.flashcards.findOne({
      selector: {
        deck_id: deckId,
        front: front.trim(),
        back: back.trim()
      }
    }).exec();

    if (existingGlobal) {
      throw new Error('Este flashcard já existe neste baralho (adicionado por outro membro ou por você).');
    }

    // Busca o deck para saber se é compartilhado
    const deckDoc = await db.decks.findOne({
      selector: { id: deckId }
    }).exec();

    if (!deckDoc) {
      throw new Error('Deck não encontrado');
    }
    const deck = deckDoc.toJSON() as Deck;

    // Determina para quais usuários criar cards
    let targetUserIds: string[] = [];
    if (deck.is_shared) {
      const members = new Set<string>();
      members.add(deck.owner_id);
      deck.shared_with.forEach(id => members.add(id));
      targetUserIds = Array.from(members);
    } else {
      targetUserIds = [userId];
    }

    const sharedCardId = deck.is_shared ? uid() : null;
    const createdCardIds: string[] = [];

    for (const targetUserId of targetUserIds) {
      const cardId = uid();
      const fsrsCard = scheduler.createCard(front.trim(), back.trim(), deckId);

      const newCard = {
        id: cardId,
        deck_id: deckId,
        user_id: targetUserId,
        front: fsrsCard.front,
        back: fsrsCard.back,
        difficulty: fsrsCard.difficulty,
        stability: fsrsCard.stability,
        retrievability: 0.9,
        dueDate: fsrsCard.due,
        reps: fsrsCard.reps,
        lapses: fsrsCard.lapses,
        lastReview: fsrsCard.lastReview,
        state: fsrsCard.state,
        elapsed_days: fsrsCard.elapsed_days,
        scheduled_days: fsrsCard.scheduled_days,
        createdAt: now,
        updatedAt: now,
        shared_card_id: sharedCardId
      };

      await db.flashcards.insert(newCard);
      if (meta) {
        setCardMeta(cardId, meta);
      }
      createdCardIds.push(cardId);
      console.log(`📇 [FlashcardContext] Card criado para usuário ${targetUserId}:`, cardId);
    }

    refreshFlashcards();
    console.log(`📇 [FlashcardContext] Criados ${createdCardIds.length} cards (deck compartilhado: ${deck.is_shared})`);

    // Sincroniza com Supabase
    try {
      const supabaseClient = await getSupabaseWithToken();
      const cardsToInsert = [];
      for (const cid of createdCardIds) {
        const doc = await db.flashcards.findOne({ selector: { id: cid } }).exec();
        if (doc) cardsToInsert.push(doc.toJSON());
      }
      if (cardsToInsert.length > 0) {
        const { error } = await supabaseClient
          .from('flashcards')
          .insert(cardsToInsert);
        if (error) throw error;
        console.log('✅ [FlashcardContext] Cards sincronizados com Supabase.');
      }
    } catch (supabaseError) {
      console.warn('⚠️ [FlashcardContext] Falha ao sincronizar cards, enfileirando.');
      for (const cid of createdCardIds) {
        const doc = await db.flashcards.findOne({ selector: { id: cid } }).exec();
        if (doc) {
          await enqueueOperation('create', 'flashcards', doc.toJSON());
        }
      }
    }

    const userCard = await db.flashcards.findOne({
      selector: { deck_id: deckId, user_id: userId, shared_card_id: sharedCardId }
    }).exec();
    if (userCard) {
      return userCard.toJSON().id;
    } else {
      return createdCardIds[0];
    }
  }, [userId, refreshFlashcards, setCardMeta, scheduler]);

  // --- REVIEW CARD ---
  const reviewCard = useCallback(async (cardId: string, rating: Rating) => {
    if (!userId) throw new Error('Usuário não autenticado');

    try {
      const db = await getDb();
      const doc = await db.flashcards.findOne({
        selector: { id: cardId }
      }).exec();

      if (!doc) {
        console.warn('⚠️ Card não encontrado:', cardId);
        return { success: false };
      }

      const cardData = doc.toJSON();

      if (cardData.user_id !== userId) {
        throw new Error('Você não tem permissão para revisar este card');
      }

      const fsrsCard: CardState = {
        id: cardData.id,
        deck_id: cardData.deck_id,
        front: cardData.front,
        back: cardData.back,
        due: cardData.dueDate,
        stability: cardData.stability || 1.0,
        difficulty: cardData.difficulty || 5.0,
        elapsed_days: cardData.elapsed_days || 0,
        scheduled_days: cardData.scheduled_days || 1,
        reps: cardData.reps || 0,
        lapses: cardData.lapses || 0,
        state: cardData.state || 0,
        lastReview: cardData.lastReview || null,
        created_at: cardData.createdAt,
        updated_at: cardData.updatedAt
      };

      const { card: updatedCard, log } = scheduler.review(fsrsCard, rating);

      const updatedData = {
        difficulty: updatedCard.difficulty,
        stability: updatedCard.stability,
        dueDate: updatedCard.due,
        reps: updatedCard.reps,
        lapses: updatedCard.lapses,
        state: updatedCard.state,
        elapsed_days: updatedCard.elapsed_days,
        scheduled_days: updatedCard.scheduled_days,
        lastReview: updatedCard.lastReview,
        updatedAt: new Date().toISOString()
      };

      await doc.incrementalPatch(updatedData);

      setAllFlashcards(prev => prev.map(c =>
        c.id === cardId ? { ...c, ...updatedData } : c
      ));

      console.log(`✅ Card revisado: ${cardId} (rating: ${rating})`);

      try {
        const supabaseClient = await getSupabaseWithToken();
        const { error } = await supabaseClient
          .from('flashcards')
          .update(updatedData)
          .eq('id', cardId);
        if (error) throw error;
        console.log('✅ [FlashcardContext] Card revisado sincronizado.');
      } catch (supabaseError) {
        console.warn('⚠️ [FlashcardContext] Falha ao sincronizar revisão, enfileirando.');
        await enqueueOperation('update', 'flashcards', { id: cardId, ...updatedData });
      }

      console.log('📝 Review log:', log);
      return { success: true, card: updatedCard };
    } catch (error) {
      console.error('❌ Erro ao revisar card:', error);
      throw error;
    }
  }, [userId, scheduler]);

  // --- DELETE DECK (CORRIGIDO: VERIFICA owner_id OU user_id) ---
  const deleteDeck = useCallback(async (deckId: string) => {
    if (!userId) throw new Error('Usuário não autenticado');

    try {
      const db = await getDb();
      const deck = await db.decks.findOne({
        selector: { id: deckId }
      }).exec();

      if (!deck) {
        console.warn('⚠️ Deck não encontrado localmente:', deckId);
        return;
      }

      const deckData = deck.toJSON();
      if (deckData.deletedAt) {
        console.log('ℹ️ Deck já está excluído (soft delete):', deckId);
        return;
      }

      // 🔥 Verifica se o usuário é o dono (considerando owner_id vazio)
      const isOwner = deckData.owner_id ? deckData.owner_id === userId : deckData.user_id === userId;
      if (!isOwner) {
        throw new Error('Apenas o dono do deck pode excluí-lo');
      }

      const now = new Date().toISOString();

      // 1. Marca o deck como deletado
      await deck.incrementalPatch({ deletedAt: now });

      // 2. Busca TODOS os cards desse deck (independente do usuário)
      const allCards = await db.flashcards.find({
        selector: { deck_id: deckId }
      }).exec();

      const cardIdsToDelete = allCards.map((doc: any) => doc.toJSON().id);

      // 3. Remove cada card (localmente)
      for (const doc of allCards) {
        await doc.remove();
        // Limpa metadados
        setCardMetas(prev => {
          const newMetas = { ...prev };
          delete newMetas[doc.toJSON().id];
          return newMetas;
        });
      }

      refreshFlashcards();
      console.log(`🗑️ Deck e ${cardIdsToDelete.length} cards deletados.`);

      // 4. Sincroniza com Supabase (deck + cards)
      try {
        const supabaseClient = await getSupabaseWithToken();
        // Atualiza deck
        await supabaseClient.from('decks').update({ deletedAt: now }).eq('id', deckId);
        // Deleta cards em lote
        if (cardIdsToDelete.length > 0) {
          await supabaseClient.from('flashcards').delete().in('id', cardIdsToDelete);
        }
      } catch (supabaseError) {
        console.warn('⚠️ Falha ao sincronizar exclusão em cascata, enfileirando.');
        await enqueueOperation('update', 'decks', { id: deckId, deletedAt: now });
        for (const id of cardIdsToDelete) {
          await enqueueOperation('delete', 'flashcards', { id });
        }
      }
    } catch (error) {
      console.error('❌ Erro ao deletar deck:', error);
      throw error;
    }
  }, [userId, refreshFlashcards, setCardMetas]);

  // --- DELETE CARD ---
  const deleteCard = useCallback(async (cardId: string) => {
    if (!userId) throw new Error('Usuário não autenticado');
    const db = await getDb();

    const card = await db.flashcards.findOne({
      selector: { id: cardId }
    }).exec();

    if (!card) {
      console.warn('⚠️ Card não encontrado para deletar:', cardId);
      return;
    }

    const cardData = card.toJSON();
    const deck = await db.decks.findOne({
      selector: { id: cardData.deck_id }
    }).exec();
    const deckData = deck ? deck.toJSON() : null;
    const isOwner = deckData && (deckData.owner_id ? deckData.owner_id === userId : deckData.user_id === userId);

    if (cardData.user_id !== userId && !isOwner) {
      throw new Error('Você não tem permissão para deletar este card');
    }

    const sharedCardId = cardData.shared_card_id;
    let cardIdsToDelete: string[] = [];

    if (sharedCardId && deckData && deckData.is_shared) {
      const allCards = await db.flashcards.find({
        selector: { shared_card_id: sharedCardId }
      }).exec();
      cardIdsToDelete = allCards.map((doc: any) => doc.toJSON().id);
    } else {
      cardIdsToDelete = [cardId];
    }

    for (const id of cardIdsToDelete) {
      const doc = await db.flashcards.findOne({ selector: { id } }).exec();
      if (doc) {
        await doc.remove();
        setCardMetas(prev => {
          const newMetas = { ...prev };
          delete newMetas[id];
          return newMetas;
        });
        console.log(`🗑️ [FlashcardContext] Card removido: ${id}`);
      }
    }

    refreshFlashcards();

    try {
      const supabaseClient = await getSupabaseWithToken();
      for (const id of cardIdsToDelete) {
        const { error } = await supabaseClient
          .from('flashcards')
          .delete()
          .eq('id', id);
        if (error) throw error;
      }
      console.log(`✅ [FlashcardContext] ${cardIdsToDelete.length} cards deletados do Supabase.`);
    } catch (supabaseError) {
      console.warn('⚠️ [FlashcardContext] Falha ao deletar cards no Supabase, enfileirando.');
      for (const id of cardIdsToDelete) {
        await enqueueOperation('delete', 'flashcards', { id });
      }
    }
  }, [userId, refreshFlashcards, setCardMetas]);

  // --- RENAME DECK (CORRIGIDO) ---
  const renameDeck = useCallback(async (deckId: string, name: string, description: string, color?: string) => {
    if (!userId) throw new Error('Usuário não autenticado');
    const db = await getDb();

    const deck = await db.decks.findOne({
      selector: { id: deckId }
    }).exec();
    if (!deck) {
      console.warn('⚠️ Deck não encontrado para renomear:', deckId);
      return;
    }

    const deckData = deck.toJSON();
    // 🔥 Verifica se o usuário é o dono
    const isOwner = deckData.owner_id ? deckData.owner_id === userId : deckData.user_id === userId;
    if (!isOwner) {
      throw new Error('Apenas o dono pode renomear o deck');
    }

    const updatedData: any = {
      name: name.trim(),
      description: description.trim() || '',
      updated_at: new Date().toISOString()
    };
    if (color) {
      updatedData.color = color;
    }

    await deck.patch(updatedData);
    refreshFlashcards();
    console.log('✏️ [FlashcardContext] Deck renomeado localmente:', deckId);

    try {
      const supabaseClient = await getSupabaseWithToken();
      const { error } = await supabaseClient
        .from('decks')
        .update(updatedData)
        .eq('id', deckId);
      if (error) throw error;
      console.log('✅ [FlashcardContext] Deck renomeado no Supabase.');
    } catch (supabaseError) {
      console.warn('⚠️ [FlashcardContext] Falha ao renomear deck no Supabase, enfileirando.');
      await enqueueOperation('update', 'decks', { id: deckId, ...updatedData });
    }
  }, [userId, refreshFlashcards]);

  // --- EDIT CARD (COM VERIFICAÇÃO GLOBAL DE DUPLICATA E PERMISSÃO CORRIGIDA) ---
  const editCard = useCallback(async (cardId: string, front: string, back: string, meta?: Partial<CardMeta>) => {
    if (!userId) throw new Error('Usuário não autenticado');
    const db = await getDb();

    const card = await db.flashcards.findOne({
      selector: { id: cardId }
    }).exec();

    if (!card) {
      console.warn('⚠️ Card não encontrado para editar:', cardId);
      return;
    }

    const cardData = card.toJSON();
    const deck = await db.decks.findOne({
      selector: { id: cardData.deck_id }
    }).exec();
    const deckData = deck ? deck.toJSON() : null;
    // 🔥 Verifica se o usuário é o dono do deck
    const isOwner = deckData && (deckData.owner_id ? deckData.owner_id === userId : deckData.user_id === userId);

    if (!isOwner && cardData.user_id !== userId) {
      throw new Error('Você não tem permissão para editar este card');
    }

    // Se o conteúdo mudou, verifica se já existe outro card com o mesmo conteúdo neste deck (global)
    if (front.trim() !== cardData.front || back.trim() !== cardData.back) {
      const existingGlobal = await db.flashcards.findOne({
        selector: {
          deck_id: cardData.deck_id,
          front: front.trim(),
          back: back.trim(),
          id: { $ne: cardId }
        }
      }).exec();

      if (existingGlobal) {
        throw new Error('Já existe outro flashcard com este conteúdo neste baralho.');
      }
    }

    let cardIdsToUpdate: string[] = [];
    if (deckData && deckData.is_shared && isOwner && cardData.shared_card_id) {
      const allCards = await db.flashcards.find({
        selector: { shared_card_id: cardData.shared_card_id }
      }).exec();
      cardIdsToUpdate = allCards.map((doc: any) => doc.toJSON().id);
    } else {
      cardIdsToUpdate = [cardId];
    }

    const updatedData = {
      front: front.trim(),
      back: back.trim(),
      updatedAt: new Date().toISOString()
    };

    for (const id of cardIdsToUpdate) {
      const doc = await db.flashcards.findOne({ selector: { id } }).exec();
      if (doc) {
        await doc.patch(updatedData);
        console.log(`✏️ [FlashcardContext] Card editado: ${id}`);
      }
    }

    if (meta) {
      for (const id of cardIdsToUpdate) {
        setCardMeta(id, meta);
      }
    }

    refreshFlashcards();

    try {
      const supabaseClient = await getSupabaseWithToken();
      for (const id of cardIdsToUpdate) {
        const { error } = await supabaseClient
          .from('flashcards')
          .update(updatedData)
          .eq('id', id);
        if (error) throw error;
      }
      console.log(`✅ [FlashcardContext] ${cardIdsToUpdate.length} cards editados no Supabase.`);
    } catch (supabaseError) {
      console.warn('⚠️ [FlashcardContext] Falha ao editar cards no Supabase, enfileirando.');
      for (const id of cardIdsToUpdate) {
        await enqueueOperation('update', 'flashcards', { id, ...updatedData });
      }
    }
  }, [userId, refreshFlashcards, setCardMeta]);

  // --- UPDATE META ---
  const updateCardMeta = useCallback(async (cardId: string, meta: Partial<CardMeta>) => {
    setCardMeta(cardId, meta);
  }, [setCardMeta]);

  // --- GET HISTORY ---
  const getCardHistory = useCallback((cardId: string) => {
    return [{ message: 'Histórico de revisões não disponível', type: 'info' }];
  }, []);

  // ============================================================
  // GERENCIAR MEMBROS (CORRIGIDO: VERIFICA owner_id OU user_id)
  // ============================================================

const addMemberToDeck = useCallback(async (
  deckId: string,
  newUserId: string,
  onProgress?: (current: number, total: number) => void
) => {
  if (!userId) throw new Error('Usuário não autenticado');
  if (newUserId === userId) throw new Error('Você não pode adicionar a si mesmo.');
  
  const db = await getDb();

  const deck = await db.decks.findOne({
    selector: { id: deckId }
  }).exec();

  if (!deck) {
    throw new Error('Deck não encontrado');
  }

  const deckData = deck.toJSON();

  // 🔥 CORREÇÃO: define o dono como user_id se owner_id estiver vazio
  const isOwner = deckData.owner_id ? deckData.owner_id === userId : deckData.user_id === userId;
  if (!isOwner) {
    throw new Error('Apenas o dono do deck pode adicionar membros');
  }

  let updatedSharedWith = [...deckData.shared_with];
  let needsActivation = false;

  if (!deckData.is_shared) {
    console.log('🔓 Ativando compartilhamento do deck...');
    needsActivation = true;
  }

  // Verifica se o novo usuário já está na lista
  if (updatedSharedWith.includes(newUserId)) {
    console.log('ℹ️ Usuário já é membro do deck');
    return;
  }

  // Adiciona o novo usuário à lista
  updatedSharedWith.push(newUserId);

  // 🔥 PREPARA TODOS OS CAMPOS QUE SERÃO ATUALIZADOS EM UM ÚNICO OBJETO
  const patchData: any = {
    shared_with: updatedSharedWith
  };

  if (needsActivation) {
    patchData.is_shared = true;
    patchData.owner_id = userId;
  }

  // 🔥 FAZ UM ÚNICO PATCH
  await deck.patch(patchData);
  console.log(`✅ Deck atualizado: is_shared=${patchData.is_shared ?? deckData.is_shared}, shared_with=${updatedSharedWith.length} membros`);

    // 🔥 COPIA CARDS COM PROGRESSO
    try {
      console.log(`📋 [addMemberToDeck] Verificando cards para ${newUserId}...`);

      // 1. Busca cards do DONO (originais)
      const ownerCards = await db.flashcards.find({
        selector: {
          deck_id: deckId,
          user_id: deckData.owner_id || userId
        }
      }).exec();
      const ownerCardsData = ownerCards.map((doc: any) => doc.toJSON());

      if (ownerCardsData.length === 0) {
        console.log('ℹ️ Nenhum card do dono para copiar.');
        if (onProgress) onProgress(0, 0);
      } else {
        // 2. Busca cards que o NOVO MEMBRO já possui neste deck
        const existingUserCards = await db.flashcards.find({
          selector: {
            deck_id: deckId,
            user_id: newUserId
          }
        }).exec();
        const existingSet = new Set();
        for (const doc of existingUserCards) {
          const existing = doc.toJSON();
          if (existing.shared_card_id) {
            existingSet.add(existing.shared_card_id);
          } else {
            existingSet.add(`${existing.front}|||${existing.back}`);
          }
        }

        // 3. Filtra apenas os cards que o novo membro NÃO tem (diff)
        const cardsToCopy = ownerCardsData.filter(ownerCard => {
          if (ownerCard.shared_card_id && existingSet.has(ownerCard.shared_card_id)) {
            return false;
          }
          const key = `${ownerCard.front}|||${ownerCard.back}`;
          if (existingSet.has(key)) {
            return false;
          }
          return true;
        });

        if (cardsToCopy.length === 0) {
          console.log('ℹ️ Nenhum card novo para copiar (já está atualizado).');
          if (onProgress) onProgress(0, 0);
        } else {
          console.log(`📋 Copiando ${cardsToCopy.length} cards novos para ${newUserId}...`);

          const now = new Date().toISOString();
          const cardsToInsert = [];

          for (let i = 0; i < cardsToCopy.length; i++) {
            const cardData = cardsToCopy[i];
            const newCardId = uid();
            const fsrsCard = scheduler.createCard(cardData.front, cardData.back, deckId);

            const newCard = {
              id: newCardId,
              deck_id: deckId,
              user_id: newUserId,
              front: cardData.front,
              back: cardData.back,
              difficulty: fsrsCard.difficulty,
              stability: fsrsCard.stability,
              retrievability: 0.9,
              dueDate: fsrsCard.due,
              reps: fsrsCard.reps,
              lapses: fsrsCard.lapses,
              lastReview: fsrsCard.lastReview,
              state: fsrsCard.state,
              elapsed_days: fsrsCard.elapsed_days,
              scheduled_days: fsrsCard.scheduled_days,
              createdAt: now,
              updatedAt: now,
              shared_card_id: cardData.shared_card_id || null
            };
            cardsToInsert.push(newCard);

            // Atualiza progresso a cada 10 cards
            if (i % 10 === 0 || i === cardsToCopy.length - 1) {
              if (onProgress) onProgress(i + 1, cardsToCopy.length);
            }
          }

          // INSERE EM LOTE (BULK)
          if (cardsToInsert.length > 0) {
            await db.flashcards.bulkInsert(cardsToInsert);
            console.log(`✅ ${cardsToInsert.length} cards inseridos localmente em lote.`);

            // Sincroniza com Supabase em lotes
            try {
              const supabaseClient = await getSupabaseWithToken();
              const batchSize = 50;
              for (let i = 0; i < cardsToInsert.length; i += batchSize) {
                const batch = cardsToInsert.slice(i, i + batchSize);
                const { error } = await supabaseClient.from('flashcards').insert(batch);
                if (error) throw error;
              }
              console.log(`✅ ${cardsToInsert.length} cards sincronizados com Supabase em lote.`);
            } catch (supabaseError) {
              console.warn('⚠️ Falha ao sincronizar em lote, enfileirando individualmente.');
              for (const card of cardsToInsert) {
                await enqueueOperation('create', 'flashcards', card);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Erro ao copiar cards:', error);
    }

    refreshFlashcards();

    // Sincroniza a atualização do deck
    try {
      const supabaseClient = await getSupabaseWithToken();
      await supabaseClient.from('decks').update({
        shared_with: updatedSharedWith,
        is_shared: patchData.is_shared ?? deckData.is_shared,
        owner_id: patchData.owner_id ?? deckData.owner_id
      }).eq('id', deckId);
    } catch (supabaseError) {
      await enqueueOperation('update', 'decks', {
        id: deckId,
        shared_with: updatedSharedWith,
        is_shared: patchData.is_shared ?? deckData.is_shared,
        owner_id: patchData.owner_id ?? deckData.owner_id
      });
    }
  }, [userId, refreshFlashcards, scheduler]);

  // --- REMOVE MEMBER (CORRIGIDO) ---
  const removeMemberFromDeck = useCallback(async (deckId: string, userIdToRemove: string) => {
    if (!userId) throw new Error('Usuário não autenticado');
    const db = await getDb();

    const deck = await db.decks.findOne({
      selector: { id: deckId }
    }).exec();

    if (!deck) {
      throw new Error('Deck não encontrado');
    }

    const deckData = deck.toJSON();
    // 🔥 Verifica se o usuário é o dono
    const isOwner = deckData.owner_id ? deckData.owner_id === userId : deckData.user_id === userId;
    if (!isOwner) {
      throw new Error('Apenas o dono do deck pode remover membros');
    }

    if (userIdToRemove === deckData.owner_id) {
      throw new Error('Não é possível remover o dono do deck');
    }

    if (!deckData.shared_with.includes(userIdToRemove)) {
      console.log('ℹ️ Usuário não está na lista de membros');
      return;
    }

    const updatedSharedWith = deckData.shared_with.filter(id => id !== userIdToRemove);
    await deck.patch({ shared_with: updatedSharedWith });

    refreshFlashcards();

    try {
      const supabaseClient = await getSupabaseWithToken();
      const { error } = await supabaseClient
        .from('decks')
        .update({ shared_with: updatedSharedWith })
        .eq('id', deckId);
      if (error) throw error;
      console.log(`✅ [FlashcardContext] Membro ${userIdToRemove} removido do deck ${deckId}`);
    } catch (supabaseError) {
      console.warn('⚠️ [FlashcardContext] Falha ao sincronizar remoção de membro, enfileirando.');
      await enqueueOperation('update', 'decks', { id: deckId, shared_with: updatedSharedWith });
    }
  }, [userId, refreshFlashcards]);

  // 🔥 ADICIONAR POR E-MAIL
  const addMemberByEmail = useCallback(async (deckId: string, email: string) => {
    if (!userId) throw new Error('Usuário não autenticado');
    
    const foundUserId = await findUserByEmail(email);
    if (!foundUserId) {
      throw new Error(`Nenhum usuário encontrado com o e-mail: ${email}`);
    }

    await addMemberToDeck(deckId, foundUserId);
  }, [userId, addMemberToDeck]);

  // ============================================================
  // CONTEXT VALUE
  // ============================================================

  const value = useMemo(() => ({
    refreshFlashcards,
    dueCards,
    decks: decksData || [],
    stats,
    loading: loading || isLoadingUser,
    reviewCard,
    createDeck,
    getOrCreateErrorDeck,
    addCard,
    deleteDeck,
    deleteCard,
    renameDeck,
    editCard,
    updateCardMeta,
    getDeckMeta,
    setDeckMeta,
    getCardMeta,
    setCardMeta,
    getCardHistory,
    getAllCardsByDeck,
    getAllFlashcards,
    addMemberToDeck,
    removeMemberFromDeck,
    addMemberByEmail,
  }), [
    refreshFlashcards,
    dueCards,
    decksData,
    stats,
    loading,
    isLoadingUser,
    reviewCard,
    createDeck,
    getOrCreateErrorDeck,
    addCard,
    deleteDeck,
    deleteCard,
    renameDeck,
    editCard,
    updateCardMeta,
    getDeckMeta,
    setDeckMeta,
    getCardMeta,
    setCardMeta,
    getCardHistory,
    getAllCardsByDeck,
    getAllFlashcards,
    addMemberToDeck,
    removeMemberFromDeck,
    addMemberByEmail,
  ]);

  return (
    <FlashcardContext.Provider value={value}>
      {children}
    </FlashcardContext.Provider>
  );
};

export const useFlashcardContext = () => {
  const context = useContext(FlashcardContext);
  if (!context) {
    throw new Error('useFlashcardContext deve ser usado dentro de FlashcardProvider');
  }
  return context;
};