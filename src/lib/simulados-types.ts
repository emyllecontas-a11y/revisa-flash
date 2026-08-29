// src/lib/simulados-types.ts

export interface Simulado {
  id: string;
  titulo: string;
  descricao: string | null;
  area: string;
  nivel: 'Básico' | 'Intermediário' | 'Avançado';
  banca: string;
  ano: number;
  tempo_total: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  isDeleted: boolean;
  questoes_count?: number;
}

export interface Questao {
  id: string;
  simulado_id: string;
  numero: number;
  enunciado: string;
  area: string | null;
  comentario_geral: string | null;
  created_at: string;
  isDeleted: boolean;
}

export interface Alternativa {
  id: string;
  questao_id: string;
  letra: 'A' | 'B' | 'C' | 'D' | 'E';
  texto: string;
  correta: boolean;
  comentario: string | null;
  created_at: string;
  isDeleted: boolean;
}

export interface ProgressoSimulado {
  id: string;
  simulado_id: string;
  user_id: string;
  respostas: Record<number, string>;
  eliminadas: Record<number, string[]>;
  marcadas: number[];
  tempo_decorrido: number;
  status: 'em-andamento' | 'concluido';
  created_at: string;
  updated_at: string;
  isDeleted: boolean;
}

export interface AlternativaImport {
  letra: 'A' | 'B' | 'C' | 'D' | 'E';
  texto: string;
  correta: boolean;
  comentario?: string;
}

export interface QuestaoImport {
  numero: number;
  enunciado: string;
  area?: string;
  comentario_geral?: string;
  alternativas: AlternativaImport[];
}

export interface SimuladoImport {
  titulo: string;
  descricao?: string;
  area: string;
  nivel: 'Básico' | 'Intermediário' | 'Avançado';
  banca: string;
  ano: number;
  tempo_total: number;
  questoes: QuestaoImport[];
}

export interface QuestaoPlayer extends Questao {
  alternativas: Alternativa[];
}

export interface SimuladoPlayer extends Simulado {
  questoes: QuestaoPlayer[];
}

export interface ProgressoPlayer {
  respostas: Record<number, string>;
  eliminadas: Record<number, string[]>;
  marcadas: number[];
  tempo_decorrido: number;
  status: 'em-andamento' | 'concluido';
}

export interface ResultadoSimulado {
  simuladoId: string;
  totalQuestoes: number;
  respondidas: number;
  acertos: number;
  erros: number;
  naoRespondidas: number;
  porcentagem: number;
  tempoDecorrido: number;
}

export interface ResultadoSalvo {
  id: string;
  simulado_id: string;
  user_id: string;
  total_questoes: number;
  acertos: number;
  erros: number;
  nao_respondidas: number;
  porcentagem: number;
  tempo_segundos: number;
  created_at: string;
  isdeleted: boolean;
}