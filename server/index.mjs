#!/usr/bin/env node
/**
 * AdGuard Home Console — local server
 * 1. Serves the frontend build output (SPA)
 * 2. Reverse-proxies /api/agh/* to the user-configured AdGuard Home, bypassing
 *    browser CORS limits
 *
 * The proxy itself lives in proxy.mjs — one of the two adapters of the
 * frontend-owned contract in src/lib/api.ts, pinned by
 * contract/agh-proxy.contract.json. Allowed variance kept here: request bodies
 * pass through express.json({limit:'4mb'}), so oversized/malformed bodies are
 * rejected before the proxy (413/400; the Rust adapter has no such limit).
 */
import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { createAghProxy } from './proxy.mjs'
import { createVersionHandler } from './version.mjs'
import { createUpgradeHandler } from './upgrade.mjs'
import { checkCliUpdate } from './cli-update.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Load .env from the project root (does not override existing env vars); skip if missing
{
  const envPath = path.join(__dirname, '..', '.env')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      if (line.trim().startsWith('#')) continue
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}
const DIST = path.join(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT || 8787)
// HOSTS: comma-separated bind addresses; if unset, listen on all interfaces.
// e.g. HOSTS=127.0.0.1,<AGH_HOST>,10.126.126.2 → expose only to loopback,
// Tailscale and EasyTier; public interfaces are not bound
const HOSTS = (process.env.HOSTS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '4mb' }))

// —— CORS (unneeded for dev direct connect or same-origin deploys; opened just in case) ——
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-AGH-Target')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'adguard-home-console', time: Date.now() })
})

// Default target server (optional, prefills the login page)
app.get('/api/config', (_req, res) => {
  res.json({ defaultUrl: process.env.AGH_DEFAULT_URL || '' })\n})

// System version and remote update check
app.get('/api/system/version', createVersionHandler())

// System self-upgrade endpoints (guarded by AGH_ENABLE_SELF_UPGRADE)
const { upgradeHandler, statusHandler } = createUpgradeHandler()
app.post('/api/system/upgrade', upgradeHandler)
app.get('/api/system/upgrade/status', statusHandler)

// —— AGH reverse proxy (see proxy.mjs) ——
app.use('/api/agh', createAghProxy())

// —— Static assets + SPA fallback ——
app.use(express.static(DIST, { maxAge: '1h', index: false }))
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
  const index = path.join(DIST, 'index.html')
  if (fs.existsSync(index)) return res.sendFile(index)
  res
    .status(503)
    .send('<h3>前端尚未构建</h3><p>请先执行 <code>pnpm build</code>,或开发模式下访问 5173 端口。</p>')
})

// HOSTS: comma-separated; entries can be IPs or interface names (e.g. tailscale0, tun0).
// An interface name resolves its current IPv4 at bind time and rebinds when the address
// changes → self-heals across VPN subnet changes and slow startup
function ipv4Of(spec) {
  if (net.isIP(spec)) return spec
  const addrs = os.networkInterfaces()[spec]
  if (!addrs) return null
  const v4 = addrs.find((a) => a.family === 'IPv4')
  return v4 ? v4.address : null
}

const bound = new Map() // spec -> { srv, ip }

function listenOn(spec) {
  const ip = ipv4Of(spec)
  if (!ip) {
    // The VPN interface may come up after this server (e.g. Tailscale unassigned at boot)
    console.error(`[adguard-home-console] ${spec} has no IPv4 yet, retry in 10s`)
    return setTimeout(() => listenOn(spec), 10_000)
  }
  const srv = app.listen(PORT, ip, () => {
    console.log(`[adguard-home-console] http://${ip}:${PORT}  (${spec})  (dist: ${DIST})`)
  })
  bound.set(spec, { srv, ip })
  srv.on('error', (err) => {
    if (err.code === 'EADDRNOTAVAIL' || err.code === 'EADDRINUSE') {
      console.error(`[adguard-home-console] bind ${spec}(${ip}):${PORT} failed (${err.code}), retry in 10s`)
      setTimeout(() => listenOn(spec), 10_000)
    } else {
      console.error(`[adguard-home-console] fatal:`, err)
      process.exit(1)
    }
  })
}

function watchInterfaces(intervalMs = 60_000) {
  setInterval(() => {
    for (const [spec, entry] of [...bound]) {
      if (net.isIP(spec)) continue
      const cur = ipv4Of(spec)
      if (cur && cur !== entry.ip) {
        console.log(`[adguard-home-console] ${spec} address changed ${entry.ip} -> ${cur}, rebinding`)
        bound.delete(spec)
        entry.srv.closeAllConnections?.()
        entry.srv.close(() => listenOn(spec))
      }
    }
  }, intervalMs)
}

if (HOSTS.length > 0) {
  for (const spec of HOSTS) listenOn(spec)
  watchInterfaces()
} else {
  app.listen(PORT, () => {
    console.log(`[adguard-home-console] http://localhost:${PORT}  (dist: ${DIST})`)
  })
}

// Check for CLI updates in background after startup
setTimeout(() => {
  checkCliUpdate().catch(() => {})
}, 100)
