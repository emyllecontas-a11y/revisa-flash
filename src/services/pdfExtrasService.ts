// src/services/pdfExtrasService.ts
//
// Associa sublinhados, negritos e itálicos extraídos do PDF às questões montadas pelo parser.
// Usa âncoras de texto (mesma técnica do parser) para localizar as linhas certas.

import {
  montarTextoDeLinhas,
  reancorarSublinhados,
  associarImagemAQuestao,
  type LinhaPDF,
  type ImagemExtraida,
  type FaixaQuestao,
  type Intervalo,
} from './pdfExtracaoAvancada';
import type { QuestaoImportLista } from '@/lib/listas-types';

/* ============================================================
 * Normalização para âncora de texto
 * ============================================================ */

function normalizar(s: string): { n: string; map: number[] } {
  let n = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const d = s[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (const ch of d) {
      if (/[a-z0-9]/.test(ch)) {
        n += ch;
        map.push(i);
      }
    }
  }
  return { n, map };
}

interface RangeLinhas {
  inicio: number;
  fim: number;
}

function acharRangeLinhas(
  textoAlvo: string,
  normLinhas: string,
  linhaStart: number[],
  cursor: number
): { range: RangeLinhas; cursor: number } | null {
  const alvo = normalizar(textoAlvo).n.slice(0, 40);
  if (alvo.length < 8) return null;

  const pos = normLinhas.indexOf(alvo, cursor);
  if (pos < 0) return null;

  let idxInicio = 0;
  for (let i = 0; i < linhaStart.length; i++) {
    if (linhaStart[i] <= pos) idxInicio = i;
    else break;
  }
  const fimNorm = pos + alvo.length;
  let idxFim = idxInicio;
  for (let i = idxInicio; i < linhaStart.length; i++) {
    if (linhaStart[i] < fimNorm) idxFim = i;
    else break;
  }
  return { range: { inicio: idxInicio, fim: idxFim }, cursor: idxInicio + 1 };
}

/* ============================================================
 * Associação principal
 * ============================================================ */

export interface ResultadoAssociacao {
  questoes: QuestaoImportLista[];
  questoesComSublinhado: number;
  totalSublinhados: number;
  questoesComNegrito: number;
  totalNegritos: number;
  questoesComItalico: number;
  totalItalicos: number;
  questoesComImagem: number;
  imagensPorQuestao: Map<number, ImagemExtraida[]>;
  avisos: string[];
}

/** Aplica reancoragem e chama o setter; devolve quantos sobreviveram. */
function aplicar(
  textoFinal: string | undefined,
  intervalos: Intervalo[] | undefined,
  setter: (v: { inicio: number; fim: number }[]) => void
): number {
  if (!textoFinal || !intervalos || intervalos.length === 0) return 0;
  const reancorados = reancorarSublinhados(textoFinal, intervalos, 0);
  if (reancorados.length === 0) return 0;
  setter(reancorados.map(({ inicio, fim }) => ({ inicio, fim })));
  return reancorados.length;
}

