import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pdfWorkerSrc = resolve(
  __dirname,
  'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
).replace(/\\/g, '/');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: pdfWorkerSrc,
          dest: '',
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  base: '/',
  builder: 'rollup',
  optimizeDeps: {
    exclude: ['broadcast-channel'],
    include: ['pdfjs-dist'],
  },
  ssr: false,
  build: {
    ssr: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});