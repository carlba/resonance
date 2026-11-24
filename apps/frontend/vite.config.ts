import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The backend's default port; see PORT in the root .env.example.
const BACKEND_URL = 'http://localhost:3000';
const API_PREFIX = /^\/api/;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The one .env lives in the repo root. Vite only exposes the variables prefixed with VITE_ to
  // the browser, so the backend's secrets in it stay out of the bundle.
  envDir: path.resolve(import.meta.dirname, '../..'),
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // The browser only talks to the dev server, so the backend needs no CORS setup.
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
        rewrite: requestPath => requestPath.replace(API_PREFIX, ''),
      },
    },
  },
});
