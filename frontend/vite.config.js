import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    host: true,
    // Telegram opens the app through an HTTPS tunnel (cloudflared / ngrok) with a random host.
    allowedHosts: true,
    // Same-origin /api so the phone reaches the backend through the same tunnel.
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } },
  },
  preview: {
    host: true,
    allowedHosts: true,
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } },
  },
});
