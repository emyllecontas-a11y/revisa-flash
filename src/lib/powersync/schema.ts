// src/lib/powersync/schema.ts
// Estrutura completa do banco de dados (adaptado do projeto original)

import { column, Schema, Table } from '@powersync/web';

// ============================================================
// TABELA: decks (baralhos de flashcards)
// ============================================================
const decks = new Table(
  {
    id: column.text,
    user_id: column.text,
    name: column.text,
    created_at: column.text,
    description: column.text
  },
  { indexes: { user_id: ['user_id'] } }
);

// ============================================================
// TABELA: disciplines (disciplinas/matérias)
// ============================================================
const disciplines = new Table(
  {
    id: column.text,
    user_id: column.text,
    name: column.text,
    created_at: column.text
  },
  { indexes: { user_id: ['user_id'] } }
);

// ============================================================
// TABELA: errors (erros cometidos em questões)
// ============================================================
const errors = new Table(
  {
    id: column.text,
    user_id: column.text,
    question: column.text,
    area: column.text,
    correct_answer: column.text,
    note: column.text,
    tipo_erro: column.text,
    observacao: column.text,
    created_at: column.text
  },
  { indexes: { user_id: ['user_id'] } }
);

// ============================================================
// TABELA: files (arquivos anexados)
// ============================================================
const files = new Table(
  {
    id: column.text,
    user_id: column.text,
    disciplina: column.text,
    topico_id: column.text,
    nome: column.text,
    tipo: column.text,
    url: column.text,
    descricao: column.text,
    created_at: column.text
  },
  { indexes: { 
    user_id: ['user_id'],
    topico_id: ['topico_id'] 
  } }
);

// ============================================================
// TABELA: flashcards (os cartões de estudo)
// ============================================================
const flashcards = new Table(
  {
    id: column.text,
    deck_id: column.text,
    user_id: column.text,
    frente: column.text,
    verso: column.text,
    reps: column.integer,
    lastReview: column.text,
    created_at: column.text,
    updated_at: column.text,
    difficulty: column.real,
    stability: column.real,
    retrievability: column.real,
    dueDate: column.text,
    lapses: column.integer
  },
  { indexes: { 
    deck_id: ['deck_id'], 
    user_id: ['user_id'],
    dueDate: ['dueDate']
  } }
);

// ============================================================
// TABELA: revisoes (agendamento de revisões de tópicos)
// ============================================================
const revisoes = new Table(
  {
    id: column.text,
    user_id: column.text,
    topico_id: column.text,
    topico_nome: column.text,
    disciplina: column.text,
    review_level: column.integer,
    next_review_date: column.text,
    last_study_date: column.text,
    completed_at: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { 
    topico_id: ['topico_id'], 
    user_id: ['user_id'],
    next_review_date: ['next_review_date'] 
  } }
);

// ============================================================
// TABELA: study_records (histórico de sessões de estudo)
// ============================================================
const study_records = new Table(
  {
    id: column.text,
    user_id: column.text,
    data: column.text,
    tempo: column.integer,
    materia: column.text,
    topico: column.text,
    tipo: column.text,
    questoes_feitas: column.integer,
    questoes_acertos: column.integer,
    resumo: column.text,
    created_at: column.text
  },
  { indexes: { 
    user_id: ['user_id'],
    data: ['data'] 
  } }
);

// ============================================================
// TABELA: topics (tópicos dentro de uma disciplina)
// ============================================================
const topics = new Table(
  {
    id: column.text,
    discipline_id: column.text,
    user_id: column.text,
    name: column.text,
    status: column.text,
    planned_date: column.text,
    created_at: column.text
  },
  { indexes: { 
    discipline_id: ['discipline_id'], 
    user_id: ['user_id'],
    planned_date: ['planned_date']
  } }
);

// ============================================================
// SCHEMA PRINCIPAL (reúne todas as tabelas)
// ============================================================

export const AppSchema = new Schema({
  decks,
  disciplines,
  errors,
  files,
  flashcards,
  revisoes,
  study_records,
  topics
});

export type Database = (typeof AppSchema)['types'];