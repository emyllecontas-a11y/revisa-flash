// src/services/pdfExportService.ts
//
// Gera PDFs de listas de questões e simulados, com duas versões:
//  - "responder": enunciado + alternativas (sem gabarito nem resposta)
//  - "corrigida": enunciado + alternativas marcadas (✓ correta / ✗ sua) + comentário
//
// Suporta formatação rica: sublinhados, negritos e itálicos.
import type { QuestaoPlayer } from '@/lib/simulados-types';
import type { QuestaoListaPlayer } from '@/lib/listas-types';

interface RangeFormatacao {
  inicio: number;
  fim: number;
}

interface AlternativaExport {
  letra: string;
  texto: string;
  correta: boolean;
  sublinhados?: RangeFormatacao[] | null;
  negritos?: RangeFormatacao[] | null;
  italicos?: RangeFormatacao[] | null;
}

export interface QuestaoExport {
  numero: number;
  enunciado: string;
  sublinhadosEnunciado?: RangeFormatacao[] | null;
  negritosEnunciado?: RangeFormatacao[] | null;
  italicosEnunciado?: RangeFormatacao[] | null;
  alternativas: AlternativaExport[];
  comentario: string | null;
  sublinhadosComentario?: RangeFormatacao[] | null;
  negritosComentario?: RangeFormatacao[] | null;
  italicosComentario?: RangeFormatacao[] | null;
  imagem_url: string | null;
}

export type ModoPdf = 'responder' | 'corrigida';

export interface OpcoesExportacaoPdf {
  titulo: string;
  subtitulo?: string;
  questoes: QuestaoExport[];
  respostas: Record<number, string>;
  resultado?: {
    acertos: number;
    erros: number;
    naoRespondidas: number;
    porcentagem: number;
  } | null;
  modo: ModoPdf;
  onProgress?: (info: { current: number; total: number; label: string }) => void;
}

// ============================================================
// ADAPTERS — convertem os tipos do app para o formato do PDF
// ============================================================
export function normalizarQuestaoSimulado(q: QuestaoPlayer): QuestaoExport {
  const ehMultipla = q.alternativas && q.alternativas.length > 0;
  const base: QuestaoExport = {
    numero: q.numero,
    enunciado: q.enunciado || '',
    sublinhadosEnunciado: (q as any).sublinhados_enunciado ?? null,
    negritosEnunciado: (q as any).negritos_enunciado ?? null,
    italicosEnunciado: (q as any).italicos_enunciado ?? null,
    alternativas: [],
    comentario: (q as any).comentario_geral ?? null,
    sublinhadosComentario: (q as any).sublinhados_comentario ?? null,
    negritosComentario: (q as any).negritos_comentario ?? null,
    italicosComentario: (q as any).italicos_comentario ?? null,
    imagem_url: (q as any).imagem_url ?? null,
  };

  if (ehMultipla) {
    base.alternativas = q.alternativas.map((a: any) => ({
      letra: a.letra,
      texto: a.texto,
      correta: !!a.correta,
      sublinhados: a.sublinhados ?? null,
      negritos: a.negritos ?? null,
      italicos: a.italicos ?? null,
    }));
  } else {
    const correta = q.gabarito_ce === true ? 'C' : 'E';
    base.alternativas = [
      { letra: 'C', texto: 'Certo', correta: correta === 'C' },
      { letra: 'E', texto: 'Errado', correta: correta === 'E' },
    ];
  }

  return base;
}

