import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'; // <-- NOVO IMPORT
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // <-- ADICIONADO
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  base: '/revisa-flash/',
  builder: 'rollup',
  optimizeDeps: {
    exclude: ['broadcast-channel'],
  },
});