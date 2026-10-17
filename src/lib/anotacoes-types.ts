// src/lib/anotacoes-types.ts

export type QuestaoOrigem = 'lista' | 'simulado';

/** Campo onde o grifo foi feito. Alternativas usam "alternativa_A", "alternativa_B"... */
export type CampoAlvo =
  | 'enunciado'
  | 'comentario'
  | `alternativa_${'A' | 'B' | 'C' | 'D' | 'E'}`;

export type CorGrifo = 'yellow' | 'green' | 'pink' | 'blue' | 'red';

export interface RectGrifo {
  x1: number; // 0..1 relativo ao bloco
  y1: number;
  x2: number;
  y2: number;
}

export interface AnotacaoQuestao {
  id: string;
  user_id: string;
  questao_origem: QuestaoOrigem;
  questao_id: string;
  campo_alvo: CampoAlvo;
  texto_snippet: string | null;
  cor: CorGrifo;
  rects: RectGrifo[];
  created_at: string;
  updated_at: string;
  isdeleted: boolean;
}

export const CORES_GRIFO: Record<CorGrifo, { label: string; dot: string; bg: string }> = {
  yellow: { label: 'Amarelo', dot: '#FFEB3B', bg: 'rgba(255, 235, 59, 0.45)' },
  green:  { label: 'Verde',   dot: '#8BC34A', bg: 'rgba(139, 195, 74, 0.45)' },
  pink:   { label: 'Rosa',    dot: '#F48FB1', bg: 'rgba(244, 143, 177, 0.45)' },
  blue:   { label: 'Azul',    dot: '#64B5F6', bg: 'rgba(100, 181, 246, 0.45)' },
  red:    { label: 'Vermelho',dot: '#EF5350', bg: 'rgba(244, 67, 54, 0.35)' },
};