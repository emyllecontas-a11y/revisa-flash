// src/services/queueService.ts
import { getDb } from '@/lib/db';
import { getSupabaseWithToken } from '@/lib/supabaseClient';
import { uid } from '@/utils/helpers';

export type OperationType = 'create' | 'update' | 'delete';

export interface PendingOperation {
  id: string;
  user_id?: string;
  op_type: OperationType;
  table_name: string;
  data: any;
  timestamp: string;
  retries: number;
  updated_at?: string;
  failed?: boolean;
  failed_at?: string | null;
}

const MAX_RETRIES = 5;

// Tabelas que têm UNIQUE lógico (1 linha por par). Nessas, "create" vira upsert.
const UPSERT_CONFLICT: Record<string, string> = {
  progresso_simulado: 'simulado_id,user_id',
  progresso_lista: 'lista_id,user_id',
};

// ============================================================
// USUÁRIO ATUAL
// ============================================================
function getCurrentUserId(): string | null {
  try {
    return localStorage.getItem('revisaflash_user_id');
  } catch {
    return null;
  }
}

// ============================================================
// ENQUEUE — idempotente por (user_id, table_name, data.id)
// ============================================================

export async function enqueueOperation(
  type: OperationType,
  tableName: string,
  data: any
): Promise<void> {
  try {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      console.warn('⚠️ enqueueOperation chamado sem usuário logado. Operação ignorada.');
      return;
    }

    const db = await getDb();
    if (!db.collections || !db.collections.pending_operations) {
      console.warn('⚠️ Coleção pending_operations não encontrada.');
      return;
    }

    const cleanData = JSON.parse(JSON.stringify(data));
    const now = new Date().toISOString();
    const dataId: string | undefined = cleanData?.id;

    // 1. Se já existe operação pendente para o mesmo (user, table, data.id), mescla
    if (dataId) {
      const pendentes = await db.pending_operations.find({
        selector: { table_name: tableName, user_id: currentUserId },
      }).exec();

      const match = pendentes.find((d: any) => {
        const dData = d.get('data');
        return dData && dData.id === dataId;
      });

      if (match) {
        const existingType = match.get('op_type') as OperationType;
        const existingData = match.get('data') || {};
        const wasFailed = match.get('failed') === true;

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
          if (existingType === 'create') {
            await match.remove();
            console.log(`📦 Operação cancelada (create+delete): ${tableName}/${dataId}`);
            return;
          }
          // Nova alteração do usuário → reativa se estava marcada como falha.
          await match.patch({
            op_type: 'delete',
            data: { id: dataId },
            updated_at: now,
            failed: false,
            failed_at: null,
            retries: wasFailed ? 0 : match.get('retries'),
          });
          console.log(`📦 Operação convertida em delete: ${tableName}/${dataId}`);
          return;
        }

        await match.patch({
          op_type: mergedType,
          data: { ...existingData, ...cleanData },
          updated_at: now,
          // Nova alteração do usuário → reativa se estava marcada como falha.
          failed: false,
          failed_at: null,
          retries: wasFailed ? 0 : match.get('retries'),
        });
        console.log(`📦 Operação mesclada na fila: ${mergedType} em ${tableName}`);
        return;
      }
    }

    // 2. Não existe → cria nova
    const operation: PendingOperation = {
      id: uid(),
      user_id: currentUserId,
      op_type: type,
      table_name: tableName,
      data: cleanData,
      timestamp: now,
      retries: 0,
      updated_at: now,
      failed: false,
      failed_at: null,
    };
    await db.pending_operations.insert(operation);
    console.log(`📦 Operação adicionada à fila: ${type} em ${tableName}`);
  } catch (error) {
    console.error('❌ Erro ao adicionar operação à fila:', error);
  }
}

// ============================================================
// PROCESS — só do usuário logado, com guarda de reentrância
// ============================================================

let isProcessing = false;

