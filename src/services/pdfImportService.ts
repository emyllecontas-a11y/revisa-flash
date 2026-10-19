// src/services/pdfImportService.ts
//
// Orquestrador: extrai texto (para o parser), linhas com sublinhados e
// imagens do PDF. O parser continua recebendo string — não muda nada nele.

import { pdfjs } from 'react-pdf';
import { setupPdfWorker } from '@/lib/pdfWorker';
import {
  parseQuestoesPdf,
  stripNoise,
  type ParseResult,
} from './parseQuestoesPdf';
import {
  extrairLinhas,
  extrairImagens,
  extrairRegioesVetoriais,
  mergeRegioesVetoriaisEntrePaginas,
  removerDecorativas,
  type LinhaPDF,
  type ImagemExtraida,
} from './pdfExtracaoAvancada';

export interface PaginaExtraida {
  numero: number;
  texto: string;
  totalLinhas: number;
}

export interface ExtracaoTexto {
  paginas: PaginaExtraida[];
  totalPaginas: number;
  totalCaracteres: number;
  temTextoSelecionavel: boolean;
  textoCompleto: string;
}

export interface ExtracaoCompleta extends ExtracaoTexto {
  /** Linhas com sublinhados detectados (coordenadas relativas por linha) */
  linhas: LinhaPDF[];
  /** Imagens raster extraídas do PDF (com Blob) */
  imagens: ImagemExtraida[];
}

/**
 * Extrai SÓ o texto (compatibilidade). Usado quando não precisa de imagem/sublinhado.
 */
export async function extrairTextoDoPdf(file: File): Promise<ExtracaoTexto> {
  setupPdfWorker();

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const paginas: PaginaExtraida[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const texto = reconstruirTextoDaPagina(content.items as any[]);
    const totalLinhas = texto.split('\n').filter((l) => l.trim()).length;
    paginas.push({ numero: p, texto, totalLinhas });
    page.cleanup();
  }

  const textoCompleto = paginas.map((p) => p.texto).join('\n\n');
  return {
    paginas,
    totalPaginas: pdf.numPages,
    totalCaracteres: textoCompleto.length,
    temTextoSelecionavel: textoCompleto.length > 200,
    textoCompleto,
  };
}

/**
 * Extração COMPLETA: texto + linhas (com sublinhados) + imagens.
 * Usa `extrairLinhas` e `extrairImagens` do pdfExtracaoAvancada.
 */
export async function extrairTudoDoPdf(file: File): Promise<ExtracaoCompleta> {
  setupPdfWorker();

  console.log('[pdfImport] Extração completa:', file.name);

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const paginas: PaginaExtraida[] = [];
  const todasLinhas: LinhaPDF[] = [];
  let todasImagens: ImagemExtraida[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);

    // 1) Texto "chapado" (para o parser)
    const content = await page.getTextContent();
    const texto = reconstruirTextoDaPagina(content.items as any[]);
    const totalLinhas = texto.split('\n').filter((l) => l.trim()).length;
    paginas.push({ numero: p, texto, totalLinhas });

    // 2) Linhas com sublinhados
    try {
      const linhasPagina = await extrairLinhas(page);
      todasLinhas.push(...linhasPagina);
    } catch (e) {
      console.warn(`[pdfImport] Falha ao extrair linhas da página ${p}:`, e);
    }

    // 3) Imagens raster (fotos, PNG embutido)
    try {
      const imgsPagina = await extrairImagens(page);
      todasImagens.push(...imgsPagina);
    } catch (e) {
      console.warn(`[pdfImport] Falha ao extrair imagens da página ${p}:`, e);
    }

    // 4) Regiões vetoriais (tabelas, gráficos desenhados com linhas)
    try {
      const vetoriais = await extrairRegioesVetoriais(page);
      todasImagens.push(...vetoriais);
    } catch (e) {
      console.warn(`[pdfImport] Falha ao extrair regiões vetoriais da página ${p}:`, e);
    }
    page.cleanup();
  }

  // Remove imagens que se repetem em várias páginas (logo, selo, rodapé decorativo)
  todasImagens = removerDecorativas(todasImagens);
    // Junta tabelas/figuras vetoriais cortadas entre duas páginas
  todasImagens = await mergeRegioesVetoriaisEntrePaginas(todasImagens);

  const textoCompleto = paginas.map((p) => p.texto).join('\n\n');
  const totalSublinhados = todasLinhas.reduce((s, l) => s + l.sublinhados.length, 0);

  console.log(
    `[pdfImport] Extração completa: ${pdf.numPages} páginas, ` +
      `${todasLinhas.length} linhas, ${totalSublinhados} sublinhados, ` +
      `${todasImagens.length} imagens`
  );

  return {
    paginas,
    totalPaginas: pdf.numPages,
    totalCaracteres: textoCompleto.length,
    temTextoSelecionavel: textoCompleto.length > 200,
    textoCompleto,
    linhas: todasLinhas,
    imagens: todasImagens,
  };
}

