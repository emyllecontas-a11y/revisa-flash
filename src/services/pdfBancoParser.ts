// src/services/pdfBancoParser.ts
import { pdfjs } from 'react-pdf';
import { setupPdfWorker } from '@/lib/pdfWorker';

setupPdfWorker();

export interface AlternativaParsed {
  letra: string;
  texto: string;
  correta: boolean;
}

export interface QuestaoParsed {
  banca: string;
  ano: number | null;
  concurso: string | null;
  cargo: string | null;
  disciplina: string;
  assunto: string | null;
  subassunto: string | null;
  tipo_questao: 'multipla_escolha' | 'certo_errado';
  enunciado: string;
  alternativas: AlternativaParsed[] | null;
  gabarito_letra: string | null;
  gabarito_ce: boolean | null;
  comentario: string | null;
  imagem_url: string | null;
  hash_dedup: string;
  url_origem: string | null;
  arquivo_origem: string | null;
  __numero: number | null;
  __warnings: string[];
  __nome_imagem: string | null;
}

export interface ParseResultado {
  success: boolean;
  questoes?: QuestaoParsed[];
  erro?: string;
}

export async function extrairQuestoesDePdf(file: File, arquivoNome?: string): Promise<ParseResultado> {
  try {
    const texto = await extrairTextoBruto(file);
    if (!texto.trim()) return { success: false, erro: 'PDF sem texto extraível.' };
    const nome = arquivoNome || file.name || 'importado.pdf';
    const questoes = parseTexto(texto, nome);
    if (questoes.length === 0) return { success: false, erro: 'Nenhuma questão identificada.' };
    return { success: true, questoes };
  } catch (e: any) {
    console.error('[pdfBancoParser] Erro:', e);
    return { success: false, erro: e?.message || 'Erro ao ler o PDF.' };
  }
}

export async function extrairTextoBruto(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
  const paginas: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    paginas.push(reconstruirTexto(content));
  }
  return paginas.join('\n\n');
}

function reconstruirTexto(content: any): string {
  const items: any[] = (content.items || []).filter((it: any) => typeof it.str === 'string' && it.str.length > 0);
  if (items.length === 0) return '';

  const Y_TOL = 3;
  const linhas: { y: number; items: { x: number; str: string; w: number }[] }[] = [];

  for (const it of items) {
    const y = it.transform[5];
    const x = it.transform[4];
    const w = it.width || 0;
    let linha = linhas.find((l) => Math.abs(l.y - y) <= Y_TOL);
    if (!linha) {
      linha = { y, items: [] };
      linhas.push(linha);
    }
    linha.items.push({ x, str: it.str, w });
  }

  linhas.sort((a, b) => b.y - a.y);
  for (const l of linhas) l.items.sort((a, b) => a.x - b.x);

  return linhas.map((l) => {
      let out = '';
      let prevX = -Infinity;
      let prevW = 0;
      for (const item of l.items) {
        const gap = item.x - (prevX + prevW);
        const precisaEspaco = out.length > 0 && gap > 1.5 && !/\s$/.test(out) && !/^\s/.test(item.str);
        if (precisaEspaco) out += ' ';
        out += item.str;
        prevX = item.x;
        prevW = item.w;
      }
      return out;
    }).join('\n');
}

function parseTexto(textoOriginal: string, arquivoNome: string): QuestaoParsed[] {
  let limpo = limparTexto(textoOriginal);
  limpo = limpo.replace(/===== Page \d+ =====/gi, '');
  
  limpo = limpo.replace(/(www\.tecconcursos\.com\.br)\s*\/\s*questoes\s*\/\s*(\d+)/g, '$1/questoes/$2')
               .replace(/(www\.tecconcursos\.com\.br)\s*\n\s*(\/questoes)/g, '$1$2');

  const questoes: QuestaoParsed[] = [];
  const urlRegex = /www\.tecconcursos\.com\.br\/questoes\/(\d+)/g;
  const matches = [...limpo.matchAll(urlRegex)];

  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const url = `https://${m[0]}`;
      const inicio = m.index! + m[0].length;
      const fim = i < matches.length - 1 ? matches[i + 1].index! : limpo.length;
      const corpo = limpo.substring(inicio, fim).trim();
      const q = parseQuestao(corpo, url, arquivoNome);
      if (q) questoes.push(q);
    }
    if (questoes.length > 0) return questoes;
  }

  const partes = limpo.split(/\n(?=\d+\)\s)/);
  for (const p of partes) {
    const q = parseQuestao(p.trim(), null, arquivoNome);
    if (q) questoes.push(q);
  }
  return questoes;
}

function parseHierarquia(str: string) {
  const partes = str.split(/\s+-\s+/);
  return {
    disciplina: partes[0]?.trim() || '',
    assunto: partes[1]?.trim() || null,
    subassunto: partes[2]?.trim() || null,
  };
}

