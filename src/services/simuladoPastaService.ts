// src/services/simuladoPastaService.ts
import { getDb } from '@/lib/db';
import { enqueueOperation } from '@/services/queueService';

export interface SimuladoPasta {
  id: string;
  user_id: string;
  name: string;
  order: number;
  created_at: string;
  updated_at: string;
  isdeleted: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function getPastasSimulado(
  userId: string
): Promise<{ success: boolean; data?: SimuladoPasta[]; error?: string }> {
  try {
    const db = await getDb();
    const docs = await db.simulados_pastas.find({
      selector: { user_id: userId, isdeleted: false },
    }).exec();
    const data: SimuladoPasta[] = docs.map((d: any) => d.toJSON());
    data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));
    return { success: true, data };
  } catch (e: any) {
    console.error('[simuladoPasta] erro getPastasSimulado:', e);
    return { success: false, error: e?.message || 'Erro ao buscar pastas' };
  }
}

export async function criarPastaSimulado(
  userId: string,
  name: string
): Promise<{ success: boolean; data?: SimuladoPasta; error?: string }> {
  try {
    const nomeLimpo = name?.trim();
    if (!nomeLimpo) return { success: false, error: 'Nome é obrigatório' };
    if (!userId) return { success: false, error: 'Usuário não autenticado' };

    const db = await getDb();
    const now = nowIso();

    const existentes = await db.simulados_pastas.find({
      selector: { user_id: userId, isdeleted: false },
    }).exec();
    const ordens = existentes.map((d: any) => d.get('order') || 0);
    const proxima = ordens.length > 0 ? Math.max(...ordens) + 1 : 0;

    const pasta: SimuladoPasta = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: nomeLimpo,
      order: proxima,
      created_at: now,
      updated_at: now,
      isdeleted: false,
    };

    await db.simulados_pastas.insert(pasta);
    await enqueueOperation('create', 'simulados_pastas', pasta);
    return { success: true, data: pasta };
  } catch (e: any) {
    console.error('[simuladoPasta] erro criar:', e);
    return { success: false, error: e?.message || 'Erro ao criar pasta' };
  }
}

export async function renomearPastaSimulado(
  pastaId: string,
  userId: string,
  novoNome: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const nomeLimpo = novoNome?.trim();
    if (!nomeLimpo) return { success: false, error: 'Nome é obrigatório' };

    const db = await getDb();
    const now = nowIso();
    const doc = await db.simulados_pastas.findOne({ selector: { id: pastaId } }).exec();
    if (!doc || doc.get('user_id') !== userId) {
      return { success: false, error: 'Pasta não encontrada' };
    }

    await doc.patch({ name: nomeLimpo, updated_at: now });
    await enqueueOperation('update', 'simulados_pastas', {
      id: pastaId, name: nomeLimpo, updated_at: now,
    });
    return { success: true };
  } catch (e: any) {
    console.error('[simuladoPasta] erro renomear:', e);
    return { success: false, error: e?.message || 'Erro ao renomear' };
  }
}

export async function excluirPastaSimulado(
  pastaId: string,
  userId: string
): Promise<{ success: boolean; simuladosMovidos?: number; error?: string }> {
  try {
    const db = await getDb();
    const now = nowIso();

    // Move todos os simulados dessa pasta para "sem pasta" (não apaga nenhum)
    const simulados = await db.simulados.find({
      selector: { created_by: userId, folder_id: pastaId, isdeleted: false },
    }).exec();
    for (const s of simulados) {
      await s.patch({ folder_id: null, updated_at: now });
      await enqueueOperation('update', 'simulados', {
        id: s.get('id'), folder_id: null, updated_at: now,
      });
    }

    const doc = await db.simulados_pastas.findOne({ selector: { id: pastaId } }).exec();
    if (!doc || doc.get('user_id') !== userId) {
      return { success: false, error: 'Pasta não encontrada' };
    }
    await doc.patch({ isdeleted: true, updated_at: now });
    await enqueueOperation('update', 'simulados_pastas', {
      id: pastaId, isdeleted: true, updated_at: now,
    });

    return { success: true, simuladosMovidos: simulados.length };
  } catch (e: any) {
    console.error('[simuladoPasta] erro excluir:', e);
    return { success: false, error: e?.message || 'Erro ao excluir' };
  }
}

export async function moverSimuladoParaPasta(
  simuladoId: string,
  userId: string,
  pastaId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const now = nowIso();

    const doc = await db.simulados.findOne({ selector: { id: simuladoId } }).exec();
    if (!doc) return { success: false, error: 'Simulado não encontrado' };
    if (doc.get('created_by') !== userId || doc.get('isdeleted')) {
      return { success: false, error: 'Simulado não encontrado' };
    }

    await doc.patch({ folder_id: pastaId, updated_at: now });
    await enqueueOperation('update', 'simulados', {
      id: simuladoId, folder_id: pastaId, updated_at: now,
    });
    return { success: true };
  } catch (e: any) {
    console.error('[simuladoPasta] erro mover:', e);
    return { success: false, error: e?.message || 'Erro ao mover' };
  }
}

export async function reordenarPastasSimulado(
  userId: string,
  itens: { id: string; order: number }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!itens || itens.length === 0) return { success: true };

    const db = await getDb();
    const now = nowIso();

    for (const item of itens) {
      const doc = await db.simulados_pastas.findOne({ selector: { id: item.id } }).exec();
      if (!doc || doc.get('user_id') !== userId) continue;
      await doc.patch({ order: item.order, updated_at: now });
      await enqueueOperation('update', 'simulados_pastas', {
        id: item.id, order: item.order, updated_at: now,
      });
    }

    return { success: true };
  } catch (e: any) {
    console.error('[simuladoPasta] erro reordenar:', e);
    return { success: false, error: e?.message || 'Erro ao reordenar' };
  }
}