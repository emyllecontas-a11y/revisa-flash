// src/lib/pdfWorker.ts
// Configura o worker do PDF.js. DEVE ser importado antes de qualquer
// componente que use react-pdf.
//
// Aqui criamos o Worker manualmente e o entregamos ao PDF.js via
// `workerPort`. Essa é a forma recomendada pelo Vite para workers:
//   - o Vite entende o padrão `new Worker(new URL(...), { type: 'module' })`
//   - ele empacota o arquivo do worker como asset separado
//   - funciona em dev E em produção
//
// Não usamos `workerSrc` porque o PDF.js tentaria um `import()` dinâmico
// da URL, e o Vite reescreveria isso com `?import`, quebrando.

import { pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerPort = new Worker(
  new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
  { type: 'module' }
);