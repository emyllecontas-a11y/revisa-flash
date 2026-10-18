// src/services/pdfExportService.ts
//
// Gera PDFs de listas de questões e simulados, com duas versões:
//  - "responder": enunciado + alternativas (sem gabarito nem resposta)
//  - "corrigida": enunciado + alternativas marcadas (✓ correta / ✗ sua) + comentário
//
// Usa `jspdf` via dynamic import (só baixa a lib quando o usuário pede o PDF).
import type { QuestaoPlayer } from '@/lib/simulados-types';
import type { QuestaoListaPlayer } from '@/lib/listas-types';

export interface QuestaoExport {
  numero: number;
  enunciado: string;
  alternativas: { letra: string; texto: string; correta: boolean }[];
  comentario: string | null;
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
  if (ehMultipla) {
    return {
      numero: q.numero,
      enunciado: q.enunciado || '',
      alternativas: q.alternativas.map((a: any) => ({
        letra: a.letra,
        texto: a.texto,
        correta: !!a.correta,
      })),
      comentario: (q as any).comentario_geral ?? null,
      imagem_url: (q as any).imagem_url ?? null,
    };
  }
  const correta = q.gabarito_ce === true ? 'C' : 'E';
  return {
    numero: q.numero,
    enunciado: q.enunciado || '',
    alternativas: [
      { letra: 'C', texto: 'Certo', correta: correta === 'C' },
      { letra: 'E', texto: 'Errado', correta: correta === 'E' },
    ],
    comentario: (q as any).comentario_geral ?? null,
    imagem_url: (q as any).imagem_url ?? null,
  };
}

export function normalizarQuestaoLista(q: QuestaoListaPlayer): QuestaoExport {
  const ehMultipla = q.tipo === 'multipla_escolha' && q.alternativas && q.alternativas.length > 0;
  if (ehMultipla) {
    return {
      numero: q.numero,
      enunciado: q.enunciado || '',
      alternativas: (q.alternativas || []).map((a: any) => ({
        letra: a.letra,
        texto: a.texto,
        correta: !!a.correta,
      })),
      comentario: (q as any).comentario_geral ?? null,
      imagem_url: (q as any).imagem_url ?? null,
    };
  }
  const correta = q.gabarito_ce === true ? 'C' : 'E';
  return {
    numero: q.numero,
    enunciado: q.enunciado || '',
    alternativas: [
      { letra: 'C', texto: 'Certo', correta: correta === 'C' },
      { letra: 'E', texto: 'Errado', correta: correta === 'E' },
    ],
    comentario: (q as any).comentario_geral ?? null,
    imagem_url: (q as any).imagem_url ?? null,
  };
}

// ============================================================
// HELPERS
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
    // Faixa superior (laranja da marca)
    doc.setFillColor(254, 120, 2);
    doc.rect(0, 0, pageW, 10, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('RevisaFlash', margin, 7);

    if (modo === 'corrigida') {
      doc.text('CORRIGIDO', pageW - margin, 7, { align: 'right' });
    }

    // Título
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    const tituloLines = doc.splitTextToSize(titulo, contentW);
    doc.text(tituloLines, margin, margin + 6);
    let yCab = margin + 6 + tituloLines.length * 5;

    // Subtítulo
    if (subtitulo) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      yCab += 4;
      doc.text(subtitulo, margin, yCab);
    }

    // Resultado (apenas na versão corrigida)
    if (modo === 'corrigida' && resultado) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 100, 0);
      yCab += 4;
      const texto = `Acertos: ${resultado.acertos} · Erros: ${resultado.erros} · Não respondidas: ${resultado.naoRespondidas} · Aproveitamento: ${resultado.porcentagem}%`;
      doc.text(texto, margin, yCab);
    }

    // Linha
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

  const novaPagina = () => {
    desenharRodape(pageNumber);
    doc.addPage();
    pageNumber++;
    desenharCabecalho();
    y = contentTop;
  };

  const verificarEspaco = (espaco: number) => {
    if (y + espaco > contentBottom) novaPagina();
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
    verificarEspaco(10);
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

    // Imagem (antes do enunciado, como no app)
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
          verificarEspaco(imgH + 4);
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

    // Enunciado
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    const enunciadoLines = doc.splitTextToSize(q.enunciado, contentW);
    for (const line of enunciadoLines) {
      verificarEspaco(5);
      doc.text(line, margin, y);
      y += 5;
    }
    y += 2;

    // Alternativas
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

      doc.setTextColor(cor[0], cor[1], cor[2]);
      const linha = `(${alt.letra}) ${alt.texto}${sufixo}`;
      const altLines = doc.splitTextToSize(linha, contentW - 5);
      for (const line of altLines) {
        verificarEspaco(5);
        doc.text(line, margin + 5, y);
        y += 5;
      }
    }

    // Comentário (só na corrigida)
    if (modo === 'corrigida' && q.comentario && q.comentario.trim()) {
      y += 2;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(80, 80, 80);
      const comentLines = doc.splitTextToSize(`Comentário: ${q.comentario}`, contentW);
      for (const line of comentLines) {
        verificarEspaco(4.5);
        doc.text(line, margin, y);
        y += 4.5;
      }
    }

    y += 6; // espaço entre questões
  }

  desenharRodape(pageNumber);

  if (imagensFalharam > 0) {
    console.warn(`[pdfExport] ${imagensFalharam} imagem(ns) não puderam ser incluídas.`);
  }

  onProgress?.({ current: totalQuestoes, total: totalQuestoes, label: 'Salvando PDF...' });

  const nome = `${sanitizeFilename(titulo)}-${modo === 'corrigida' ? 'corrigido' : 'para-responder'}.pdf`;
  doc.save(nome);
}