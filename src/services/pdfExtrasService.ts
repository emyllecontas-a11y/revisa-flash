// src/services/pdfExtrasService.ts
//
// Associa sublinhados, negritos e itálicos do PDF às questões do parser.
//
// COMO FUNCIONA (versão nova):
//  1. Todas as linhas do PDF viram UM texto contínuo, sem espaços/acentos (só a-z0-9),
//     onde cada letra "sabe" se é sublinhada / negrito / itálico. Cabeçalho e rodapé saem.
//  2. Cada parte da questão (enunciado, CADA alternativa, comentário) é procurada INTEIRA
//     nesse texto. Se não bater exato, usa alinhamento tolerante (pula ruído).
//  3. As marcas viajam letra a letra para o texto final -> {inicio, fim}.
//  4. O enunciado aparece no PDF 2x (COMENTADAS e LISTA): usamos as duas ocorrências
//     (uma cobre a outra se perder alguma marca).
//  5. Sublinhados do PDF que não caíram em nenhuma questão viram AVISO (nada se perde calado).

import {
  associarImagemAQuestao,
  type LinhaPDF,
  type ImagemExtraida,
  type FaixaQuestao,
} from './pdfExtracaoAvancada';
import type { QuestaoImportLista } from '@/lib/listas-types';

const SUB = 1;
const NEG = 2;
const ITA = 4;

type Faixa = { inicio: number; fim: number };

/* ============================================================
 * Normalização (mesma regra do parser: só a-z0-9, sem acento)
 * ============================================================ */

interface Normal {
  n: string;
  /** índice do caractere ORIGINAL de cada letra normalizada */
  map: number[];
  /** 1 se o caractere original gerou alguma letra normalizada */
  tem: Uint8Array;
}

function normalizar(s: string): Normal {
  let n = '';
  const map: number[] = [];
  const tem = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const d = s[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (const ch of d) {
      if (/[a-z0-9]/.test(ch)) {
        n += ch;
        map.push(i);
        tem[i] = 1;
      }
    }
  }
  return { n, map, tem };
}

/* ============================================================
 * 1. Texto contínuo do PDF com marcas por letra
 * ============================================================ */

interface Fluxo {
  S: string;
  raw: string[];
  flags: Uint8Array;
  /** (pagina-1) + y relativo de cada letra */
  pos: Float64Array;
}

const RE_RUIDO = [/estrategiaconcursos\.com\.br/i, /^\d{11}\s*-\s*\S/, /^Aula\s+\d+$/i];
const emFaixa = (l: LinhaPDF) => l.yBase < 0.12 || l.yBase > 0.88;
const chaveLinha = (t: string) => t.replace(/\s+/g, ' ').trim().replace(/\d+/g, '#');

/** Tira cabeçalho/rodapé: linhas das faixas de topo/base que se repetem em várias páginas. */
function filtrarRuido(linhas: LinhaPDF[]): LinhaPDF[] {
  const totalPaginas = new Set(linhas.map((l) => l.pagina)).size;
  const minRep = Math.max(3, Math.ceil(totalPaginas * 0.3));
  const paginasPorChave = new Map<string, Set<number>>();
  for (const l of linhas) {
    if (!emFaixa(l)) continue;
    const k = chaveLinha(l.texto);
    if (!k) continue;
    if (!paginasPorChave.has(k)) paginasPorChave.set(k, new Set());
    paginasPorChave.get(k)!.add(l.pagina);
  }
  return linhas.filter((l) => {
    const t = l.texto.trim();
    if (!t) return false;
    if (RE_RUIDO.some((re) => re.test(t))) return false;
    if (emFaixa(l) && (paginasPorChave.get(chaveLinha(t))?.size ?? 0) >= minRep) return false;
    return true;
  });
}

function pintar(m: Uint8Array, ints: Faixa[] | undefined, bit: number) {
  for (const it of ints ?? []) {
    const a = Math.max(0, it.inicio);
    const b = Math.min(m.length, it.fim);
    for (let i = a; i < b; i++) m[i] |= bit;
  }
}

