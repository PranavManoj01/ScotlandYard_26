import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    host: true,
    proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true } },
  },
  test: { root: '.', include: ['shared/**/*.test.ts', 'server/**/*.test.ts'] },
} as any);
