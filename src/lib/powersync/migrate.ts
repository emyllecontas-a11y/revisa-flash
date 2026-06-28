// src/lib/powersync/migrate.ts
// Versão corrigida — SEM verificação, cria tabelas sempre que necessário

import { db } from './client';

export async function migrateDatabase() {
  console.log('🔄 Iniciando migrações...');

  try {
    console.log('📦 Criando tabelas (se não existirem)...');

    // ============================================================
    // CRIAÇÃO DAS TABELAS (com IF NOT EXISTS)
    // ============================================================

    await db.execute(`
      CREATE TABLE IF NOT EXISTS decks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT,
        description TEXT
      )
    `);
    console.log('  ✅ Tabela decks criada/verificada');

    await db.execute(`
      CREATE TABLE IF NOT EXISTS disciplines (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT
      )
    `);
    console.log('  ✅ Tabela disciplines criada/verificada');

    await db.execute(`
      CREATE TABLE IF NOT EXISTS errors (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        question TEXT,
        area TEXT,
        correct_answer TEXT,
        note TEXT,
        tipo_erro TEXT,
        observacao TEXT,
        created_at TEXT
      )
    `);
    console.log('  ✅ Tabela errors criada/verificada');

    await db.execute(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        disciplina TEXT,
        topico_id TEXT,
        nome TEXT,
        tipo TEXT,
        url TEXT,
        descricao TEXT,
        created_at TEXT
      )
    `);
    console.log('  ✅ Tabela files criada/verificada');

    await db.execute(`
      CREATE TABLE IF NOT EXISTS flashcards (
        id TEXT PRIMARY KEY,
        deck_id TEXT,
        user_id TEXT NOT NULL,
        frente TEXT,
        verso TEXT,
        reps INTEGER DEFAULT 0,
        lastReview TEXT,
        created_at TEXT,
        updated_at TEXT,
        difficulty REAL,
        stability REAL,
        retrievability REAL,
        dueDate TEXT,
        lapses INTEGER DEFAULT 0
      )
    `);
    console.log('  ✅ Tabela flashcards criada/verificada');

    await db.execute(`
      CREATE TABLE IF NOT EXISTS revisoes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        topico_id TEXT,
        topico_nome TEXT,
        disciplina TEXT,
        review_level INTEGER,
        next_review_date TEXT,
        last_study_date TEXT,
        completed_at TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);
    console.log('  ✅ Tabela revisoes criada/verificada');

    await db.execute(`
      CREATE TABLE IF NOT EXISTS study_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        data TEXT,
        tempo INTEGER,
        materia TEXT,
        topico TEXT,
        tipo TEXT,
        questoes_feitas INTEGER,
        questoes_acertos INTEGER,
        resumo TEXT,
        created_at TEXT
      )
    `);
    console.log('  ✅ Tabela study_records criada/verificada');

    await db.execute(`
      CREATE TABLE IF NOT EXISTS topics (
        id TEXT PRIMARY KEY,
        discipline_id TEXT,
        user_id TEXT NOT NULL,
        name TEXT,
        status TEXT,
        planned_date TEXT,
        created_at TEXT
      )
    `);
    console.log('  ✅ Tabela topics criada/verificada');

    // ============================================================
    // CRIAÇÃO DE ÍNDICES (com verificação de existência da tabela)
    // ============================================================
    console.log('📇 Criando índices...');

    const createIndexIfTableExists = async (tableName: string, indexName: string, indexSql: string) => {
      try {
        const tableCheck = await db.execute(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
        );
        const tableExists = tableCheck.rows?._array?.length > 0;
        if (tableExists) {
          await db.execute(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} ${indexSql}`);
          console.log(`  ✅ Índice ${indexName} criado`);
        } else {
          console.log(`  ⚠️ Tabela ${tableName} não encontrada, ignorando índice ${indexName}`);
        }
      } catch (error) {
        console.error(`  ❌ Erro ao criar índice ${indexName}:`, error);
      }
    };

    await createIndexIfTableExists('decks', 'idx_decks_user_id', '(user_id)');
    await createIndexIfTableExists('disciplines', 'idx_disciplines_user_id', '(user_id)');
    await createIndexIfTableExists('errors', 'idx_errors_user_id', '(user_id)');
    await createIndexIfTableExists('files', 'idx_files_user_id', '(user_id)');
    await createIndexIfTableExists('files', 'idx_files_topico_id', '(topico_id)');
    await createIndexIfTableExists('flashcards', 'idx_flashcards_deck_id', '(deck_id)');
    await createIndexIfTableExists('flashcards', 'idx_flashcards_user_id', '(user_id)');
    await createIndexIfTableExists('flashcards', 'idx_flashcards_dueDate', '(dueDate)');
    await createIndexIfTableExists('revisoes', 'idx_revisoes_topico_id', '(topico_id)');
    await createIndexIfTableExists('revisoes', 'idx_revisoes_user_id', '(user_id)');
    await createIndexIfTableExists('revisoes', 'idx_revisoes_next_review_date', '(next_review_date)');
    await createIndexIfTableExists('study_records', 'idx_study_records_user_id', '(user_id)');
    await createIndexIfTableExists('study_records', 'idx_study_records_data', '(data)');
    await createIndexIfTableExists('topics', 'idx_topics_discipline_id', '(discipline_id)');
    await createIndexIfTableExists('topics', 'idx_topics_user_id', '(user_id)');
    await createIndexIfTableExists('topics', 'idx_topics_planned_date', '(planned_date)');

    console.log('✅ Migrações concluídas com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante migrações:', error);
    throw error;
  }
}