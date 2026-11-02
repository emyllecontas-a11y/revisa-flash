// src/services/cadernoService.ts
import { getDb } from '@/lib/db';
import { enqueueOperation } from '@/services/queueService';
import type { QuestaoBanco } from '@/services/bancoQuestoesService';

export interface PastaCaderno {
  id: string;
  user_id: string;
  name: string;
  order: number;
  created_at: string;
  updated_at: string;
  isdeleted: boolean;
}

export interface Caderno {
  id: string;
  user_id: string;
  nome: string;
  descricao: string | null;
  pasta_id: string | null;
  created_at: string;
  updated_at: string;
  isdeleted: boolean;
  questoes_count?: number;
}

function nowIso() { return new Date().toISOString(); }

export async function getPastasCaderno(userId: string): Promise<{ success: boolean; data?: PastaCaderno[]; error?: string }> {
  if (!userId) return { success: false, error: 'Usuário não autenticado.' };
  try {
    const db = await getDb();
    const docs = await db.pastas_caderno.find({ selector: { user_id: userId, isdeleted: false } }).exec();
    const data = docs.map((d: any) => d.toJSON() as PastaCaderno);
    data.sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao listar pastas.' };
  }
}

export async function getCadernos(userId: string): Promise<{ success: boolean; data?: Caderno[]; error?: string }> {
  if (!userId) return { success: false, error: 'Usuário não autenticado.' };
  try {
    const db = await getDb();
    const docs = await db.cadernos.find({ selector: { user_id: userId, isdeleted: false } }).exec();
    const data = docs.map((d: any) => d.toJSON() as Caderno);
    
    const links = await db.caderno_questoes.find().exec();
    const contagem: Record<string, number> = {};
    for (const link of links) {
      const cid = link.get('caderno_id');
      contagem[cid] = (contagem[cid] || 0) + 1;
    }

    data.forEach(c => { c.questoes_count = contagem[c.id] || 0; });
    data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao listar cadernos.' };
  }
}

export async function criarPastaCaderno(userId: string, name: string): Promise<{ success: boolean; error?: string }> {
  if (!name.trim()) return { success: false, error: 'O nome da pasta é obrigatório.' };
  try {
    const db = await getDb();
    const agora = nowIso();
    const nova = { id: crypto.randomUUID(), user_id: userId, name: name.trim(), order: 0, created_at: agora, updated_at: agora, isdeleted: false };
    await db.pastas_caderno.insert(nova);
    await enqueueOperation('create', 'pastas_caderno', nova);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao criar pasta.' };
  }
}

export async function atualizarPasta(userId: string, id: string, name: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const doc = await db.pastas_caderno.findOne({ selector: { id } }).exec();
    if (!doc || doc.get('user_id') !== userId) return { success: false, error: 'Pasta não encontrada.' };
    const agora = nowIso();
    await doc.patch({ name: name.trim(), updated_at: agora });
    await enqueueOperation('update', 'pastas_caderno', { id, name: name.trim(), updated_at: agora });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao atualizar pasta.' };
  }
}

export async function excluirPasta(userId: string, id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const doc = await db.pastas_caderno.findOne({ selector: { id } }).exec();
    if (!doc || doc.get('user_id') !== userId) return { success: false, error: 'Pasta não encontrada.' };
    const agora = nowIso();
    await doc.patch({ isdeleted: true, updated_at: agora });
    await enqueueOperation('update', 'pastas_caderno', { id, isdeleted: true, updated_at: agora });

    // Desvincula cadernos desta pasta (volta para "Sem pasta")
    const cadernos = await db.cadernos.find({ selector: { pasta_id: id, isdeleted: false } }).exec();
    for (const c of cadernos) {
      await c.patch({ pasta_id: null, updated_at: agora });
      await enqueueOperation('update', 'cadernos', { id: c.get('id'), pasta_id: null, updated_at: agora });
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao excluir pasta.' };
  }
}

