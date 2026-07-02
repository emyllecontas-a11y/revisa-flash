// src/services/queueService.ts
import { getDb } from '@/lib/db';
import { getSupabaseWithToken } from '@/lib/supabaseClient';
import { uid } from '@/utils/helpers';

export type OperationType = 'create' | 'update' | 'delete';

export interface PendingOperation {
  id: string;
  type: OperationType;
  collection: string;
  data: any;
  timestamp: string;
  retries: number;
}

/**
 * Adiciona uma operação à fila de pendências
 */
export async function addPendingOperation(
  type: OperationType,
  collection: string,
  data: any
): Promise<void> {
  try {
    const db = await getDb();
    
    // Verifica se a coleção existe
    if (!db.collections || !db.collections.pending_operations) {
      console.error('❌ Coleção pending_operations não encontrada no banco.');
      return;
    }

    const operation: PendingOperation = {
      id: uid(),
      type,
      collection,
      data,
      timestamp: new Date().toISOString(),
      retries: 0,
    };

    await db.pending_operations.insert(operation);
    console.log(`📦 Operação adicionada à fila: ${type} em ${collection}`);
  } catch (error) {
    console.error('❌ Erro ao adicionar operação à fila:', error);
    // Não relança o erro para não quebrar o fluxo principal
  }
}

/**
 * Processa todas as operações pendentes (envia para o Supabase)
 */
export async function processPendingOperations(): Promise<void> {
  try {
    const db = await getDb();
    
    // Verifica se a coleção existe
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

        // 👇 OBTÉM O CLIENTE SUPABASE COM O TOKEN DO CLERK
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
          await doc.incrementalPatch({ retries });
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

/**
 * Configura um listener para processar a fila quando houver alterações
 */
export function setupQueueListener(): void {
  const handleOnline = () => {
    console.log('📶 Conexão restaurada, processando fila de operações pendentes...');
    processPendingOperations().catch(console.error);
  };

  const setupChangeListener = async () => {
    try {
      const db = await getDb();
      if (!db.collections || !db.collections.pending_operations) {
        console.warn('⚠️ Coleção pending_operations não encontrada para listener.');
        return;
      }

      db.pending_operations.$.subscribe(() => {
        console.log('🔄 Mudança detectada na fila, processando...');
        processPendingOperations().catch(console.error);
      });
    } catch (error) {
      console.warn('⚠️ Erro ao configurar listener da fila:', error);
    }
  };

  window.addEventListener('online', handleOnline);
  setupChangeListener();

  window.addEventListener('beforeunload', () => {
    window.removeEventListener('online', handleOnline);
  });

  console.log('✅ Listener da fila configurado.');
}

// Exporta o alias para compatibilidade
export const enqueueOperation = addPendingOperation;