function parseQuestao(corpo: string, urlOrigem: string | null, arquivoNome: string): QuestaoParsed | null {
  const linhas = corpo.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (linhas.length === 0) return null;
  const warnings: string[] = [];
  let primeira = 0;
  while (primeira < linhas.length && isNoise(linhas[primeira])) primeira++;
  if (primeira >= linhas.length) return null;

  const meta = parseMetadata(linhas[primeira]);
  if (!meta) return null;

  let prox = primeira + 1;
  let disciplina = meta.disciplina;
  let assunto = meta.assunto;
  let subassunto = meta.subassunto;

  if (!disciplina && prox < linhas.length) {
    if (linhas[prox].includes(' - ')) {
      const hier = parseHierarquia(linhas[prox]);
      disciplina = hier.disciplina;
      assunto = hier.assunto;
      subassunto = hier.subassunto;
      prox++;
    } else {
      disciplina = linhas[prox].trim();
      prox++;
    }
  }

  if (!disciplina) {
    disciplina = 'Não categorizada';
    warnings.push('Disciplina não identificada');
  }

  const corpoQuestao = linhas.slice(prox).join('\n');
  return parseCorpo(corpoQuestao, { banca: meta.banca, ano: meta.ano, concurso: meta.concurso, cargo: meta.cargo, disciplina, assunto, subassunto, urlOrigem, arquivoNome, warnings });
}

function isNoise(linha: string): boolean {
  if (!linha.trim()) return true;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(linha)) return true;
  if (/Caderno\s+\w+/i.test(linha) && linha.length < 60) return true;
  if (/^teconcursos$/i.test(linha.trim())) return true;
  if (/^Ordenação\s*:/i.test(linha)) return true;
  return false;
}

function parseMetadata(linha: string): any | null {
  // REGEX MAIS PERMISSIVO PARA ACEITAR BANCAS COM CARACTERES ESPECIAIS (&, etc)
  const m = linha.match(/^(.+?)\s+-\s+(.+)$/);
  if (!m) return null;
  const banca = m[1].trim();
  const resto = m[2].trim();
  const segs = resto.split('/').map((s) => s.trim());
  const cargo = segs[0] || null;
  const concurso = segs[1] || null;
  const ultimo = segs[segs.length - 1] || '';

  const anoOnly = ultimo.match(/^(\d{4})$/);
  if (anoOnly) return { banca, ano: parseInt(anoOnly[1], 10), concurso, cargo, disciplina: '', assunto: null, subassunto: null };

  const anoDisc = ultimo.match(/^(\d{4})\s+(.+)$/);
  if (anoDisc) {
    const hier = parseHierarquia(anoDisc[2]);
    return { banca, ano: parseInt(anoDisc[1], 10), concurso, cargo, disciplina: hier.disciplina, assunto: hier.assunto, subassunto: hier.subassunto };
  }

  for (const s of segs) {
    const mm = s.match(/\b(\d{4})\b/);
    if (mm) return { banca, ano: parseInt(mm[1], 10), concurso, cargo, disciplina: '', assunto: null, subassunto: null };
  }
  return { banca, ano: null, concurso, cargo, disciplina: '', assunto: null, subassunto: null };
}

