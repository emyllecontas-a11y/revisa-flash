// src/lib/fsrs/scheduler.ts
// Implementação do algoritmo FSRS (adaptado do original)

import { CardState, Rating } from './types';

export class FSRSScheduler {
  
  // Mapeia a avaliação para um fator de grade (0.0 a 1.5)
  private getGradeFactor(rating: Rating): number {
    const map = {
      'again': 0.0,
      'hard': 0.5,
      'good': 1.0,
      'easy': 1.5
    };
    return map[rating] || 1.0;
  }

  // Processa uma revisão e retorna o card atualizado e o log
  review(card: CardState, rating: Rating): { card: CardState; log: any } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let stability = card.stability || 1.0;
    let difficulty = card.difficulty || 5.0;
    let reps = (card.reps || 0) + 1;
    let lapses = card.lapses || 0;
    let state = card.state || 0;
    
    // Algoritmo FSRS simplificado
    if (rating === 'again') {
      stability = Math.max(0.1, stability * 0.5);
      difficulty = Math.min(10, difficulty + 0.5);
      lapses += 1;
      state = 1; // Aprendendo novamente
    } else if (rating === 'hard') {
      stability = stability * 0.8;
      difficulty = Math.min(10, difficulty + 0.2);
      state = state === 0 ? 1 : 2; // Se era novo, vira aprendendo; senão, revisando
    } else if (rating === 'good') {
      stability = stability * 1.5;
      difficulty = Math.max(1, difficulty - 0.1);
      state = state === 0 ? 2 : 3; // Se era novo, vira revisando; senão, consolidado
    } else if (rating === 'easy') {
      stability = stability * 2.0;
      difficulty = Math.max(1, difficulty - 0.3);
      state = 3; // Consolidado
    }
    
    // Define a próxima data de revisão baseada na estabilidade
    const daysToAdd = Math.max(1, Math.round(stability));
    const newDue = new Date(today);
    newDue.setDate(newDue.getDate() + daysToAdd);
    
    const updatedCard: CardState = {
      ...card,
      due: newDue.toISOString(),
      stability: stability,
      difficulty: difficulty,
      reps: reps,
      lapses: lapses,
      state: state,
      elapsed_days: card.elapsed_days || 0,
      scheduled_days: daysToAdd,
      lastReview: now.toISOString(),
      updated_at: now.toISOString(),
    };
    
    const log = {
      card_id: card.id,
      rating: rating,
      state: state,
      due: newDue.toISOString(),
      stability: stability,
      difficulty: difficulty,
      elapsed_days: card.elapsed_days || 0,
      scheduled_days: daysToAdd,
      review: now.toISOString(),
      created_at: now.toISOString(),
    };
    
    return {
      card: updatedCard,
      log: log,
    };
  }

  // Cria um novo card com valores iniciais
  createCard(front: string, back: string, deckId: string): CardState {
    const now = new Date().toISOString();
    const today = new Date();
    const due = new Date(today);
    due.setDate(due.getDate() + 1);
    
    return {
      id: '',
      deck_id: deckId,
      front,
      back,
      due: due.toISOString(),
      stability: 1.0,
      difficulty: 5.0,
      elapsed_days: 0,
      scheduled_days: 1,
      reps: 0,
      lapses: 0,
      state: 0,
      lastReview: null,
      created_at: now,
      updated_at: now,
    };
  }
}