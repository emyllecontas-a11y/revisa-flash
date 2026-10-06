// src/lib/db.ts
import { createRxDatabase, RxDatabase } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { supabase, getSupabaseWithToken } from './supabaseClient';

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
    isDeleted: { type: 'boolean', default: false },
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
    isDeleted: { type: 'boolean', default: false }
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
    source_lista_id: { type: 'string' },
    discipline_id: { type: 'string' },
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
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    op_type: { type: 'string' },
    table_name: { type: 'string' },
    data: { type: 'object', additionalProperties: true },
    timestamp: { type: 'string' },
    retries: { type: 'number' },
    updated_at: { type: 'string' }
  },
  required: ['id', 'op_type', 'table_name', 'data', 'timestamp']
};

const userSettingsSchema = {
  title: 'user_settings schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    user_id: { type: 'string' },
    daily_limit: { type: 'number', default: 100 },
    new_cards_per_day: { type: 'number', default: 20 },
    max_reviews_per_day: { type: 'number', default: 200 },
    leech_threshold: { type: 'number', default: 5 },
    show_new_first: { type: 'boolean', default: false },
    theme: { type: 'string', default: 'system' },
    learning_steps: { type: 'array', items: { type: 'number' }, default: [1, 10] },
    graduating_interval: { type: 'number', default: 1 },
    easy_interval: { type: 'number', default: 4 },
    relearning_steps: { type: 'array', items: { type: 'number' }, default: [10] },
    day_start: { type: 'number', default: 4 },
    fsrs_params: { type: ['object', 'null'], default: null },
    show_next_review_time: { type: 'boolean', default: false },
    updated_at: { type: 'string' }
  },
  required: ['id', 'user_id']
};

// ============================================================
// LISTAS
// ============================================================

const listaSchema = {
  title: 'lista schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    user_id: { type: 'string' },
    discipline_id: { type: 'string' },
    folder_id: { type: ['string', 'null'] },
    titulo: { type: 'string' },
    descricao: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    isdeleted: { type: 'boolean', default: false },
  },
  required: ['id', 'user_id', 'discipline_id', 'titulo'],
};

const listaPastaSchema = {
  title: 'lista pasta schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    user_id: { type: 'string' },
    discipline_id: { type: 'string' },
    name: { type: 'string' },
    order: { type: 'number', default: 0 },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    isdeleted: { type: 'boolean', default: false },
  },
  required: ['id', 'user_id', 'discipline_id', 'name'],
};

const questaoListaSchema = {
  title: 'questao lista schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    user_id: { type: 'string' },
    discipline_id: { type: 'string' },
    tipo: { type: 'string' },
    enunciado: { type: 'string' },
    area: { type: ['string', 'null'] },
    imagem_url: { type: ['string', 'null'] },
    comentario_geral: { type: ['string', 'null'] },
    alternativas: { type: ['array', 'null'], items: { type: 'object', additionalProperties: true } },
    gabarito_ce: { type: ['boolean', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    isdeleted: { type: 'boolean', default: false },
  },
  required: ['id', 'user_id', 'discipline_id', 'tipo', 'enunciado'],
};

const listaQuestaoLinkSchema = {
  title: 'lista questao link schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    lista_id: { type: 'string' },
    questao_id: { type: 'string' },
    ordem: { type: 'number', default: 0 },
    created_at: { type: 'string' },
  },
  required: ['id', 'lista_id', 'questao_id'],
};

const progressoListaSchema = {
  title: 'progresso lista schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    lista_id: { type: 'string' },
    user_id: { type: 'string' },
    respostas: { type: 'object', additionalProperties: true },
    marcadas: { type: 'array', items: { type: 'number' } },
    tempo_decorrido: { type: 'number', default: 0 },
    status: { type: 'string', default: 'em-andamento' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    isdeleted: { type: 'boolean', default: false },
  },
  required: ['id', 'lista_id', 'user_id'],
};

