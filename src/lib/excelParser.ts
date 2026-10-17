// src/lib/excelParser.ts
// Substitui o csvParser.ts. Lê o Modelo_Plano_Estudos.xlsx e devolve PlanoSemana[].
import * as XLSX from "xlsx";
import type { PlanoBloco, PlanoSemana } from "./planoEnareData";

export interface ResultadoImportacao {
  semanas: PlanoSemana[];
  avisos: string[];
  totalBlocos: number;
}

// Índice no array `dias`: 0 = Segunda ... 6 = Domingo (igual ao app)
const NOMES_DIAS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];

// Proteção contra números de semana absurdos (ex.: alguém digitar "Semana 2025")
const MAX_SEMANAS = 104;

/** Tira acentos e espaços das pontas, deixa minúsculo: "Terça " -> "terca" */
function normalizar(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Mesma regra que o csvParser antigo e o PlanoWizard usam:
 * 4 primeiras letras em maiúsculo ("Português" -> "PORT", "RL" -> "RL").
 * Assim as cores do PlanoDiaCard continuam funcionando do mesmo jeito.
 */
export function siglaDaMateria(materia: string): string {
  return materia.trim().substring(0, 4).toUpperCase();
}

/**
 * Transforma o texto de UMA célula em blocos (um por linha).
 *
 *   "Português: Acentuação | Aulas 1 a 5\nMatemática: Conjuntos"
 *   -> [{ k:"PORT", t:"Acentuação", d:"Aulas 1 a 5" }, { k:"MATE", t:"Conjuntos" }]
 *
 * Regras:
 *  - Só o PRIMEIRO ":" separa matéria e tema.
 *  - O que vem depois de "|" é o detalhe (campo `d`), opcional.
 *  - Linha sem ":" (ex.: "Revisão") vira matéria e tema ao mesmo tempo.
 */
export function parseCelula(texto: string): PlanoBloco[] {
  const blocos: PlanoBloco[] = [];

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;

    // 1) separa o detalhe (depois do primeiro "|")
    const barra = linha.indexOf("|");
    const principal = (barra === -1 ? linha : linha.slice(0, barra)).trim();
    const detalhe = barra === -1 ? "" : linha.slice(barra + 1).trim();

    // 2) separa matéria e tema (no primeiro ":")
    const doisPontos = principal.indexOf(":");
    const materia = (doisPontos === -1 ? principal : principal.slice(0, doisPontos)).trim();
    const tema = doisPontos === -1 ? "" : principal.slice(doisPontos + 1).trim();

    if (!materia && !tema) continue;

    const bloco: PlanoBloco = {
      k: siglaDaMateria(materia || "Geral"),
      t: tema || materia, // sem tema? mostra o nome da matéria
    };
    if (detalhe) bloco.d = detalhe;
    blocos.push(bloco);
  }

  return blocos;
}

/** "Semana 3" -> 3. Se não tiver número, usa a posição da linha. */
function numeroDaSemana(valor: unknown, fallback: number): number {
  const m = String(valor ?? "").match(/\d+/);
  return m ? parseInt(m[0], 10) : fallback;
}

const diasVazios = (): PlanoBloco[][] => Array.from({ length: 7 }, () => []);

/**
 * Lê o arquivo .xlsx e devolve as semanas no formato do app.
 * Semanas sem conteúdo no meio do plano viram semanas vazias
 * (igual ao csvParser antigo), então n sempre vai de 1 até a última.
 */
export async function lerPlanoExcel(file: File): Promise<ResultadoImportacao> {
  const avisos: string[] = [];

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  } catch {
    throw new Error("Não consegui abrir o arquivo. Confira se é um Excel (.xlsx) válido.");
  }

  // Procura a aba "Plano"; se não existir, usa a primeira
  const nomeAba = wb.SheetNames.find((n) => normalizar(n) === "plano") ?? wb.SheetNames[0];
  if (!nomeAba) throw new Error("O arquivo Excel está vazio.");
  if (normalizar(nomeAba) !== "plano") {
    avisos.push(`Não achei a aba "Plano", então usei a aba "${nomeAba}".`);
  }

  // Matriz: linhas[0] = cabeçalho, linhas[1..] = semanas
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nomeAba], {
    header: 1,
    defval: "",
    raw: false, // tudo como texto
    blankrows: false,
  });

  if (linhas.length < 2) {
    throw new Error("Não encontrei nenhuma semana preenchida no arquivo.");
  }

  // Descobre a coluna de cada dia pelo TÍTULO (funciona mesmo com colunas fora de ordem)
  const cabecalho = linhas[0].map(normalizar);
  const colunaSemana = cabecalho.indexOf("semana");
  const colunasDias = NOMES_DIAS.map((nome) => cabecalho.indexOf(nome));

  const faltando = NOMES_DIAS.filter((_, i) => colunasDias[i] === -1);
  if (faltando.length === NOMES_DIAS.length) {
    throw new Error(
      'Não achei as colunas dos dias. Confira se o cabeçalho tem "Segunda", "Terça"... como no modelo.'
    );
  }
  if (faltando.length > 0) {
    avisos.push(`Colunas não encontradas (ficam vazias): ${faltando.join(", ")}.`);
  }

  // Junta tudo por número de semana
  const porSemana = new Map<number, PlanoBloco[][]>();

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    const n = numeroDaSemana(colunaSemana >= 0 ? linha[colunaSemana] : "", i);

    const dias = colunasDias.map((col) =>
      col === -1 ? [] : parseCelula(String(linha[col] ?? ""))
    );
    if (!dias.some((d) => d.length > 0)) continue; // linha vazia

    if (n < 1 || n > MAX_SEMANAS) {
      avisos.push(`Ignorei a linha "${String(linha[colunaSemana] ?? n)}": número de semana fora de 1 a ${MAX_SEMANAS}.`);
      continue;
    }

    const existente = porSemana.get(n);
    if (existente) {
      avisos.push(`A Semana ${n} aparece mais de uma vez; juntei o conteúdo das linhas.`);
      dias.forEach((d, idx) => existente[idx].push(...d));
    } else {
      porSemana.set(n, dias);
    }
  }

  if (porSemana.size === 0) {
    throw new Error("Nenhuma matéria encontrada. Preencha os dias no formato Matéria: Tema.");
  }

  // Monta 1..última semana, preenchendo buracos com semanas vazias
  const ultima = Math.max(...porSemana.keys());
  const semanas: PlanoSemana[] = [];
  const buracos: number[] = [];
  let totalBlocos = 0;

  for (let s = 1; s <= ultima; s++) {
    const dias = porSemana.get(s);
    if (!dias) buracos.push(s);
    else totalBlocos += dias.reduce((acc, d) => acc + d.length, 0);
    semanas.push({ n: s, dias: dias ?? diasVazios() });
  }

  if (buracos.length > 0) {
    avisos.push(`Semanas sem conteúdo (ficam vazias no plano): ${buracos.join(", ")}.`);
  }

  return { semanas, avisos, totalBlocos };
}