import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 真机 dev(`tauri ios dev --host`)时 Tauri 把 devUrl 里的 localhost 换成 Mac 的局域网地址,
// 并通过 TAURI_DEV_HOST 告知;dev server 不监听该地址的话手机加载不到前端。
// 桌面/浏览器开发时该变量为空,行为与之前一致(仅监听 localhost)。
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
