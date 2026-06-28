// src/lib/fsrs/types.ts
// Definições de tipos para o sistema FSRS

export interface CardState {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  // Campos usados pelo FSRS
  due: string | null; // ISO string
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number; // 0=Novo, 1=Aprendendo, 2=Revisando, 3=Reaprendendo
  lastReview: string | null; // ISO string
  // Metadados
  created_at: string;
  updated_at: string;
}

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewLog {
  id: string;
  card_id: string;
  rating: Rating;
  state: number;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  review: string;
  created_at: string;
}

export interface FSRSStats {
  totalCards: number;
  dueCards: number;
  reviewedToday: number;
  averageRetrievability: number;
}