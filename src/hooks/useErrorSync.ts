// src/hooks/useErrorSync.ts
import { useCallback } from 'react';
import { useFlashcardContext } from '@/contexts/FlashcardContext';
import type { ErrorRecord } from '@/contexts/ErrorContext';

export function useErrorSync() {
  const { editCard, deleteCard } = useFlashcardContext();

  const syncAddError = useCallback(async (error: ErrorRecord): Promise<ErrorRecord> => {
    // Criação automática de flashcards DESATIVADA a pedido da usuária.
    // O erro agora é apenas salvo no banco de dados de erros.
    return error;
  }, []);

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