import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Real-device dev (`tauri ios dev --host`): Tauri rewrites the localhost in
// its devUrl to the Mac's LAN address and reports it via TAURI_DEV_HOST;
// unless the dev server listens on that address, the phone cannot load the
// frontend. In desktop/browser dev the variable is empty and behavior is
// unchanged (localhost only).
const devHost = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: devHost || false,
    port: 5173,
    hmr: devHost ? { protocol: 'ws', host: devHost, port: 5174 } : undefined,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
})
