// src/lib/pdfWorker.ts
// Configura o worker do PDF.js. DEVE ser importado antes de qualquer
// componente que use react-pdf.
//
// Esta função é chamada EXPLICITAMENTE pelo PdfViewer (não é side-effect
// import), para o bundler não poder descartá-la.
//
// Estratégia:
//   1. Tenta o arquivo local empacotado pelo Vite (?url).
//   2. Se o valor vier vazio/undefined, cai para o CDN do unpkg (sempre
//      funciona, casa com a versão instalada do pdfjs-dist).
//   3. Se o CDN também falhar, cai para um caminho absoluto fixo.

import { pdfjs } from 'react-pdf';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export function setupPdfWorker(): void {
  const local = typeof pdfWorkerUrl === 'string' && pdfWorkerUrl.length > 0
    ? pdfWorkerUrl
    : null;

  const cdn = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const finalUrl = local || cdn;

  pdfjs.GlobalWorkerOptions.workerSrc = finalUrl;

  console.log('[pdfWorker] workerSrc configurado para:', finalUrl);
}