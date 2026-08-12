import { supabase, getSupabaseWithToken } from '@/lib/supabaseClient';
import { uid } from '@/utils/helpers';
import type { RxDatabase } from 'rxdb';

export type OperationType = 'create' | 'update' | 'delete';

export interface PendingOperation {
  id: string;
  type: OperationType;
  collection: string;
  data: any;
  timestamp: string;
  retries: number;
  updated_at?: string;
}

/**
 * Adiciona uma operação à fila de pendências (recebe a instância do db)
 */
export async function addPendingOperation(
  db: RxDatabase,
  type: OperationType,
  collection: string,
  data: any
): Promise<void> {
  try {
    if (!db.collections || !db.collections.pending_operations) {
      console.warn('⚠️ Coleção pending_operations não encontrada.');
      return;
    }

    const cleanData = JSON.parse(JSON.stringify(data));

    const now = new Date().toISOString();
    const operation: PendingOperation = {
      id: uid(),
      type,
      collection,
      data: cleanData,
      timestamp: now,
      retries: 0,
      updated_at: now,
    };

    await db.pending_operations.insert(operation);
    console.log(`📦 Operação adicionada à fila: ${type} em ${collection}`);
  } catch (error) {
    console.error('❌ Erro ao adicionar operação à fila:', error);
  }
}

/**
 * Processa todas as operações pendentes (recebe a instância do db)
 */
export async function processPendingOperations(db: RxDatabase): Promise<void> {
  try {
    if (!db.collections || !db.collections.pending_operations) {
      console.log('📭 Coleção pending_operations não encontrada.');
      return;
    }

    const operations = await db.pending_operations.find().exec();

    if (operations.length === 0) {
      console.log('📭 Nenhuma operação pendente na fila.');
      return;
    }

    console.log(`📦 Processando ${operations.length} operações pendentes...`);

    const sorted = operations.sort((a, b) => {
      const aData = a.toJSON() as PendingOperation;
      const bData = b.toJSON() as PendingOperation;
      return new Date(aData.timestamp).getTime() - new Date(bData.timestamp).getTime();
    });

    const failed: string[] = [];

    for (const doc of sorted) {
      const op = doc.toJSON() as PendingOperation;
      try {
        console.log(`🔄 Processando: ${op.type} em ${op.collection}`);

        const supabaseClient = await getSupabaseWithToken();

        if (op.type === 'create') {
          const { error } = await supabaseClient.from(op.collection).insert(op.data);
          if (error) throw error;
        } else if (op.type === 'update') {
          const { id, ...updateData } = op.data;
          const { error } = await supabaseClient.from(op.collection).update(updateData).eq('id', id);
          if (error) throw error;
        } else if (op.type === 'delete') {
          const { id } = op.data;
          const { error } = await supabaseClient.from(op.collection).delete().eq('id', id);
          if (error) throw error;
        }

        await doc.remove();
        console.log(`✅ Operação concluída: ${op.id}`);

      } catch (error: any) {
        console.error(`❌ Erro ao processar operação ${op.id}:`, error.message);
        const retries = (op.retries || 0) + 1;
        if (retries >= 5) {
          console.warn(`⚠️ Operação ${op.id} falhou 5 vezes, removendo da fila.`);
          await doc.remove();
        } else {
          await doc.patch({ retries, updated_at: new Date().toISOString() });
          failed.push(op.id);
        }
      }
    }

    if (failed.length > 0) {
      console.warn(`⚠️ ${failed.length} operações falharam e serão tentadas novamente.`);
    } else {
      console.log('✅ Todas as operações pendentes foram processadas.');
    }

  } catch (error) {
    console.error('❌ Erro ao processar fila de operações:', error);
  }
}

// Exporta alias para compatibilidade
export const enqueueOperation = addPendingOperation;