// src/services/queueService.ts
import { getDb } from '@/lib/db';
import { getSupabaseWithToken } from '@/lib/supabaseClient';
import { uid } from '@/utils/helpers';

export type OperationType = 'create' | 'update' | 'delete';

export interface PendingOperation {
  id: string;
  op_type: OperationType;
  table_name: string;
  data: any;
  timestamp: string;
  retries: number;
  updated_at?: string;
}

// Tabelas que têm UNIQUE lógico (1 linha por par). Nessas, "create" vira upsert.
const UPSERT_CONFLICT: Record<string, string> = {
  progresso_simulado: 'simulado_id,user_id',
  progresso_lista: 'lista_id,user_id',
};

// ============================================================
// ENQUEUE — idempotente por (table_name, data.id)
// ============================================================

export async function enqueueOperation(
  type: OperationType,
  tableName: string,
  data: any
): Promise<void> {
  try {
    const db = await getDb();
    if (!db.collections || !db.collections.pending_operations) {
      console.warn('⚠️ Coleção pending_operations não encontrada.');
      return;
    }

    const cleanData = JSON.parse(JSON.stringify(data));
    const now = new Date().toISOString();
    const dataId: string | undefined = cleanData?.id;

    // 1. Se já existe operação pendente para o mesmo (table_name, data.id), mescla
    if (dataId) {
      const pendentes = await db.pending_operations.find({
        selector: { table_name: tableName },
      }).exec();

      const match = pendentes.find((d: any) => {
        const dData = d.get('data');
        return dData && dData.id === dataId;
      });

      if (match) {
        const existingType = match.get('op_type') as OperationType;
        const existingData = match.get('data') || {};

        // Regras de mesclagem:
        // - create + update → mantém create (servidor ainda não tem)
        // - create + delete → remove da fila (nem chegou a criar)
        // - update + update → mescla
        // - update + delete → vira delete
        // - delete + qualquer → mantém delete
        let mergedType: OperationType;
        if (existingType === 'delete') mergedType = 'delete';
        else if (type === 'delete') mergedType = 'delete';
        else if (existingType === 'create') mergedType = 'create';
        else mergedType = 'update';

        if (mergedType === 'delete') {
          // Se ainda não foi criado no servidor, simplesmente remove da fila
          if (existingType === 'create') {
            await match.remove();
            console.log(`📦 Operação cancelada (create+delete): ${tableName}/${dataId}`);
            return;
          }
          // Senão, vira delete simples
          await match.patch({
            op_type: 'delete',
            data: { id: dataId },
            updated_at: now,
          });
          console.log(`📦 Operação convertida em delete: ${tableName}/${dataId}`);
          return;
        }

        await match.patch({
          op_type: mergedType,
          data: { ...existingData, ...cleanData },
          updated_at: now,
        });
        console.log(`📦 Operação mesclada na fila: ${mergedType} em ${tableName}`);
        return;
      }
    }

    // 2. Não existe → cria nova
    const operation: PendingOperation = {
      id: uid(),
      op_type: type,
      table_name: tableName,
      data: cleanData,
      timestamp: now,
      retries: 0,
      updated_at: now,
    };
    await db.pending_operations.insert(operation);
    console.log(`📦 Operação adicionada à fila: ${type} em ${tableName}`);
  } catch (error) {
    console.error('❌ Erro ao adicionar operação à fila:', error);
  }
}

// ============================================================
// PROCESS — com guarda de reentrância e upsert para creates
// ============================================================

let isProcessing = false;

export async function processPendingOperations(): Promise<void> {
  if (isProcessing) {
    console.log('⏳ Fila já está sendo processada.');
    return;
  }
  isProcessing = true;

  try {
    const db = await getDb();
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
        console.log(`🔄 Processando: ${op.op_type} em ${op.table_name}`);
        const supabaseClient = await getSupabaseWithToken();

        if (op.op_type === 'create') {
          const onConflict = UPSERT_CONFLICT[op.table_name];

          if (onConflict) {
            // Tabela com UNIQUE lógico: tenta upsert; se falhar, faz update manual
            const { error: upsertErr } = await supabaseClient
              .from(op.table_name)
              .upsert(op.data, { onConflict });

            if (upsertErr) {
              // Fallback: update por colunas únicas
              const cols = onConflict.split(',').map(c => c.trim());
              let q: any = supabaseClient.from(op.table_name).update(op.data);
              for (const col of cols) {
                q = q.eq(col, op.data[col]);
              }
              const { error: updErr } = await q;
              if (updErr) throw upsertErr;
            }
          } else {
            const { error } = await supabaseClient
              .from(op.table_name)
              .insert(op.data);
            if (error) throw error;
          }
        } else if (op.op_type === 'update') {
          const { id, ...updateData } = op.data;
          const { error } = await supabaseClient
            .from(op.table_name)
            .update(updateData)
            .eq('id', id);
          if (error) throw error;
        } else if (op.op_type === 'delete') {
          const { id } = op.data;
          const { error } = await supabaseClient
            .from(op.table_name)
            .delete()
            .eq('id', id);
          if (error) throw error;
        }

        // Recarrega o doc antes de remover (evita conflito se já foi mexido)
        const fresh = await db.pending_operations.findOne({ selector: { id: op.id } }).exec();
        if (fresh) await fresh.remove();
        console.log(`✅ Operação concluída: ${op.id}`);
      } catch (error: any) {
        console.error(`❌ Erro ao processar operação ${op.id}:`, error.message);

        // 409 Conflict em create significa que a linha já existe no servidor.
        // Trata como sucesso (idempotência).
        const status = error?.status || error?.code;
        const is409 =
          status === 409 ||
          String(error?.message || '').includes('duplicate key');

        const fresh = await db.pending_operations.findOne({ selector: { id: op.id } }).exec();
        if (!fresh) continue;

        if (is409) {
          await fresh.remove();
          console.log(`✅ Operação ${op.id} ignorada (já existe no servidor).`);
          continue;
        }

        const retries = (op.retries || 0) + 1;
        if (retries >= 5) {
          console.warn(`⚠️ Operação ${op.id} falhou 5 vezes, removendo da fila.`);
          await fresh.remove();
        } else {
          await fresh.patch({ retries, updated_at: new Date().toISOString() });
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
  } finally {
    isProcessing = false;
  }
}

// ============================================================
// LISTENER
// ============================================================

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
        // Pequeno debounce: se várias mudanças vierem juntas, uma só chamada
        setTimeout(() => {
          processPendingOperations().catch(console.error);
        }, 300);
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