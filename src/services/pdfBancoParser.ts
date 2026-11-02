// src/services/pdfBancoParser.ts
// Parser de PDFs exportados do TEC Concursos.
// Lê o texto via pdfjs-dist (já instalado), detecta questões,
// extrai metadados, enunciado, alternativas e gabarito.
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
}

export interface ParseResultado {
  success: boolean;
  questoes?: QuestaoParsed[];
  erro?: string;
}

export async function extrairQuestoesDePdf(
  file: File,
  arquivoNome?: string
): Promise<ParseResultado> {
  try {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

    const paginas: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      paginas.push(reconstruirTexto(content));
    }

    const textoCompleto = paginas.join('\n');
    const nome = arquivoNome || file.name || 'importado.pdf';
    const questoes = parseTexto(textoCompleto, nome);

    if (questoes.length === 0) {
      return {
        success: false,
        erro: 'Nenhuma questão identificada. Verifique se é um PDF exportado do TEC Concursos.',
      };
    }
    return { success: true, questoes };
  } catch (e: any) {
    console.error('[pdfBancoParser] Erro:', e);
    return { success: false, erro: e?.message || 'Erro ao ler o PDF.' };
  }
}

// ============================================================
// RECONSTRUÇÃO DO TEXTO (agrupa itens por linha visual)
// ============================================================
function reconstruirTexto(content: any): string {
  const items: any[] = (content.items || []).filter(
    (it: any) => typeof it.str === 'string' && it.str.trim().length > 0
  );
  if (items.length === 0) return '';

  const Y_TOL = 2;
  const linhas: { y: number; items: { x: number; str: string }[] }[] = [];

  for (const it of items) {
    const y = it.transform[5];
    const x = it.transform[4];
    let linha = linhas.find((l) => Math.abs(l.y - y) <= Y_TOL);
    if (!linha) {
      linha = { y, items: [] };
      linhas.push(linha);
    }
    linha.items.push({ x, str: it.str });
  }

  linhas.sort((a, b) => b.y - a.y);
  for (const l of linhas) l.items.sort((a, b) => a.x - b.x);

  return linhas.map((l) => l.items.map((i) => i.str).join(' ')).join('\n');
}

// ============================================================
// PARSING PRINCIPAL
// ============================================================
function parseTexto(texto: string, arquivoNome: string): QuestaoParsed[] {
  const limpo = limparTexto(texto);
  const questoes: QuestaoParsed[] = [];

  const urlRegex = /(www\.tecconcursos\.com\.br\/questoes\/(\d+))/g;
  const matches = [...limpo.matchAll(urlRegex)];

  if (matches.length === 0) {
    // Fallback: divide por "N)" no início de linha
    const partes = limpo.split(/\n(?=\d+\)\s)/);
    for (const p of partes) {
      const q = parseQuestao(p.trim(), null, arquivoNome);
      if (q) questoes.push(q);
    }
    return questoes;
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const url = `https://${m[1]}`;
    const inicio = m.index! + m[0].length;
    const fim = i < matches.length - 1 ? matches[i + 1].index! : limpo.length;
    const corpo = limpo.substring(inicio, fim).trim();
    const q = parseQuestao(corpo, url, arquivoNome);
    if (q) questoes.push(q);
  }
  return questoes;
}

function parseQuestao(
  corpo: string,
  urlOrigem: string | null,
  arquivoNome: string
): QuestaoParsed | null {
  const linhas = corpo.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (linhas.length === 0) return null;

  const warnings: string[] = [];

  // Linha 1 = metadados
  const meta = parseMetadata(linhas[0]);
  if (!meta) return null;

  let prox = 1;
  let disciplina = meta.disciplina;
  let assunto = meta.assunto;

  // FGV style: disciplina vem na próxima linha ("DISCIPLINA - ASSUNTO")
  if (!disciplina && linhas[prox]) {
    const discMatch = linhas[prox].match(/^(.+?)\s+-\s+(.+)$/);
    if (discMatch) {
      disciplina = discMatch[1].trim();
      assunto = discMatch[2].trim();
      prox++;
    }
  }

  if (!disciplina) {
    disciplina = 'Não categorizada';
    warnings.push('Disciplina não identificada');
  }

  const corpoQuestao = linhas.slice(prox).join('\n');
  return parseCorpo(corpoQuestao, {
    banca: meta.banca,
    ano: meta.ano,
    concurso: meta.concurso,
    cargo: meta.cargo,
    disciplina,
    assunto,
    subassunto: null,
    urlOrigem,
    arquivoNome,
    warnings,
  });
}

