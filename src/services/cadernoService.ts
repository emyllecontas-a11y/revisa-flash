// src/services/cadernoService.ts
import { getDb } from '@/lib/db';

export interface PastaCaderno {
  id: string;
  user_id: string;
  name: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface Caderno {
  id: string;
  user_id: string;
  nome: string;
  descricao: string | null;
  pasta_id: string | null;
  created_at: string;
  updated_at: string;
  questoes_count?: number; // Contagem que faremos na hora
}

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
    
    // Para cada caderno, busca quantas questões ele tem
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