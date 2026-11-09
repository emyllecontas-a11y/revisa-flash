// src/hooks/useComentarioQuestao.ts
import { useState, useEffect, useRef } from 'react';
import { buscarComentarioSobDemanda } from '@/services/bancoQuestoesService';

/**
 * Carrega o comentário de uma questão sob demanda.
 *
 * - Se `comentarioLocal` já tem valor, retorna ele (sem rede).
 * - Se não, busca no Supabase, salva no IndexedDB e retorna.
 * - Se `enabled=false`, não busca (usa para adiar até o usuário revelar).
 *
 * O cache é feito pelo `buscarComentarioSobDemanda` (service),
 * então a mesma questão não é buscada 2x na vida do dispositivo.
 */
export function useComentarioQuestao(
  questaoId: string | null | undefined,
  comentarioLocal: string | null | undefined,
  enabled: boolean = true
) {
  const [comentarioRemoto, setComentarioRemoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const jaBuscouRef = useRef<Set<string>>(new Set());

  // Quando muda de questão, zera o estado remoto
  useEffect(() => {
    setComentarioRemoto(null);
    setErro(null);
    setLoading(false);
  }, [questaoId]);

  useEffect(() => {
    if (!enabled) return;

    // Já tem local? Não busca
    if (comentarioLocal && comentarioLocal.trim()) return;

    if (!questaoId) return;

    // Já buscou nesta sessão? Evita loop
    if (jaBuscouRef.current.has(questaoId)) return;
    jaBuscouRef.current.add(questaoId);

    let cancelado = false;
    setLoading(true);
    setErro(null);

    buscarComentarioSobDemanda(questaoId)
      .then((res) => {
        if (cancelado) return;
        if (res.success) {
          setComentarioRemoto(res.comentario);
        } else {
          setErro(res.error || 'Erro ao carregar comentário');
        }
      })
      .catch((e) => {
        if (!cancelado) setErro(e?.message || 'Erro inesperado');
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [questaoId, comentarioLocal, enabled]);

  // Local tem prioridade sobre remoto
  const comentario =
    comentarioLocal && comentarioLocal.trim()
      ? comentarioLocal
      : comentarioRemoto;

  return { comentario, loading, erro };
}