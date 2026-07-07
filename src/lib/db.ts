// src/lib/db.ts
import { createRxDatabase, RxDatabase } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { supabase, getSupabaseWithToken } from './supabaseClient';
import { processPendingOperations } from '@/services/queueService';

// ============================================================
// SCHEMAS (com isDeleted booleano, version: 0)
// ============================================================

const deckSchema = {
  title: 'deck schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    user_id: { type: 'string' },
    createdAt: { type: 'string' },
    updated_at: { type: 'string' },
    color: { type: 'string' },
    isDeleted: { type: 'boolean', default: false }, // 🔥 NOME ALTERADO
    is_shared: { type: 'boolean' },
    owner_id: { type: 'string' },
    shared_with: { type: 'array', items: { type: 'string' } }
  },
  required: ['id', 'name', 'user_id']
};

const flashcardSchema = {
  title: 'flashcard schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    deck_id: { type: 'string' },
    user_id: { type: 'string' },
    front: { type: 'string' },
    back: { type: 'string' },
    difficulty: { type: 'number' },
    stability: { type: 'number' },
    retrievability: { type: 'number' },
    dueDate: { type: 'string' },
    reps: { type: 'number' },
    lapses: { type: 'number' },
    lastReview: { type: 'string' },
    state: { type: 'number' },
    elapsed_days: { type: 'number' },
    scheduled_days: { type: 'number' },
    createdAt: { type: 'string' },
    updated_at: { type: 'string' },
    shared_card_id: { type: ['string', 'null'] },
    isDeleted: { type: 'boolean', default: false } // 🔥
  },
  required: ['id', 'deck_id', 'user_id', 'front', 'back']
};

const disciplineSchema = {
  title: 'discipline schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    user_id: { type: 'string' },
    createdAt: { type: 'string' },
    updated_at: { type: 'string' },
    isDeleted: { type: 'boolean', default: false }
  },
  required: ['id', 'name', 'user_id']
};

const topicSchema = {
  title: 'topic schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    discipline_id: { type: 'string' },
    user_id: { type: 'string' },
    status: { type: 'string' },
    planned_date: { type: 'string' },
    createdAt: { type: 'string' },
    updated_at: { type: 'string' },
    isDeleted: { type: 'boolean', default: false },
    order: { type: 'number', default: 0 }
  },
  required: ['id', 'name', 'user_id']
};

const errorSchema = {
  title: 'error schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    user_id: { type: 'string' },
    question: { type: 'string' },
    area: { type: 'string' },
    correctAnswer: { type: 'string' },
    yourAnswer: { type: 'string' },
    topic: { type: 'string' },
    type: { type: 'string' },
    source: { type: 'string' },
    comment: { type: 'string' },
    repetitions: { type: 'number' },
    status: { type: 'string' },
    flashcardId: { type: 'string' },
    createdAt: { type: 'string' },
    updated_at: { type: 'string' },
    isDeleted: { type: 'boolean', default: false }
  },
  required: ['id', 'user_id', 'question', 'area', 'correctAnswer']
};

const revisaoSchema = {
  title: 'revisao schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    user_id: { type: 'string' },
    topico_id: { type: 'string' },
    topicName: { type: 'string' },
    discipline: { type: 'string' },
    review_level: { type: 'number' },
    nextReviewDate: { type: 'string' },
    lastStudyDate: { type: 'string' },
    completedAt: { type: 'string' },
    createdAt: { type: 'string' },
    updated_at: { type: 'string' },
    isDeleted: { type: 'boolean', default: false }
  },
  required: ['id', 'user_id', 'topico_id']
};

const studyRecordSchema = {
  title: 'study_record schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    user_id: { type: 'string' },
    date: { type: 'string' },
    type: { type: 'string' },
    discipline: { type: 'string' },
    topic: { type: 'string' },
    duration: { type: 'number' },
    material: { type: 'string' },
    questionsCount: { type: 'number' },
    correctCount: { type: 'number' },
    wrongCount: { type: 'number' },
    source: { type: 'string' },
    observations: { type: 'string' },
    createdAt: { type: 'string' },
    updated_at: { type: 'string' },
    isDeleted: { type: 'boolean', default: false }
  },
  required: ['id', 'user_id', 'date', 'type', 'discipline', 'topic', 'duration']
};