function construirFluxo(todas: LinhaPDF[]): Fluxo {
  const partes: string[] = [];
  const raw: string[] = [];
  const fl: number[] = [];
  const ps: number[] = [];

  for (const l of filtrarRuido(todas)) {
    const m = new Uint8Array(l.texto.length);
    pintar(m, l.sublinhados, SUB);
    pintar(m, l.negritos, NEG);
    pintar(m, l.italicos, ITA);
    for (let i = 0; i < l.texto.length; i++) {
      const d = l.texto[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      for (const ch of d) {
        if (/[a-z0-9]/.test(ch)) {
          partes.push(ch);
          raw.push(l.texto[i]);
          fl.push(m[i]);
          ps.push(l.pos);
        }
      }
    }
  }
  return { S: partes.join(''), raw, flags: Uint8Array.from(fl), pos: Float64Array.from(ps) };
}

/* ============================================================
 * 2. Localizar uma parte (exato; senão, tolerante)
 * ============================================================ */

interface Achado {
  ini: number;
  fim: number;
  /** null = alinhamento exato (letra k do alvo = letra ini+k do PDF) */
  mapa: Int32Array | null;
}

/** Alinha o texto alvo T com o trecho [ini, fim) do PDF, pulando ruído nos dois lados. */
function alinhar(T: string, S: string, ini: number, fim: number): Int32Array {
  const mapa = new Int32Array(T.length).fill(-1);
  const JANELA = 200;
  let i = 0;
  let j = ini;
  while (i < T.length && j < fim) {
    if (T.charCodeAt(i) === S.charCodeAt(j)) {
      mapa[i++] = j++;
      continue;
    }
    const kT = T.slice(i, i + 5);
    const kS = S.slice(j, j + 5);
    let dS = -1;
    let dT = -1;
    for (let d = 1; d <= JANELA && j + d < fim; d++) {
      if (S.startsWith(kT, j + d)) { dS = d; break; }
    }
    for (let d = 1; d <= JANELA && i + d < T.length; d++) {
      if (T.startsWith(kS, i + d)) { dT = d; break; }
    }
    if (dS > 0 && (dT < 0 || dS <= dT)) j += dS; // PDF tem texto a mais (ruído)
    else if (dT > 0) i += dT; // o texto do parser tem trecho que o PDF não tem
    else i++;
  }
  return mapa;
}

function fecharAproximado(f: Fluxo, T: string, ini: number): Achado | null {
  const suf = T.slice(-Math.min(20, T.length));
  const baixo = ini + Math.floor(T.length * 0.7);
  const alto = ini + Math.ceil(T.length * 1.3) + 250;
  const at = f.S.indexOf(suf, baixo);
  if (at < 0 || at + suf.length > alto) return null;
  const fim = at + suf.length;
  return { ini, fim, mapa: alinhar(T, f.S, ini, fim) };
}

/** Procura T logo depois de `de` (no máximo `gap` letras de distância). */
function acharPeca(f: Fluxo, T: string, de: number, gap: number): Achado | null {
  if (!T) return null;
  const ex = f.S.indexOf(T, de);
  if (ex >= 0 && ex - de <= gap) return { ini: ex, fim: ex + T.length, mapa: null };
  if (T.length < 12) return null;
  const ini = f.S.indexOf(T.slice(0, Math.min(24, T.length)), de);
  if (ini < 0 || ini - de > gap) return null;
  return fecharAproximado(f, T, ini);
}

/** Todas as ocorrências do enunciado no PDF (normalmente 2: COMENTADAS e LISTA). */
function ocorrenciasEnunciado(f: Fluxo, T: string): Achado[] {
  const out: Achado[] = [];
  if (T.length < 8) return out;
  let i = f.S.indexOf(T);
  while (i >= 0 && out.length < 4) {
    out.push({ ini: i, fim: i + T.length, mapa: null });
    i = f.S.indexOf(T, i + 1);
  }
  if (out.length > 0 || T.length < 12) return out;

  const pre = T.slice(0, Math.min(24, T.length));
  let p = f.S.indexOf(pre);
  while (p >= 0 && out.length < 4) {
    const a = fecharAproximado(f, T, p);
    if (a) out.push(a);
    p = f.S.indexOf(pre, p + 1);
  }
  return out;
}

/* ============================================================
 * 3. Passar as marcas do PDF para o texto final
 * ============================================================ */

function aplicarAchado(
  f: Fluxo,
  a: Achado,
  T: Normal,
  acc: Uint8Array,
  cobertos: Uint8Array
) {
  for (let k = 0; k < T.n.length; k++) {
    const s = a.mapa ? a.mapa[k] : a.ini + k;
    if (s < 0) continue;
    acc[T.map[k]] |= f.flags[s];
    cobertos[s] = 1;
  }
}

/** Letras marcadas -> intervalos {inicio, fim}. Espaços/pontuação entram se estiverem "dentro" da marca. */
function intervalos(texto: string, acc: Uint8Array, tem: Uint8Array, bit: number): Faixa[] {
  const n = texto.length;
  const marc = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (tem[i] && acc[i] & bit) marc[i] = 1;

  const esq = new Int32Array(n);
  const dir = new Int32Array(n);
  let ult = -1;
  for (let i = 0; i < n; i++) { if (tem[i]) ult = i; esq[i] = ult; }
  ult = -1;
  for (let i = n - 1; i >= 0; i--) { if (tem[i]) ult = i; dir[i] = ult; }

  for (let i = 0; i < n; i++) {
    if (tem[i]) continue;
    const L = esq[i];
    const R = dir[i];
    if (/\s/.test(texto[i])) {
      if (L >= 0 && R >= 0 && marc[L] && marc[R]) marc[i] = 1;
    } else {
      const colaEsq = L >= 0 && marc[L] && !/\s/.test(texto.slice(L + 1, i));
      const colaDir = R >= 0 && marc[R] && !/\s/.test(texto.slice(i + 1, R));
      if (colaEsq || colaDir) marc[i] = 1;
    }
  }

  const out: Faixa[] = [];
  let i = 0;
  while (i < n) {
    if (!marc[i]) { i++; continue; }
    let j = i;
    while (j < n && marc[j]) j++;
    let a = i;
    let b = j;
    while (a < b && /\s/.test(texto[a])) a++;
    while (b > a && /\s/.test(texto[b - 1])) b--;
    if (b > a) out.push({ inicio: a, fim: b });
    i = j;
  }
  return out;
}

interface Marcas { s: Faixa[]; n: Faixa[]; i: Faixa[] }
function marcasDe(texto: string, acc: Uint8Array, T: Normal): Marcas {
  return {
    s: intervalos(texto, acc, T.tem, SUB),
    n: intervalos(texto, acc, T.tem, NEG),
    i: intervalos(texto, acc, T.tem, ITA),
  };
}

/* ============================================================
 * Associação principal
 * ============================================================ */

export interface RelatorioExtras {
  /** trechos sublinhados (contínuos) encontrados no PDF inteiro */
  sublinhadosNoPdf: number;
  /** trechos sublinhados que não caíram em nenhuma questão */
  sublinhadosSemDono: number;
  orfaos: { pagina: number; trecho: string }[];
}

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
  relatorio: RelatorioExtras;
}