function reconstruirTextoDaPagina(items: any[]): string {
  if (!items || items.length === 0) return '';
  const TOLERANCIA_Y = 3;
  const linhas: {
    y: number;
    partes: { str: string; x: number; width: number }[];
  }[] = [];

  for (const item of items) {
    if (typeof item.str !== 'string' || item.str.length === 0) continue;
    const t = item.transform;
    if (!Array.isArray(t) || t.length < 6) continue;
    const x = t[4] as number;
    const y = t[5] as number;
    const width = (item.width as number) || 0;

    let linha = linhas.find((l) => Math.abs(l.y - y) < TOLERANCIA_Y);
    if (!linha) {
      linha = { y, partes: [] };
      linhas.push(linha);
    }
    linha.partes.push({ str: item.str, x, width });
  }

  linhas.sort((a, b) => b.y - a.y);
  const resultado: string[] = [];
  for (const linha of linhas) {
    linha.partes.sort((a, b) => a.x - b.x);
    let texto = '';
    let xUltimo = -Infinity;
    for (const parte of linha.partes) {
      const gap = parte.x - xUltimo;
      if (texto.length > 0 && gap > 1) texto += ' ';
      texto += parte.str;
      xUltimo = parte.x + (parte.width || parte.str.length * 5);
    }
    const limpo = texto.trim();
    if (limpo) resultado.push(limpo);
  }
  return reordenarAlternativasEmGrade(resultado).join('\n');
}

/**
 * Alternativas em colunas (ex.: A) e C) e E) na mesma linha, B) e D) na linha de baixo)
 * saem do PDF embaralhadas. Aqui cada célula "X) ..." vira uma linha própria, em ordem de letra.
 */
const RE_CELULA = /(?:^|\s)(?=[A-E]\)\s)/;
function reordenarAlternativasEmGrade(linhas: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < linhas.length) {
    if (!/^[A-E]\)\s/.test(linhas[i])) { out.push(linhas[i++]); continue; }
    let j = i;
    while (j < linhas.length && /^[A-E]\)\s/.test(linhas[j])) j++;
    const bloco = linhas.slice(i, j);
    const temGrade = bloco.some((l) => l.split(RE_CELULA).filter(Boolean).length > 1);
    if (!temGrade) { out.push(...bloco); i = j; continue; }
    const celulas = bloco.flatMap((l) => l.split(RE_CELULA).map((c) => c.trim()).filter(Boolean));
    celulas.sort((a, b) => a.charCodeAt(0) - b.charCodeAt(0));
    out.push(...celulas);
    i = j;
  }
  return out;
}

/**
 * Importa PDF: extração completa + parse.
 * A partir de agora retorna também `linhas` e `imagens` para as próximas etapas.
 */
export async function importarPdf(
  file: File,
  titulo?: string
): Promise<{
  extracao: ExtracaoCompleta;
  resultado: ParseResult;
}> {
  const extracao = await extrairTudoDoPdf(file);
  const tituloFinal = titulo || file.name.replace(/\.pdf$/i, '');
  const resultado = parseQuestoesPdf(extracao.textoCompleto, tituloFinal);
  return { extracao, resultado };
}

export { parseQuestoesPdf, stripNoise };
export type { ParseResult };
export type { LinhaPDF, ImagemExtraida };