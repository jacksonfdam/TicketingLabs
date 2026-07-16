import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend is backend-agnostic: in dev it proxies /api to the gateway, in
// production it is served behind the same gateway origin, so it never learns which
// backend answers. Assets are hashed for long-lived caching.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://localhost',
        changeOrigin: true,
        secure: false, // self-signed gateway cert in local dev
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split vendor libraries so app changes do not bust their long-cached chunks.
        // Rolldown (Vite 8's bundler) wants manualChunks as a function.
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'react';
            if (id.includes('@tanstack')) return 'query';
            return 'vendor';
          }
        },
      },
    },
  },
});