export function associarExtras(
  questoes: QuestaoImportLista[],
  linhas: LinhaPDF[],
  imagens: ImagemExtraida[]
): ResultadoAssociacao {
  const avisos: string[] = [];
  const f = construirFluxo(linhas);
  const cobertos = new Uint8Array(f.S.length);

  const ocs: { numero: number; ini: number; fimConteudo: number }[] = [];
  let totalSub = 0, totalNeg = 0, totalIta = 0;
  let qSub = 0, qNeg = 0, qIta = 0;

  for (const q of questoes) {
    const Te = normalizar(q.enunciado);
    const alts = q.tipo === 'multipla_escolha' ? q.alternativas ?? [] : [];
    const Ta = alts.map((a) => normalizar(a.texto));
    const textoCom = q.comentario_geral ?? '';
    const Tc = textoCom.trim() ? normalizar(textoCom) : null;

    const occs = ocorrenciasEnunciado(f, Te.n);
    if (occs.length === 0) {
      avisos.push(`Q${q.numero}: enunciado não localizado no PDF (sem sublinhado/negrito/itálico).`);
      continue;
    }

    const accE = new Uint8Array(q.enunciado.length);
    const accA = alts.map((a) => new Uint8Array(a.texto.length));
    const accC = new Uint8Array(textoCom.length);
    const achouA = alts.map(() => false);
    let achouC = false;

    for (const oc of occs) {
      aplicarAchado(f, oc, Te, accE, cobertos);
      let cursor = oc.fim;
      let fimConteudo = oc.fim;

      alts.forEach((_, j) => {
        const a = Ta[j].n ? acharPeca(f, Ta[j].n, cursor, 14) : null;
        if (a) {
          aplicarAchado(f, a, Ta[j], accA[j], cobertos);
          cursor = a.fim;
          fimConteudo = a.fim;
          achouA[j] = true;
        } else {
          cursor += Ta[j].n.length + 2; // estimativa para a próxima alternativa
        }
      });

      if (Tc && Tc.n) {
        const a = acharPeca(f, Tc.n, cursor, 60);
        if (a) {
          aplicarAchado(f, a, Tc, accC, cobertos);
          fimConteudo = a.fim;
          achouC = true;
        }
      }
      ocs.push({ numero: q.numero, ini: oc.ini, fimConteudo });
    }

    alts.forEach((a, j) => {
      if (!achouA[j] && Ta[j].n.length > 0)
        avisos.push(`Q${q.numero}: alternativa ${a.letra} não localizada no PDF (marcas podem faltar).`);
    });
    if (Tc && Tc.n && !achouC)
      avisos.push(`Q${q.numero}: comentário não localizado no PDF (marcas podem faltar).`);

    // ---- enunciado ----
    const mE = marcasDe(q.enunciado, accE, Te);
    if (mE.s.length) q.sublinhados_enunciado = mE.s;
    if (mE.n.length) q.negritos_enunciado = mE.n;
    if (mE.i.length) q.italicos_enunciado = mE.i;
    let temS = mE.s.length > 0, temN = mE.n.length > 0, temI = mE.i.length > 0;
    totalSub += mE.s.length; totalNeg += mE.n.length; totalIta += mE.i.length;

    // ---- alternativas (NOVO) ----
    alts.forEach((a, j) => {
      const m = marcasDe(a.texto, accA[j], Ta[j]);
      if (m.s.length) a.sublinhados = m.s; else delete a.sublinhados;
      if (m.n.length) a.negritos = m.n; else delete a.negritos;
      if (m.i.length) a.italicos = m.i; else delete a.italicos;
      if (m.s.length) temS = true;
      if (m.n.length) temN = true;
      if (m.i.length) temI = true;
      totalSub += m.s.length; totalNeg += m.n.length; totalIta += m.i.length;
    });

    // ---- comentário ----
    if (Tc) {
      const m = marcasDe(textoCom, accC, Tc);
      if (m.s.length) q.sublinhados_comentario = m.s;
      if (m.n.length) q.negritos_comentario = m.n;
      if (m.i.length) q.italicos_comentario = m.i;
      if (m.s.length) temS = true;
      if (m.n.length) temN = true;
      if (m.i.length) temI = true;
      totalSub += m.s.length; totalNeg += m.n.length; totalIta += m.i.length;
    }

    if (temS) qSub++;
    if (temN) qNeg++;
    if (temI) qIta++;
  }

  // ---- sublinhados do PDF que não caíram em nenhuma questão ----
  let noPdf = 0;
  const orfaos: { pagina: number; trecho: string }[] = [];
  for (let i = 0; i < f.S.length; ) {
    if (!(f.flags[i] & SUB)) { i++; continue; }
    let j = i;
    let coberto = false;
    while (j < f.S.length && f.flags[j] & SUB) {
      if (cobertos[j]) coberto = true;
      j++;
    }
    noPdf++;
    if (!coberto) {
      orfaos.push({
        pagina: Math.floor(f.pos[i]) + 1,
        trecho: f.raw.slice(i, Math.min(j, i + 50)).join(''),
      });
    }
    i = j;
  }
  if (orfaos.length > 0) {
    avisos.push(
      `${orfaos.length} de ${noPdf} trechos sublinhados do PDF não foram ligados a nenhuma questão:`
    );
    for (const o of orfaos.slice(0, 10)) avisos.push(`  pág. ${o.pagina}: «${o.trecho}»`);
    if (orfaos.length > 10) avisos.push(`  … e mais ${orfaos.length - 10}.`);
  }
  console.log(
    `[pdfExtras] sublinhados no PDF: ${noPdf} | sem dono: ${orfaos.length} | ` +
      `atribuídos às questões: ${totalSub} | negritos: ${totalNeg} | itálicos: ${totalIta}`
  );

  // ---- faixas para as imagens (uma por ocorrência da questão) ----
  ocs.sort((a, b) => a.ini - b.ini);
  const faixas: FaixaQuestao[] = ocs.map((o, k) => {
    const posInicio = f.pos[o.ini] - 0.003;
    const posFimConteudo = f.pos[Math.max(0, o.fimConteudo - 1)] + 0.1;
    const proxima = ocs[k + 1] ? f.pos[ocs[k + 1].ini] - 0.003 : Infinity;
    return { numero: o.numero, posInicio, posFim: Math.min(proxima, posFimConteudo) };
  });
  const imagensPorQuestao = associarImagemAQuestao(imagens, faixas);

  let questoesComImagem = 0;
  for (const [, imgs] of imagensPorQuestao.entries()) if (imgs.length > 0) questoesComImagem++;

  return {
    questoes,
    questoesComSublinhado: qSub,
    totalSublinhados: totalSub,
    questoesComNegrito: qNeg,
    totalNegritos: totalNeg,
    questoesComItalico: qIta,
    totalItalicos: totalIta,
    questoesComImagem,
    imagensPorQuestao,
    avisos,
    relatorio: { sublinhadosNoPdf: noPdf, sublinhadosSemDono: orfaos.length, orfaos },
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