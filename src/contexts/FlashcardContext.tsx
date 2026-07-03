// src/contexts/FlashcardContext.tsx

import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode, useEffect } from 'react';
import { getDb, syncWithSupabase } from '@/lib/db';
import { supabase, getSupabaseWithToken } from '@/lib/supabaseClient';
import { uid } from '@/utils/helpers';
import { FSRSScheduler } from '@/lib/fsrs/scheduler';
import type { CardState, Rating } from '@/lib/fsrs/types';
import { enqueueOperation } from '@/services/queueService';

// ============================================================
// TIPOS
// ============================================================

interface Deck {
  id: string;
  name: string;
  description: string;
  user_id: string;
  createdAt: string;
  color?: string;
  deletedAt?: string | null;
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
  createDeck: (name: string, description: string, color?: string) => Promise<void>;
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
  // 🔥 NOVA FUNÇÃO ADICIONADA
  getAllCardsByDeck: (deckId: string) => Promise<any[]>;
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
      console.log('📥 [loadLocalData] Buscando decks do usuário:', userId);
      
      const decksResult = await db.decks.find({
        selector: {
          user_id: userId,
          deletedAt: { $eq: null }
        }
      }).exec();
      
      const decksData = decksResult.map((doc: any) => doc.toJSON());
      console.log(`📊 [loadLocalData] Encontrados ${decksData.length} decks.`);
      setDecksData(decksData);

      console.log('📥 [loadLocalData] Buscando flashcards...');
      const cardsResult = await db.flashcards.find().exec();
      const cardsData = cardsResult.map((doc: any) => doc.toJSON());
      console.log(`📊 [loadLocalData] Encontrados ${cardsData.length} flashcards.`);
      setAllFlashcards(cardsData);

