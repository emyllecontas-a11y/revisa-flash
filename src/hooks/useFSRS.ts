// src/hooks/useFSRS.ts
// Hook para gerenciar flashcards com o algoritmo FSRS

import { useState, useCallback, useMemo, useEffect } from 'react';
import { FSRSService } from '../lib/fsrs/service';
import { CardState, Rating, FSRSStats } from '../lib/fsrs/types';
import { getDb } from '@/lib/db';

export function useFSRS(userId: string | null, version: number = 0) {
  const [service, setService] = useState<FSRSService | null>(null);
  const [dueCards, setDueCards] = useState<CardState[]>([]);
  const [loading, setLoading] = useState(true);

  // Função para carregar os cards do RxDB
  const loadDueCards = useCallback(async () => {
    if (!userId) {
      setDueCards([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const db = await getDb();
      
      // Busca os decks do usuário
      const decks = await db.decks.find({
        selector: { user_id: userId }
      }).exec();
      
      const deckIds = decks.map((d: any) => d.get('id'));

      if (deckIds.length === 0) {
        setDueCards([]);
        setLoading(false);
        return;
      }

      // Busca os flashcards cujo deck_id está nos decks do usuário
      const cards = await db.flashcards.find({
        selector: {
          deck_id: { $in: deckIds }
        }
      }).exec();

      const cardsData = cards.map((doc: any) => doc.toJSON() as CardState);
      setDueCards(cardsData);
      console.log(`✅ ${cardsData.length} flashcards carregados do RxDB`);
    } catch (error) {
      console.error('❌ Erro ao carregar cards:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Inicializa o serviço e carrega dados quando o userId mudar
  useEffect(() => {
    if (userId) {
      setService(new FSRSService(userId));
      loadDueCards();
    } else {
      setService(null);
      setDueCards([]);
      setLoading(false);
    }
  }, [userId, loadDueCards]);

  // Recarrega quando a versão mudar (ex: após atualização externa)
  useEffect(() => {
    if (userId) {
      loadDueCards();
    }
  }, [version, userId, loadDueCards]);

  // Estatísticas derivadas
  const stats = useMemo(() => {
    const totalCards = dueCards.length;
    const today = new Date().toISOString().split('T')[0];
    const reviewedToday = dueCards.filter(c => 
      c.lastReview && c.lastReview.startsWith(today)
    ).length;
    const dueCount = dueCards.filter(c => new Date(c.due) <= new Date()).length;
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

  // Revisar um card
  const reviewCard = useCallback(async (cardId: string, rating: Rating) => {
    if (!service) {
      console.error('❌ Serviço FSRS não inicializado');
      return null;
    }
    try {
      const result = await service.reviewCard(cardId, rating);
      if (result) {
        // Recarrega os cards após a revisão para refletir as mudanças
        await loadDueCards();
        return result;
      }
      return null;
    } catch (error) {
      console.error('❌ Erro ao revisar card:', error);
      return null;
    }
  }, [service, loadDueCards]);

  // Forçar recarga manual (para uso externo)
  const reloadDueCards = useCallback(() => {
    loadDueCards();
  }, [loadDueCards]);

  return {
    dueCards,
    loading,
    stats,
    reviewCard,
    reloadDueCards,
  };
}