export function associarExtras(
  questoes: QuestaoImportLista[],
  linhas: LinhaPDF[],
  imagens: ImagemExtraida[]
): ResultadoAssociacao {
  const avisos: string[] = [];

  // --- 1. Texto normalizado das linhas + offsets ---
  let normLinhas = '';
  const linhaStart: number[] = [];
  for (const l of linhas) {
    linhaStart.push(normLinhas.length);
    normLinhas += normalizar(l.texto).n;
  }

  // --- 2. Achar range de linhas para enunciado e comentário de cada questão ---
  const rangesEnunciado: (RangeLinhas | null)[] = [];
  const rangesComentario: (RangeLinhas | null)[] = [];
  let cursorEnun = 0;
  let cursorCom = 0;

  for (let i = 0; i < questoes.length; i++) {
    const q = questoes[i];

    const enun = acharRangeLinhas(q.enunciado, normLinhas, linhaStart, cursorEnun);
    if (enun) {
      rangesEnunciado.push(enun.range);
      cursorEnun = enun.cursor;
    } else {
      rangesEnunciado.push(null);
      avisos.push(`Q${q.numero}: âncora do enunciado não encontrada.`);
    }

    if (q.comentario_geral && q.comentario_geral.trim()) {
      const com = acharRangeLinhas(q.comentario_geral, normLinhas, linhaStart, cursorCom);
      if (com) {
        rangesComentario.push(com.range);
        cursorCom = com.cursor;
      } else {
        rangesComentario.push(null);
        avisos.push(`Q${q.numero}: âncora do comentário não encontrada.`);
      }
    } else {
      rangesComentario.push(null);
    }
  }

  // --- 3. Anexar sublinhados/negritos/itálicos a cada questão ---
  let questoesComSublinhado = 0;
  let totalSublinhados = 0;
  let questoesComNegrito = 0;
  let totalNegritos = 0;
  let questoesComItalico = 0;
  let totalItalicos = 0;

  for (let i = 0; i < questoes.length; i++) {
    const q = questoes[i];

    // --- ENUNCIADO ---
    const rEnun = rangesEnunciado[i];
    if (rEnun) {
      const linhasEnun = linhas.slice(rEnun.inicio, rEnun.fim + 1);
      const montado = montarTextoDeLinhas(linhasEnun);

      const s = aplicar(q.enunciado, montado.sublinhados, (v) => { q.sublinhados_enunciado = v; });
      const n = aplicar(q.enunciado, montado.negritos, (v) => { q.negritos_enunciado = v; });
      const it = aplicar(q.enunciado, montado.italicos, (v) => { q.italicos_enunciado = v; });

      totalSublinhados += s;
      totalNegritos += n;
      totalItalicos += it;
    }

    // --- COMENTÁRIO ---
    const rCom = rangesComentario[i];
    if (rCom && q.comentario_geral) {
      const linhasCom = linhas.slice(rCom.inicio, rCom.fim + 1);
      const montado = montarTextoDeLinhas(linhasCom);

      const s = aplicar(q.comentario_geral, montado.sublinhados, (v) => { q.sublinhados_comentario = v; });
      const n = aplicar(q.comentario_geral, montado.negritos, (v) => { q.negritos_comentario = v; });
      const it = aplicar(q.comentario_geral, montado.italicos, (v) => { q.italicos_comentario = v; });

      totalSublinhados += s;
      totalNegritos += n;
      totalItalicos += it;
    }

    if (q.sublinhados_enunciado?.length || q.sublinhados_comentario?.length) questoesComSublinhado++;
    if (q.negritos_enunciado?.length || q.negritos_comentario?.length) questoesComNegrito++;
    if (q.italicos_enunciado?.length || q.italicos_comentario?.length) questoesComItalico++;
  }

  // --- 4. Associar imagens às questões ---
  const faixas: FaixaQuestao[] = [];
  for (let i = 0; i < questoes.length; i++) {
    const rEnun = rangesEnunciado[i];
    const rCom = rangesComentario[i];
    if (!rEnun) continue;

    const posInicio = linhas[rEnun.inicio].pos - 0.005;
    const posFim = rCom
      ? linhas[rCom.fim].pos + 0.05
      : linhas[rEnun.fim].pos + 0.05;

    faixas.push({ numero: questoes[i].numero, posInicio, posFim });
  }

  const imagensPorQuestao = associarImagemAQuestao(imagens, faixas);

  let questoesComImagem = 0;
  for (const [, imgs] of imagensPorQuestao.entries()) {
    if (imgs.length > 0) questoesComImagem++;
  }

  return {
    questoes,
    questoesComSublinhado,
    totalSublinhados,
    questoesComNegrito,
    totalNegritos,
    questoesComItalico,
    totalItalicos,
    questoesComImagem,
    imagensPorQuestao,
    avisos,
  };
}

/* ============================================================
 * Utilidades de imagem (inalterado)
 * ============================================================ */

export async function juntarImagensVerticais(
  imgs: ImagemExtraida[]
): Promise<{ blob: Blob; largura: number; altura: number } | null> {
  if (!imgs || imgs.length === 0) return null;
  if (imgs.length === 1) {
    return { blob: imgs[0].blob, largura: imgs[0].largura, altura: imgs[0].altura };
  }

  const bitmaps = await Promise.all(imgs.map((i) => createImageBitmap(i.blob)));

  const GAP = 12;
  const larguraMax = Math.max(...bitmaps.map((b) => b.width));
  const alturaTotal = bitmaps.reduce((s, b) => s + b.height, 0) + GAP * (bitmaps.length - 1);

  const canvas = document.createElement('canvas');
  canvas.width = larguraMax;
  canvas.height = alturaTotal;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let y = 0;
  for (const b of bitmaps) {
    const x = Math.floor((larguraMax - b.width) / 2);
    ctx.drawImage(b, x, y);
    y += b.height + GAP;
  }

  const blob: Blob = await new Promise((res) =>
    canvas.toBlob((b) => res(b!), 'image/jpeg', 0.9)
  );
  return { blob, largura: canvas.width, altura: canvas.height };
}

export function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao ler blob'));
    reader.readAsDataURL(blob);
  });
}