function parseMetadata(linha: string): {
  banca: string;
  ano: number | null;
  concurso: string | null;
  cargo: string | null;
  disciplina: string;
  assunto: string | null;
} | null {
  // Banca + " - " + resto
  const m = linha.match(/^([A-ZÀ-Ú][A-Z0-9À-Ú\s\(\)\.\-]{1,50}?)\s+-\s+(.+)$/);
  if (!m) return null;

  const banca = m[1].trim();
  const resto = m[2].trim();

  const segs = resto.split('/').map((s) => s.trim());
  const cargo = segs[0] || null;
  const concurso = segs[1] || null;
  const ultimo = segs[segs.length - 1] || '';

  // FGV style: último segmento é só "YYYY"
  const anoOnly = ultimo.match(/^(\d{4})$/);
  if (anoOnly) {
    return {
      banca,
      ano: parseInt(anoOnly[1], 10),
      concurso,
      cargo,
      disciplina: '',
      assunto: null,
    };
  }

  // CEBRASPE style: último é "YYYY DISCIPLINA - ASSUNTO"
  const anoDisc = ultimo.match(/^(\d{4})\s+(.+)$/);
  if (anoDisc) {
    const ano = parseInt(anoDisc[1], 10);
    const partes = anoDisc[2].trim().split(/\s+-\s+/);
    return {
      banca,
      ano,
      concurso,
      cargo,
      disciplina: partes[0]?.trim() || '',
      assunto: partes[1]?.trim() || null,
    };
  }

  // Fallback: tenta encontrar ano em qualquer segmento
  for (const s of segs) {
    const mm = s.match(/\b(\d{4})\b/);
    if (mm) {
      return {
        banca,
        ano: parseInt(mm[1], 10),
        concurso,
        cargo,
        disciplina: '',
        assunto: null,
      };
    }
  }

  return { banca, ano: null, concurso, cargo, disciplina: '', assunto: null };
}

function parseCorpo(
  corpo: string,
  base: {
    banca: string;
    ano: number | null;
    concurso: string | null;
    cargo: string | null;
    disciplina: string;
    assunto: string | null;
    subassunto: string | null;
    urlOrigem: string | null;
    arquivoNome: string;
    warnings: string[];
  }
): QuestaoParsed | null {
  const linhas = corpo.split('\n');

  // Procura "Gabarito: X"
  let gabIdx = -1;
  let gabRaw: string | null = null;
  for (let i = linhas.length - 1; i >= 0; i--) {
    const m = linhas[i].match(/^Gabarito\s*:\s*(.+)$/i);
    if (m) {
      gabIdx = i;
      gabRaw = m[1].trim();
      break;
    }
  }

  const antesG = (gabIdx >= 0 ? linhas.slice(0, gabIdx) : linhas).join('\n').trim();
  const depoisG = gabIdx >= 0 ? linhas.slice(gabIdx + 1).join('\n').trim() : '';

  // Número
  const numM = antesG.match(/^\s*(\d+)\s*\)\s+/);
  const numero = numM ? parseInt(numM[1], 10) : null;
  const textoQ = numM ? antesG.substring(numM[0].length) : antesG;
  if (!textoQ.trim()) return null;

  const tipo = detectarTipo(textoQ);
  if (!tipo) return null;

  let enunciado: string;
  let alternativas: AlternativaParsed[] | null = null;
  let gabaritoLetra: string | null = null;
  let gabaritoCe: boolean | null = null;

  if (tipo === 'multipla_escolha') {
    const alts = extrairAlternativasMC(textoQ);
    if (!alts || alts.length < 2) return null;
    enunciado = textoQ.substring(0, alts[0].posicao).trim();

    if (gabRaw) {
      const g = gabRaw.toUpperCase().charAt(0);
      if (/^[A-E]$/.test(g)) gabaritoLetra = g;
      else base.warnings.push(`Gabarito "${gabRaw}" não reconhecido`);
    } else {
      base.warnings.push('Sem gabarito');
    }
    alternativas = alts.map((a) => ({
      letra: a.letra,
      texto: a.texto,
      correta: gabaritoLetra === a.letra.toUpperCase(),
    }));
  } else {
    // CE — remove o marcador "Certo Errado" do fim
    const cePattern = /(?:^|\n)\s*Certo\s+Errado\s*[\.\?!]?\s*(?:\n|$)/gi;
    enunciado = textoQ.replace(cePattern, '\n').replace(/\n{3,}/g, '\n\n').trim();

    if (gabRaw) {
      const g = gabRaw.toLowerCase().trim();
      if (g === 'certo' || g === 'c') gabaritoCe = true;
      else if (g === 'errado' || g === 'e') gabaritoCe = false;
      else base.warnings.push(`Gabarito "${gabRaw}" não reconhecido`);
    } else {
      base.warnings.push('Sem gabarito');
    }
  }

  if (enunciado.length < 20) base.warnings.push('Enunciado muito curto');

  const comentario = depoisG || null;
  const hash = hashQuestao({
    banca: base.banca,
    ano: base.ano,
    enunciado,
    alternativas,
    gabarito_letra: gabaritoLetra,
    gabarito_ce: gabaritoCe,
  });

  return {
    banca: base.banca,
    ano: base.ano,
    concurso: base.concurso,
    cargo: base.cargo,
    disciplina: base.disciplina,
    assunto: base.assunto,
    subassunto: base.subassunto,
    tipo_questao: tipo,
    enunciado,
    alternativas,
    gabarito_letra: gabaritoLetra,
    gabarito_ce: gabaritoCe,
    comentario,
    imagem_url: null,
    hash_dedup: hash,
    url_origem: base.urlOrigem,
    arquivo_origem: base.arquivoNome,
    __numero: numero,
    __warnings: base.warnings,
  };
}

