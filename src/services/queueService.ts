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
  updated_at?: string;
}

export async function addPendingOperation(
  type: OperationType,
  collection: string,
  data: any
): Promise<void> {
  try {
    const db = await getDb();
    if (!db.collections?.pending_operations) {
      console.warn('⚠️ Coleção pending_operations não encontrada.');
      return;
    }

    // 🔥 Limpeza: evita undefined
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

export async function processPendingOperations(): Promise<void> {
  try {
    const db = await getDb();
    if (!db.collections?.pending_operations) {
      console.log('📭 Coleção pending_operations não encontrada.');
      return;
    }

    const operations = await db.pending_operations.find().exec();
    if (operations.length === 0) {
      console.log('📭 Nenhuma operação pendente.');
      return;
    }

    // ... resto igual
  } catch (error) {
    console.error('❌ Erro ao processar fila:', error);
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