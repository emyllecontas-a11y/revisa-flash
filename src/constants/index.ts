// src/constants/index.ts

import type { StudyCategory, StudyDestination, StudyPostKind } from '@/types/studyRats';

// ============================================================
// 📦 NOMES DE CAMPOS (para evitar erros de digitação)
// ============================================================

export const CAMPOS = {
  // ----- Estudos (study_records) -----
  ESTUDO: {
    ID: "id",
    USUARIO_ID: "user_id",
    DATA: "date",
    TIPO: "type",
    DISCIPLINA: "discipline",
    TOPICO: "topic",
    DURACAO: "duration",
    MATERIAL: "material",
    QUESTOES_FEITAS: "questionsCount",
    QUESTOES_CERTAS: "correctCount",
    QUESTOES_ERRADAS: "wrongCount",
    FONTE: "source",
    OBSERVACOES: "observations",
    CRIADO_EM: "createdAt",
  },

  // ----- Decks -----
  DECK: {
    ID: "id",
    NOME: "name",
    DESCRICAO: "description",
    USUARIO_ID: "user_id",
    CRIADO_EM: "createdAt", // ✅ corrigido: agora camelCase
    DELETADO_EM: "deletedAt", // ✅ corrigido: agora camelCase
  },

  // ----- Flashcards -----
  FLASHCARD: {
    ID: "id",
    DECK_ID: "deck_id",
    USUARIO_ID: "user_id",
    FRENTE: "front", // ✅ corrigido: inglês
    VERSO: "back", // ✅ corrigido: inglês
    DIFICULDADE: "difficulty",
    ESTABILIDADE: "stability",
    DATA_VENCIMENTO: "dueDate",
    REPETICOES: "reps",
    LAPSOS: "lapses",
    ULTIMA_REVISAO: "lastReview",
    CRIADO_EM: "createdAt", // ✅ corrigido
    ATUALIZADO_EM: "updatedAt", // ✅ corrigido
  },

  // ----- Disciplinas -----
  DISCIPLINA: {
    ID: "id",
    NOME: "name",
    USUARIO_ID: "user_id",
    CRIADO_EM: "createdAt", // ✅ corrigido
    DELETADO_EM: "deletedAt", // ✅ corrigido
  },

  // ----- Tópicos -----
  TOPICO: {
    ID: "id",
    NOME: "name",
    DISCIPLINA_ID: "discipline_id",
    USUARIO_ID: "user_id",
    STATUS: "status",
    DATA_PLANEJADA: "planned_date",
    CRIADO_EM: "createdAt", // ✅ corrigido
    DELETADO_EM: "deletedAt", // ✅ corrigido
    ATUALIZADO_EM: "updatedAt", // ✅ corrigido
  },

  // ----- Erros -----
  ERRO: {
    ID: "id",
    USUARIO_ID: "user_id",
    QUESTAO: "question",
    RESPOSTA_CORRETA: "correctAnswer",
    SUA_RESPOSTA: "yourAnswer",
    AREA: "area",
    TOPICO: "topic",
    TIPO: "type",
    FONTE: "source",
    COMENTARIO: "comment",
    REPETICOES: "repetitions",
    STATUS: "status",
    FLASHCARD_ID: "flashcardId",
    CRIADO_EM: "createdAt",
    ATUALIZADO_EM: "updatedAt",
  },

  // ----- Revisões -----
  REVISAO: {
    ID: "id",
    USUARIO_ID: "user_id",
    TOPICO_ID: "topico_id",
    TOPICO_NOME: "topicName", // ✅ corrigido: camelCase
    DISCIPLINA: "discipline", // ✅ corrigido: inglês
    NIVEL: "review_level",
    PROXIMA_REVISAO: "nextReviewDate", // ✅ corrigido: camelCase
    ULTIMO_ESTUDO: "lastStudyDate", // ✅ corrigido: camelCase
    CONCLUIDO_EM: "completedAt", // ✅ corrigido: camelCase
    CRIADO_EM: "createdAt", // ✅ corrigido
    ATUALIZADO_EM: "updatedAt", // ✅ corrigido
  },

  // ----- Sessões de estudo (study_sessions) -----
  SESSAO: {
    ID: "id",
    DECK_ID: "deckId", // ✅ corrigido: camelCase
    INICIO: "startTime", // ✅ corrigido: camelCase
    FIM: "endTime", // ✅ corrigido: camelCase
    TEMPO_TOTAL: "totalTimeSeconds", // ✅ corrigido: camelCase
    CONCLUIDA: "completed",
    TEMPOS_CARTAO: "cardTimes", // ✅ corrigido: camelCase
    CRIADO_EM: "createdAt", // ✅ corrigido
  },
};

// ============================================================
// 🔢 VALORES FIXOS (opções, status, etc.)
// ============================================================

export const TIPOS_ESTUDO = {
  TEORICO: "teorico",
  PRATICO: "pratico",
} as const;

export const STATUS_TOPICO = {
  NAO_ESTUDADO: "nao_estudado",
  ESTUDANDO: "estudando",
  REVISADO: "revisado",
  DOMINADO: "dominado",
} as const;

