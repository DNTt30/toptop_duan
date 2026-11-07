import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: '/overlay/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
