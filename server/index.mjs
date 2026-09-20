/**
 * AdGuard Home Console — 本地服务
 * 1. 托管前端构建产物(SPA)
 * 2. 反向代理 /api/agh/* 到用户配置的 AdGuard Home,绕过浏览器 CORS 限制
 */
import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 加载项目根目录 .env(不覆盖已存在的环境变量);文件缺失则跳过
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
// HOSTS:逗号分隔的绑定地址;不设则监听所有网卡。
// 例:HOSTS=127.0.0.1,<AGH_HOST>,10.126.126.2 → 只暴露给回环/Tailscale/EasyTier,公网网卡不监听
const HOSTS = (process.env.HOSTS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '4mb' }))

// —— CORS(开发期直连或同源部署都不需要,保险起见放开)——
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

// 默认目标服务器(可选,方便登录页预填)
app.get('/api/config', (_req, res) => {
  res.json({ defaultUrl: process.env.AGH_DEFAULT_URL || '' })
})

// —— AGH 反向代理 ——
const MAX_REDIRECTS = 3

async function proxyAGH(req, res, target, authHeader, redirects = 0) {
  try {
    const targetUrl = new URL(target)
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return res.status(400).json({ error: '目标地址必须是 http:// 或 https://' })
    }
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
      // 过滤器全量刷新需从各 URL 下载规则,耗时远超普通接口
      signal: AbortSignal.timeout(req.path.includes('/filtering/refresh') ? 120_000 : 25_000),
    })

    // 跟随上游重定向(例如 http->https 308)
    if ([301, 302, 307, 308].includes(r.status) && r.headers.get('location') && redirects < MAX_REDIRECTS) {
      const loc = new URL(r.headers.get('location'), upstream).origin
      return proxyAGH(req, res, loc, authHeader, redirects + 1)
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

// —— 静态资源 + SPA 回退 ——
app.use(express.static(DIST, { maxAge: '1h', index: false }))
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
  const index = path.join(DIST, 'index.html')
  if (fs.existsSync(index)) return res.sendFile(index)
  res
    .status(503)
    .send('<h3>前端尚未构建</h3><p>请先执行 <code>npm run build</code>,或开发模式下访问 5173 端口。</p>')
})

// HOSTS:逗号分隔;条目可以是 IP,也可以是网卡名(如 tailscale0、tun0)。
// 网卡名在绑定时解析当前 IPv4,并在地址变化时自动重绑 → VPN 换网段/开机未就绪均能自愈
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
    // VPN 网卡可能晚于本服务就绪(如开机时 Tailscale 尚未分配地址)
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
