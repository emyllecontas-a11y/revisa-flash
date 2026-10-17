// src/services/parseQuestoesPdf.ts
//
// Parser de PDFs de questões (Estratégia Concursos) -> JSON do RevisaFlash.
//
// ESTRATÉGIA:
//  1. Gabarito primeiro (fim do PDF), com texto já normalizado.
//  2. "LISTA DE QUESTÕES" é a fonte da verdade de enunciado e alternativas.
//  3. "QUESTÕES COMENTADAS" só serve para o comentário, achado por ÂNCORA de texto.
//  4. Fallback: se não houver LISTA, corta por marcadores.

import type {
  ListaImport,
  QuestaoImportLista,
  AlternativaLista,
} from '@/lib/listas-types';

export interface ParseResult extends ListaImport {
  warnings: string[];
}

type Gab = { tipo: 'letra'; letra: string } | { tipo: 'ce'; correta: boolean };

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/* ------------------------------ Gabarito ------------------------------ */

function findGabaritoStart(t: string): number {
  const re = /GABARITO/gi;
  let best = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const tail = t.slice(m.index + 8, m.index + 8 + 60);
    if (/^\W*1\s*[.\-–)]\s*(LETRA|CORRETA|INCORRETA|CERTO|ERRADO|CERTA|ERRADA)/i.test(tail)) {
      best = m.index;
    }
  }
  return best;
}

function parseGabarito(block: string): Map<number, Gab> {
  const out = new Map<number, Gab>();
  const re =
    /(?<!\d)(\d{1,3})\s*[.\-–)]\s*(?:LETRA\s*([A-E])(?![A-Za-z])|(INCORRETA|CORRETA|ERRADO|ERRADA|CERTO|CERTA)(?![A-Za-z]))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const n = Number(m[1]);
    if (out.has(n)) continue;
    if (m[2]) out.set(n, { tipo: 'letra', letra: m[2].toUpperCase() });
    else {
      const w = m[3].toUpperCase();
      out.set(n, {
        tipo: 'ce',
        correta: w === 'CORRETA' || w === 'CERTO' || w === 'CERTA',
      });
    }
  }
  return out;
}

/* ------------------------------ Seções ------------------------------ */

function lastHeading(
  t: string,
  re: RegExp,
  before: number
): { index: number; end: number } | null {
  const g = new RegExp(re.source, 'g');
  let last: { index: number; end: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = g.exec(t)) && m.index < before) {
    last = { index: m.index, end: m.index + m[0].length };
  }
  return last;
}

/* ------------------------------ Questões ------------------------------ */

interface Raw {
  numero: number;
  enunciado: string;
  alternativas: { letra: string; texto: string }[];
  comentarioInline?: string | null;
}

const COMMENT_MARKERS: RegExp[] = [
  /Coment[áa]rio\s*:/i,
  /Nesse tipo de quest[ãa]o/i,
  /Vamos analisar/i,
  /Gabarito\s*:/i,
  /Resolu[çc][ãa]o\s*:/i,
  /(?:^|\s)(?:Item|Quest[ãa]o|Alternativa|Afirmativa|Assertiva)\s+(?:correto|correta|incorreto|incorreta|certo|errado|certa|errada)\b/i,
  /\bA quest[ãa]o (?:trata|cobra|exige|pede|aborda|envolve)/i,
];

