import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { brandPlugin } from './vite.brand-plugin.ts';

export default defineConfig({
  plugins: [react(), brandPlugin()],
  build: { sourcemap: false, chunkSizeWarningLimit: 2000 },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787', '/__mock': 'http://localhost:8787' } },
});
