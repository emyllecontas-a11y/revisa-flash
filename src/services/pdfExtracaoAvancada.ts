import { OPS } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';

/* ============================================================================================
 * Tipos públicos
 * ========================================================================================== */

export interface Sublinhado {
  pagina: number;
  x0: number;
  x1: number;
  y: number;
  espessuraPt: number;
  larguraPagina: number;
  alturaPagina: number;
  origem: 'desenho' | 'anotacao';
}

export interface ItemPos {
  str: string;
  x0: number;
  x1: number;
  yBase: number;
  tamanho: number;
  hasEOL: boolean;
  /** veio de fonte bold */
  bold: boolean;
  /** veio de fonte itálica */
  italic: boolean;
}

/** Intervalo sobre um texto (inicio/fim exclusivo). `trecho`/`antes` são opcionais para reancoragem. */
export interface Intervalo {
  inicio: number;
  fim: number;
  trecho?: string;
  antes?: string;
}

/** Compatibilidade com nome antigo. */
export type IntervaloSublinhado = Intervalo;

export interface LinhaPDF {
  pagina: number;
  texto: string;
  sublinhados: Intervalo[];
  negritos: Intervalo[];
  italicos: Intervalo[];
  x0: number;
  yBase: number;
  pos: number;
}

export interface ImagemExtraida {
  blob: Blob;
  mime: string;
  largura: number;
  altura: number;
  pagina: number;
  x: number;
  y: number;
  w: number;
  h: number;
  posGlobal: number;
  origem: 'raster' | 'vetorial';
  hash: string;
}

export interface OpcoesSublinhado {
  limiarPalavra?: number;
}

export interface OpcoesImagem {
  maxBytes?: number;
  margemSuperior?: number;
  margemInferior?: number;
  tamanhoMinimoPt?: number;
  larguraMaximaRel?: number;
}

export interface FaixaQuestao {
  numero: number;
  posInicio: number;
  posFim: number;
}

/* ============================================================================================
 * Matemática 2D e utilitários
 * ========================================================================================== */

type Mat = [number, number, number, number, number, number];
type Pt = [number, number];