const studySessionSchema = {
  title: 'study_session schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    deckId: { type: 'string' },
    startTime: { type: 'string' },
    endTime: { type: 'string' },
    totalTimeSeconds: { type: 'number' },
    completed: { type: 'boolean' },
    cardTimes: { type: 'object' },
    createdAt: { type: 'string' },
    updated_at: { type: 'string' }
  },
  required: ['id', 'deckId']
};

const areaSchema = {
  title: 'area schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    user_id: { type: 'string' },
    name: { type: 'string' },
    icon: { type: 'string' },
    isDeleted: { type: 'boolean', default: false }
  },
  required: ['id', 'user_id', 'name']
};

const pendingOperationSchema = {
  title: 'pending operation schema',
  version: 0, // 🔥 ALTERADO DE 0 PARA 1
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    collection: { type: 'string' },
    data: { type: 'object', additionalProperties: true },
    timestamp: { type: 'string' },
    retries: { type: 'number' },
    updated_at: { type: 'string' }
  },
  required: ['id', 'type', 'collection', 'data', 'timestamp']
};

// ============================================================
// GERENCIADOR DO BANCO (getDb) – igual
// ============================================================
let dbInstance: RxDatabase | null = null;
let isCreating = false;

export async function getDb(): Promise<RxDatabase> {
  if (dbInstance) {
    if (dbInstance.collections && dbInstance.collections.study_records) {
      return dbInstance;
    } else {
      console.warn('⚠️ Instância do banco incompleta. Recriando...');
      try {
        await dbInstance.destroy();
      } catch (e) {}
      dbInstance = null;
    }
  }

  if (isCreating) {
    await new Promise(resolve => setTimeout(resolve, 500));
    return getDb();
  }

  isCreating = true;

  try {
    const DB_NAME = 'revisaflash_db_v2';

    // Limpeza opcional (pode remover se quiser manter dados)
    try {
      indexedDB.deleteDatabase('revisaflash-db');
    } catch (e) {}

    const db = await createRxDatabase({
      name: DB_NAME,
      storage: getRxStorageDexie(),
      multiInstance: true,
      ignoreDuplicate: true
    });

    await db.addCollections({
      decks: { schema: deckSchema },
      flashcards: { schema: flashcardSchema },
      disciplines: { schema: disciplineSchema },
      topics: { schema: topicSchema },
      errors: { schema: errorSchema },
      revisoes: { schema: revisaoSchema },
      study_records: { schema: studyRecordSchema },
      study_sessions: { schema: studySessionSchema },
      areas: { schema: areaSchema },
      pending_operations: { schema: pendingOperationSchema }
    });

    console.log('✅ Banco local criado com sucesso.');
    dbInstance = db;
    return db;
  } catch (error: any) {
    console.error('❌ Erro ao criar banco:', error);
    throw error;
  } finally {
    isCreating = false;
  }
}

// ============================================================
// SINCRONIZAÇÃO COM SUPABASE
// ============================================================
let isSyncing = false;

