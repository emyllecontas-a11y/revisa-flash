// src/hooks/useErrorSync.ts

import { useCallback } from 'react';
import { useFlashcardContext } from '@/contexts/FlashcardContext';
import type { ErrorRecord } from '@/contexts/ErrorContext';

export function useErrorSync() {
  const { getOrCreateErrorDeck, addCard, editCard, deleteCard } = useFlashcardContext();

  const syncAddError = useCallback(async (error: ErrorRecord): Promise<ErrorRecord> => {
    try {
      const deck = await getOrCreateErrorDeck();
      const cardId = await addCard(deck.id, error.question, error.correctAnswer, {
        topico: error.topic || 'Erro',
        errorId: error.id,
      });
      return { ...error, flashcardId: cardId };
    } catch (e) {
      console.error('Erro ao sincronizar erro com flashcard:', e);
      return error;
    }
  }, [getOrCreateErrorDeck, addCard]);

  const syncEditError = useCallback(async (error: ErrorRecord) => {
    if (!error.flashcardId) return;
    try {
      await editCard(error.flashcardId, error.question, error.correctAnswer, {
        topico: error.topic || 'Erro',
        errorId: error.id,
      });
    } catch (e) {
      console.error('Erro ao atualizar flashcard:', e);
    }
  }, [editCard]);

  const syncDeleteError = useCallback(async (error: ErrorRecord) => {
    if (!error.flashcardId) return;
    try {
      await deleteCard(error.flashcardId);
    } catch (e) {
      console.error('Erro ao excluir flashcard:', e);
    }
  }, [deleteCard]);

  return { syncAddError, syncEditError, syncDeleteError };
}