      console.log('✅ Dados carregados do banco local');
    } catch (error) {
      console.error('❌ Erro ao carregar dados locais:', error);
      setDecksData([]);
      setAllFlashcards([]);
    }
  }, []);

  // ============================================================
  // 🔥 NOVA FUNÇÃO: BUSCAR TODOS OS CARDS DE UM DECK
  // ============================================================
  const getAllCardsByDeck = useCallback(async (deckId: string): Promise<any[]> => {
    try {
      const db = await getDb();
      const result = await db.flashcards.find({
        selector: { deck_id: deckId }
      }).exec();
      return result.map((doc: any) => doc.toJSON());
    } catch (error) {
      console.error('❌ Erro ao buscar cards do deck:', error);
      return [];
    }
  }, []);

  // ============================================================
  // CARREGAR USUÁRIO (agora com Clerk)
  // ============================================================
  useEffect(() => {
    let isMounted = true;
    const loadUser = async () => {
      try {
        console.log('🔍 [FlashcardContext] Iniciando carregamento do usuário...');
        
        let userId: string | null = null;

        // Tenta pegar do localStorage (vem do Clerk)
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
  // FUNÇÕES CRUD (COM TOKEN DO CLERK)
  // ============================================================

  // --- CREATE DECK ---
  const createDeck = useCallback(async (name: string, description: string, color?: string) => {
    if (!userId) throw new Error('Usuário não autenticado');
    const now = new Date().toISOString();
    const deckId = uid();
    const db = await getDb();
    
    const newDeck = {
      id: deckId,
      user_id: userId,
      name: name.trim(),
      description: description.trim() || '',
      createdAt: now,
      updated_at: now,
      color: color || '#14B8A6',
      deletedAt: null
    };
    
    await db.decks.insert(newDeck);
    refreshFlashcards();
    console.log('📚 [FlashcardContext] Deck criado localmente:', deckId);

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

  // --- GET OR CREATE ERROR DECK ---
  const getOrCreateErrorDeck = useCallback(async (): Promise<Deck> => {
    if (!userId) throw new Error('Usuário não autenticado');
    const db = await getDb();
    
    const existing = await db.decks.findOne({
      selector: { 
        user_id: userId,
        name: 'Erros'
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
      name: 'Erros',
      description: 'Flashcards gerados a partir do banco de erros',
      createdAt: now,
      updated_at: now,
      color: '#FB7185',
      deletedAt: null
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
      name: 'Erros', 
      createdAt: now,
      color: '#FB7185',
      description: 'Flashcards gerados a partir do banco de erros' 
    };
  }, [userId, refreshFlashcards]);

  // --- ADD CARD ---
  const addCard = useCallback(async (deckId: string, front: string, back: string, meta?: Partial<CardMeta>): Promise<string> => {
    if (!userId) throw new Error('Usuário não autenticado');
    const now = new Date().toISOString();
    const cardId = uid();
    const db = await getDb();

    const fsrsCard = scheduler.createCard(front.trim(), back.trim(), deckId);
    
    const newCard = {
      id: cardId,
      deck_id: deckId,
      user_id: userId,
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
      updatedAt: now
    };
    
    await db.flashcards.insert(newCard);
    if (meta) {
      setCardMeta(cardId, meta);
    }
    refreshFlashcards();
    console.log('📇 [FlashcardContext] Card criado localmente:', cardId);

    try {
      const supabaseClient = await getSupabaseWithToken();
      const { error } = await supabaseClient
        .from('flashcards')
        .insert(newCard);
      if (error) throw error;
      console.log('✅ [FlashcardContext] Card sincronizado com Supabase.');
    } catch (supabaseError) {
      console.warn('⚠️ [FlashcardContext] Falha ao sincronizar card, enfileirando.');
      await enqueueOperation('create', 'flashcards', newCard);
    }
    
    return cardId;
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

  // --- DELETE DECK ---
  const deleteDeck = useCallback(async (deckId: string) => {
    if (!userId) throw new Error('Usuário não autenticado');

    try {
      const db = await getDb();
      let deck = await db.decks.findOne({
        selector: { id: deckId }
      }).exec();

      if (!deck) {
        console.warn('⚠️ Deck não encontrado localmente:', deckId);
        return;
      }

      let deckData = deck.toJSON();
      if (deckData.deletedAt) {
        console.log('ℹ️ Deck já está excluído (soft delete):', deckId);
        return;
      }

      const now = new Date().toISOString();

      await deck.incrementalPatch({ deletedAt: now });
      refreshFlashcards();
      console.log('🗑️ [FlashcardContext] Deck marcado como deletado localmente:', deckId);

      try {
        const supabaseClient = await getSupabaseWithToken();
        const { error } = await supabaseClient
          .from('decks')
          .update({ deletedAt: now })
          .eq('id', deckId);
        if (error) throw error;
        console.log('✅ [FlashcardContext] Deck deletado no Supabase.');
      } catch (supabaseError) {
        console.warn('⚠️ [FlashcardContext] Falha ao deletar deck no Supabase, enfileirando.');
        await enqueueOperation('update', 'decks', { id: deckId, deletedAt: now });
      }
    } catch (error) {
      console.error('❌ Erro ao deletar deck:', error);
      throw error;
    }
  }, [userId, refreshFlashcards]);

  // --- DELETE CARD ---
  const deleteCard = useCallback(async (cardId: string) => {
    if (!userId) throw new Error('Usuário não autenticado');
    const db = await getDb();
    
    const card = await db.flashcards.findOne({
      selector: { id: cardId }
    }).exec();
    if (card) {
      await card.remove();
      setCardMetas(prev => {
        const newMetas = { ...prev };
        delete newMetas[cardId];
        return newMetas;
      });
      refreshFlashcards();
      console.log('🗑️ [FlashcardContext] Card removido localmente:', cardId);

      try {
        const supabaseClient = await getSupabaseWithToken();
        const { error } = await supabaseClient
          .from('flashcards')
          .delete()
          .eq('id', cardId);
        if (error) throw error;
        console.log('✅ [FlashcardContext] Card deletado do Supabase.');
      } catch (supabaseError) {
        console.warn('⚠️ [FlashcardContext] Falha ao deletar card no Supabase, enfileirando.');
        await enqueueOperation('delete', 'flashcards', { id: cardId });
      }
    } else {
      console.warn('⚠️ Card não encontrado para deletar:', cardId);
    }
  }, [userId, refreshFlashcards]);

  // --- RENAME DECK ---
  const renameDeck = useCallback(async (deckId: string, name: string, description: string, color?: string) => {
    if (!userId) throw new Error('Usuário não autenticado');
    const db = await getDb();
    
    const deck = await db.decks.findOne({
      selector: { id: deckId }
    }).exec();
    if (deck) {
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
    }
  }, [userId, refreshFlashcards]);

  // --- EDIT CARD ---
  const editCard = useCallback(async (cardId: string, front: string, back: string, meta?: Partial<CardMeta>) => {
    if (!userId) throw new Error('Usuário não autenticado');
    const db = await getDb();
    
    const card = await db.flashcards.findOne({
      selector: { id: cardId }
    }).exec();
    if (card) {
      const updatedData = {
        front: front.trim(),
        back: back.trim(),
        updatedAt: new Date().toISOString()
      };
      
      await card.patch(updatedData);
      if (meta) {
        setCardMeta(cardId, meta);
      }
      refreshFlashcards();
      console.log('✏️ [FlashcardContext] Card editado localmente:', cardId);

      try {
        const supabaseClient = await getSupabaseWithToken();
        const { error } = await supabaseClient
          .from('flashcards')
          .update(updatedData)
          .eq('id', cardId);
        if (error) throw error;
        console.log('✅ [FlashcardContext] Card editado no Supabase.');
      } catch (supabaseError) {
        console.warn('⚠️ [FlashcardContext] Falha ao editar card no Supabase, enfileirando.');
        await enqueueOperation('update', 'flashcards', { id: cardId, ...updatedData });
      }
    }
  }, [userId, refreshFlashcards, setCardMeta]);

  const updateCardMeta = useCallback(async (cardId: string, meta: Partial<CardMeta>) => {
    setCardMeta(cardId, meta);
  }, [setCardMeta]);

  const getCardHistory = useCallback((cardId: string) => {
    return [{ message: 'Histórico de revisões não disponível', type: 'info' }];
  }, []);

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
    // 🔥 NOVA FUNÇÃO EXPORTADA
    getAllCardsByDeck,
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