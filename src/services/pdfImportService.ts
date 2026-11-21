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
  extrairLinhasComCoordenadas,
  extrairImagens,
  extrairRegioesVetoriais,
  mergeRegioesVetoriaisEntrePaginas,
  removerDecorativas,
  extrairSublinhados,
  type LinhaPDF,
  type ImagemExtraida,
  type TrechoComCoordenadas,
  type Sublinhado,
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
  /** NOVO (Fase A1): Trechos de texto com coordenadas exatas para associação precisa */
  trechos?: TrechoComCoordenadas[];
  /** NOVO (Fase A1): Sublinhados brutos (desenho/anotação) para método por coordenadas */
  sublinhadosBrutos?: Sublinhado[];
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
  const todosTrechos: TrechoComCoordenadas[] = [];
  const todosSublinhadosBrutos: Sublinhado[] = [];
  let todasImagens: ImagemExtraida[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);

    // 1) Texto "chapado" (para o parser)
    const content = await page.getTextContent();
    const texto = reconstruirTextoDaPagina(content.items as any[]);
    const totalLinhas = texto.split('\n').filter((l) => l.trim()).length;
    paginas.push({ numero: p, texto, totalLinhas });

    // 2) Linhas com sublinhados + trechos com coordenadas (Fase A1)
    try {
      const { linhas, trechos } = await extrairLinhasComCoordenadas(page);
      todasLinhas.push(...linhas);
      todosTrechos.push(...trechos);
    } catch (e) {
      console.warn(`[pdfImport] Falha ao extrair linhas/trechos da página ${p}:`, e);
    }

    // 3) Sublinhados brutos para método por coordenadas (Fase A1)
    try {
      const subs = await extrairSublinhados(page);
      todosSublinhadosBrutos.push(...subs);
    } catch (e) {
      console.warn(`[pdfImport] Falha ao extrair sublinhados brutos da página ${p}:`, e);
    }

    // 4) Imagens raster (fotos, PNG embutido)
    try {
      const imgsPagina = await extrairImagens(page);
      todasImagens.push(...imgsPagina);
    } catch (e) {
      console.warn(`[pdfImport] Falha ao extrair imagens da página ${p}:`, e);
    }

    // 5) Regiões vetoriais (tabelas, gráficos desenhados com linhas)
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
      `${todosTrechos.length} trechos coordenados, ${todosSublinhadosBrutos.length} sublinhados brutos, ` +
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
    trechos: todosTrechos,
    sublinhadosBrutos: todosSublinhadosBrutos,
  };
}

const TOLERANCIA_Y = 3;

function reconstruirTextoDaPagina(items: any[]): string {
  if (!items || items.length === 0) return '';
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

  // ---- DETECÇÃO DE DUAS COLUNAS ----
  // Se houver uma faixa vertical consistentemente vazia no meio da página (gap grande em X),
  // leia a coluna da esquerda inteira e depois a da direita.
  const USE_TWO_COLUMN = detectarDuasColunas(linhas);

  let resultado: string[];
  if (USE_TWO_COLUMN) {
    resultado = reconstruirDuasColunas(linhas);
  } else {
    resultado = [];
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
  }
  return reordenarAlternativasEmGrade(resultado).join('\n');
}

/**
 * Detecta se a página tem duas colunas: verifica se existe uma faixa vertical vazia
 * consistente (gap em X) na maioria das linhas não vazias.
 */
