import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Vite config (also consumed by Vitest) with a dev proxy so the frontend can
// call the API without CORS friction during local development (plan §11).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      // Socket.io signaling shares the API port; proxy the websocket upgrade so
      // the client can stay same-origin in dev (§12 real-time layer).
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost:5173/' } },
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
