/**
 * Tipos do mockup do Ranking (RevisaFlash).
 * Pensados para receber dados reais no futuro sem mudar os componentes.
 */

export type PeriodoTipo = "semanal" | "mensal";

/** Tipos de coroa exibidos sobre o avatar. A regra de quem recebe cada uma será definida depois. */
export type CrownType = "ouro" | "prata" | "bronze" | "rubi" | "safira" | "diamante";

/** Nível visual de uma medalha. */
export type MedalTier = "bronze" | "prata" | "ouro" | "rubi" | "safira" | "diamante";

/** Ícone desenhado dentro da medalha. */
export type MedalIcon = "flame" | "clock" | "target" | "calendar" | "book" | "trophy" | "zap" | "star";

export interface RankingParticipant {
  id: string;
  name: string;
  avatar_url: string | null;
  pontos: number;
  /** Variação de posição desde o dia anterior (+ subiu, - desceu, 0 estável). */
  variacao: number;
  horasEstudadas: number;
  questoesResolvidas: number;
  simuladosRealizados: number;
  /** Coroa opcional exibida sobre a foto. */
  coroa?: CrownType | null;
}

export interface RankingPeriod {
  tipo: PeriodoTipo;
  /** Ex.: "11 a 17 de novembro" ou "Novembro de 2026". */
  label: string;
  /** Texto fictício de encerramento. Ex.: "Encerra em 3 dias". */
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
  /** 0–1, usado quando ainda não conquistada. */
  progresso?: number;
  /** Estudantes que conquistaram (para exibição social). */
  ganhadores?: MedalWinner[];
}

export interface CurrentUser extends RankingParticipant {
  posicao: number;
  /** Pontos que faltam para o próximo colocado (fictício). */
  pontosParaProximo: number;
  /** Progresso visual (0–1) até o próximo colocado. */
  progressoProximo: number;
}

export interface UserIndicators {
  /** Minutos estudados. */
  tempo: { dia: number; semana: number; mes: number };
  questoes: { dia: number; semana: number; mes: number };
  simulados: { semana: number; mes: number };
}

export type RankingViewState = "preenchido" | "carregando" | "vazio" | "erro" | "sem-amigos";