function parseCorpo(corpo: string, base: any): QuestaoParsed | null {
  const linhas = corpo.split('\n');
  let gabIdx = -1;
  let gabRaw: string | null = null;
  for (let i = linhas.length - 1; i >= 0; i--) {
    // REGEX PERMITE O GABARITO NO FINAL DA LINHA
    const m = linhas[i].match(/Gabarito\s*:\s*([A-E]|Certo|Errado)\b/i);
    if (m) { gabIdx = i; gabRaw = m[1].trim(); break; }
  }

  const antesG = (gabIdx >= 0 ? linhas.slice(0, gabIdx) : linhas).join('\n').trim();
  const depoisG = gabIdx >= 0 ? linhas.slice(gabIdx + 1).join('\n').trim() : '';
  const numM = antesG.match(/^\s*(\d+)\s*\)\s+/);
  const numero = numM ? parseInt(numM[1], 10) : null;
  let textoQ = numM ? antesG.substring(numM[0].length) : antesG;
  if (!textoQ.trim()) return null;

  let nome_imagem: string | null = null;
  const matchImg = textoQ.match(/\[IMAGEM:\s*(.+?)\]/i);
  if (matchImg) {
    nome_imagem = matchImg[1].trim();
    textoQ = textoQ.replace(/\[IMAGEM:\s*(.+?)\]/i, '').trim();
  }

  const tipo = detectarTipo(textoQ);
  if (!tipo) { base.warnings.push('Tipo não identificado'); return null; }

  let enunciado: string;
  let alternativas: AlternativaParsed[] | null = null;
  let gabaritoLetra: string | null = null;
  let gabaritoCe: boolean | null = null;

  if (tipo === 'multipla_escolha') {
    const alts = extrairAlternativasMC(textoQ);
    if (!alts || alts.length < 2) { base.warnings.push('Alternativas não identificadas'); return null; }
    enunciado = textoQ.substring(0, alts[0].posicao).trim();

    if (gabRaw) {
      if (gabRaw.startsWith('[')) base.warnings.push(`Gabarito ${gabRaw}`);
      else {
        const g = gabRaw.toUpperCase().charAt(0);
        if (/^[A-E]$/.test(g)) gabaritoLetra = g;
        else base.warnings.push(`Gabarito "${gabRaw}" não reconhecido`);
      }
    } else { base.warnings.push('Sem gabarito'); }
    alternativas = alts.map((a) => ({ letra: a.letra, texto: a.texto, correta: gabaritoLetra === a.letra.toUpperCase() }));
  } else {
    const cePattern = /(?:^|\n)\s*Certo\s+Errado\s*[\.\?!]?\s*(?:\n|$)/gi;
    enunciado = textoQ.replace(cePattern, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (gabRaw) {
      if (gabRaw.startsWith('[')) base.warnings.push(`Gabarito ${gabRaw}`);
      else {
        const g = gabRaw.toLowerCase().trim();
        if (g === 'certo' || g === 'c') gabaritoCe = true;
        else if (g === 'errado' || g === 'e') gabaritoCe = false;
        else base.warnings.push(`Gabarito "${gabRaw}" não reconhecido`);
      }
    } else { base.warnings.push('Sem gabarito'); }
  }

  const hash = hashQuestao({ banca: base.banca, ano: base.ano, enunciado, alternativas, gabarito_letra: gabaritoLetra, gabarito_ce: gabaritoCe });

  return {
    banca: base.banca, ano: base.ano, concurso: base.concurso, cargo: base.cargo,
    disciplina: base.disciplina, assunto: base.assunto, subassunto: base.subassunto,
    tipo_questao: tipo, enunciado, alternativas, gabarito_letra: gabaritoLetra, gabarito_ce: gabaritoCe,
    comentario: depoisG || null, imagem_url: null, hash_dedup: hash, url_origem: base.urlOrigem, arquivo_origem: base.arquivoNome,
    __numero: numero, __warnings: base.warnings,
    __nome_imagem: nome_imagem
  };
}

function detectarTipo(texto: string): 'multipla_escolha' | 'certo_errado' | null {
  // PRIMEIRO TENTA ACHAR ALTERNATIVAS (MUITO MAIS SEGURO)
  const alts = extrairAlternativasMC(texto);
  if (alts && alts.length >= 2) return 'multipla_escolha';

  // SE NÃO ACHAR, TENTA CERTO/ERRADO
  const ceMatch = /(?:^|\n)\s*Certo\s+Errado\s*[\.\?!]?\s*(?:\n|$)/i.exec(texto);
  if (ceMatch) return 'certo_errado';
  
  return null;
}

function extrairAlternativasMC(texto: string): { letra: string; texto: string; posicao: number }[] | null {
  const regex = /(?:^|\s|\n)([a-eA-E])\)\s*/g;
  const matches: { letra: string; inicioTexto: number; posicao: number }[] = [];
  let m;
  while ((m = regex.exec(texto)) !== null) {
    matches.push({ letra: m[1].toLowerCase(), inicioTexto: m.index + m[0].length, posicao: m.index });
  }
  if (matches.length < 2) return null;

  const alts: { letra: string; texto: string; posicao: number }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const atual = matches[i];
    const prox = i < matches.length - 1 ? matches[i + 1] : null;
    const fim = prox ? prox.posicao : texto.length;
    let t = texto.substring(atual.inicioTexto, fim).trim().replace(/\s+$/, '').replace(/\n+/g, ' ');
    if (t.length > 0) alts.push({ letra: atual.letra, texto: t, posicao: atual.posicao });
  }
  return alts.length >= 2 ? alts : null;
}

function hashQuestao(q: any): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const partes = [norm(q.banca), q.ano?.toString() || '', norm(q.enunciado), (q.alternativas || []).slice().sort((a: any, b: any) => a.letra.localeCompare(b.letra)).map((a: any) => `${a.letra}:${norm(a.texto)}`).join('|'), q.gabarito_letra?.toUpperCase() || '', q.gabarito_ce === null ? '' : q.gabarito_ce ? 'C' : 'E'];
  return fnv1a64(partes.join('§'));
}

function fnv1a64(s: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < s.length; i++) {
    hash ^= BigInt(s.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

function limparTexto(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .filter((line) => !isFontTestLine(line) && !/^===== Page \d+ =====$/i.test(line.trim()))
    .join('\n')
    .trim();
}

function isFontTestLine(line: string): boolean {
  return /[¡¢£¤¥¦§¨ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿]{5,}/.test(line);
}