const resultadoListaSchema = {
  title: 'resultado lista schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    lista_id: { type: 'string' },
    user_id: { type: 'string' },
    total_questoes: { type: 'number', default: 0 },
    acertos: { type: 'number', default: 0 },
    erros: { type: 'number', default: 0 },
    nao_respondidas: { type: 'number', default: 0 },
    porcentagem: { type: 'number', default: 0 },
    tempo_segundos: { type: 'number', default: 0 },
    respostas: { type: 'object', additionalProperties: true },
    areas: { type: 'object', additionalProperties: true },
    acertos_por_area: { type: ['object', 'null'], additionalProperties: true },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    isdeleted: { type: 'boolean', default: false },
  },
  required: ['id', 'lista_id', 'user_id'],
};

// ============================================================
// SIMULADOS
// ============================================================

const simuladoSchema = {
  title: 'simulado schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    titulo: { type: 'string' },
    descricao: { type: ['string', 'null'] },
    area: { type: 'string' },
    nivel: { type: 'string' },
    banca: { type: 'string' },
    ano: { type: 'number' },
    tempo_total: { type: 'number' },
    created_by: { type: 'string' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    isdeleted: { type: 'boolean', default: false },
  },
  required: ['id', 'titulo', 'area'],
};

const simuladoQuestaoSchema = {
  title: 'simulado questao schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    simulado_id: { type: 'string' },
    numero: { type: 'number' },
    enunciado: { type: 'string' },
    area: { type: ['string', 'null'] },
    comentario_geral: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    isdeleted: { type: 'boolean', default: false },
  },
  required: ['id', 'simulado_id', 'numero', 'enunciado'],
};

const alternativaSchema = {
  title: 'alternativa schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    questao_id: { type: 'string' },
    letra: { type: 'string' },
    texto: { type: 'string' },
    correta: { type: 'boolean', default: false },
    comentario: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    isdeleted: { type: 'boolean', default: false },
  },
  required: ['id', 'questao_id', 'letra', 'texto'],
};

const progressoSimuladoSchema = {
  title: 'progresso simulado schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    simulado_id: { type: 'string' },
    user_id: { type: 'string' },
    respostas: { type: 'object', additionalProperties: true },
    eliminadas: { type: 'object', additionalProperties: true },
    marcadas: { type: 'array', items: { type: 'number' } },
    tempo_decorrido: { type: 'number', default: 0 },
    status: { type: 'string', default: 'em-andamento' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    isdeleted: { type: 'boolean', default: false },
  },
  required: ['id', 'simulado_id', 'user_id'],
};

const resultadoSimuladoSchema = {
  title: 'resultado simulado schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    simulado_id: { type: 'string' },
    user_id: { type: 'string' },
    total_questoes: { type: 'number', default: 0 },
    acertos: { type: 'number', default: 0 },
    erros: { type: 'number', default: 0 },
    nao_respondidas: { type: 'number', default: 0 },
    porcentagem: { type: 'number', default: 0 },
    tempo_segundos: { type: 'number', default: 0 },
    respostas: { type: 'object', additionalProperties: true },
    areas: { type: 'object', additionalProperties: true },
    comentarios_gerais: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    isdeleted: { type: 'boolean', default: false },
  },
  required: ['id', 'simulado_id', 'user_id'],
};

// ============================================================
// INSTÂNCIA
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
    const DB_NAME = 'revisaflash_db_v7';

    try { indexedDB.deleteDatabase('revisaflash_db_v3'); } catch (e) {}
    try { indexedDB.deleteDatabase('revisaflash_db_v4'); } catch (e) {}
    try { indexedDB.deleteDatabase('revisaflash_db_v5'); } catch (e) {}
    try { indexedDB.deleteDatabase('revisaflash_db_v6'); } catch (e) {}
    try { indexedDB.deleteDatabase('revisaflash-db'); } catch (e) {}

    try {
      const markerVersion = localStorage.getItem('revisaflash_db_version');
      if (markerVersion !== 'v7') {
        console.log('🔄 Nova versão do banco local — resetando lastSyncTimestamp para pull completo.');
        localStorage.removeItem('lastSyncTimestamp');
        localStorage.setItem('revisaflash_db_version', 'v7');
      }
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
      pending_operations: { schema: pendingOperationSchema },
      user_settings: { schema: userSettingsSchema },
      listas: { schema: listaSchema },
      listas_pastas: { schema: listaPastaSchema },
      questoes_lista: { schema: questaoListaSchema },
      listas_questoes: { schema: listaQuestaoLinkSchema },
      progresso_lista: { schema: progressoListaSchema },
      resultados_lista: { schema: resultadoListaSchema },
      simulados: { schema: simuladoSchema },
      questoes: { schema: simuladoQuestaoSchema },
      alternativas: { schema: alternativaSchema },
      progresso_simulado: { schema: progressoSimuladoSchema },
      resultados_simulado: { schema: resultadoSimuladoSchema },
    });

    console.log('✅ Banco local criado com sucesso (v7).');
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
// SYNC
// ============================================================

