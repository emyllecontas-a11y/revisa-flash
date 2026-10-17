// src/services/anotacaoQuestaoService.ts
//
// Gerencia anotações de questão (grifos) no RxDB local.
// Sincroniza pelo mesmo mecanismo do resto do app.

import { getDb } from '@/lib/db';
import { getSupabaseWithToken } from '@/lib/supabaseClient';
import { enqueueOperation } from '@/services/queueService';
import type {
  AnotacaoQuestao,
  CampoAlvo,
  CorGrifo,
  QuestaoOrigem,
  RectGrifo,
} from '@/lib/anotacoes-types';

function nowIso() {
  return new Date().toISOString();
}

/* ============================================================
 * LEITURA
 * ============================================================ */

/**
 * Carrega todas as anotações de uma questão.
 * Online: tenta também o Supabase (fallback se o local está vazio).
 */
export async function getAnotacoesDeQuestao(
  userId: string,
  questaoOrigem: QuestaoOrigem,
  questaoId: string
): Promise<AnotacaoQuestao[]> {
  try {
    const db = await getDb();
    const docs = await db.anotacoes_questao.find({
      selector: {
        user_id: userId,
        questao_origem: questaoOrigem,
        questao_id: questaoId,
        isdeleted: false,
      },
    }).exec();
    return docs.map((d: any) => d.toJSON() as AnotacaoQuestao);
  } catch (e) {
    console.warn('[anotacoes] Erro ao ler local:', e);
    return [];
  }
}

/**
 * Versão em lote: pega anotações de várias questões de uma vez.
 * Usada quando o player abre (para não fazer 1 chamada por questão).
 */
export async function getAnotacoesDeQuestoes(
  userId: string,
  questaoOrigem: QuestaoOrigem,
  questaoIds: string[]
): Promise<Map<string, AnotacaoQuestao[]>> {
  const mapa = new Map<string, AnotacaoQuestao[]>();
  if (questaoIds.length === 0) return mapa;

  try {
    const db = await getDb();
    const docs = await db.anotacoes_questao.find({
      selector: {
        user_id: userId,
        questao_origem: questaoOrigem,
        questao_id: { $in: questaoIds },
        isdeleted: false,
      },
    }).exec();

    for (const d of docs) {
      const j: any = d.toJSON();
      if (!mapa.has(j.questao_id)) mapa.set(j.questao_id, []);
      mapa.get(j.questao_id)!.push(j);
    }
  } catch (e) {
    console.warn('[anotacoes] Erro ao ler lote:', e);
  }
  return mapa;
}

/* ============================================================
 * ESCRITA
 * ============================================================ */

export async function criarAnotacao(
  userId: string,
  questaoOrigem: QuestaoOrigem,
  questaoId: string,
  campoAlvo: CampoAlvo,
  cor: CorGrifo,
  texto: string,
  rects: RectGrifo[]
): Promise<AnotacaoQuestao | null> {
  try {
    const db = await getDb();
    const now = nowIso();
    const doc: AnotacaoQuestao = {
      id: crypto.randomUUID(),
      user_id: userId,
      questao_origem: questaoOrigem,
      questao_id: questaoId,
      campo_alvo: campoAlvo,
      texto_snippet: texto.slice(0, 500),
      cor,
      rects,
      created_at: now,
      updated_at: now,
      isdeleted: false,
    };
    await db.anotacoes_questao.insert(doc);
    await enqueueOperation('create', 'anotacoes_questao', doc);
    return doc;
  } catch (e) {
    console.error('[anotacoes] Erro ao criar:', e);
    return null;
  }
}

export async function trocarCorAnotacao(
  id: string,
  cor: CorGrifo
): Promise<boolean> {
  try {
    const db = await getDb();
    const now = nowIso();
    const doc = await db.anotacoes_questao.findOne({ selector: { id } }).exec();
    if (!doc) return false;
    await doc.patch({ cor, updated_at: now });
    await enqueueOperation('update', 'anotacoes_questao', { id, cor, updated_at: now });
    return true;
  } catch (e) {
    console.error('[anotacoes] Erro ao trocar cor:', e);
    return false;
  }
}

export async function removerAnotacao(id: string): Promise<boolean> {
  try {
    const db = await getDb();
    const now = nowIso();
    const doc = await db.anotacoes_questao.findOne({ selector: { id } }).exec();
    if (!doc) return false;
    await doc.patch({ isdeleted: true, updated_at: now });
    await enqueueOperation('update', 'anotacoes_questao', { id, isdeleted: true, updated_at: now });
    return true;
  } catch (e) {
    console.error('[anotacoes] Erro ao remover:', e);
    return false;
  }
}