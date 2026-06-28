import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  builder: 'rollup',
  optimizeDeps: {
    exclude: ['broadcast-channel'],
  },
});