export function normalizarQuestaoLista(q: QuestaoListaPlayer): QuestaoExport {
  const ehMultipla = q.tipo === 'multipla_escolha' && q.alternativas && q.alternativas.length > 0;
  const base: QuestaoExport = {
    numero: q.numero,
    enunciado: q.enunciado || '',
    sublinhadosEnunciado: (q as any).sublinhados_enunciado ?? null,
    negritosEnunciado: (q as any).negritos_enunciado ?? null,
    italicosEnunciado: (q as any).italicos_enunciado ?? null,
    alternativas: [],
    comentario: (q as any).comentario_geral ?? null,
    sublinhadosComentario: (q as any).sublinhados_comentario ?? null,
    negritosComentario: (q as any).negritos_comentario ?? null,
    italicosComentario: (q as any).italicos_comentario ?? null,
    imagem_url: (q as any).imagem_url ?? null,
  };

  if (ehMultipla) {
    base.alternativas = (q.alternativas || []).map((a: any) => ({
      letra: a.letra,
      texto: a.texto,
      correta: !!a.correta,
      sublinhados: a.sublinhados ?? null,
      negritos: a.negritos ?? null,
      italicos: a.italicos ?? null,
    }));
  } else {
    const correta = q.gabarito_ce === true ? 'C' : 'E';
    base.alternativas = [
      { letra: 'C', texto: 'Certo', correta: correta === 'C' },
      { letra: 'E', texto: 'Errado', correta: correta === 'E' },
    ];
  }

  return base;
}

// ============================================================
// HELPERS DE IMAGEM
// ============================================================
async function carregarImagemBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function obterDimensoesImagem(base64: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = base64;
  });
}

function sanitizeFilename(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'material'
  );
}

// ============================================================
// RICH TEXT — segmentação em runs
// ============================================================
interface RichRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

function segmentarTexto(
  texto: string,
  formatacao: {
    sublinhados?: RangeFormatacao[] | null;
    negritos?: RangeFormatacao[] | null;
    italicos?: RangeFormatacao[] | null;
  }
): RichRun[] {
  if (!texto) return [{ text: '', bold: false, italic: false, underline: false }];

  const len = texto.length;
  const boldMask = new Uint8Array(len);
  const italicMask = new Uint8Array(len);
  const underlineMask = new Uint8Array(len);

  for (const r of formatacao.negritos || []) {
    for (let i = Math.max(0, r.inicio); i < Math.min(len, r.fim); i++) boldMask[i] = 1;
  }
  for (const r of formatacao.italicos || []) {
    for (let i = Math.max(0, r.inicio); i < Math.min(len, r.fim); i++) italicMask[i] = 1;
  }
  for (const r of formatacao.sublinhados || []) {
    for (let i = Math.max(0, r.inicio); i < Math.min(len, r.fim); i++) underlineMask[i] = 1;
  }

  const runs: RichRun[] = [];
  let i = 0;
  while (i < len) {
    const b = boldMask[i];
    const it = italicMask[i];
    const u = underlineMask[i];
    let j = i;
    while (j < len && boldMask[j] === b && italicMask[j] === it && underlineMask[j] === u) j++;
    runs.push({ text: texto.slice(i, j), bold: !!b, italic: !!it, underline: !!u });
    i = j;
  }

  return runs;
}

function estiloFont(run: RichRun): string {
  if (run.bold && run.italic) return 'bolditalic';
  if (run.bold) return 'bold';
  if (run.italic) return 'italic';
  return 'normal';
}

function quebrarLinhas(
  doc: any,
  runs: RichRun[],
  maxWidth: number,
  fontSize: number
): RichRun[][] {
  const lines: RichRun[][] = [[]];
  let currentWidth = 0;

  for (const run of runs) {
    doc.setFont('helvetica', estiloFont(run));
    doc.setFontSize(fontSize);

    const tokens: string[] = run.text.split(/(\s+)/).filter((t: string) => t.length > 0);

    for (const token of tokens) {
      if (token.includes('\n')) {
        lines.push([]);
        currentWidth = 0;
        continue;
      }
      const isWhitespace = /^\s+$/.test(token);
      const w = doc.getTextWidth(token);

      if (isWhitespace) {
        if (currentWidth > 0) {
          lines[lines.length - 1].push({ ...run, text: token });
          currentWidth += w;
        }
        continue;
      }

      if (currentWidth + w > maxWidth && currentWidth > 0) {
        lines.push([]);
        currentWidth = 0;
      }

      lines[lines.length - 1].push({ ...run, text: token });
      currentWidth += w;
    }
  }

  return lines;
}

