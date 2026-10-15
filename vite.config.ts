import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { FRAME_HEADERS } from './src/server/frame-headers';

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