export async function syncWithSupabase(userId: string) {
  if (isSyncing) {
    console.log('⏳ Sincronização já em andamento.');
    return;
  }
  isSyncing = true;

  try {
    console.log('📦 Processando operações pendentes...');
    await processPendingOperations();

    const database = await getDb();
    const lastSync = localStorage.getItem('lastSyncTimestamp') || '1970-01-01T00:00:00Z';
    const supabaseClient = await getSupabaseWithToken();

    const collections = ['decks', 'flashcards', 'disciplines', 'topics', 'errors', 'revisoes', 'study_records'];

    for (const name of collections) {
      const collection = database.collections[name];
      if (!collection) continue;

      // 1. PULL
      let query;
      if (name === 'decks') {
        query = supabaseClient
          .from(name)
          .select('*')
          .or(`user_id.eq.${userId},shared_with.cs.{${userId}}`)
          .gte('updated_at', lastSync);
      } else {
        query = supabaseClient
          .from(name)
          .select('*')
          .eq('user_id', userId)
          .gte('updated_at', lastSync);
      }

      const { data: supabaseData, error } = await query;
      if (error) {
        console.error(`❌ Pull ${name}:`, error);
        continue;
      }

      if (supabaseData && supabaseData.length > 0) {
        for (const doc of supabaseData) {
          const existing = await collection.findOne({ selector: { id: doc.id } }).exec();
          if (existing) {
            const localUpdated = existing.get('updated_at') || '1970-01-01T00:00:00Z';
            if (doc.updated_at > localUpdated) {
              await existing.patch(doc);
              console.log(`🔄 Atualizado ${name} ID ${doc.id}`);
            }
          } else {
            await collection.insert(doc);
            console.log(`➕ Inserido ${name} ID ${doc.id}`);
          }
        }
        console.log(`✅ Pull ${name}: ${supabaseData.length} registros atualizados`);
      } else {
        console.log(`ℹ️ Pull ${name}: Nenhuma atualização nova.`);
      }

      // 2. PUSH
      const localDocs = await collection.find({
        selector: {
          user_id: userId,
          updated_at: { $gt: lastSync }
        }
      }).exec();

      if (localDocs.length > 0) {
        const docsToPush = localDocs.map(doc => doc.toJSON());
        const { error: upsertError } = await supabaseClient
          .from(name)
          .upsert(docsToPush, { onConflict: 'id' });

        if (upsertError) {
          console.error(`❌ Push ${name}:`, upsertError);
        } else {
          console.log(`✅ Push ${name}: ${docsToPush.length} registros enviados`);
        }
      }
    }

    // study_sessions – igual ao original
    try {
      console.log('📥 Pull: study_sessions');
      const decksCollection = database.collections.decks;
      const userDecks = await decksCollection.find({
        selector: { 
          user_id: userId,
          isDeleted: { $ne: true }
        }
      }).exec();
      
      const deckIds = userDecks.map(doc => doc.get('id'));

      if (deckIds.length === 0) {
        console.log('⚠️ study_sessions: Nenhum deck encontrado');
      } else {
        const { data: sessionsData, error } = await supabaseClient
          .from('study_sessions')
          .select('*')
          .in('deckId', deckIds)
          .gte('updated_at', lastSync);

        if (error) {
          console.error('❌ Erro ao buscar study_sessions:', error);
        } else if (sessionsData && sessionsData.length > 0) {
          const collection = database.collections.study_sessions;
          for (const doc of sessionsData) {
            const existing = await collection.findOne({ selector: { id: doc.id } }).exec();
            if (existing) {
              const localUpdated = existing.get('updated_at') || '1970-01-01T00:00:00Z';
              if (doc.updated_at > localUpdated) {
                await existing.patch(doc);
              }
            } else {
              await collection.insert(doc);
            }
          }
          console.log(`✅ study_sessions: ${sessionsData.length} registros sincronizados`);
        }

        console.log('📤 Push: study_sessions');
        const collection = database.collections.study_sessions;
        const localSessions = await collection.find({
          selector: {
            updated_at: { $gt: lastSync }
          }
        }).exec();

        if (localSessions.length > 0) {
          const sessionsToPush = localSessions
            .map(doc => doc.toJSON())
            .filter(session => deckIds.includes(session.deckId));

          if (sessionsToPush.length > 0) {
            const { error: upsertError } = await supabaseClient
              .from('study_sessions')
              .upsert(sessionsToPush, { onConflict: 'id' });

            if (upsertError) {
              console.error('❌ Erro ao enviar study_sessions:', upsertError);
            } else {
              console.log(`✅ study_sessions: ${sessionsToPush.length} registros enviados`);
            }
          }
        }
      }
    } catch (err) {
      console.error('❌ Erro na sincronização de study_sessions:', err);
    }

    localStorage.setItem('lastSyncTimestamp', new Date().toISOString());
    console.log('✅ Sincronização concluída.');

  } catch (err) {
    console.error('❌ Erro na sincronização:', err);
  } finally {
    isSyncing = false;
  }
}