function desenharRichText(
  doc: any,
  runs: RichRun[],
  x: number,
  yInicial: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  contentBottom: number,
  novaPagina: () => number,
  cor: [number, number, number]
): number {
  let y = yInicial;
  const lines = quebrarLinhas(doc, runs, maxWidth, fontSize);

  for (const line of lines) {
    if (y + lineHeight > contentBottom) {
      y = novaPagina();
    }

    let cursorX = x;
    for (const run of line) {
      doc.setFont('helvetica', estiloFont(run));
      doc.setFontSize(fontSize);
      doc.setTextColor(cor[0], cor[1], cor[2]);

      const w = doc.getTextWidth(run.text);
      doc.text(run.text, cursorX, y);

      if (run.underline) {
        doc.setDrawColor(cor[0], cor[1], cor[2]);
        doc.setLineWidth(0.2);
        doc.line(cursorX, y + 0.7, cursorX + w, y + 0.7);
      }

      cursorX += w;
    }
    y += lineHeight;
  }

  return y;
}

// ============================================================
// FUNÇÃO PRINCIPAL
// ============================================================
export async function exportarPdf(opcoes: OpcoesExportacaoPdf): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const pageW = 210;
  const pageH = 297;
  const margin = 15;
  const contentW = pageW - margin * 2;
  const headerHeight = 22;
  const contentTop = margin + headerHeight + 4;
  const contentBottom = pageH - margin - 12;

  let y = contentTop;
  let pageNumber = 1;
  let imagensFalharam = 0;

  const { titulo, subtitulo, questoes, respostas, resultado, modo, onProgress } = opcoes;
  const totalQuestoes = questoes.length;

  const desenharCabecalho = () => {
    doc.setFillColor(254, 120, 2);
    doc.rect(0, 0, pageW, 10, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('RevisaFlash', margin, 7);

    if (modo === 'corrigida') {
      doc.text('CORRIGIDO', pageW - margin, 7, { align: 'right' });
    }

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    const tituloLines = doc.splitTextToSize(titulo, contentW);
    doc.text(tituloLines, margin, margin + 6);
    let yCab = margin + 6 + tituloLines.length * 5;

    if (subtitulo) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      yCab += 4;
      doc.text(subtitulo, margin, yCab);
    }

    if (modo === 'corrigida' && resultado) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 100, 0);
      yCab += 4;
      const texto = `Acertos: ${resultado.acertos} · Erros: ${resultado.erros} · Não respondidas: ${resultado.naoRespondidas} · Aproveitamento: ${resultado.porcentagem}%`;
      doc.text(texto, margin, yCab);
    }

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(margin, margin + headerHeight, pageW - margin, margin + headerHeight);
  };

  const desenharRodape = (pageNum: number) => {
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.text(`RevisaFlash · Página ${pageNum}`, pageW / 2, pageH - 6, { align: 'center' });
  };

  const novaPaginaRetornaY = (): number => {
    desenharRodape(pageNumber);
    doc.addPage();
    pageNumber++;
    desenharCabecalho();
    return contentTop;
  };

  desenharCabecalho();

  for (let i = 0; i < questoes.length; i++) {
    const q = questoes[i];
    const resp = respostas[q.numero];
    const correta = q.alternativas.find((a) => a.correta)?.letra ?? null;
    const acertou = !!resp && resp === correta;

    onProgress?.({
      current: i,
      total: totalQuestoes,
      label: `Gerando questão ${i + 1} de ${totalQuestoes}...`,
    });

    // Cabeçalho da questão
    if (y + 10 > contentBottom) y = novaPaginaRetornaY();
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);

    let labelQ = `Questão ${q.numero}`;
    if (modo === 'corrigida') {
      if (!resp) labelQ += '  —  (não respondida)';
      else if (acertou) labelQ += '  —  ✓ acertou';
      else labelQ += '  —  ✗ errou';
    }
    doc.text(labelQ, margin, y);
    y += 6;

    // Imagem
    if (q.imagem_url) {
      const b64 = await carregarImagemBase64(q.imagem_url);
      if (b64) {
        const dim = await obterDimensoesImagem(b64);
        if (dim.w > 0 && dim.h > 0) {
          const ratio = dim.h / dim.w;
          let imgW = Math.min(contentW, 120);
          let imgH = imgW * ratio;
          if (imgH > 80) {
            imgH = 80;
            imgW = imgH / ratio;
          }
          if (y + imgH + 4 > contentBottom) y = novaPaginaRetornaY();
          try {
            doc.addImage(b64, 'JPEG', margin, y, imgW, imgH);
            y += imgH + 4;
          } catch {
            try {
              doc.addImage(b64, 'PNG', margin, y, imgW, imgH);
              y += imgH + 4;
            } catch {
              imagensFalharam++;
            }
          }
        }
      } else {
        imagensFalharam++;
      }
    }

    // Enunciado com formatação rica
    const runsEnunciado = segmentarTexto(q.enunciado, {
      sublinhados: q.sublinhadosEnunciado,
      negritos: q.negritosEnunciado,
      italicos: q.italicosEnunciado,
    });
    y = desenharRichText(
      doc, runsEnunciado, margin, y, contentW,
      10, 5, contentBottom, novaPaginaRetornaY,
      [0, 0, 0]
    );
    y += 2;

    // Alternativas com formatação rica
    for (const alt of q.alternativas) {
      let cor: [number, number, number] = [0, 0, 0];
      let sufixo = '';

      if (modo === 'corrigida') {
        if (alt.correta) {
          cor = [0, 120, 0];
          sufixo = '   ✓ correta';
        } else if (resp === alt.letra && resp !== correta) {
          cor = [180, 0, 0];
          sufixo = '   ✗ sua resposta';
        }
      }

      const textoAlternativa = `(${alt.letra}) ${alt.texto}`;
      const runsAlt = segmentarTexto(textoAlternativa, {
        sublinhados: alt.sublinhados,
        negritos: alt.negritos,
        italicos: alt.italicos,
      });

      if (sufixo) {
        runsAlt.push({ text: sufixo, bold: false, italic: false, underline: false });
      }

      y = desenharRichText(
        doc, runsAlt, margin + 5, y, contentW - 5,
        10, 5, contentBottom, novaPaginaRetornaY,
        cor
      );
    }

    // Comentário (só na corrigida) com formatação rica
    if (modo === 'corrigida' && q.comentario && q.comentario.trim()) {
      y += 2;

      const prefixo: RichRun = { text: 'Comentário: ', bold: false, italic: true, underline: false };
      const runsComentario = segmentarTexto(q.comentario, {
        sublinhados: q.sublinhadosComentario,
        negritos: q.negritosComentario,
        italicos: q.italicosComentario,
      });
      // Aplica itálico como base (para combinar com o prefixo), mantendo negrito/sublinhado próprios.
      const runsComBase: RichRun[] = runsComentario.map((r) => ({
        text: r.text,
        bold: r.bold,
        italic: true, // comentário inteiro em itálico
        underline: r.underline,
      }));

      y = desenharRichText(
        doc,
        [prefixo, ...runsComBase],
        margin, y, contentW,
        9, 4.5, contentBottom, novaPaginaRetornaY,
        [80, 80, 80]
      );
    }

    y += 6;
  }

  desenharRodape(pageNumber);

  if (imagensFalharam > 0) {
    console.warn(`[pdfExport] ${imagensFalharam} imagem(ns) não puderam ser incluídas.`);
  }

  onProgress?.({ current: totalQuestoes, total: totalQuestoes, label: 'Salvando PDF...' });

  const nome = `${sanitizeFilename(titulo)}-${modo === 'corrigida' ? 'corrigido' : 'para-responder'}.pdf`;
  doc.save(nome);
}