// src/hooks/useRevisoesSubtopico.ts
import { useState, useEffect, useCallback } from 'react';
import { getDb } from '@/lib/db';
import { listarRevisoesSubtopico, type RevisaoSubtopicoView } from '@/services/subtopicService';

export function useRevisoesSubtopico(userId: string | null) {
  const [revisoes, setRevisoes] = useState<RevisaoSubtopicoView[]>([]);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      setRevisoes(await listarRevisoesSubtopico(userId));
    } catch (e) {
      console.error('Erro ao carregar revisões de subtópico:', e);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let sub: { unsubscribe: () => void } | null = null;
    let cancelado = false;

    (async () => {
      try {
        const db = await getDb();
        if (cancelado || !db.collections?.revisoes_subtopico) return;
        sub = db.collections.revisoes_subtopico.$.subscribe(() => {
          if (timeoutId) clearTimeout(timeoutId);
          timeoutId = setTimeout(reload, 500);
        });
      } catch (e) {
        console.warn('Erro ao ouvir revisoes_subtopico:', e);
      }
    })();

    return () => {
      cancelado = true;
      if (timeoutId) clearTimeout(timeoutId);
      sub?.unsubscribe();
    };
  }, [reload]);

  return { revisoes, reload };
}