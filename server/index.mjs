/**
 * AdGuard Home Console — local server
 * 1. Serves the frontend build output (SPA)
 * 2. Reverse-proxies /api/agh/* to the user-configured AdGuard Home, bypassing
 *    browser CORS limits
 */
import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

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
  res.json({ defaultUrl: process.env.AGH_DEFAULT_URL || '' })
})

// —— AGH reverse proxy ——
const MAX_REDIRECTS = 3

async function proxyAGH(req, res, target, authHeader, redirects = 0, originHost) {
  try {
    const targetUrl = new URL(target)
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return res.status(400).json({ error: '目标地址必须是 http:// 或 https://' })
    }
    // First hop pins the host; every later hop must stay on it (see the redirect branch)
    const pinnedHost = originHost ?? targetUrl.hostname
    const upstream = new URL(req.originalUrl.replace(/^\/api\/agh/, '/control'), targetUrl.origin)

    const headers = {}
    if (authHeader) headers['Authorization'] = authHeader
    const ct = req.headers['content-type']
    if (ct) headers['Content-Type'] = ct

    let body
    if (!['GET', 'HEAD'].includes(req.method)) {
      body = JSON.stringify(req.body ?? {})
      headers['Content-Type'] = headers['Content-Type'] || 'application/json'
    }

    const r = await fetch(upstream, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      // Full filter refresh downloads rules from each URL, far slower than normal endpoints
      signal: AbortSignal.timeout(req.path.includes('/filtering/refresh') ? 120_000 : 25_000),
    })

    // Follow upstream redirects (e.g. http->https 308). Only same-host hops: replaying
    // Authorization to another host would hand the admin password to that host; the
    // scheme/port may change, the hostname may not
    if ([301, 302, 307, 308].includes(r.status) && r.headers.get('location') && redirects < MAX_REDIRECTS) {
      const loc = new URL(r.headers.get('location'), upstream)
      if (loc.hostname !== pinnedHost) {
        return res.status(502).json({ error: '上游重定向到其他主机,已拒绝转发凭据' })
      }
      return proxyAGH(req, res, loc.origin, authHeader, redirects + 1, pinnedHost)
    }

    const text = await r.text()
    res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(text)
  } catch (err) {
    const msg = err?.name === 'TimeoutError' ? '连接超时,请检查地址与网络' : String(err?.cause?.message || err?.message || err)
    res.status(502).json({ error: msg })
  }
}

app.use('/api/agh', (req, res) => {
  const target = req.get('X-AGH-Target')
  if (!target) return res.status(400).json({ error: '缺少 X-AGH-Target 头' })
  const auth = req.get('Authorization')
  proxyAGH(req, res, target.trim(), auth)
})

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
