import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
  server: {
    proxy: {
      '/pdf': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
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
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(Date.now()),
  },
});