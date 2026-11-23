// src/services/aulaService.ts
import { getSupabaseWithToken } from "@/lib/supabaseClient";

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

// v2: o cache antigo (v1) guardava só as primeiras 1.000 aulas; trocar o nome força baixar tudo de novo.
const CACHE_PREFIX = "unavox_aulas_cache_v2_";
const CACHE_PREFIX_ANTIGO = "unavox_aulas_cache_v1_";

const cacheStatusMap: Record<string, { isFromCache: boolean; savedAt: string | null }> = {};

function salvarCacheAulas(userId: string, aulas: Aula[], savedAt: string): void {
  try {
    const key = `${CACHE_PREFIX}${userId}`;
    const payload = JSON.stringify({ savedAt, aulas });
    localStorage.setItem(key, payload);
    // Remove o cache antigo (v1) para não ocupar espaço no aparelho.
    localStorage.removeItem(`${CACHE_PREFIX_ANTIGO}${userId}`);
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
// (A busca agora pode levar várias páginas, então o limite é maior que antes.)
const TIMEOUT_BUSCA_AULAS_MS = 20000;

// O Supabase devolve no MÁXIMO 1.000 linhas por consulta. Para trazer todas as aulas,
// buscamos em páginas e juntamos tudo. Sem isso, aulas além da milésima somem do app.
const TAMANHO_PAGINA_AULAS = 1000;
const MAX_PAGINAS_AULAS = 100; // segurança contra loop infinito (até 100.000 aulas)

type SupabaseComToken = Awaited<ReturnType<typeof getSupabaseWithToken>>;

async function buscarTodasAsAulas(
  supabase: SupabaseComToken,
): Promise<{ data: Aula[] | null; error: { message: string } | null }> {
  const todas: Aula[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS_AULAS; pagina++) {
    // O início avança pelo que realmente chegou (e não por um número fixo),
    // assim nenhuma aula é pulada mesmo que o servidor devolva páginas menores.
    const inicio = todas.length;
    const { data, error } = await supabase
      .from("aulas")
      .select("*")
      .order("ordem", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      // Desempate fixo: sem ele, aulas com mesma ordem/data podem repetir ou faltar entre páginas.
      .order("id", { ascending: true })
      .range(inicio, inicio + TAMANHO_PAGINA_AULAS - 1);

    if (error) return { data: null, error };
    if (!data || data.length === 0) break;
    todas.push(...(data as Aula[]));
  }

  return { data: todas, error: null };
}

// Aulas são COMPARTILHADAS: todo usuário logado vê todas as aulas (as regras de acesso ficam no banco).
// O userId serve só para separar o cache offline de cada pessoa neste aparelho.
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
    const supabase = await getSupabaseWithToken();
    const busca = buscarTodasAsAulas(supabase);

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
    // Sem token do Clerk (ainda carregando/sessão expirada) também cai no cache, em vez de lista vazia.
    const semSessao = err instanceof Error && err.message === "Usuário não autenticado";
    const semConexaoReal =
      timedOut || semSessao || (typeof navigator !== "undefined" && navigator.onLine === false);
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
    // Só administrador consegue gravar (o banco recusa os demais).
    const supabase = await getSupabaseWithToken();
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
