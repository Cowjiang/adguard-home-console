import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Real-device dev (`tauri ios dev --host`): Tauri rewrites the localhost in
// its devUrl to the Mac's LAN address and reports it via TAURI_DEV_HOST;
// unless the dev server listens on that address, the phone cannot load the
// frontend. In desktop/browser dev the variable is empty and behavior is
// unchanged (localhost only).
const devHost = process.env.TAURI_DEV_HOST

// The version the UI reports in Settings → About. It is baked in at build time,
// so the release pipeline decides it before Vite runs: release-plan.mjs
// --set-version stamps package.json in the build and iOS jobs, and the image
// build passes APP_VERSION as a build arg (stamping the context would invalidate
// the pnpm install layer). Neither present → a local build reports
// package.json#version.
const packageVersion = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version as string
const appVersion = process.env.APP_VERSION || packageVersion

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react(), tailwindcss()],
  // vitest covers src/ only; server/ uses the node:test runner (npm run test:server)
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
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