// Listas para usar em selects ou validações
export const LISTA_TIPOS_ESTUDO = [TIPOS_ESTUDO.TEORICO, TIPOS_ESTUDO.PRATICO] as const;

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
  CALENDARIO: "/calendario",
  DASHBOARD: "/",
  DECKS: "/decks",
  FLASHCARDS: "/flashcards",
  ESTUDO: "/estudo",
  REVISOES: "/revisoes",
  ERROS: "/erros",
  CONFIGURACOES: "/configuracoes",
} as const;

// ============================================================
// 📦 NOME DO BANCO DE DADOS
// ============================================================

export const DB_NAME = "revisaflash_db_v2";

// ============================================================
// 📎 MATERIAL DE APOIO (aula_materiais)
// ============================================================

export const AULA_MATERIAIS = {
  COLECAO: "aula_materiais",
  BUCKET: "aula-materiais",
  MIME_TYPE: "application/pdf",
  MAX_SIZE_BYTES: 50 * 1024 * 1024, // 50 MB
  MAX_SIZE_MB: 50,
} as const;

// ============================================================
// 🎬 VÍDEO OFFLINE (download para IndexedDB, por aparelho)
// ============================================================

export const VIDEO_OFFLINE = {
  DB_NAME: 'revisaflash_videos',
  CHUNK_SIZE_BYTES: 8 * 1024 * 1024, // 8 MB
  PROXY_URL: import.meta.env.VITE_VIDEO_PROXY_URL || 'https://revisa-video-proxy.emyllecontas.workers.dev',
  ALLOWED_HOST: 'github.com',
  ALLOWED_PATH_PREFIX: '/emyllecontas-a11y/',
  RELEASE_PATH_PART: '/releases/download/',
  FREE_SPACE_MARGIN: 1.1,
  MAX_RETRIES: 6,
} as const;

// ============================================================
// 🔗 CONFIGURAÇÕES DO SUPABASE (opcional)
// ============================================================

export const SUPABASE = {
  URL: import.meta.env.VITE_SUPABASE_URL,
  ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  TABELAS: {
    STUDY_RECORDS: "study_records",
    DECKS: "decks",
    FLASHCARDS: "flashcards",
    DISCIPLINES: "disciplines",
    TOPICS: "topics",
    ERRORS: "errors",
    REVISOES: "revisoes",
    STUDY_SESSIONS: "study_sessions",
  },
} as const;

// ============================================================
// 🐭 STUDY RATS (feed estilo Instagram da aba Comunidade)
// ============================================================

export const STUDY_RATS = {
  TABELAS: {
    POSTS: "study_posts",
    POST_PHOTOS: "study_post_photos",
    POST_LIKES: "study_post_likes",
    POST_COMMENTS: "study_post_comments",
    POST_SAVES: "study_post_saves",
    STORIES: "study_stories",
    STORY_VIEWS: "study_story_views",
    PROFILES: "profiles",
  },
  COLECOES: {
    CHECKINS: "study_posts",
  },
  BUCKET: "study-rats",
  RPC: {
    FEED: "study_feed",
    STORIES_FEED: "study_stories_feed",
    PERFIL_RESUMO: "study_perfil_resumo",
    POST_COMMENTS: "study_post_comments_list",
    STORY_VIEWERS: "study_story_viewers",
    STORIES_EXPIRADOS: "study_stories_meus_expirados",
    STORIES_APAGAR_EXPIRADOS: "study_stories_apagar_expirados",
  },
  TIPOS: {
    CHECKIN: "checkin",
    POST: "post",
  },
  LISTA_TIPOS: ["checkin", "post"] as StudyPostKind[],
  CATEGORIAS: {
    DICA: "study_tip",
    CURIOSIDADE: "curiosity",
    DUVIDA: "question",
    MOTIVACAO: "motivation",
  },
  LISTA_CATEGORIAS: ["study_tip", "curiosity", "question", "motivation"] as StudyCategory[],
  DESTINOS: {
    FEED: "feed",
    STORY: "story",
  },
  LISTA_DESTINOS: ["feed", "story"] as StudyDestination[],
  LIMITES: {
    MAX_FOTOS: 10,
    MAX_BIO: 150,
    MAX_COMENTARIO: 500,
    MAX_LEGENDA: 2000,
    MAX_ARQUIVO_MB: 20,
    MAX_DURACAO_MIN: 1440,
    IMAGEM_ALVO_MB: 0.8,
    IMAGEM_MAX_PX: 1080,
    PAGINA_FEED: 20,
    STORY_HORAS: 24,
    URL_ASSINADA_SEGUNDOS: 3600,
    URL_ASSINADA_RENOVAR_SEGUNDOS: 3000,
  },
} as const;

/** Categorias de publicação com rótulo (português) e emoji usados na interface. */
export const STUDY_RATS_CATEGORIAS: ReadonlyArray<{
  value: StudyCategory;
  label: string;
  emoji: string;
}> = [
  { value: STUDY_RATS.CATEGORIAS.DICA, label: "Dica de estudo", emoji: "💡" },
  { value: STUDY_RATS.CATEGORIAS.CURIOSIDADE, label: "Curiosidade", emoji: "🔎" },
  { value: STUDY_RATS.CATEGORIAS.DUVIDA, label: "Dúvida", emoji: "❓" },
  { value: STUDY_RATS.CATEGORIAS.MOTIVACAO, label: "Motivação", emoji: "🔥" },
];