function cutAtMarker(s: string): { texto: string; comentario: string | null } {
  let best = -1;
  for (const re of COMMENT_MARKERS) {
    const m = re.exec(s);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  if (best <= 0) return { texto: s, comentario: null };
  return { texto: s.slice(0, best).trim(), comentario: s.slice(best).trim() };
}

function splitByNumber(t: string, max: number): { n: number; body: string }[] {
  const starts: { n: number; idx: number; end: number }[] = [];
  let cursor = 0;
  for (let n = 1; n <= max; n++) {
    let m: RegExpExecArray | null = null;
    for (const lookahead of ['(?=[("“A-ZÁÉÍÓÚÂÊÔÃÕÇ])', '(?=\\S)']) {
      const re = new RegExp(`(?<![\\w.,/§-])${n}\\s*\\.\\s*${lookahead}`, 'g');
      re.lastIndex = cursor;
      m = re.exec(t);
      if (m) break;
    }
    if (!m) break;
    starts.push({ n, idx: m.index, end: m.index + m[0].length });
    cursor = m.index + m[0].length;
  }
  return starts.map((s, i) => ({
    n: s.n,
    body: t
      .slice(s.end, i + 1 < starts.length ? starts[i + 1].idx : t.length)
      .trim(),
  }));
}

function splitAlternativas(body: string): {
  enunciado: string;
  alts: { letra: string; texto: string }[];
} {
  const marks: { letra: string; idx: number; end: number }[] = [];
  let cursor = 0;
  for (const letra of ['A', 'B', 'C', 'D', 'E']) {
    const re = new RegExp(`(?:^|\\s)\\(?${letra}\\s*\\)\\s*`, 'g');
    re.lastIndex = cursor;
    const m = re.exec(body);
    if (!m) break;
    marks.push({ letra, idx: m.index, end: m.index + m[0].length });
    cursor = m.index + m[0].length;
  }
  if (marks.length < 2) return { enunciado: clean(body), alts: [] };
  return {
    enunciado: clean(body.slice(0, marks[0].idx)),
    alts: marks.map((mk, i) => ({
      letra: mk.letra,
      texto: clean(
        body.slice(mk.end, i + 1 < marks.length ? marks[i + 1].idx : body.length)
      ),
    })),
  };
}

/* --------------------- Alinhamento por âncora --------------------- */

function norm(s: string): { n: string; map: number[] } {
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

function attachComments(
  raws: Raw[],
  com: string,
  warnings: string[]
): Map<number, string | null> {
  const out = new Map<number, string | null>();
  const { n: N, map } = norm(com);

  const starts: (number | null)[] = [];
  let cursor = 0;
  for (const r of raws) {
    const full = norm(r.enunciado).n;
    let idx = -1;
    for (const len of [40, 25, 14]) {
      const a = full.slice(0, len);
      if (a.length < 8) break;
      idx = N.indexOf(a, cursor);
      if (idx >= 0) break;
    }
    if (idx < 0) {
      starts.push(null);
      warnings.push(`Q${r.numero}: não localizei a questão na seção comentada.`);
    } else {
      starts.push(idx);
      cursor = idx + 1;
    }
  }

  raws.forEach((r, i) => {
    const s = starts[i];
    if (s == null) {
      out.set(r.numero, null);
      return;
    }
    const nextStart = starts.slice(i + 1).find((x) => x != null) ?? N.length;
    const fullStmt = [
      r.enunciado,
      ...r.alternativas.map((a) => `${a.letra}) ${a.texto}`),
    ].join(' ');
    const tailNorm = norm(fullStmt).n;
    const expectedEnd = s + tailNorm.length;
    let endNormIdx = -1;
    for (const len of [30, 18]) {
      const a = tailNorm.slice(-len);
      if (a.length < 8) break;
      const from = Math.max(s, expectedEnd - 80);
      const at = N.indexOf(a, from);
      if (at >= 0 && at < nextStart && at + a.length <= expectedEnd + 120) {
        endNormIdx = at + a.length;
        break;
      }
    }
    const blockEndOrig = nextStart < N.length ? map[nextStart] : com.length;
    let comment: string | null = null;
    if (endNormIdx >= 0) {
      const startOrig =
        endNormIdx - 1 < map.length ? map[endNormIdx - 1] + 1 : com.length;
      comment = com
        .slice(startOrig, blockEndOrig)
        .replace(/^[\s.;:!?]+/, '')
        .replace(/\s*\b\d{1,3}\s*\.\s*[("“\s]*$/, '')
        .trim();
    } else {
      const block = com.slice(map[s], blockEndOrig);
      const cut = cutAtMarker(block);
      comment = cut.comentario;
      warnings.push(
        `Q${r.numero}: fim do enunciado não encontrado; comentário cortado por marcador${
          cut.comentario ? '' : ' (nenhum achado)'
        }.`
      );
    }
    comment = comment
      ? clean(comment.replace(/^Coment[áa]rios?\s*:?\s*/i, ''))
      : null;
    out.set(r.numero, comment || null);
  });
  return out;
}

/* ------------------------------ stripNoise ------------------------------ */

export function stripNoise(raw: string): string {
  const lines = raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/==\w+==/g, '')
    .split(/\r?\n/)
    .map((l) => l.trim());
  const key = (l: string) => l.replace(/\s+/g, ' ').replace(/\d+/g, '#');
  const freq = new Map<string, number>();
  for (const l of lines) if (l) freq.set(key(l), (freq.get(key(l)) ?? 0) + 1);
  const keep = (l: string) => {
    if (!l) return false;
    if (/estrategiaconcursos\.com\.br/i.test(l)) return false;
    if (/^\d{11}\s*-\s*\S/.test(l)) return false;
    if (/^Aula\s+\d+$/i.test(l)) return false;
    const structural = /^(?:\d{1,3}\s*\.|\(?[A-E]\s*\))/.test(l);
    if (!structural && l.length < 120 && (freq.get(key(l)) ?? 0) >= 4) return false;
    return true;
  };
  return lines.filter(keep).join('\n');
}

/* ------------------------------ Principal ------------------------------ */

export function parseQuestoesPdf(
  input: string[] | string,
  tituloInicial = 'Lista importada',
  areaPadrao = 'Não categorizada'
): ParseResult {
  let titulo = tituloInicial;
  const warnings: string[] = [];
  const t = clean(
    stripNoise(Array.isArray(input) ? input.join('\n') : input).normalize('NFC')
  );

  const gStart = findGabaritoStart(t);
  const gab = gStart >= 0 ? parseGabarito(t.slice(gStart)) : new Map<number, Gab>();
  if (gStart < 0) warnings.push('Gabarito em bloco não encontrado.');
  const total = gab.size ? Math.max(...gab.keys()) : 300;
  const body = gStart >= 0 ? t.slice(0, gStart) : t;

  const RE_LISTA = /LISTA DE QUEST(?:Õ|O)ES/;
  const RE_COM = /QUEST(?:Õ|O)ES COMENTADAS/;
  const lista = lastHeading(body, RE_LISTA, body.length);
  const comH = lastHeading(body, RE_COM, lista ? lista.index : body.length);
const comText = comH ? body.slice(comH.end, lista ? lista.index : body.length) : '';

// Extrai o título do cabeçalho da seção COMENTADAS.
// Ex: "## QUESTÕES COMENTADAS - PREPOSIÇÃO - MULTIBANCAS" → "Preposição"
if (comH && titulo === 'Lista importada') {
  const trecho = body.slice(Math.max(0, comH.index - 20), comH.end + 80);
  const m = trecho.match(
    /QUEST(?:Õ|O)ES\s+COMENTADAS\s*[-–:]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{2,40})/
  );
  if (m) {
    titulo = m[1]
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  }
}
  const listaText = lista ? body.slice(lista.end) : '';

  let raws: Raw[] = [];
  let comments = new Map<number, string | null>();

  if (lista && comH) {
    raws = splitByNumber(listaText, total).map(({ n, body }) => {
      const { enunciado, alts } = splitAlternativas(body);
      return { numero: n, enunciado, alternativas: alts };
    });
    comments = attachComments(raws, comText, warnings);
  } else {
    warnings.push(
      'Seção LISTA DE QUESTÕES/QUESTÕES COMENTADAS não encontrada; usando corte por marcadores (menos confiável).'
    );
    const src = comH ? comText : body;
    raws = splitByNumber(src, total).map(({ n, body }) => {
      const { enunciado, alts } = splitAlternativas(body);
      if (alts.length) {
        const last = alts[alts.length - 1];
        const cut = cutAtMarker(last.texto);
        last.texto = cut.texto;
        return { numero: n, enunciado, alternativas: alts, comentarioInline: cut.comentario };
      }
      const cut = cutAtMarker(enunciado);
      return { numero: n, enunciado: cut.texto, alternativas: alts, comentarioInline: cut.comentario };
    });
    raws.forEach((r) =>
      comments.set(r.numero, r.comentarioInline ? clean(r.comentarioInline) : null)
    );
  }

  const questoes: QuestaoImportLista[] = raws.map((r) => {
    const g = gab.get(r.numero);
    const com = comments.get(r.numero) ?? null;
    const isCE = g ? g.tipo === 'ce' : r.alternativas.length < 2;

    if (isCE) {
      if (r.alternativas.length)
        warnings.push(`Q${r.numero}: gabarito é certo/errado mas há alternativas A-E; confira.`);
      if (!g)
        warnings.push(`Q${r.numero}: sem gabarito; marquei como certo_errado=false por padrão.`);
      const enun = r.alternativas.length
        ? clean(
            `${r.enunciado} ${r.alternativas
              .map((a) => `${a.letra}) ${a.texto}`)
              .join(' ')}`
          )
        : r.enunciado;
      return {
        numero: r.numero,
        tipo: 'certo_errado' as const,
        enunciado: enun,
        area: areaPadrao,
        comentario_geral: com ?? undefined,
        correta: g?.tipo === 'ce' ? g.correta : false,
      };
    }

    if (r.alternativas.length < 2)
      warnings.push(`Q${r.numero}: gabarito é letra mas não achei alternativas.`);
    const letra = g?.tipo === 'letra' ? g.letra : null;
    if (!letra) warnings.push(`Q${r.numero}: sem gabarito.`);
    else if (!r.alternativas.some((a) => a.letra === letra))
      warnings.push(`Q${r.numero}: gabarito ${letra} não existe nas alternativas.`);

    const alternativas: AlternativaLista[] = r.alternativas.map((a) => ({
      letra: a.letra as AlternativaLista['letra'],
      texto: a.texto,
      correta: a.letra === letra,
      comentario: null,
    }));

    return {
      numero: r.numero,
      tipo: 'multipla_escolha' as const,
      enunciado: r.enunciado,
      area: areaPadrao,
      comentario_geral: com ?? undefined,
      alternativas,
    };
  });

  if (gab.size && questoes.length !== gab.size)
    warnings.push(`Achei ${questoes.length} questões, mas o gabarito tem ${gab.size}.`);
  const nums = questoes.map((q) => q.numero);
  if (nums.some((n, i) => n !== i + 1))
    warnings.push('Numeração das questões não é sequencial.');

  return { titulo, questoes, warnings };
}