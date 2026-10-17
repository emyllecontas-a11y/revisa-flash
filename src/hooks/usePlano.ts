// src/hooks/usePlano.ts
import { useState, useEffect, useCallback } from 'react';
import { getDb } from '@/lib/db';
import { obterPlanoAtivo, listarFeitos, alternarFeito, type Plano } from '@/services/planoService';

export function usePlano(userId: string | null | undefined) {
  const [plano, setPlano] = useState<Plano | null>(null);
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    if (!userId) {
      setCarregando(false);
      return;
    }
    try {
      const p = await obterPlanoAtivo(userId);
      setPlano(p);
      setFeitos(p ? await listarFeitos(p.id, userId) : new Set());
    } catch (e) {
      console.error('Erro ao carregar plano:', e);
    } finally {
      setCarregando(false);
    }
  }, [userId]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const subs: { unsubscribe: () => void }[] = [];
    let cancelado = false;

    (async () => {
      try {
        const db = await getDb();
        if (cancelado) return;
        for (const nome of ['planos', 'plano_feitos']) {
          const col = db.collections?.[nome];
          if (col) {
            subs.push(col.$.subscribe(() => {
              if (timeoutId) clearTimeout(timeoutId);
              timeoutId = setTimeout(recarregar, 500);
            }));
          }
        }
      } catch (e) {
        console.warn('Erro ao ouvir plano:', e);
      }
    })();

    return () => {
      cancelado = true;
      if (timeoutId) clearTimeout(timeoutId);
      subs.forEach(s => s.unsubscribe());
    };
  }, [recarregar]);

  const alternar = useCallback(async (chave: string) => {
    if (!plano || !userId) return;
    const marcar = !feitos.has(chave);
    setFeitos(prev => {
      const novo = new Set(prev);
      if (marcar) novo.add(chave); else novo.delete(chave);
      return novo;
    });
    try {
      await alternarFeito(plano.id, userId, chave, marcar);
    } catch (e) {
      console.error('Erro ao marcar bloco:', e);
      recarregar();
    }
  }, [plano, userId, feitos, recarregar]);

  return { plano, feitos, carregando, recarregar, alternar };
}