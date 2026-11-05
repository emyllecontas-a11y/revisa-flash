// src/components/ranking/types.ts
export type PeriodoTipo = "semanal" | "mensal";

export type CrownType = "ouro" | "prata" | "bronze" | "rubi" | "safira" | "diamante";

export type MedalTier = "bronze" | "prata" | "ouro" | "rubi" | "safira" | "diamante";

export type MedalIcon = "flame" | "clock" | "target" | "calendar" | "book" | "trophy" | "zap" | "star";

export interface RankingParticipant {
  id: string;
  name: string;
  avatar_url: string | null;
  avatar_tipo?: string | null; // 🔥 NOVO
  avatar_id?: string | null;   // 🔥 NOVO
  pontos: number;
  variacao: number;
  horasEstudadas: number;
  questoesResolvidas: number;
  simuladosRealizados: number;
  coroa?: CrownType | null;
}

export interface RankingPeriod {
  tipo: PeriodoTipo;
  label: string;
  encerramento?: string;
}

export interface MedalWinner {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface Medal {
  id: string;
  categoria: PeriodoTipo;
  titulo: string;
  descricao: string;
  tier: MedalTier;
  icon: MedalIcon;
  conquistada: boolean;
  progresso?: number;
  ganhadores?: MedalWinner[];
}

export interface CurrentUser extends RankingParticipant {
  posicao: number;
  pontosParaProximo: number;
  progressoProximo: number;
}

export interface UserIndicators {
  tempo: { dia: number; semana: number; mes: number };
  questoes: { dia: number; semana: number; mes: number };
  simulados: { semana: number; mes: number };
}

export type RankingViewState = "preenchido" | "carregando" | "vazio" | "erro" | "sem-amigos";