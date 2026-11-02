// src/services/cadernoService.ts
import { getDb } from '@/lib/db';
import { enqueueOperation } from '@/services/queueService';

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
    const docs = await db.pastas_caderno.find({
      selector: { user_id: userId, isdeleted: false }
    }).exec();
    
    const data = docs.map((d: any) => d.toJSON() as PastaCaderno);
    data.sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
    
    return { success: true, data };
  } catch (e: any) {
    console.error('[cadernoService] Erro ao listar pastas:', e);
    return { success: false, error: e?.message || 'Erro ao listar pastas.' };
  }
}

export async function getCadernos(userId: string): Promise<{ success: boolean; data?: Caderno[]; error?: string }> {
  if (!userId) return { success: false, error: 'Usuário não autenticado.' };
  try {
    const db = await getDb();
    const docs = await db.cadernos.find({
      selector: { user_id: userId, isdeleted: false }
    }).exec();
    
    const data = docs.map((d: any) => d.toJSON() as Caderno);
    
    const links = await db.caderno_questoes.find().exec();
    const contagem: Record<string, number> = {};
    for (const link of links) {
      const cid = link.get('caderno_id');
      contagem[cid] = (contagem[cid] || 0) + 1;
    }

    data.forEach(c => {
      c.questoes_count = contagem[c.id] || 0;
    });

    data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    return { success: true, data };
  } catch (e: any) {
    console.error('[cadernoService] Erro ao listar cadernos:', e);
    return { success: false, error: e?.message || 'Erro ao listar cadernos.' };
  }
}

export async function criarPastaCaderno(userId: string, name: string): Promise<{ success: boolean; error?: string }> {
  if (!name.trim()) return { success: false, error: 'O nome da pasta é obrigatório.' };
  try {
    const db = await getDb();
    const agora = nowIso();
    const nova = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: name.trim(),
      order: 0,
      created_at: agora,
      updated_at: agora,
      isdeleted: false,
    };
    await db.pastas_caderno.insert(nova);
    await enqueueOperation('create', 'pastas_caderno', nova);
    return { success: true };
  } catch (e: any) {
    console.error('[cadernoService] Erro ao criar pasta:', e);
    return { success: false, error: e?.message || 'Erro ao criar pasta.' };
  }
}

export async function criarCaderno(
  userId: string,
  nome: string,
  pastaId: string | null,
  questoesIds: string[]
): Promise<{ success: boolean; error?: string }> {
  if (!nome.trim()) return { success: false, error: 'O nome do caderno é obrigatório.' };
  if (questoesIds.length === 0) return { success: false, error: 'Selecione pelo menos uma questão.' };

  try {
    const db = await getDb();
    const agora = nowIso();
    const cadernoId = crypto.randomUUID();

    // 1. Cria o caderno
    const novoCaderno = {
      id: cadernoId,
      user_id: userId,
      nome: nome.trim(),
      descricao: null,
      pasta_id: pastaId === 'sem-pasta' ? null : pastaId,
      created_at: agora,
      updated_at: agora,
      isdeleted: false,
    };
    await db.cadernos.insert(novoCaderno);
    await enqueueOperation('create', 'cadernos', novoCaderno);

    // 2. Adiciona as questões nele
    for (let i = 0; i < questoesIds.length; i++) {
      const link = {
        id: crypto.randomUUID(),
        caderno_id: cadernoId,
        questao_banco_id: questoesIds[i],
        ordem: i,
        created_at: agora,
      };
      await db.caderno_questoes.insert(link);
      await enqueueOperation('create', 'caderno_questoes', link);
    }

    return { success: true };
  } catch (e: any) {
    console.error('[cadernoService] Erro ao criar caderno:', e);
    return { success: false, error: e?.message || 'Erro ao criar caderno.' };
  }
}