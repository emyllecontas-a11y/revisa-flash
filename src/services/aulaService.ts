// src/services/aulaService.ts
import { supabase } from "@/lib/supabaseClient";

export interface Aula {
  id: string;
  user_id: string;
  titulo: string;
  descricao: string;
  terabox_url: string;
  disciplina?: string; // Nova coluna
  assunto?: string; // Nova coluna
  subassunto?: string | null; // Opcional: 3º nível da árvore
  assunto_ordem?: number | null; // Ordem do assunto dentro da disciplina
  ordem?: number; // Nova coluna para ordenação
  created_at: string;
}

const CACHE_PREFIX = "unavox_aulas_cache_v1_";

const cacheStatusMap: Record<string, { isFromCache: boolean; savedAt: string | null }> = {};

function salvarCacheAulas(userId: string, aulas: Aula[], savedAt: string): void {
  try {
    const key = `${CACHE_PREFIX}${userId}`;
    const payload = JSON.stringify({ savedAt, aulas });
    localStorage.setItem(key, payload);
  } catch (e) {
    console.warn("Erro ao salvar cache de aulas no localStorage:", e);
  }
}

function lerCacheAulas(userId: string): { savedAt: string; aulas: Aula[] } | null {
  try {
    const key = `${CACHE_PREFIX}${userId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.aulas)) {
      return {
        savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
        aulas: parsed.aulas as Aula[],
      };
    }
    return null;
  } catch (e) {
    console.warn("Erro ao ler cache de aulas do localStorage:", e);
    return null;
  }
}

export function getAulasCacheInfo(userId: string): { savedAt: string | null; isFromCache: boolean } {
  if (!userId) return { savedAt: null, isFromCache: false };
  const status = cacheStatusMap[userId];
  if (status) {
    return status;
  }
  const cached = lerCacheAulas(userId);
  return {
    savedAt: cached?.savedAt || null,
    isFromCache: false,
  };
}

export function isAulasFromCache(userId: string): boolean {
  if (!userId) return false;
  return cacheStatusMap[userId]?.isFromCache ?? false;
}

// Tempo máximo de espera da consulta ao Supabase antes de cair no cache local.
const TIMEOUT_BUSCA_AULAS_MS = 8000;

export async function getAulasDoUsuario(userId: string): Promise<Aula[]> {
  if (!userId) {
    cacheStatusMap["anon"] = { isFromCache: false, savedAt: null };
    return [];
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const cached = lerCacheAulas(userId);
    if (cached) {
      cacheStatusMap[userId] = { isFromCache: true, savedAt: cached.savedAt };
      return cached.aulas;
    }
    cacheStatusMap[userId] = { isFromCache: false, savedAt: null };
    return [];
  }

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const busca = supabase
      .from("aulas")
      .select("*")
      .eq("user_id", userId)
      .order("ordem", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    // Promise.race com timeout: consultas lentas não deixam a tela em spinner infinito.
    const limite = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve("timeout");
      }, TIMEOUT_BUSCA_AULAS_MS);
    });

    const resultado = await Promise.race([busca, limite]);

    if (resultado === "timeout") {
      throw new Error(`Busca de aulas excedeu ${TIMEOUT_BUSCA_AULAS_MS}ms`);
    }

    const { data, error } = resultado;

    if (error) {
      console.error("Erro ao buscar aulas no Supabase:", error);
      const cached = lerCacheAulas(userId);
      if (cached) {
        cacheStatusMap[userId] = { isFromCache: true, savedAt: cached.savedAt };
        return cached.aulas;
      }
      cacheStatusMap[userId] = { isFromCache: false, savedAt: null };
      return [];
    }

    const aulas = data || [];
    const savedAt = new Date().toISOString();
    salvarCacheAulas(userId, aulas, savedAt);
    cacheStatusMap[userId] = { isFromCache: false, savedAt };
    return aulas;
  } catch (err) {
    console.error("Exceção ao buscar aulas no Supabase:", err);
    // Sem internet aparente, mas a rede caiu no meio da busca: usa o cache salvo.
    const semConexaoReal =
      timedOut || (typeof navigator !== "undefined" && navigator.onLine === false);
    if (semConexaoReal) {
      const cached = lerCacheAulas(userId);
      if (cached) {
        cacheStatusMap[userId] = { isFromCache: true, savedAt: cached.savedAt };
        return cached.aulas;
      }
    }
    cacheStatusMap[userId] = { isFromCache: false, savedAt: null };
    return [];
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Limpa o cache de aulas do usuário no localStorage.
 * Deve ser chamado no logout para não vazar dados entre usuários.
 */
export function limparCacheAulas(userId: string): void {
  try {
    const key = `${CACHE_PREFIX}${userId}`;
    localStorage.removeItem(key);
    delete cacheStatusMap[userId];
  } catch (e) {
    console.warn("Erro ao limpar cache de aulas:", e);
  }
}

export async function atualizarOrdemAula(
  aulaId: string,
  novaOrdem: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("aulas")
      .update({ ordem: novaOrdem })
      .eq("id", aulaId);

    if (error) {
      console.error("Erro ao atualizar ordem da aula:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao atualizar ordem.";
    return { success: false, error: message };
  }
}
