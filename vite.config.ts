import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Keep in sync with `src/server/frame-headers.ts` (vite.config cannot import `.ts` without
// allowImportingTsExtensions, and a bare import triggers Vite's native-loader warning).
const FRAME_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
} as const;

export default defineConfig({
  root: fileURLToPath(new URL('./src/web', import.meta.url)),
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    headers: { ...FRAME_HEADERS },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/web', import.meta.url)),
    emptyOutDir: true,
  },
});
