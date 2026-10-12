// src/lib/pdfWorker.ts
// Configura o worker do PDF.js. DEVE ser importado antes de qualquer
// componente que use react-pdf.
//
// IMPORTANTE: usamos a sintaxe `?url` do Vite, que faz o Vite:
//   1) copiar o arquivo do worker para dist/assets no build de produção
//   2) devolver o caminho correto desse arquivo
// Isso é necessário porque `new URL(...)` NÃO funciona em produção
// com Vite 7+ (o worker não é copiado e o navegador recebe 404).

import { pdfjs } from 'react-pdf';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;