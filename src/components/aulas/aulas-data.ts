export type AulaTone = "laranja" | "rosa" | "menta" | "lavanda";

// Mantemos a interface original do Lovable para os componentes visuais não quebrarem
export interface AulaVisual {
  id: string;
  numero: number;
  modulo: string;
  titulo: string;
  descricao: string;
  duracao: string;
  progresso: number;
  tone: AulaTone;
  terabox_url?: string; // Adicionamos o link aqui
}