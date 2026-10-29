import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The dev server proxies /api to the Express backend so the browser never makes
 * a cross-origin request during development. Change the target here (or set
 * VITE_API_BASE_URL in .env) if your backend listens on another port.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5050',
        changeOrigin: true,
      },
    },
  },
});
