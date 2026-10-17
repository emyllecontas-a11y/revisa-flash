// src/services/syncHelpers.ts
// Envia dados para o Supabase; se falhar (offline etc.), enfileira para retentar.

import { getSupabaseWithToken } from '@/lib/supabaseClient';
import { enqueueOperation } from '@/services/queueService';

export type OpSync = 'create' | 'update' | 'upsert';

export async function enviarOuEnfileirar(tabela: string, op: OpSync, linhas: any[]) {
  if (linhas.length === 0) return;
  try {
    const client = await getSupabaseWithToken();
    if (op === 'create') {
      const { error } = await client.from(tabela).insert(linhas);
      if (error) throw error;
    } else if (op === 'upsert') {
      const { error } = await client.from(tabela).upsert(linhas, { onConflict: 'id' });
      if (error) throw error;
    } else {
      for (const linha of linhas) {
        const { error } = await client.from(tabela).update(linha).eq('id', linha.id);
        if (error) throw error;
      }
    }
  } catch (e) {
    console.warn(`⚠️ [sync] Falha ao enviar ${tabela}, enfileirando.`, e);
    for (const linha of linhas) {
      await enqueueOperation(op === 'upsert' ? 'create' : op, tabela, linha);
    }
  }
}