export async function criarCaderno(userId: string, nome: string, pastaId: string | null, questoesIds: string[]): Promise<{ success: boolean; error?: string }> {
  if (!nome.trim()) return { success: false, error: 'O nome do caderno é obrigatório.' };
  if (questoesIds.length === 0) return { success: false, error: 'Selecione pelo menos uma questão.' };

  try {
    const db = await getDb();
    const agora = nowIso();
    const cadernoId = crypto.randomUUID();

    const novoCaderno = { id: cadernoId, user_id: userId, nome: nome.trim(), descricao: null, pasta_id: pastaId === 'sem-pasta' ? null : pastaId, created_at: agora, updated_at: agora, isdeleted: false };
    await db.cadernos.insert(novoCaderno);
    await enqueueOperation('create', 'cadernos', novoCaderno);

    for (let i = 0; i < questoesIds.length; i++) {
      const link = { id: crypto.randomUUID(), caderno_id: cadernoId, questao_banco_id: questoesIds[i], ordem: i, created_at: agora };
      await db.caderno_questoes.insert(link);
      await enqueueOperation('create', 'caderno_questoes', link);
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao criar caderno.' };
  }
}

export async function atualizarCaderno(userId: string, id: string, dados: { nome: string; pasta_id: string | null }): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const doc = await db.cadernos.findOne({ selector: { id } }).exec();
    if (!doc || doc.get('user_id') !== userId) return { success: false, error: 'Caderno não encontrado.' };
    const agora = nowIso();
    const patch = { nome: dados.nome.trim(), pasta_id: dados.pasta_id === 'sem-pasta' ? null : dados.pasta_id, updated_at: agora };
    await doc.patch(patch);
    await enqueueOperation('update', 'cadernos', { id, ...patch });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao atualizar caderno.' };
  }
}

export async function excluirCaderno(userId: string, id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const doc = await db.cadernos.findOne({ selector: { id } }).exec();
    if (!doc || doc.get('user_id') !== userId) return { success: false, error: 'Caderno não encontrado.' };
    const agora = nowIso();
    
    // Soft delete no caderno
    await doc.patch({ isdeleted: true, updated_at: agora });
    await enqueueOperation('update', 'cadernos', { id, isdeleted: true, updated_at: agora });

    // Remove os vínculos das questões (hard delete)
    const links = await db.caderno_questoes.find({ selector: { caderno_id: id } }).exec();
    for (const link of links) {
      await link.remove();
      await enqueueOperation('delete', 'caderno_questoes', { id: link.get('id') });
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao excluir caderno.' };
  }
}

export async function getQuestoesDoCaderno(cadernoId: string): Promise<{ success: boolean; data?: QuestaoBanco[]; error?: string }> {
  try {
    const db = await getDb();
    const links = await db.caderno_questoes.find({ selector: { caderno_id: cadernoId } }).exec();
    const ids = links.map(l => l.get('questao_banco_id'));
    if (ids.length === 0) return { success: true, data: [] };

    const questoes = await db.banco_questoes.find({ selector: { id: { $in: ids }, isdeleted: false } }).exec();
    const data = questoes.map((d: any) => d.toJSON() as QuestaoBanco);
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao buscar questões.' };
  }
}

export async function removerQuestaoDoCaderno(cadernoId: string, questaoId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const link = await db.caderno_questoes.findOne({ selector: { caderno_id: cadernoId, questao_banco_id: questaoId } }).exec();
    if (!link) return { success: false, error: 'Questão não encontrada neste caderno.' };
    await link.remove();
    await enqueueOperation('delete', 'caderno_questoes', { id: link.get('id') });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao remover questão.' };
  }
}

// NOVA FUNÇÃO: Adicionar novas questões a um caderno que já existe
export async function adicionarQuestoesAoCaderno(cadernoId: string, questoesIds: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const agora = nowIso();
    
    // Busca a última ordem para continuar a numeração
    const existentes = await db.caderno_questoes.find({ selector: { caderno_id: cadernoId } }).exec();
    let maxOrdem = -1;
    for (const e of existentes) {
      const o = e.get('ordem');
      if (o > maxOrdem) maxOrdem = o;
    }

    for (let i = 0; i < questoesIds.length; i++) {
      const link = { id: crypto.randomUUID(), caderno_id: cadernoId, questao_banco_id: questoesIds[i], ordem: maxOrdem + 1 + i, created_at: agora };
      await db.caderno_questoes.insert(link);
      await enqueueOperation('create', 'caderno_questoes', link);
    }
    return { success: true };
  } catch (e: any) {
    console.error('[cadernoService] Erro ao adicionar questões:', e);
    return { success: false, error: e?.message || 'Erro ao adicionar questões.' };
  }
}