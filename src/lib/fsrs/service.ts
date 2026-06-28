// src/lib/fsrs/service.ts
// Serviço que gerencia a revisão de flashcards usando o scheduler

import { FSRSScheduler } from './scheduler';
import { CardState, Rating } from './types';
import { getDb } from '@/lib/db';

export class FSRSService {
  private scheduler: FSRSScheduler;
  private userId: string;

  constructor(userId: string) {
    this.scheduler = new FSRSScheduler();
    this.userId = userId;
  }

  // Processa a revisão de um card específico
  async reviewCard(cardId: string, rating: Rating): Promise<{ card: CardState; log: any } | null> {
    try {
      const db = await getDb();
      
      // Busca o card no RxDB (filtrado pelo user_id)
      const doc = await db.flashcards.findOne({
        selector: { id: cardId, user_id: this.userId }
      }).exec();

      if (!doc) {
        console.error('Card não encontrado:', cardId);
        return null;
      }

      const cardData = doc.toJSON();

      // Converte os dados do banco para o formato CardState
      const card: CardState = {
        id: cardData.id,
        deck_id: cardData.deck_id,
        front: cardData.frente || cardData.front || '',
        back: cardData.verso || cardData.back || '',
        due: cardData.dueDate || cardData.due || new Date().toISOString(),
        stability: cardData.stability || 0,
        difficulty: cardData.difficulty || 0,
        elapsed_days: cardData.elapsed_days || 0,
        scheduled_days: cardData.scheduled_days || 0,
        reps: cardData.reps || 0,
        lapses: cardData.lapses || 0,
        state: cardData.state || 0,
        lastReview: cardData.lastReview || null,
        created_at: cardData.created_at || new Date().toISOString(),
        updated_at: cardData.updated_at || new Date().toISOString(),
      };

      // Processa com FSRS
      const result_fsrs = this.scheduler.review(card, rating);

      // Atualiza no RxDB usando patch
      await doc.patch({
        dueDate: result_fsrs.card.due,
        stability: result_fsrs.card.stability,
        difficulty: result_fsrs.card.difficulty,
        elapsed_days: result_fsrs.card.elapsed_days,
        scheduled_days: result_fsrs.card.scheduled_days,
        reps: result_fsrs.card.reps,
        lapses: result_fsrs.card.lapses,
        state: result_fsrs.card.state,
        lastReview: result_fsrs.card.lastReview,
        updated_at: new Date().toISOString()
      });

      console.log(`✅ Card ${cardId} revisado com sucesso!`);
      return result_fsrs;
    } catch (error) {
      console.error('❌ Erro ao revisar card:', error);
      return null;
    }
  }
}