let isSyncing = false;

export async function syncWithSupabase(userId: string, onComplete?: () => void) {
  if (isSyncing) {
    console.log('⏳ Sincronização já em andamento.');
    return;
  }
  isSyncing = true;

  // Se qualquer pull/push falhar, este flag impede que lastSyncTimestamp avance.
  let houveErro = false;

  try {
    const { processPendingOperations } = await import('@/services/queueService');
    console.log('📦 Processando operações pendentes...');
    await processPendingOperations();

    const database = await getDb();
    const supabaseClient = await getSupabaseWithToken();
    const userIdStr = String(userId);

    const lastSyncGlobal = localStorage.getItem('lastSyncTimestamp') || '1970-01-01T00:00:00Z';
    if (lastSyncGlobal === '1970-01-01T00:00:00Z') {
      console.log('🔄 Pull COMPLETO (lastSyncTimestamp zerado).');
    } else {
      console.log(`🔄 Pull incremental a partir de ${lastSyncGlobal}.`);
    }

    const collectionsToCheck = [
      'decks', 'flashcards', 'disciplines', 'topics', 'errors',
      'revisoes', 'study_records', 'user_settings',
      'listas', 'listas_pastas', 'questoes_lista', 'progresso_lista',
      'progresso_simulado', 'resultados_lista', 'resultados_simulado',
      'simulados',
    ];
    const emptyCollections = new Set<string>();
    for (const name of collectionsToCheck) {
      const collection = database.collections[name];
      if (collection) {
        const count = await collection.find({ selector: {} }).exec();
        if (count.length === 0) {
          emptyCollections.add(name);
          console.log(`📭 Coleção "${name}" vazia — pull completo será forçado.`);
        }
      }
    }

    // ============================================================
    // LOOP PADRÃO
    // ============================================================
    const collections = [
      'decks', 'flashcards', 'disciplines', 'topics', 'errors',
      'revisoes', 'study_records', 'user_settings',
      'listas', 'listas_pastas', 'questoes_lista',
      'progresso_lista', 'progresso_simulado',
    ];

    for (const name of collections) {
      const collection = database.collections[name];
      if (!collection) continue;

      const pullFrom = emptyCollections.has(name) ? '1970-01-01T00:00:00Z' : lastSyncGlobal;

      let supabaseData: any[] = [];
      let error: any = null;

      if (name === 'study_records') {
        const { data, error: rpcError } = await supabaseClient
          .rpc('buscar_study_records_usuario', { p_user_id: userIdStr, p_last_sync: pullFrom });
        if (rpcError) { console.error(`❌ RPC study_records:`, rpcError); houveErro = true; continue; }
        supabaseData = data || [];
      } else if (name === 'user_settings') {
        const { data, error: rpcError } = await supabaseClient
          .rpc('buscar_user_settings_usuario', { p_user_id: userIdStr, p_last_sync: pullFrom });
        if (rpcError) { console.error(`❌ RPC user_settings:`, rpcError); houveErro = true; continue; }
        supabaseData = data || [];
      } else if (name === 'decks') {
        const { data, error: queryError } = await supabaseClient
          .from('decks')
          .select('*')
          .or(`user_id.eq.${userIdStr},shared_with.cs.{${userIdStr}}`)
          .gte('updated_at', pullFrom);
        if (queryError) { console.error(`❌ Pull ${name}:`, queryError); houveErro = true; continue; }
        supabaseData = data || [];
      } else {
        const { data, error: queryError } = await supabaseClient
          .from(name)
          .select('*')
          .eq('user_id', userIdStr)
          .gte('updated_at', pullFrom);
        if (queryError) { console.error(`❌ Pull ${name}:`, queryError); houveErro = true; continue; }
        supabaseData = data || [];
      }

      if (supabaseData.length > 0) {
        for (const doc of supabaseData) {
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
        console.log(`✅ Pull ${name}: ${supabaseData.length}`);
      }

      const localDocs = await collection.find({
        selector: { user_id: userIdStr, updated_at: { $gt: lastSyncGlobal } }
      }).exec();

      if (localDocs.length > 0) {
        const docsToPush = localDocs.map(doc => doc.toJSON());

        if (name === 'study_records') {
          const { error: rpcError } = await supabaseClient
            .rpc('salvar_study_records_batch', { p_records: docsToPush });
          if (rpcError) { console.error(`❌ Push ${name} via RPC:`, rpcError); houveErro = true; }
          else console.log(`✅ Push ${name} via RPC: ${docsToPush.length}`);
        } else if (name === 'user_settings') {
          const { error: rpcError } = await supabaseClient
            .rpc('salvar_user_settings_batch', { p_records: docsToPush });
          if (rpcError) { console.error(`❌ Push ${name} via RPC:`, rpcError); houveErro = true; }
          else console.log(`✅ Push ${name} via RPC: ${docsToPush.length}`);
        } else {
          const { error: upsertError } = await supabaseClient
            .from(name)
            .upsert(docsToPush, { onConflict: 'id' });
          if (upsertError) { console.error(`❌ Push ${name}:`, upsertError); houveErro = true; }
          else console.log(`✅ Push ${name}: ${docsToPush.length}`);
        }
      }
    }

    // ============================================================
    // RESULTADOS_LISTA — puxa tudo
    // ============================================================
    {
      const collection = database.collections.resultados_lista;

      const { data, error } = await supabaseClient
        .from('resultados_lista')
        .select('*')
        .eq('user_id', userIdStr);

      if (error) {
        console.error('❌ Pull resultados_lista:', error);
        houveErro = true;
      } else if (data) {
        let atualizados = 0;
        for (const doc of data) {
          const existing = await collection.findOne({ selector: { id: doc.id } }).exec();
          if (existing) {
            const remoteTs = doc.updated_at || doc.created_at;
            const localTs = existing.get('updated_at') || existing.get('created_at') || '1970-01-01T00:00:00Z';
            if (remoteTs > localTs) {
              await existing.patch(doc);
              atualizados++;
            }
          } else {
            await collection.insert(doc);
            atualizados++;
          }
        }
        console.log(`✅ Pull resultados_lista: ${atualizados} novos/atualizados (total remoto: ${data.length})`);
      }

      const localDocs = await collection.find({
        selector: { user_id: userIdStr, updated_at: { $gt: lastSyncGlobal } }
      }).exec();
      if (localDocs.length > 0) {
        const { error: upsertError } = await supabaseClient
          .from('resultados_lista')
          .upsert(localDocs.map(d => d.toJSON()), { onConflict: 'id' });
        if (!upsertError) console.log(`✅ Push resultados_lista: ${localDocs.length}`);
        else { console.error('❌ Push resultados_lista:', upsertError); houveErro = true; }
      }
    }

    // ============================================================
    // RESULTADOS_SIMULADO — puxa tudo
    // ============================================================
    {
      const collection = database.collections.resultados_simulado;

      const { data, error } = await supabaseClient
        .from('resultados_simulado')
        .select('*')
        .eq('user_id', userIdStr);

      if (error) {
        console.error('❌ Pull resultados_simulado:', error);
        houveErro = true;
      } else if (data) {
        let atualizados = 0;
        for (const doc of data) {
          const existing = await collection.findOne({ selector: { id: doc.id } }).exec();
          if (existing) {
            const remoteTs = doc.updated_at || doc.created_at;
            const localTs = existing.get('updated_at') || existing.get('created_at') || '1970-01-01T00:00:00Z';
            if (remoteTs > localTs) {
              await existing.patch(doc);
              atualizados++;
            }
          } else {
            await collection.insert(doc);
            atualizados++;
          }
        }
        console.log(`✅ Pull resultados_simulado: ${atualizados} novos/atualizados (total remoto: ${data.length})`);
      }

      const localDocs = await collection.find({
        selector: { user_id: userIdStr, updated_at: { $gt: lastSyncGlobal } }
      }).exec();
      if (localDocs.length > 0) {
        const { error: upsertError } = await supabaseClient
          .from('resultados_simulado')
          .upsert(localDocs.map(d => d.toJSON()), { onConflict: 'id' });
        if (!upsertError) console.log(`✅ Push resultados_simulado: ${localDocs.length}`);
        else { console.error('❌ Push resultados_simulado:', upsertError); houveErro = true; }
      }
    }

    // ============================================================
    // LISTAS_QUESTOES (link)
    // ============================================================
    {
      const collection = database.collections.listas_questoes;
      const listasCollection = database.collections.listas;

      const userListas = await listasCollection.find({
        selector: { user_id: userIdStr, isdeleted: false }
      }).exec();
      const listaIds = userListas.map(d => d.get('id'));

      if (listaIds.length > 0) {
        const chunkArray = <T,>(arr: T[], size: number): T[][] => {
          const chunks: T[][] = [];
          for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
          return chunks;
        };

        const chunks = chunkArray(listaIds, 100);
        for (const chunk of chunks) {
          const { data, error } = await supabaseClient
            .from('listas_questoes')
            .select('*')
            .in('lista_id', chunk);

          if (error) { console.error('❌ Pull listas_questoes (chunk):', error); houveErro = true; continue; }
          if (!data) continue;

          for (const doc of data) {
            const existing = await collection.findOne({ selector: { id: doc.id } }).exec();
            if (existing) {
              if (existing.get('ordem') !== doc.ordem) {
                await existing.patch({ ordem: doc.ordem });
              }
            } else {
              await collection.insert(doc);
            }
          }
        }
        console.log(`✅ Pull listas_questoes: ${userListas.length} listas verificadas`);

        const localLinks = await collection.find({
          selector: { lista_id: { $in: listaIds } }
        }).exec();
        const toPush = localLinks.map(d => d.toJSON());

        if (toPush.length > 0) {
          const { error: upsertError } = await supabaseClient
            .from('listas_questoes')
            .upsert(toPush, { onConflict: 'id' });
          if (!upsertError) console.log(`✅ Push listas_questoes: ${toPush.length}`);
          else { console.error('❌ Push listas_questoes:', upsertError); houveErro = true; }
        }
      }
    }

    // ============================================================
    // SIMULADOS → QUESTOES → ALTERNATIVAS (somente leitura)
    // ============================================================
    {
      const chunkArray = <T,>(arr: T[], size: number): T[][] => {
        const chunks: T[][] = [];
        for (let i = 0; i < arr.length; i += size) {
          chunks.push(arr.slice(i, i + size));
        }
        return chunks;
      };

      // --- SIMULADOS ---
      const simuladosCollection = database.collections.simulados;
      const pullFrom = emptyCollections.has('simulados') ? '1970-01-01T00:00:00Z' : lastSyncGlobal;

      const { data: simData, error: simErr } = await supabaseClient
        .from('simulados')
        .select('*')
        .eq('isdeleted', false)
        .gte('updated_at', pullFrom);

      if (!simErr && simData) {
        for (const doc of simData) {
          const existing = await simuladosCollection.findOne({ selector: { id: doc.id } }).exec();
          if (existing) {
            if (doc.updated_at > (existing.get('updated_at') || '1970-01-01T00:00:00Z')) {
              await existing.patch(doc);
            }
          } else {
            await simuladosCollection.insert(doc);
          }
        }
        if (simData.length > 0) console.log(`✅ Pull simulados: ${simData.length}`);
      } else if (simErr) {
        console.error('❌ Pull simulados:', simErr);
        houveErro = true;
      }

      // --- QUESTOES ---
      const questoesCollection = database.collections.questoes;
      const localSimsAll = await simuladosCollection.find({ selector: {} }).exec();
      const simIds = localSimsAll.map(d => d.get('id'));

      if (simIds.length > 0) {
        const simIdChunks = chunkArray(simIds, 100);
        let totalQuestoes = 0;

        for (const chunk of simIdChunks) {
          const { data: qData, error: qErr } = await supabaseClient
            .from('questoes')
            .select('*')
            .in('simulado_id', chunk)
            .eq('isdeleted', false);

          if (qErr) {
            console.error('❌ Pull questoes (chunk):', qErr);
            houveErro = true;
            continue;
          }
          if (!qData) continue;

          for (const doc of qData) {
            const existing = await questoesCollection.findOne({ selector: { id: doc.id } }).exec();
            if (!existing) {
              await questoesCollection.insert(doc);
              totalQuestoes++;
            }
          }
        }
        if (totalQuestoes > 0) console.log(`✅ Pull questoes: ${totalQuestoes}`);

        // --- ALTERNATIVAS ---
        const altCollection = database.collections.alternativas;
        const localQ = await questoesCollection.find({ selector: {} }).exec();
        const qIds = localQ.map(d => d.get('id'));

        if (qIds.length > 0) {
          const qIdChunks = chunkArray(qIds, 100);
          let totalAlt = 0;

          for (const chunk of qIdChunks) {
            const { data: aData, error: aErr } = await supabaseClient
              .from('alternativas')
              .select('*')
              .in('questao_id', chunk)
              .eq('isdeleted', false);

            if (aErr) {
              console.error('❌ Pull alternativas (chunk):', aErr);
              houveErro = true;
              continue;
            }
            if (!aData) continue;

            for (const doc of aData) {
              const existing = await altCollection.findOne({ selector: { id: doc.id } }).exec();
              if (!existing) {
                await altCollection.insert(doc);
                totalAlt++;
              }
            }
          }
          if (totalAlt > 0) console.log(`✅ Pull alternativas: ${totalAlt}`);
        }
      }
    }

    // ============================================================
    // STUDY_SESSIONS
    // ============================================================
    try {
      const decksCollection = database.collections.decks;
      const userDecks = await decksCollection.find({
        selector: { user_id: userIdStr, isDeleted: { $ne: true } }
      }).exec();
      const deckIds = userDecks.map(doc => doc.get('id'));

      if (deckIds.length > 0) {
        const sessionsPullFrom = emptyCollections.has('study_sessions')
          ? '1970-01-01T00:00:00Z' : lastSyncGlobal;

        const { data: sessionsData, error } = await supabaseClient
          .from('study_sessions')
          .select('*')
          .in('deckId', deckIds)
          .gte('updated_at', sessionsPullFrom);

        if (error) {
          console.error('❌ Pull study_sessions:', error);
          houveErro = true;
        } else if (sessionsData && sessionsData.length > 0) {
          const collection = database.collections.study_sessions;
          for (const doc of sessionsData) {
            const existing = await collection.findOne({ selector: { id: doc.id } }).exec();
            if (existing) {
              if (doc.updated_at > (existing.get('updated_at') || '1970-01-01T00:00:00Z')) {
                await existing.patch(doc);
              }
            } else {
              await collection.insert(doc);
            }
          }
          console.log(`✅ Pull study_sessions: ${sessionsData.length}`);
        }

        const collection = database.collections.study_sessions;
        const localSessions = await collection.find({
          selector: { updated_at: { $gt: lastSyncGlobal } }
        }).exec();
        if (localSessions.length > 0) {
          const toPush = localSessions.map(d => d.toJSON()).filter(s => deckIds.includes(s.deckId));
          if (toPush.length > 0) {
            const { error: upErr } = await supabaseClient
              .from('study_sessions').upsert(toPush, { onConflict: 'id' });
            if (!upErr) console.log(`✅ Push study_sessions: ${toPush.length}`);
            else { console.error('❌ Push study_sessions:', upErr); houveErro = true; }
          }
        }
      }
    } catch (err) {
      console.error('❌ Erro na sincronização de study_sessions:', err);
      houveErro = true;
    }

    // ============================================================
    // ATUALIZA TIMESTAMP — só se não houve erro
    // ============================================================
    if (houveErro) {
      console.warn('⚠️ Houve erros durante a sincronização. lastSyncTimestamp NÃO será avançado — os itens faltantes serão retentados no próximo sync.');
    } else {
      localStorage.setItem('lastSyncTimestamp', new Date().toISOString());
      console.log('✅ Sincronização concluída.');
    }

    if (onComplete) onComplete();

  } catch (err) {
    console.error('❌ Erro na sincronização:', err);
  } finally {
    isSyncing = false;
  }
}