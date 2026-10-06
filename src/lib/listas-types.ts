// src/lib/listas-types.ts

// ============================================================
// TIPOS DO BANCO (espelham as tabelas criadas no Supabase)
// ============================================================

export type TipoQuestaoLista = 'multipla_escolha' | 'certo_errado';

export interface AlternativaLista {
  letra: 'A' | 'B' | 'C' | 'D' | 'E';
  texto: string;
  correta: boolean;
  comentario: string | null;
}

// Pasta de listas (tabela listas_pastas)
export interface Pasta {
  id: string;
  user_id: string;
  discipline_id: string;
  name: string;
  order: number;
  created_at: string;
  updated_at: string;
  isdeleted: boolean;
  /** Quantidade de listas ativas dentro desta pasta (calculado em query) */
  listas_count?: number;
}

export interface Lista {
  id: string;
  user_id: string;
  discipline_id: string;
  folder_id: string | null; // null = lista direto na disciplina
  titulo: string;
  descricao: string | null;
  created_at: string;
  updated_at: string;
  isdeleted: boolean;
  questoes_count?: number;
}

export interface QuestaoLista {
  id: string;
  user_id: string;
  discipline_id: string;
  tipo: TipoQuestaoLista;
  enunciado: string;
  area: string | null;
  imagem_url: string | null;
  comentario_geral: string | null;
  alternativas: AlternativaLista[] | null;
  gabarito_ce: boolean | null;
  created_at: string;
  isdeleted: boolean;
}

// Questão carregada já com o número dentro da lista
// (o número vem da tabela listas_questoes.ordem)
export interface QuestaoListaPlayer extends QuestaoLista {
  numero: number;
}

export interface AcertosPorArea {
  [area: string]: {
    acertos: number;
    total: number;
  };
}

export interface ResultadoLista {
  id: string;
  lista_id: string;
  user_id: string;
  total_questoes: number;
  acertos: number;
  erros: number;
  nao_respondidas: number;
  porcentagem: number;
  tempo_segundos: number;
  respostas: Record<number, string>;
  areas: Record<number, string>;
  acertos_por_area: AcertosPorArea;
  created_at: string;
  isdeleted: boolean;
}

// ============================================================
// TIPOS DE IMPORTAÇÃO (o formato do JSON)
// ============================================================

export interface QuestaoImportLista {
  numero: number;
  tipo: TipoQuestaoLista;
  enunciado: string;
  area?: string;
  /**
   * NOME do arquivo de imagem (ex: "charge1.jpg").
   * O arquivo deve ser selecionado no modal junto com o JSON.
   * Formato novo e recomendado.
   */
  imagem?: string;
  /**
   * Formato antigo: imagem embutida como base64.
   * Mantido apenas para compatibilidade com JSONs já existentes.
   */
  imagem_base64?: string;
  comentario_geral?: string;
  // Só para múltipla escolha
  alternativas?: AlternativaLista[];
  // Só para certo/errado
  correta?: boolean;
}

export interface ListaImport {
  titulo: string;
  descricao?: string;
  questoes: QuestaoImportLista[];
}

// ============================================================
// TIPOS DO PLAYER (usados na UI)
// ============================================================

export interface ListaPlayer extends Lista {
  questoes: QuestaoListaPlayer[];
}

export interface ProgressoLista {
  respostas: Record<number, string>;
  marcadas: number[];
  tempo_decorrido: number;
  status: 'em-andamento' | 'concluido';
}

export interface ResultadoListaCalc {
  listaId: string;
  totalQuestoes: number;
  respondidas: number;
  acertos: number;
  erros: number;
  naoRespondidas: number;
  porcentagem: number;
  tempoDecorrido: number;
}

// ============================================================
// FILTRO DE LISTAGEM DE LISTAS
// ============================================================
//
// Todas as propriedades são opcionais.
// - sem filtro               → retorna todas as listas do usuário (comportamento atual)
// - { disciplineId }         → só listas daquela disciplina (com ou sem pasta)
// - { folderId }             → só listas daquela pasta
// - { disciplineId, apenasSemPasta: true }
//                            → só listas direto na disciplina (folder_id = null)
//
export interface FiltroListas {
  disciplineId?: string;
  folderId?: string;
  apenasSemPasta?: boolean;
}