function detectarTipo(texto: string): 'multipla_escolha' | 'certo_errado' | null {
  // CE: "Certo Errado" no final (sem alternativas depois)
  const ceMatch = /(?:^|\n)\s*Certo\s+Errado\s*[\.\?!]?\s*(?:\n|$)/i.exec(texto);
  if (ceMatch && ceMatch.index > texto.length - 500) {
    const depois = texto.substring(ceMatch.index + ceMatch[0].length);
    if (!/[a-e]\)\s+/i.test(depois)) return 'certo_errado';
  }
  // MC: alternativas
  const alts = extrairAlternativasMC(texto);
  if (alts && alts.length >= 2) return 'multipla_escolha';
  return null;
}

function extrairAlternativasMC(
  texto: string
): { letra: string; texto: string; posicao: number }[] | null {
  const regex = /(?:^|\s|\n)([a-e])\)\s+/g;
  const matches: { letra: string; inicioTexto: number; posicao: number }[] = [];
  let m;
  while ((m = regex.exec(texto)) !== null) {
    matches.push({
      letra: m[1].toLowerCase(),
      inicioTexto: m.index + m[0].length,
      posicao: m.index,
    });
  }
  if (matches.length < 2) return null;

  const alts: { letra: string; texto: string; posicao: number }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const atual = matches[i];
    const prox = i < matches.length - 1 ? matches[i + 1] : null;
    const fim = prox ? prox.posicao : texto.length;
    let t = texto.substring(atual.inicioTexto, fim).trim();
    t = t.replace(/\s+$/, '').replace(/\n+/g, ' ');
    if (t.length > 0) {
      alts.push({ letra: atual.letra, texto: t, posicao: atual.posicao });
    }
  }
  return alts.length >= 2 ? alts : null;
}

function hashQuestao(q: {
  banca: string;
  ano: number | null;
  enunciado: string;
  alternativas: AlternativaParsed[] | null;
  gabarito_letra: string | null;
  gabarito_ce: boolean | null;
}): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const partes = [
    norm(q.banca),
    q.ano?.toString() || '',
    norm(q.enunciado),
    (q.alternativas || [])
      .slice()
      .sort((a, b) => a.letra.localeCompare(b.letra))
      .map((a) => `${a.letra}:${norm(a.texto)}`)
      .join('|'),
    q.gabarito_letra?.toUpperCase() || '',
    q.gabarito_ce === null ? '' : q.gabarito_ce ? 'C' : 'E',
  ];
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
    .trim();
}