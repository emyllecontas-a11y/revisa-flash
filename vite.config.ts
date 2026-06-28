import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/revisa-flash/', // 🔥 ESSA É A LINHA QUE FALTAVA
  builder: 'rollup',
  optimizeDeps: {
    exclude: ['broadcast-channel'],
  },
});