// src/services/ocrPdfService.ts
// Extrai texto de PDFs image-based via Tesseract.js.
// Renderiza cada página como imagem e passa pelo OCR.

import { pdfjs } from 'react-pdf';
import { setupPdfWorker } from '@/lib/pdfWorker';

setupPdfWorker();

export interface OcrProgresso {
  pagina: number;
  total: number;
  etapa: 'renderizando' | 'ocr' | 'concluida';
  textoParcial?: string;
}

export async function extrairTextoViaOCR(
  file: File,
  onProgresso?: (p: OcrProgresso) => void,
  maxPaginas?: number
): Promise<{ success: boolean; texto?: string; erro?: string }> {
  try {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;

    const totalPaginas = maxPaginas
      ? Math.min(maxPaginas, pdf.numPages)
      : pdf.numPages;

    // Import dinâmico — Tesseract só carrega quando usado
    const { createWorker } = await import('tesseract.js');

    onProgresso?.({
      pagina: 0,
      total: totalPaginas,
      etapa: 'ocr',
      textoParcial: 'Carregando Tesseract (primeira vez baixa ~15MB)...',
    });

    // Cria worker com português + inglês (inglês ajuda com siglas e números)
    const worker = await createWorker('por+eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          // Progresso por página (do Tesseract)
        }
      },
    });

    const textos: string[] = [];

    for (let i = 1; i <= totalPaginas; i++) {
      onProgresso?.({
        pagina: i,
        total: totalPaginas,
        etapa: 'renderizando',
      });

      const page = await pdf.getPage(i);

      const viewport = page.getViewport({ scale: 5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        await worker.terminate();
        return { success: false, erro: 'Falha ao criar canvas para renderizar PDF.' };
      }

      await page.render({
        canvasContext: ctx,
        viewport,
        canvas,
      } as any).promise;

      onProgresso?.({
        pagina: i,
        total: totalPaginas,
        etapa: 'ocr',
      });

      const { data } = await worker.recognize(canvas);
      textos.push(`===== Page ${i} =====\n${data.text}`);
    }

    await worker.terminate();

    onProgresso?.({
      pagina: totalPaginas,
      total: totalPaginas,
      etapa: 'concluida',
    });

    return { success: true, texto: textos.join('\n\n') };
  } catch (e: any) {
    console.error('[ocrPdfService] Erro:', e);
    return { success: false, erro: e?.message || 'Erro ao processar OCR.' };
  }
}