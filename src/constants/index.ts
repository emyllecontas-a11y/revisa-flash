// src/constants/index.ts

// ============================================================
// 📦 NOMES DE CAMPOS (para evitar erros de digitação)
// ============================================================

export const CAMPOS = {
  // ----- Estudos (study_records) -----
  ESTUDO: {
    ID: 'id',
    USUARIO_ID: 'user_id',
    DATA: 'date',
    TIPO: 'type',
    DISCIPLINA: 'discipline',
    TOPICO: 'topic',
    DURACAO: 'duration',
    MATERIAL: 'material',
    QUESTOES_FEITAS: 'questionsCount',
    QUESTOES_CERTAS: 'correctCount',
    QUESTOES_ERRADAS: 'wrongCount',
    FONTE: 'source',
    OBSERVACOES: 'observations',
    CRIADO_EM: 'createdAt',
  },

  // ----- Decks -----
  DECK: {
    ID: 'id',
    NOME: 'name',
    DESCRICAO: 'description',
    USUARIO_ID: 'user_id',
    CRIADO_EM: 'createdAt',      // ✅ corrigido: agora camelCase
    DELETADO_EM: 'deletedAt',    // ✅ corrigido: agora camelCase
  },

  // ----- Flashcards -----
  FLASHCARD: {
    ID: 'id',
    DECK_ID: 'deck_id',
    USUARIO_ID: 'user_id',
    FRENTE: 'front',             // ✅ corrigido: inglês
    VERSO: 'back',               // ✅ corrigido: inglês
    DIFICULDADE: 'difficulty',
    ESTABILIDADE: 'stability',
    DATA_VENCIMENTO: 'dueDate',
    REPETICOES: 'reps',
    LAPSOS: 'lapses',
    ULTIMA_REVISAO: 'lastReview',
    CRIADO_EM: 'createdAt',      // ✅ corrigido
    ATUALIZADO_EM: 'updatedAt',  // ✅ corrigido
  },

  // ----- Disciplinas -----
  DISCIPLINA: {
    ID: 'id',
    NOME: 'name',
    USUARIO_ID: 'user_id',
    CRIADO_EM: 'createdAt',      // ✅ corrigido
    DELETADO_EM: 'deletedAt',    // ✅ corrigido
  },

  // ----- Tópicos -----
  TOPICO: {
    ID: 'id',
    NOME: 'name',
    DISCIPLINA_ID: 'discipline_id',
    USUARIO_ID: 'user_id',
    STATUS: 'status',
    DATA_PLANEJADA: 'planned_date',
    CRIADO_EM: 'createdAt',      // ✅ corrigido
    DELETADO_EM: 'deletedAt',    // ✅ corrigido
    ATUALIZADO_EM: 'updatedAt',  // ✅ corrigido
  },

  // ----- Erros -----
  ERRO: {
    ID: 'id',
    USUARIO_ID: 'user_id',
    QUESTAO: 'question',
    RESPOSTA_CORRETA: 'correctAnswer',
    SUA_RESPOSTA: 'yourAnswer',
    AREA: 'area',
    TOPICO: 'topic',
    TIPO: 'type',
    FONTE: 'source',
    COMENTARIO: 'comment',
    REPETICOES: 'repetitions',
    STATUS: 'status',
    FLASHCARD_ID: 'flashcardId',
    CRIADO_EM: 'createdAt',
    ATUALIZADO_EM: 'updatedAt',
  },

  // ----- Revisões -----
  REVISAO: {
    ID: 'id',
    USUARIO_ID: 'user_id',
    TOPICO_ID: 'topico_id',
    TOPICO_NOME: 'topicName',          // ✅ corrigido: camelCase
    DISCIPLINA: 'discipline',          // ✅ corrigido: inglês
    NIVEL: 'review_level',
    PROXIMA_REVISAO: 'nextReviewDate', // ✅ corrigido: camelCase
    ULTIMO_ESTUDO: 'lastStudyDate',    // ✅ corrigido: camelCase
    CONCLUIDO_EM: 'completedAt',       // ✅ corrigido: camelCase
    CRIADO_EM: 'createdAt',            // ✅ corrigido
    ATUALIZADO_EM: 'updatedAt',        // ✅ corrigido
  },

  // ----- Sessões de estudo (study_sessions) -----
  SESSAO: {
    ID: 'id',
    DECK_ID: 'deckId',                 // ✅ corrigido: camelCase
    INICIO: 'startTime',               // ✅ corrigido: camelCase
    FIM: 'endTime',                    // ✅ corrigido: camelCase
    TEMPO_TOTAL: 'totalTimeSeconds',   // ✅ corrigido: camelCase
    CONCLUIDA: 'completed',
    TEMPOS_CARTAO: 'cardTimes',        // ✅ corrigido: camelCase
    CRIADO_EM: 'createdAt',            // ✅ corrigido
  },
};

// ============================================================
// 🔢 VALORES FIXOS (opções, status, etc.)
// ============================================================

export const TIPOS_ESTUDO = {
  TEORICO: 'teorico',
  PRATICO: 'pratico',
} as const;

export const STATUS_TOPICO = {
  NAO_ESTUDADO: 'nao_estudado',
  ESTUDANDO: 'estudando',
  REVISADO: 'revisado',
  DOMINADO: 'dominado',
} as const;

// Listas para usar em selects ou validações
export const LISTA_TIPOS_ESTUDO = [
  TIPOS_ESTUDO.TEORICO,
  TIPOS_ESTUDO.PRATICO,
] as const;

export const LISTA_STATUS_TOPICO = [
  STATUS_TOPICO.NAO_ESTUDADO,
  STATUS_TOPICO.ESTUDANDO,
  STATUS_TOPICO.REVISADO,
  STATUS_TOPICO.DOMINADO,
] as const;

// ============================================================
// 🏷️ ROTAS DO SISTEMA
// ============================================================

export const ROTAS = {
  CALENDARIO: '/calendario',
  DASHBOARD: '/',
  DECKS: '/decks',
  FLASHCARDS: '/flashcards',
  ESTUDO: '/estudo',
  REVISOES: '/revisoes',
  ERROS: '/erros',
  CONFIGURACOES: '/configuracoes',
} as const;

// ============================================================
// 📦 NOME DO BANCO DE DADOS
// ============================================================

export const DB_NAME = 'revisaflash_db_v2';

// ============================================================
// 🔗 CONFIGURAÇÕES DO SUPABASE (opcional)
// ============================================================

export const SUPABASE = {
  URL: import.meta.env.VITE_SUPABASE_URL,
  ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  TABELAS: {
    STUDY_RECORDS: 'study_records',
    DECKS: 'decks',
    FLASHCARDS: 'flashcards',
    DISCIPLINES: 'disciplines',
    TOPICS: 'topics',
    ERRORS: 'errors',
    REVISOES: 'revisoes',
    STUDY_SESSIONS: 'study_sessions',
  },
} as const;