export async function processPendingOperations(): Promise<void> {
  if (isProcessing) {
    console.log('⏳ Fila já está sendo processada.');
    return;
  }
  isProcessing = true;

  try {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      console.log('📭 Nenhum usuário logado. Fila não será processada.');
      return;
    }

    const db = await getDb();
    if (!db.collections || !db.collections.pending_operations) {
      console.log('📭 Coleção pending_operations não encontrada.');
      return;
    }

    // 🔥 Limpeza: descarta operações legadas sem user_id.
    const allPending = await db.pending_operations.find().exec();
    const orphans = allPending.filter((d: any) => !d.get('user_id'));
    if (orphans.length > 0) {
      console.warn(`⚠️ Descartando ${orphans.length} operação(ões) legada(s) sem user_id.`);
      for (const orphan of orphans) {
        await orphan.remove();
      }
    }

    // 🔥 Filtro: só do usuário logado E que não estejam marcadas como falha
    const operations = await db.pending_operations.find({
      selector: {
        user_id: currentUserId,
        failed: { $ne: true },
      },
    }).exec();

    if (operations.length === 0) {
      console.log('📭 Nenhuma operação pendente na fila.');
      return;
    }

    console.log(`📦 Processando ${operations.length} operações pendentes do usuário ${currentUserId}...`);

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
            const { error: upsertErr } = await supabaseClient
              .from(op.table_name)
              .upsert(op.data, { onConflict });

            if (upsertErr) {
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

        const fresh = await db.pending_operations.findOne({ selector: { id: op.id } }).exec();
        if (fresh) await fresh.remove();
        console.log(`✅ Operação concluída: ${op.id}`);
      } catch (error: any) {
        console.error(`❌ Erro ao processar operação ${op.id}:`, error.message);

        // 409 Conflict em create significa que a linha já existe no servidor.
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

        if (retries >= MAX_RETRIES) {
          // 🔥 D5: NÃO removemos mais a operação.
          // Marcamos como falha definitiva para não perdermos dados.
          await fresh.patch({
            retries,
            failed: true,
            failed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          console.warn(`⚠️ Operação ${op.id} marcada como falha após ${MAX_RETRIES} tentativas. Ela NÃO foi removida.`);
        } else {
          await fresh.patch({
            retries,
            updated_at: new Date().toISOString(),
          });
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
// 🔥 D5: OPERAÇÕES COM FALHA
// ============================================================

/**
 * Reativa todas as operações marcadas como falha do usuário atual.
 * Zera retries e limpa `failed`, tornando-as elegíveis para o próximo
 * processPendingOperations().
 * Retorna quantas foram reativadas.
 */
export async function retryFailedOperations(): Promise<number> {
  try {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return 0;

    const db = await getDb();
    if (!db.collections || !db.collections.pending_operations) return 0;

    const failedOps = await db.pending_operations.find({
      selector: {
        user_id: currentUserId,
        failed: true,
      },
    }).exec();

    if (failedOps.length === 0) return 0;

    console.log(`🔁 Reativando ${failedOps.length} operação(ões) marcada(s) como falha...`);
    for (const doc of failedOps) {
      await doc.patch({
        failed: false,
        failed_at: null,
        retries: 0,
        updated_at: new Date().toISOString(),
      });
    }
    return failedOps.length;
  } catch (error) {
    console.error('❌ Erro ao reativar operações com falha:', error);
    return 0;
  }
}

/**
 * Conta operações marcadas como falha do usuário atual.
 * Vai ser útil para mostrar aviso na UI em etapa posterior.
 */
export async function countFailedOperations(): Promise<number> {
  try {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return 0;

    const db = await getDb();
    if (!db.collections || !db.collections.pending_operations) return 0;

    const failedOps = await db.pending_operations.find({
      selector: {
        user_id: currentUserId,
        failed: true,
      },
    }).exec();

    return failedOps.length;
  } catch {
    return 0;
  }
}

// ============================================================
// LISTENER
// ============================================================

export function setupQueueListener(): void {
  const handleOnline = () => {
    console.log('📶 Conexão restaurada, processando fila de operações pendentes...');
    processPendingOperations().catch(console.error);
    // 🔥 D5: depois de dar tempo para a fila normal rodar, dá uma segunda
    // chance às operações que estavam marcadas como falha. Se a causa foi
    // rede, agora provavelmente funcionam.
    setTimeout(() => {
      retryFailedOperations()
        .then((n) => {
          if (n > 0) processPendingOperations().catch(console.error);
        })
        .catch(console.error);
    }, 5000);
  };

  const setupChangeListener = async () => {
    try {
      const db = await getDb();
      if (!db.collections || !db.collections.pending_operations) {
        console.warn('⚠️ Coleção pending_operations não encontrada para listener.');
        return;
      }
      db.pending_operations.$.subscribe(() => {
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