function detectarDuasColunas(linhas: { y: number; partes: { x: number; width: number }[] }[]): boolean {
  if (linhas.length < 5) return false;

  // Coleta todos os gaps em X entre partes consecutivas na mesma linha
  const gaps: { xFim: number; xInicio: number; tamanho: number }[] = [];
  for (const linha of linhas) {
    if (linha.partes.length < 2) continue;
    const ordenadas = [...linha.partes].sort((a, b) => a.x - b.x);
    for (let i = 0; i < ordenadas.length - 1; i++) {
      const gap = ordenadas[i + 1].x - (ordenadas[i].x + (ordenadas[i].width || 0));
      if (gap > 30) { // gap mínimo significativo (pontos PDF ~ 1/72 inch)
        gaps.push({
          xFim: ordenadas[i].x + (ordenadas[i].width || 0),
          xInicio: ordenadas[i + 1].x,
          tamanho: gap,
        });
      }
    }
  }

  if (gaps.length < 3) return false;

  // Verifica se há uma posição X consistente onde o gap ocorre (meio da página)
  // Agrupa gaps por posição central aproximada
  const gruposGap = new Map<number, typeof gaps>();
  for (const g of gaps) {
    const centro = Math.round((g.xFim + g.xInicio) / 2 / 50) * 50; // arredonda para 50pt
    if (!gruposGap.has(centro)) gruposGap.set(centro, []);
    gruposGap.get(centro)!.push(g);
  }

  // Precisa que pelo menos 40% das linhas tenham gap na mesma posição central
  const totalLinhasComTexto = linhas.filter(l => l.partes.length > 0).length;
  const limiar = Math.max(3, Math.ceil(totalLinhasComTexto * 0.4));

  for (const [, grupo] of gruposGap) {
    if (grupo.length >= limiar) {
      // Verifica se o gap divide a página aproximadamente ao meio
      const xMedio = grupo[0].xFim + grupo[0].tamanho / 2;
      const larguraPagina = Math.max(...linhas.flatMap(l => l.partes.map(p => p.x + (p.width || 0))));
      if (xMedio > larguraPagina * 0.3 && xMedio < larguraPagina * 0.7) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Reconstrói texto lendo coluna esquerda inteira e depois coluna direita.
 * Encontra a posição X do divisor (gap consistente) e separa as partes.
 */
function reconstruirDuasColunas(linhas: { y: number; partes: { str: string; x: number; width: number }[] }[]): string[] {
  // Encontra a posição X do divisor (gap mais consistente)
  const gaps: { xFim: number; xInicio: number; tamanho: number }[] = [];
  for (const linha of linhas) {
    if (linha.partes.length < 2) continue;
    const ordenadas = [...linha.partes].sort((a, b) => a.x - b.x);
    for (let i = 0; i < ordenadas.length - 1; i++) {
      const gap = ordenadas[i + 1].x - (ordenadas[i].x + (ordenadas[i].width || 0));
      if (gap > 30) {
        gaps.push({
          xFim: ordenadas[i].x + (ordenadas[i].width || 0),
          xInicio: ordenadas[i + 1].x,
          tamanho: gap,
        });
      }
    }
  }

  const gruposGap = new Map<number, typeof gaps>();
  for (const g of gaps) {
    const centro = Math.round((g.xFim + g.xInicio) / 2 / 50) * 50;
    if (!gruposGap.has(centro)) gruposGap.set(centro, []);
    gruposGap.get(centro)!.push(g);
  }

  let melhorCentro = 0;
  let melhorCount = 0;
  for (const [centro, grupo] of gruposGap) {
    if (grupo.length > melhorCount) {
      melhorCount = grupo.length;
      melhorCentro = centro;
    }
  }

  const divisorX = melhorCentro;
  const resultado: string[] = [];

  // Processa linhas da esquerda para direita, agrupando por Y
  const linhasPorY = new Map<number, { esq: typeof linhas[0]['partes']; dir: typeof linhas[0]['partes'] }>();
  for (const linha of linhas) {
    const key = Math.round(linha.y / TOLERANCIA_Y) * TOLERANCIA_Y;
    if (!linhasPorY.has(key)) linhasPorY.set(key, { esq: [], dir: [] });
    const entry = linhasPorY.get(key)!;
    for (const parte of linha.partes) {
      const centroParte = parte.x + (parte.width || 0) / 2;
      if (centroParte < divisorX) entry.esq.push(parte);
      else entry.dir.push(parte);
    }
  }

  // Ordena por Y (topo para baixo)
  const ysOrdenados = [...linhasPorY.keys()].sort((a, b) => b - a); // PDF tem Y invertido (topo = maior Y)

  // Coluna esquerda
  for (const y of ysOrdenados) {
    const entry = linhasPorY.get(y)!;
    if (entry.esq.length > 0) {
      entry.esq.sort((a, b) => a.x - b.x);
      let texto = '';
      let xUltimo = -Infinity;
      for (const parte of entry.esq) {
        const gap = parte.x - xUltimo;
        if (texto.length > 0 && gap > 1) texto += ' ';
        texto += parte.str;
        xUltimo = parte.x + (parte.width || parte.str.length * 5);
      }
      const limpo = texto.trim();
      if (limpo) resultado.push(limpo);
    }
  }

  // Coluna direita
  for (const y of ysOrdenados) {
    const entry = linhasPorY.get(y)!;
    if (entry.dir.length > 0) {
      entry.dir.sort((a, b) => a.x - b.x);
      let texto = '';
      let xUltimo = -Infinity;
      for (const parte of entry.dir) {
        const gap = parte.x - xUltimo;
        if (texto.length > 0 && gap > 1) texto += ' ';
        texto += parte.str;
        xUltimo = parte.x + (parte.width || parte.str.length * 5);
      }
      const limpo = texto.trim();
      if (limpo) resultado.push(limpo);
    }
  }

  return resultado;
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