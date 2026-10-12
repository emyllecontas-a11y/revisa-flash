// src/lib/pdfWorker.ts
// Configura o worker do PDF.js. DEVE ser importado antes de qualquer
// componente que use react-pdf.

import { pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();