const mul = (m1: Mat, m2: Mat): Mat => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];
const aplicar = (m: Mat, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

type Cv = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function criarCanvas(w: number, h: number): Cv {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
const ctx2d = (c: Cv) => c.getContext('2d') as Ctx;

function paraBlob(c: Cv, tipo: string, qualidade?: number): Promise<Blob | null> {
  if ('convertToBlob' in c) return (c as OffscreenCanvas).convertToBlob({ type: tipo, quality: qualidade }).catch(() => null);
  return new Promise((res) => (c as HTMLCanvasElement).toBlob((b) => res(b), tipo, qualidade));
}

/* ============================================================================================
 * Operator list (cache por página)
 * ========================================================================================== */

interface CaixaPath {
  x0: number; y0: number; x1: number; y1: number;
  paint: 'fill' | 'stroke' | 'both';
  traco: number;
  /** preenchimento (sem contorno) em branco/quase branco: fundo de linha de texto, não é figura */
  branco: boolean;
}
interface PinturaImagem {
  id: string | null;
  inline: any | null;
  x0: number; y0: number; x1: number; y1: number;
}

/** Aceita '#rrggbb' (pdf.js novo) ou [r,g,b] (0-255, pdf.js antigo). Cor desconhecida = NÃO branca. */
function corEhBranca(c: unknown): boolean {
  let r = -1, g = -1, b = -1;
  if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) {
    r = parseInt(c.slice(1, 3), 16); g = parseInt(c.slice(3, 5), 16); b = parseInt(c.slice(5, 7), 16);
  } else if (Array.isArray(c) && c.length >= 3) {
    [r, g, b] = c as number[];
  }
  return r >= 245 && g >= 245 && b >= 245;
}

const FILL_OPS = new Set<number>([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
const STROKE_OPS = new Set<number>([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
const tipoPaint = (op: number): 'fill' | 'stroke' | 'both' | null => {
  const f = FILL_OPS.has(op), s = STROKE_OPS.has(op);
  return f && s ? 'both' : f ? 'fill' : s ? 'stroke' : null;
};

function decodificarPath(args: any[]): { sub: Pt[][]; op: number | null } {
  const sub: Pt[][] = [];
  let cur: Pt[] | null = null;
  const mover = (x: number, y: number) => { cur = [[x, y]]; sub.push(cur); };
  const linha = (x: number, y: number) => { if (!cur) mover(x, y); else cur.push([x, y]); };

  if (typeof args[0] === 'number') {
    const d = args[1][0] as ArrayLike<number>;
    let i = 0;
    while (i < d.length) {
      const c = d[i++];
      if (c === 0) { mover(d[i], d[i + 1]); i += 2; }
      else if (c === 1) { linha(d[i], d[i + 1]); i += 2; }
      else if (c === 2) { linha(d[i + 4], d[i + 5]); i += 6; }
      else if (c === 3) { linha(d[i + 2], d[i + 3]); i += 4; }
      else if (c === 4) { /* closePath */ }
      else break;
    }
    return { sub, op: args[0] };
  }

  const ops: number[] = args[0];
  const co: ArrayLike<number> = args[1];
  let j = 0;
  for (const op of ops) {
    if (op === OPS.moveTo) { mover(co[j], co[j + 1]); j += 2; }
    else if (op === OPS.lineTo) { linha(co[j], co[j + 1]); j += 2; }
    else if (op === OPS.curveTo) { linha(co[j + 4], co[j + 5]); j += 6; }
    else if (op === OPS.curveTo2 || op === OPS.curveTo3) { linha(co[j + 2], co[j + 3]); j += 4; }
    else if (op === OPS.rectangle) {
      const [x, y, w, h] = [co[j], co[j + 1], co[j + 2], co[j + 3]];
      cur = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      sub.push(cur);
      j += 4;
    }
  }
  return { sub, op: null };
}

const _cachePercorrer = new WeakMap<PDFPageProxy, Promise<any>>();

async function percorrerPagina(page: PDFPageProxy): Promise<any> {
  const cached = _cachePercorrer.get(page);
  if (cached) return cached;

  const promessa = (async () => {
    const vp = page.getViewport({ scale: 1 });
    const vt = vp.transform as Mat;
    const { fnArray, argsArray } = await page.getOperatorList();

    let ctm: Mat = [1, 0, 0, 1, 0, 0];
    const pilha: Mat[] = [];
    const pilhaCor: boolean[] = [];
    let preenchimentoBranco = false;
    let lw = 1;
    let pendente: Pt[][] | null = null;
    const paths: CaixaPath[] = [];
    const imgs: PinturaImagem[] = [];

    const flush = (sub: Pt[][], paint: 'fill' | 'stroke' | 'both') => {
      const full = mul(vt, ctm);
      const esc = Math.sqrt(Math.abs(full[0] * full[3] - full[1] * full[2]));
      for (const s of sub) {
        if (!s.length) continue;
        const p = s.map(([x, y]) => aplicar(full, x, y));
        paths.push({
          x0: Math.min(...p.map((q) => q[0])), x1: Math.max(...p.map((q) => q[0])),
          y0: Math.min(...p.map((q) => q[1])), y1: Math.max(...p.map((q) => q[1])),
          paint, traco: lw * esc,
          branco: paint === 'fill' && preenchimentoBranco,
        });
      }
    };

    const caixaImagem = (): Omit<PinturaImagem, 'id' | 'inline'> => {
      const full = mul(vt, ctm);
      const c = [aplicar(full, 0, 0), aplicar(full, 1, 0), aplicar(full, 0, 1), aplicar(full, 1, 1)];
      return {
        x0: Math.min(...c.map((q) => q[0])), x1: Math.max(...c.map((q) => q[0])),
        y0: Math.min(...c.map((q) => q[1])), y1: Math.max(...c.map((q) => q[1])),
      };
    };

    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      const args: any = argsArray[i];

      if (fn === OPS.save) { pilha.push([...ctm] as Mat); pilhaCor.push(preenchimentoBranco); }
      else if (fn === OPS.restore) { ctm = pilha.pop() ?? ctm; preenchimentoBranco = pilhaCor.pop() ?? preenchimentoBranco; }
      else if (fn === OPS.setFillRGBColor) preenchimentoBranco = corEhBranca(args?.length >= 3 ? args : args?.[0]);
      else if (fn === OPS.setFillGray) preenchimentoBranco = typeof args?.[0] === 'number' && args[0] >= 245;
      else if (fn === OPS.setFillColorN || fn === OPS.setFillColorSpace || fn === OPS.setFillColor || fn === OPS.setFillCMYKColor) preenchimentoBranco = false;
      else if (fn === OPS.transform) ctm = mul(ctm, args as Mat);
      else if (fn === OPS.paintFormXObjectBegin) { pilha.push([...ctm] as Mat); if (args?.[0]) ctm = mul(ctm, args[0] as Mat); }
      else if (fn === OPS.paintFormXObjectEnd) ctm = pilha.pop() ?? ctm;
      else if (fn === OPS.setLineWidth) lw = args[0];
      else if (fn === OPS.constructPath) {
        const { sub, op } = decodificarPath(args);
        if (op !== null) { const t = tipoPaint(op); if (t) flush(sub, t); pendente = null; }
        else pendente = sub;
      } else if (FILL_OPS.has(fn) || STROKE_OPS.has(fn)) {
        if (pendente) { flush(pendente, tipoPaint(fn)!); pendente = null; }
      } else if (fn === OPS.endPath) pendente = null;
      else if (fn === OPS.paintImageXObject) imgs.push({ id: args[0], inline: null, ...caixaImagem() });
      else if (fn === OPS.paintInlineImageXObject) imgs.push({ id: null, inline: args[0], ...caixaImagem() });
    }
    return { vp, paths, imgs };
  })();

  _cachePercorrer.set(page, promessa);
  return promessa;
}

/* ============================================================================================
 * 1. SUBLINHADO
 * ========================================================================================== */

export async function extrairSublinhados(page: PDFPageProxy): Promise<Sublinhado[]> {
  const { vp, paths } = await percorrerPagina(page);
  const W = vp.width, H = vp.height;
  const brutos: { x0: number; x1: number; y: number; esp: number }[] = [];

  for (const p of paths) {
    const w = p.x1 - p.x0, h = p.y1 - p.y0;
    if (w < 2 || w > W * 0.9) continue;
    if (p.paint === 'fill' && h <= 2.5 && w / Math.max(h, 0.01) >= 3) {
      brutos.push({ x0: p.x0, x1: p.x1, y: (p.y0 + p.y1) / 2, esp: Math.max(h, 0.3) });
    } else if (p.paint === 'stroke' && h <= 0.8 && p.traco <= 2.5) {
      brutos.push({ x0: p.x0, x1: p.x1, y: (p.y0 + p.y1) / 2, esp: Math.max(p.traco, 0.3) });
    }
  }

  brutos.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const unidos: typeof brutos = [];
  for (const s of brutos) {
    const u = unidos[unidos.length - 1];
    if (u && Math.abs(u.y - s.y) <= 0.8 && s.x0 - u.x1 <= 1.5) {
      u.x1 = Math.max(u.x1, s.x1);
      u.esp = Math.max(u.esp, s.esp);
    } else unidos.push({ ...s });
  }

  const saida: Sublinhado[] = unidos.map((u) => ({
    pagina: page.pageNumber, x0: u.x0 / W, x1: u.x1 / W, y: u.y / H, espessuraPt: u.esp,
    larguraPagina: W, alturaPagina: H, origem: 'desenho',
  }));

  try {
    const anots: any[] = await page.getAnnotations({ intent: 'display' });
    for (const a of anots) {
      if (a.annotationType !== 9 || !a.rect) continue;
      const [ax0, ay0, ax1, ay1] = vp.convertToViewportRectangle(a.rect);
      saida.push({
        pagina: page.pageNumber, x0: Math.min(ax0, ax1) / W, x1: Math.max(ax0, ax1) / W,
        y: Math.max(ay0, ay1) / H, espessuraPt: 1, larguraPagina: W, alturaPagina: H, origem: 'anotacao',
      });
    }
  } catch { /* sem anotações */ }

  return saida;
}

/** Aguarda a fonte estar carregada (ou devolve null se timeout). */
function aguardarFonte(page: PDFPageProxy, nome: string, timeoutMs = 3000): Promise<any | null> {
  try {
    if (page.commonObjs.has(nome)) return Promise.resolve(page.commonObjs.get(nome));
  } catch { /* cai no async */ }

  return new Promise((res) => {
    const t = setTimeout(() => res(null), timeoutMs);
    try {
      page.commonObjs.get(nome, (font: any) => {
        clearTimeout(t);
        res(font ?? null);
      });
    } catch {
      clearTimeout(t);
      res(null);
    }
  });
}

export async function extrairItensTexto(page: PDFPageProxy): Promise<ItemPos[]> {
  const vp = page.getViewport({ scale: 1 });
  const vt = vp.transform as Mat;
  const tc = await page.getTextContent();

  // 1) Coleta nomes únicos de fonte nesta página
  const nomesFontes = new Set<string>();
  for (const it of tc.items as any[]) {
    if ('str' in it && it.str && it.fontName) nomesFontes.add(it.fontName);
  }

  // 2) Carrega metadados de cada fonte (bold/italic)
  const metaFonte = new Map<string, { bold: boolean; italic: boolean }>();
  for (const nome of nomesFontes) {
    const info = await aguardarFonte(page, nome);
    const nomeLower = String(info?.name || '').toLowerCase();
    const bold = !!info?.bold || /bold|\bbd\b|black|heavy|semibold/i.test(nomeLower);
    const italic = !!info?.italic || /italic|oblique|\bit\b|ital/i.test(nomeLower);
    metaFonte.set(nome, { bold, italic });
  }

  // 3) Monta os itens com as flags
  const itens: ItemPos[] = [];
  for (const it of tc.items as any[]) {
    if (!('str' in it) || it.str === '') continue;
    const t = mul(vt, it.transform as Mat);
    const tam = Math.hypot(t[2], t[3]);
    if (tam <= 0) continue;

    const meta = metaFonte.get(it.fontName) || { bold: false, italic: false };
    itens.push({
      str: it.str,
      x0: t[4],
      x1: t[4] + it.width,
      yBase: t[5],
      tamanho: tam,
      hasEOL: !!it.hasEOL,
      bold: meta.bold,
      italic: meta.italic,
    });
  }
  return itens;
}

let _ctxMedida: Ctx | null = null;
function medir(texto: string, tam: number): number {
  if (!_ctxMedida) _ctxMedida = ctx2d(criarCanvas(1, 1));
  _ctxMedida.font = `${tam}px sans-serif`;
  return _ctxMedida.measureText(texto).width;
}

function fracoes(item: ItemPos): number[] {
  const n = item.str.length;
  const total = medir(item.str, item.tamanho);
  const f: number[] = [];
  for (let i = 0; i <= n; i++) f.push(total > 0 ? medir(item.str.slice(0, i), item.tamanho) / total : i / n);
  return f;
}

function coberturaDoItem(item: ItemPos, subs: Sublinhado[]): boolean[] {
  const n = item.str.length;
  const cob = new Array<boolean>(n).fill(false);
  const intervalos: Pt[] = [];
  for (const s of subs) {
    const uy = s.y * s.alturaPagina;
    const dy = uy - item.yBase;
    if (dy < -0.12 * item.tamanho || dy > 0.5 * item.tamanho) continue;
    if (s.espessuraPt > 0.15 * item.tamanho + 0.5) continue;
    const a = Math.max(s.x0 * s.larguraPagina, item.x0);
    const b = Math.min(s.x1 * s.larguraPagina, item.x1);
    if (b - a > 0.5) intervalos.push([a, b]);
  }
  if (!intervalos.length) return cob;
  const f = fracoes(item);
  const larg = item.x1 - item.x0;
  for (let i = 0; i < n; i++) {
    const cx = item.x0 + ((f[i] + f[i + 1]) / 2) * larg;
    if (intervalos.some(([a, b]) => cx >= a && cx <= b)) cob[i] = true;
  }
  return cob;
}

function agruparEmLinhas(itens: ItemPos[]): ItemPos[][] {
  const linhas: ItemPos[][] = [];
  let atual: ItemPos[] = [];
  for (const it of itens) {
    const ult = atual[atual.length - 1];
    if (ult && Math.abs(it.yBase - ult.yBase) > 0.4 * Math.max(it.tamanho, ult.tamanho)) {
      linhas.push(atual);
      atual = [];
    }
    atual.push(it);
    if (it.hasEOL) { linhas.push(atual); atual = []; }
  }
  if (atual.length) linhas.push(atual);
  return linhas;
}

/** Converte uma máscara booleana (alinhada ao texto) em intervalos {inicio, fim}. */
function runsParaIntervalos(texto: string, cob: boolean[]): Intervalo[] {
  const out: Intervalo[] = [];
  let i = 0;
  while (i < texto.length) {
    if (!cob[i]) { i++; continue; }
    let j = i;
    while (j < texto.length && cob[j]) j++;
    let ini = i, fim = j;
    while (ini < fim && /\s/.test(texto[ini])) ini++;
    while (fim > ini && /\s/.test(texto[fim - 1])) fim--;
    if (fim > ini) {
      out.push({
        inicio: ini,
        fim,
        trecho: texto.slice(ini, fim),
        antes: texto.slice(Math.max(0, ini - 8), ini),
      });
    }
    i = j;
  }
  return out;
}

export function construirLinhas(
  pagina: number, itens: ItemPos[], subs: Sublinhado[], opc: OpcoesSublinhado = {},
): LinhaPDF[] {
  const limiar = opc.limiarPalavra ?? 0.6;
  const W = subs[0]?.larguraPagina ?? Math.max(1, ...itens.map((i) => i.x1));
  const H = subs[0]?.alturaPagina ?? Math.max(1, ...itens.map((i) => i.yBase));
  const resultado: LinhaPDF[] = [];

  for (const grupo of agruparEmLinhas(itens)) {
    let texto = '';
    const cob: boolean[] = [];
    const cobBold: boolean[] = [];
    const cobItal: boolean[] = [];
    let prev: ItemPos | null = null;

    for (const it of grupo) {
      if (prev && it.x0 - prev.x1 > 0.12 * it.tamanho && !/\s$/.test(prev.str) && !/^\s/.test(it.str)) {
        texto += ' ';
        cob.push(false);
        cobBold.push(false);
        cobItal.push(false);
      }
      texto += it.str;
      cob.push(...coberturaDoItem(it, subs));
      for (let k = 0; k < it.str.length; k++) {
        cobBold.push(it.bold);
        cobItal.push(it.italic);
      }
      prev = it;
    }

    // Estende sublinhado para palavra inteira quando >= limiar
    if (limiar < 1) {
      for (const m of texto.matchAll(/[\p{L}\p{N}]+/gu)) {
        const ini = m.index!, fim = ini + m[0].length;
        let c = 0;
        for (let i = ini; i < fim; i++) if (cob[i]) c++;
        if (c > 0 && c / (fim - ini) >= limiar) for (let i = ini; i < fim; i++) cob[i] = true;
      }
    }
    // Espaços entre dois trechos sublinhados também ficam sublinhados
    for (let i = 0; i < texto.length; i++) {
      if (!cob[i] && /\s/.test(texto[i])) {
        let l = i - 1, r = i + 1;
        while (l >= 0 && /\s/.test(texto[l])) l--;
        while (r < texto.length && /\s/.test(texto[r])) r++;
        if (l >= 0 && r < texto.length && cob[l] && cob[r]) cob[i] = true;
      }
    }

    const sublinhados = runsParaIntervalos(texto, cob);
    const negritos = runsParaIntervalos(texto, cobBold);
    const italicos = runsParaIntervalos(texto, cobItal);

    const y = grupo[0].yBase / H;
    resultado.push({
      pagina, texto, sublinhados, negritos, italicos,
      x0: grupo[0].x0 / W, yBase: y, pos: pagina - 1 + y,
    });
  }
  return resultado;
}

export async function extrairLinhas(page: PDFPageProxy, opc: OpcoesSublinhado = {}): Promise<LinhaPDF[]> {
  const [itens, subs] = await Promise.all([extrairItensTexto(page), extrairSublinhados(page)]);
  return construirLinhas(page.pageNumber, itens, subs, opc);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Devolve cada linha com marcação. Útil para depurar ou se preferir guardar texto marcado.
 * Para persistir, prefira texto puro + intervalos em campos separados (veja montarTextoDeLinhas).
 */
export function aplicarSublinhadosNoTexto(
  itens: ItemPos[], sublinhados: Sublinhado[], formato: 'html' | 'md' | 'texto' = 'html',
  opc: OpcoesSublinhado = {},
): string[] {
  const linhas = construirLinhas(1, itens, sublinhados, opc);
  return linhas.map((l) => marcar(l.texto, l.sublinhados, formato));
}

export function marcar(texto: string, subs: { inicio: number; fim: number }[], formato: 'html' | 'md' | 'texto' = 'html'): string {
  if (formato === 'texto') return texto;
  let out = '', cursor = 0;
  for (const s of [...subs].sort((a, b) => a.inicio - b.inicio)) {
    const [abre, fecha] = formato === 'html' ? ['<u>', '</u>'] : ['__', '__'];
    const pre = texto.slice(cursor, s.inicio), mid = texto.slice(s.inicio, s.fim);
    out += (formato === 'html' ? esc(pre) : pre) + abre + (formato === 'html' ? esc(mid) : mid) + fecha;
    cursor = s.fim;
  }
  const resto = texto.slice(cursor);
  return out + (formato === 'html' ? esc(resto) : resto);
}

/**
 * Renderiza texto aplicando sublinhado, negrito e itálico ao mesmo tempo.
 * Aplicado em runs contíguos para não poluir o HTML com tags repetidas.
 */
export function marcarCompleto(
  texto: string,
  sublinhados: Intervalo[] = [],
  negritos: Intervalo[] = [],
  italicos: Intervalo[] = [],
  formato: 'html' | 'md' = 'html',
): string {
  if (sublinhados.length + negritos.length + italicos.length === 0) {
    return formato === 'html' ? esc(texto) : texto;
  }

  const n = texto.length;
  const mask = new Uint8Array(n);
  // bit 1 = sublinhado, bit 2 = negrito, bit 4 = itálico
  for (const s of sublinhados) {
    const a = Math.max(0, s.inicio), b = Math.min(n, s.fim);
    for (let i = a; i < b; i++) mask[i] |= 1;
  }
  for (const s of negritos) {
    const a = Math.max(0, s.inicio), b = Math.min(n, s.fim);
    for (let i = a; i < b; i++) mask[i] |= 2;
  }
  for (const s of italicos) {
    const a = Math.max(0, s.inicio), b = Math.min(n, s.fim);
    for (let i = a; i < b; i++) mask[i] |= 4;
  }

  const [uA, uF] = formato === 'html' ? ['<u>', '</u>'] : ['__', '__'];
  const [bA, bF] = formato === 'html' ? ['<b>', '</b>'] : ['**', '**'];
  const [iA, iF] = formato === 'html' ? ['<i>', '</i>'] : ['*', '*'];

  let out = '';
  let i = 0;
  while (i < n) {
    const m = mask[i];
    let j = i;
    while (j < n && mask[j] === m) j++;
    const trecho = texto.slice(i, j);
    const trechoEsc = formato === 'html' ? esc(trecho) : trecho;
    if (m === 0) {
      out += trechoEsc;
    } else {
      let node = trechoEsc;
      if (m & 1) node = uA + node + uF;
      if (m & 2) node = bA + node + bF;
      if (m & 4) node = iA + node + iF;
      out += node;
    }
    i = j;
  }
  return out;
}

export function montarTextoDeLinhas(
  linhas: LinhaPDF[],
  separador = '\n',
): {
  texto: string;
  sublinhados: Intervalo[];
  negritos: Intervalo[];
  italicos: Intervalo[];
} {
  let texto = '';
  const sublinhados: Intervalo[] = [];
  const negritos: Intervalo[] = [];
  const italicos: Intervalo[] = [];

  linhas.forEach((l, idx) => {
    if (idx > 0) texto += separador;
    const base = texto.length;
    for (const s of l.sublinhados) sublinhados.push({ ...s, inicio: base + s.inicio, fim: base + s.fim });
    for (const n of l.negritos) negritos.push({ ...n, inicio: base + n.inicio, fim: base + n.fim });
    for (const i of l.italicos) italicos.push({ ...i, inicio: base + i.inicio, fim: base + i.fim });
    texto += l.texto;
  });

  return { texto, sublinhados, negritos, italicos };
}

/** Recorta [ini, fim) de um texto maior e rebaseia os intervalos. */
export function recortarSublinhados(subs: Intervalo[], ini: number, fim: number): Intervalo[] {
  return subs
    .filter((s) => s.fim > ini && s.inicio < fim)
    .map((s) => ({ ...s, inicio: Math.max(s.inicio, ini) - ini, fim: Math.min(s.fim, fim) - ini }));
}

/**
 * Reencontra cada trecho no texto final usando `antes + trecho` e a proximidade do offset original.
 * Intervalos sem `trecho` são ignorados.
 */
export function reancorarSublinhados(
  textoFinal: string, subs: Intervalo[], deslocamentoEsperado = 0,
): Intervalo[] {
  const out: Intervalo[] = [];
  for (const s of subs) {
    if (!s.trecho) continue;
    const alvo = s.inicio + deslocamentoEsperado;
    const buscar = (padrao: string, comp: number) => {
      let melhor = -1, dist = Infinity, i = textoFinal.indexOf(padrao);
      while (i >= 0) {
        const d = Math.abs(i + comp - alvo);
        if (d < dist) { dist = d; melhor = i + comp; }
        i = textoFinal.indexOf(padrao, i + 1);
      }
      return melhor;
    };
    let ini = s.antes ? buscar(s.antes + s.trecho, s.antes.length) : -1;
    if (ini < 0) ini = buscar(s.trecho, 0);
    if (ini >= 0) out.push({ ...s, inicio: ini, fim: ini + s.trecho.length });
  }
  return out;
}

/* ============================================================================================
 * 2. IMAGENS
 * ========================================================================================== */

const DEF_IMG: Required<OpcoesImagem> = {
  maxBytes: 2 * 1024 * 1024,
  margemSuperior: 0.09,
  margemInferior: 0.91,
  tamanhoMinimoPt: 40,
  larguraMaximaRel: 0.95,
};

function obterObjeto(page: PDFPageProxy, id: string): Promise<any | null> {
  const store: any = id.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise((res) => {
    const t = setTimeout(() => res(null), 4000);
    try { store.get(id, (o: any) => { clearTimeout(t); res(o ?? null); }); }
    catch { clearTimeout(t); res(null); }
  });
}

function imagemParaCanvas(img: any): { canvas: Cv; temAlpha: boolean } | null {
  let canvas: Cv;
  if (img.bitmap) {
    canvas = criarCanvas(img.bitmap.width, img.bitmap.height);
    ctx2d(canvas).drawImage(img.bitmap, 0, 0);
  } else if (img.data && img.width && img.height) {
    const { width: w, height: h, data, kind } = img;
    const rgba = new Uint8ClampedArray(w * h * 4);
    if (kind === 3) rgba.set(data.subarray ? data.subarray(0, w * h * 4) : data);
    else if (kind === 2) {
      for (let i = 0, j = 0; i < w * h * 3; i += 3, j += 4) { rgba[j] = data[i]; rgba[j + 1] = data[i + 1]; rgba[j + 2] = data[i + 2]; rgba[j + 3] = 255; }
    } else if (kind === 1) {
      const rowBytes = (w + 7) >> 3;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0, j = (y * w + x) * 4;
        rgba[j] = rgba[j + 1] = rgba[j + 2] = v; rgba[j + 3] = 255;
      }
    } else return null;
    canvas = criarCanvas(w, h);
    ctx2d(canvas).putImageData(new ImageData(rgba, w, h), 0, 0);
  } else return null;

  const d = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
  let temAlpha = false;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { temAlpha = true; break; }
  return { canvas, temAlpha };
}

function redimensionar(c: Cv, fator: number): Cv {
  const n = criarCanvas(Math.max(1, Math.round(c.width * fator)), Math.max(1, Math.round(c.height * fator)));
  const x = ctx2d(n);
  x.imageSmoothingQuality = 'high';
  x.drawImage(c as any, 0, 0, n.width, n.height);
  return n;
}

async function codificar(canvas: Cv, temAlpha: boolean, maxBytes: number) {
  let fator = 1, qualidade = 0.9;
  let tipo = temAlpha ? 'image/png' : 'image/webp';
  for (let t = 0; t < 14; t++) {
    const c = fator === 1 ? canvas : redimensionar(canvas, fator);
    let blob = await paraBlob(c, tipo, qualidade);
    if (blob && tipo === 'image/webp' && blob.type !== 'image/webp') { tipo = 'image/jpeg'; blob = await paraBlob(c, tipo, qualidade); }
    if (blob && blob.size <= maxBytes) return { blob, largura: c.width, altura: c.height };
    if (!temAlpha && qualidade > 0.55) qualidade -= 0.1; else fator *= 0.8;
  }
  return null;
}

function ahash(c: Cv): string {
  const p = criarCanvas(8, 8);
  const x = ctx2d(p);
  x.fillStyle = '#fff'; x.fillRect(0, 0, 8, 8);
  x.drawImage(c as any, 0, 0, 8, 8);
  const d = x.getImageData(0, 0, 8, 8).data;
  const g: number[] = [];
  for (let i = 0; i < 64; i++) g.push(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
  const m = g.reduce((a, b) => a + b, 0) / 64;
  let bits = g.map((v) => (v >= m ? '1' : '0')).join('');
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export async function extrairImagens(page: PDFPageProxy, opc: OpcoesImagem = {}): Promise<ImagemExtraida[]> {
  const o = { ...DEF_IMG, ...opc };
  const { vp, imgs } = await percorrerPagina(page);
  const W = vp.width, H = vp.height;
  const saida: ImagemExtraida[] = [];
  const vistos = new Set<string>();

  for (const im of imgs) {
    const wPt = im.x1 - im.x0, hPt = im.y1 - im.y0;
    const cy = (im.y0 + im.y1) / 2 / H;
    if (wPt < o.tamanhoMinimoPt || hPt < o.tamanhoMinimoPt) continue;
    if (wPt / W > o.larguraMaximaRel) continue;
    if (cy < o.margemSuperior || cy > o.margemInferior) continue;
    const chave = `${im.id}|${Math.round(im.x0)}|${Math.round(im.y0)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    const dados = im.inline ?? (im.id ? await obterObjeto(page, im.id) : null);
    if (!dados) continue;
    const conv = imagemParaCanvas(dados);
    if (!conv || conv.canvas.width < 16 || conv.canvas.height < 16) continue;
    const enc = await codificar(conv.canvas, conv.temAlpha, o.maxBytes);
    if (!enc) continue;

    saida.push({
      blob: enc.blob, mime: enc.blob.type, largura: enc.largura, altura: enc.altura,
      pagina: page.pageNumber, x: im.x0 / W, y: im.y0 / H, w: wPt / W, h: hPt / H,
      posGlobal: page.pageNumber - 1 + cy, origem: 'raster', hash: ahash(conv.canvas),
    });
  }
  return saida;
}

export function removerDecorativas(imagens: ImagemExtraida[], minPaginas = 3): ImagemExtraida[] {
  const paginasPorHash = new Map<string, Set<number>>();
  for (const i of imagens) {
    if (!paginasPorHash.has(i.hash)) paginasPorHash.set(i.hash, new Set());
    paginasPorHash.get(i.hash)!.add(i.pagina);
  }
  return imagens.filter((i) => paginasPorHash.get(i.hash)!.size < minPaginas);
}

export function associarImagemAQuestao(
  imagens: ImagemExtraida[], questoes: FaixaQuestao[],
): Map<number, ImagemExtraida[]> {
  const mapa = new Map<number, ImagemExtraida[]>();
  if (!questoes.length) return mapa;
  const ordenadas = [...questoes].sort((a, b) => a.posInicio - b.posInicio);

  const porHash = new Map<string, ImagemExtraida[]>();
  for (const img of imagens) {
    if (!porHash.has(img.hash)) porHash.set(img.hash, []);
    porHash.get(img.hash)!.push(img);
  }

  for (const grupo of porHash.values()) {
    const ordenado = [...grupo].sort((a, b) => a.posGlobal - b.posGlobal);
    let escolhida: { img: ImagemExtraida; alvo: FaixaQuestao } | null = null;
    for (const img of ordenado) {
      const alvo = ordenadas.find(
        (q) => img.posGlobal >= q.posInicio && img.posGlobal < q.posFim
      );
      if (alvo) { escolhida = { img, alvo }; break; }
    }
    if (!escolhida) continue;
    const { img, alvo } = escolhida;
    if (!mapa.has(alvo.numero)) mapa.set(alvo.numero, []);
    mapa.get(alvo.numero)!.push(img);
  }

  return mapa;
}

export function nomeArquivoImagem(numeroQuestao: number, indice: number, mime: string, prefixo = 'q'): string {
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  return `${prefixo}${numeroQuestao}-${indice + 1}.${ext}`;
}

/* ============================================================================================
 * 3. FIGURAS VETORIAIS
 * ========================================================================================== */

export async function renderizarRegiao(
  page: PDFPageProxy, caixa: { x: number; y: number; w: number; h: number }, escala = 1.5,
): Promise<{ blob: Blob; largura: number; altura: number } | null> {
  const vp = page.getViewport({ scale: escala });
  const rx = caixa.x * vp.width, ry = caixa.y * vp.height;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(caixa.w * vp.width));
  c.height = Math.max(1, Math.ceil(caixa.h * vp.height));
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: x, canvas: c, viewport: vp, transform: [1, 0, 0, 1, -rx, -ry] } as any).promise;
  const enc = await codificar(c, false, DEF_IMG.maxBytes);
  return enc ? { blob: enc.blob, largura: enc.largura, altura: enc.altura } : null;
}

/**
 * OTIMIZADO: renderiza a página UMA VEZ por página e recorta cada região do mesmo canvas.
 * Escala padrão 1.5 (~5x mais rápido que renderizar por região com escala 2).
 */
export async function extrairRegioesVetoriais(
  page: PDFPageProxy,
  opc: OpcoesImagem & {
    minPaths?: number;
    areaMinimaRel?: number;
    escala?: number;
    minLadoRel?: number;
  } = {},
): Promise<ImagemExtraida[]> {
  const o = {
    ...DEF_IMG,
    minPaths: 15,
    areaMinimaRel: 0.02,
    escala: 1.5,
    minLadoRel: 0.06,
    ...opc,
  };
  const { vp, paths } = await percorrerPagina(page);
  const W = vp.width, H = vp.height, PAD = 8;

  let caixas = paths
    .filter((p) => !p.branco)
    .filter((p) => !((p.y1 - p.y0) <= 2.5 && (p.x1 - p.x0) / Math.max(p.y1 - p.y0, 0.01) >= 3))
    .filter((p) => (p.x1 - p.x0) < W * o.larguraMaximaRel)
    .filter((p) => { const cy = (p.y0 + p.y1) / 2 / H; return cy > o.margemSuperior && cy < o.margemInferior; })
    .map((p) => ({ x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, n: 1 }));

  let mudou = true;
  while (mudou) {
    mudou = false;
    const sobra: typeof caixas = [];
    for (const c of caixas) {
      const alvo = sobra.find(
        (s) => c.x0 <= s.x1 + PAD && c.x1 >= s.x0 - PAD && c.y0 <= s.y1 + PAD && c.y1 >= s.y0 - PAD
      );
      if (alvo) {
        alvo.x0 = Math.min(alvo.x0, c.x0); alvo.y0 = Math.min(alvo.y0, c.y0);
        alvo.x1 = Math.max(alvo.x1, c.x1); alvo.y1 = Math.max(alvo.y1, c.y1); alvo.n += c.n;
        mudou = true;
      } else sobra.push({ ...c });
    }
    caixas = sobra;
  }

  const validas = caixas.filter((c) => {
    const wPx = c.x1 - c.x0, hPx = c.y1 - c.y0;
    const area = (wPx * hPx) / (W * H);
    if (c.n < o.minPaths || area < o.areaMinimaRel) return false;
    if (Math.min(wPx / W, hPx / H) < o.minLadoRel) return false;
    if (wPx / W > 0.9 && hPx / H < 0.08) return false;
    return true;
  });

  if (validas.length === 0) return [];

  const escala = o.escala;
  const vpRender = page.getViewport({ scale: escala });
  const full = document.createElement('canvas');
  full.width = Math.ceil(vpRender.width);
  full.height = Math.ceil(vpRender.height);
  const ctxFull = full.getContext('2d')!;
  ctxFull.fillStyle = '#fff';
  ctxFull.fillRect(0, 0, full.width, full.height);
  await page.render({ canvasContext: ctxFull, canvas: full, viewport: vpRender } as any).promise;

  const saida: ImagemExtraida[] = [];
  for (const c of validas) {
    const xPt = Math.max(0, c.x0 - PAD);
    const yPt = Math.max(0, c.y0 - PAD);
    const xEndPt = Math.min(W, c.x1 + PAD);
    const yEndPt = Math.min(H, c.y1 + PAD);

    const rx = Math.round(xPt * escala);
    const ry = Math.round(yPt * escala);
    const rw = Math.round((xEndPt - xPt) * escala);
    const rh = Math.round((yEndPt - yPt) * escala);

    const cx = Math.max(0, Math.min(full.width - 1, rx));
    const cy = Math.max(0, Math.min(full.height - 1, ry));
    const cw = Math.max(1, Math.min(full.width - cx, rw));
    const ch = Math.max(1, Math.min(full.height - cy, rh));

    const crop = criarCanvas(cw, ch);
    const cctx = ctx2d(crop);
    cctx.fillStyle = '#fff';
    cctx.fillRect(0, 0, cw, ch);
    cctx.drawImage(full as any, cx, cy, cw, ch, 0, 0, cw, ch);

    const enc = await codificar(crop, false, DEF_IMG.maxBytes);
    if (!enc) continue;
    const bmp = await createImageBitmap(enc.blob);
    const cvH = criarCanvas(bmp.width, bmp.height);
    ctx2d(cvH).drawImage(bmp, 0, 0);

    saida.push({
      blob: enc.blob, mime: enc.blob.type, largura: enc.largura, altura: enc.altura,
      pagina: page.pageNumber,
      x: xPt / W, y: yPt / H,
      w: (xEndPt - xPt) / W, h: (yEndPt - yPt) / H,
      posGlobal: page.pageNumber - 1 + (c.y0 + c.y1) / 2 / H,
      origem: 'vetorial', hash: ahash(cvH),
    });
  }
  return saida;
}

/* ============================================================================================
 * 4. MERGE DE TABELAS CORTADAS ENTRE PÁGINAS
 * ========================================================================================== */

async function juntarVerticais(
  a: ImagemExtraida, b: ImagemExtraida, gapPx: number,
): Promise<ImagemExtraida> {
  const [bmpA, bmpB] = await Promise.all([
    createImageBitmap(a.blob),
    createImageBitmap(b.blob),
  ]);
  const largura = Math.max(bmpA.width, bmpB.width);
  const altura = bmpA.height + gapPx + bmpB.height;
  const canvas = criarCanvas(largura, altura);
  const ctx = ctx2d(canvas);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, largura, altura);

  const ax = Math.floor((largura - bmpA.width) / 2);
  const bx = Math.floor((largura - bmpB.width) / 2);
  ctx.drawImage(bmpA, ax, 0);
  ctx.drawImage(bmpB, bx, bmpA.height + gapPx);

  const enc = await codificar(canvas, false, DEF_IMG.maxBytes);
  if (!enc) throw new Error('falha ao codificar imagem juntada');

  return {
    blob: enc.blob, mime: enc.blob.type, largura: enc.largura, altura: enc.altura,
    pagina: a.pagina,
    x: Math.min(a.x, b.x),
    y: a.y,
    w: Math.max(a.w, b.w),
    h: a.h + b.h,
    posGlobal: a.posGlobal,
    origem: 'vetorial',
    hash: ahash(canvas),
  };
}

/**
 * Junta tabelas/figuras vetoriais que foram cortadas entre duas páginas:
 *   - a região A termina perto do fim da página (`y + h > 0.88`)
 *   - existe uma região B na página seguinte que começa perto do topo (`y < 0.12`)
 *   - x e w alinhados (diferença < 0.06)
 */
export async function mergeRegioesVetoriaisEntrePaginas(
  imagens: ImagemExtraida[],
  opc: { gapPx?: number; proximidadeRel?: number } = {},
): Promise<ImagemExtraida[]> {
  const gapPx = opc.gapPx ?? 8;
  const proximidade = opc.proximidadeRel ?? 0.06;

  const vetoriais = imagens.filter((i) => i.origem === 'vetorial');
  const outras = imagens.filter((i) => i.origem !== 'vetorial');

  const porPagina = new Map<number, ImagemExtraida[]>();
  for (const v of vetoriais) {
    if (!porPagina.has(v.pagina)) porPagina.set(v.pagina, []);
    porPagina.get(v.pagina)!.push(v);
  }
  for (const arr of porPagina.values()) arr.sort((a, b) => a.y - b.y);

  const consumidas = new Set<ImagemExtraida>();
  const resultado: ImagemExtraida[] = [];

  const paginas = [...porPagina.keys()].sort((a, b) => a - b);
  for (const pagina of paginas) {
    const arr = porPagina.get(pagina)!;
    for (const a of arr) {
      if (consumidas.has(a)) continue;

      const terminaEmBaixo = a.y + a.h > 0.88;
      if (!terminaEmBaixo) {
        resultado.push(a);
        consumidas.add(a);
        continue;
      }

      const prox = porPagina.get(pagina + 1) || [];
      const b = prox.find(
        (c) =>
          !consumidas.has(c) &&
          c.y < 0.12 &&
          Math.abs(c.x - a.x) < proximidade &&
          Math.abs(c.w - a.w) < proximidade
      );

      if (!b) {
        resultado.push(a);
        consumidas.add(a);
        continue;
      }

      try {
        const merged = await juntarVerticais(a, b, gapPx);
        resultado.push(merged);
        consumidas.add(a);
        consumidas.add(b);
      } catch (e) {
        console.warn('[mergeRegioesVetoriais] falha ao juntar:', e);
        resultado.push(a);
        consumidas.add(a);
      }
    }
  }

  return [...outras, ...resultado];
}