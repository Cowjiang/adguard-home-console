/**
 * 本地 Mock AdGuard Home v0.107.79 — 供 iOS 两条线(Tauri 壳 / SwiftUI 原生)离线测试。
 * 用法:node scripts/mock-agh.mjs  → 监听 127.0.0.1:3990
 * 鉴权:任意非空 Basic 凭据即可(缺 Authorization → 401),用于走通 401 分支。
 * 契约依据:src/lib/api.ts + docs/AGH_API.md
 *   - interval/duration 单位毫秒;avg_processing_time 与 top_upstreams_avg_time 是秒(浮点)
 *   - stats 的 top_* 为单键对象数组(新格式);reason 为 12 个字符串枚举
 *   - /protection POST {enabled, duration(ms)};状态在内存中可变,供 UI 操作回读
 * 只用 Node 内置模块,无第三方依赖。
 */
import http from 'node:http'

const PORT = 3990
const startedAt = Date.now() - 3 * 3600_000 - 42 * 60_000

// ---------- 内存状态 ----------
const state = {
  protectionEnabled: true,
  protectionDisabledUntil: null, // ISO string | null
  protectionDisabledDuration: 0, // ms
  querylogConfig: { enabled: true, interval: 6 * 3600_000, anonymize_client_ip: false, ignored: [], ignored_enabled: false },
  statsConfig: { enabled: true, interval: 24 * 3600_000, ignored: [], ignored_enabled: false },
  dnsInfo: {
    upstream_dns: ['https://dns.google/dns-query', 'https://cloudflare-dns.com/dns-query', '223.5.5.5'],
    bootstrap_dns: ['223.5.5.5', '119.29.29.29'],
    fallback_dns: ['https://doh.pub/dns-query'],
    protection_enabled: true,
    ratelimit: 20,
    ratelimit_whitelist: [],
    ratelimit_subnet_len_ipv4: 24,
    ratelimit_subnet_len_ipv6: 56,
    upstream_timeout: 5000,
    upstream_mode: 'load_balance',
    blocking_mode: 'default',
    blocking_ipv4: '',
    blocking_ipv6: '',
    blocked_response_ttl: 10,
    edns_cs_enabled: true,
    edns_cs_use_custom: false,
    edns_cs_custom_ip: '',
    disable_ipv6: false,
    dnssec_enabled: false,
    cache_enabled: true,
    cache_size: 4 * 1024 * 1024,
    cache_ttl_min: 600,
    cache_ttl_max: 86400,
    cache_optimistic: true,
    use_private_ptr_resolvers: true,
    resolve_clients: true,
    local_ptr_upstreams: [],
  },
  filtering: {
    enabled: true,
    interval: 24 * 3600_000,
    filters: [
      { url: 'https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt', name: 'AdGuard DNS filter', id: 1, enabled: true, rules_count: 50123, last_updated: new Date(Date.now() - 26 * 3600_000).toISOString(), last_checked: new Date(Date.now() - 2 * 3600_000).toISOString() },
      { url: 'https://adguardteam.github.io/HostlistsRegistry/assets/filter_11.txt', name: 'Chinese filter', id: 2, enabled: true, rules_count: 128456, last_updated: new Date(Date.now() - 49 * 3600_000).toISOString(), last_checked: new Date(Date.now() - 5 * 3600_000).toISOString() },
    ],
    whitelist_filters: [
      { url: 'https://adguardteam.github.io/HostlistsRegistry/assets/allowlist_1.txt', name: 'AdGuard DNS allowlist', id: 3, enabled: true, rules_count: 4211, last_updated: new Date(Date.now() - 72 * 3600_000).toISOString(), last_checked: new Date(Date.now() - 6 * 3600_000).toISOString() },
    ],
    user_rules: ['@@||cn.bing.com^$important', '||internal.corp^$dnstype=AAAA'],
  },
  rewriteSettings: { enabled: true },
  rewrites: [
    { domain: 'nas.home.arpa', answer: '192.168.1.20', enabled: true },
    { domain: 'printer.home.arpa', answer: '192.168.1.88', enabled: true },
  ],
  blockedServiceIds: ['youtube', 'tiktok'],
  clients: [
    {
      name: 'Cindy-MacBook', ids: ['192.168.1.50'], use_global_settings: true, filtering_enabled: true,
      safebrowsing_enabled: false, parental_enabled: false, use_global_blocked_services: true, blocked_services: [],
      ignore_querylog: false, ignore_statistics: false, upstreams_cache_enabled: true, upstreams_cache_size: 1000,
      tags: [], safe_search: { enabled: false },
    },
  ],
  accessList: { allowed_clients: [], disallowed_clients: [], blocked_hosts: ['mail spamhaus org'] },
}

// ---------- 确定性样本数据 ----------
const DOMAINS = [
  'www.google.com', 'api.github.com', 'cdn.jsdelivr.net', 'www.youtube.com', 'fonts.googleapis.com',
  'graph.microsoft.com', 'hub.fastgit.org', ' telemetry.microsoft.com'.trim(), 'www.bilibili.com', 's1.hdslb.com',
  'adservice.google.com', 'doubleclick.net', 'analytics.tiktok.com', 'www.apple.com', 'ocsp.apple.com',
  'dns.msftncsi.com', 'www.baidu.com', 'microsoft.com', 'update.googleapis.com', 'cloudflare.com',
]
const BLOCKED = [
  'adservice.google.com', 'doubleclick.net', 'analytics.tiktok.com', 'tracker.example.com', 'ads.hdslb.com',
  'pixel.facebook.com', 'stats.g.doubleclick.net', 'ad.doubleclick.net', 'baidumobads.baidu.com',
]
const CLIENT_IPS = ['192.168.1.50', '192.168.1.51', '192.168.1.66', '100.76.99.57', '192.168.1.23']
const CLIENT_NAMES = { '192.168.1.50': 'Cindy-MacBook', '192.168.1.51': 'iPhone-15', '192.168.1.66': 'iPad-Pro', '100.76.99.57': 'VPS-Tailscale', '192.168.1.23': 'LivingTV' }
const REASONS_OK = ['NotFilteredNotFound', 'NotFilteredNotFound', 'NotFilteredNotFound', 'NotFilteredWhiteList', 'NotFilteredError']
const REASONS_BLOCK = ['FilteredBlackList', 'FilteredBlackList', 'FilteredBlockedService', 'FilteredSafeBrowsing', 'FilteredParental', 'FilteredInvalid']
const REASONS_RW = ['Rewrite', 'RewriteEtcHosts', 'RewriteRule', 'FilteredSafeSearch']
const QTYPES = ['A', 'AAAA', 'HTTPS', 'TXT', 'MX', 'SRV', 'CNAME', 'PTR']

// seeded pseudo-random,保证多次启动数据形态一致
let seed = 42
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)] }
function int(lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)) }

// 24h 统计(oldest→newest)
const hourQueries = Array.from({ length: 24 }, (_, i) => 380 + int(0, 260) + Math.round(120 * Math.sin(i / 3.4)))
const hourBlocked = hourQueries.map((q, i) => Math.round(q * (0.09 + 0.13 * Math.abs(Math.sin(i / 5)))))
const stats = {
  time_units: 'hours',
  num_dns_queries: hourQueries.reduce((a, b) => a + b, 0),
  num_blocked_filtering: hourBlocked.reduce((a, b) => a + b, 0),
  num_replaced_safebrowsing: 17,
  num_replaced_safesearch: 9,
  num_replaced_parental: 4,
  avg_processing_time: 0.0234, // 秒(浮点),前端 fmtMs 负责换算
  dns_queries: hourQueries,
  blocked_filtering: hourBlocked,
  replaced_safebrowsing: hourQueries.map((_, i) => (i % 7 === 3 ? 2 : 0)),
  replaced_parental: hourQueries.map(() => 0),
  top_queried_domains: DOMAINS.slice(0, 12).map((d, i) => ({ [d]: 900 - i * 47 + int(0, 30) })),
  top_blocked_domains: BLOCKED.map((d, i) => ({ [d]: 420 - i * 38 + int(0, 20) })),
  top_clients: CLIENT_IPS.map((ip, i) => ({ [ip]: 1500 - i * 260 + int(0, 90) })),
  top_upstreams_responses: [
    { 'https://dns.google/dns-query': 5230 },
    { 'https://cloudflare-dns.com/dns-query': 3110 },
    { '223.5.5.5:53': 1890 },
    { 'https://doh.pub/dns-query': 742 },
  ],
  top_upstreams_avg_time: [ // 秒(浮点)
    { 'https://dns.google/dns-query': 0.0312 },
    { 'https://cloudflare-dns.com/dns-query': 0.0181 },
    { '223.5.5.5:53': 0.0092 },
    { 'https://doh.pub/dns-query': 0.0444 },
  ],
}

// 查询日志:600 条,时间倒序
const LOG_TOTAL = 600
const logItems = []
for (let i = 0; i < LOG_TOTAL; i++) {
  seed = 1000 + i
  const bucket = i % 20 === 0 ? 'block' : i % 37 === 0 ? 'rw' : 'ok'
  const reason = bucket === 'block' ? pick(REASONS_BLOCK) : bucket === 'rw' ? pick(REASONS_RW) : pick(REASONS_OK)
  const domain = bucket === 'block' ? pick(BLOCKED) : pick(DOMAINS)
  const client = pick(CLIENT_IPS)
  const t = new Date(Date.now() - i * 31_000 - int(0, 25_000))
  const item = {
    time: t.toISOString(),
    question: { name: domain, type: pick(QTYPES), class: 'IN' },
    status: 'NOERROR',
    reason,
    client,
    client_proto: i % 5 === 0 ? 'tls' : 'plain',
    client_info: { name: CLIENT_NAMES[client] || '', whois: {}, disallowed: false },
    upstream: reason.startsWith('Rewrite') || reason === 'FilteredSafeSearch' ? '' : pick(['https://dns.google/dns-query', 'https://cloudflare-dns.com/dns-query', '223.5.5.5:53']),
    cached: i % 6 === 0,
    answer_dnssec: i % 23 === 0,
    elapsedMs: (2 + rnd() * 60).toFixed(4),
  }
  if (bucket === 'block') {
    item.rules = [{ filter_list_id: i % 2 ? 1 : 2, text: `||${domain}^` }]
    item.rule = `||${domain}^`
    item.filterId = i % 2 ? 1 : 2
  }
  if (bucket !== 'block') {
    item.answer = [
      { type: domain.endsWith('.arpa') ? 'PTR' : item.question.type === 'AAAA' ? 'AAAA' : 'A', value: domain.endsWith('.arpa') ? 'Cindy-MacBook.lan' : `93.184.216.${int(2, 250)}`, ttl: 300 + int(0, 3000) },
    ]
    item.original_answer = item.answer
  }
  if (i % 41 === 0) item.ecs = '116.24.0.0/16'
  if (i % 53 === 0) item.service_name = 'youtube'
  logItems.push(item)
}

const BLOCKED_SERVICES = [
  ['youtube', 'YouTube'], ['tiktok', 'TikTok'], ['netflix', 'Netflix'], ['instagram', 'Instagram'], ['facebook', 'Facebook'],
  ['x', 'X (Twitter)'], ['reddit', 'Reddit'], ['discord', 'Discord'], ['whatsapp', 'WhatsApp'], ['spotify', 'Spotify'],
  ['amazon', 'Amazon'], ['twitch', 'Twitch'],
].map(([id, name]) => ({
  id, name,
  icon_svg: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${id === 'youtube' ? '#f00' : '#56f'}"/><text x="12" y="16" font-size="9" text-anchor="middle" fill="#fff">${name[0]}</text></svg>`).toString('base64'),
  rules: [`||${id}.com^`],
  group_id: 'grp_' + id,
}))

// ---------- 状态推导 ----------
function statusPayload() {
  const s = {
    version: '0.107.79',
    language: 'zh-cn',
    dns_addresses: ['127.0.0.1', '192.168.1.10', '100.76.99.57'],
    dns_port: 53,
    http_port: PORT,
    protection_enabled: state.protectionEnabled,
    protection_disabled_duration: state.protectionDisabledDuration,
    dhcp_available: true,
    running: true,
    start_time: startedAt,
  }
  if (!state.protectionEnabled && state.protectionDisabledUntil) s.protection_disabled_until = state.protectionDisabledUntil
  return s
}

// ---------- HTTP 骨架 ----------
function json(res, code, body) {
  const text = JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-AGH-Target',
  })
  res.end(text)
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}) } catch { resolve({}) } })
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {})
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const p = url.pathname.replace(/^\/control/, '')
  const auth = req.headers.authorization || ''
  if (!auth.startsWith('Basic ')) return json(res, 401, { error: 'Unauthorized' })
  const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':')
  if (!user || pass === undefined) return json(res, 401, { error: 'Unauthorized' })
  const body = await readBody(req)
  await new Promise((r) => setTimeout(r, 8)) // 模拟网络延迟

  switch (`${req.method} ${p}`) {
    case 'GET /status': return json(res, 200, statusPayload())
    case 'GET /stats': return json(res, 200, stats)
    case 'POST /protection': {
      state.protectionEnabled = !!body.enabled
      const dur = Number(body.duration) || 0
      if (state.protectionEnabled) {
        state.protectionDisabledDuration = 0
        state.protectionDisabledUntil = null
      } else {
        state.protectionDisabledDuration = dur
        state.protectionDisabledUntil = dur > 0 ? new Date(Date.now() + dur).toISOString() : null
      }
      return json(res, 200, {})
    }
    case 'GET /querylog': {
      let items = logItems
      const search = (url.searchParams.get('search') || '').toLowerCase()
      const reasons = url.searchParams.getAll('reason')
      const olderThan = url.searchParams.get('older_than')
      const offset = parseInt(url.searchParams.get('offset') || '0', 10)
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '300', 10) || 300, 1000)
      if (search) items = items.filter((it) => it.question.name.includes(search) || it.client.includes(search))
      if (reasons.length) items = items.filter((it) => reasons.includes(it.reason))
      if (olderThan) items = items.filter((it) => it.time < olderThan)
      const data = items.slice(offset, offset + limit)
      return json(res, 200, { data, oldest: items.length ? items[items.length - 1].time : null })
    }
    case 'GET /filtering/status': return json(res, 200, state.filtering)
    case 'PUT /filtering/config': {
      if (typeof body.enabled === 'boolean') state.filtering.enabled = body.enabled
      if (Number.isFinite(Number(body.interval))) state.filtering.interval = Number(body.interval)
      return json(res, 200, {})
    }
    case 'POST /filtering/set_rules': return json(res, 200, {})
    case 'POST /filtering/refresh': {
      await new Promise((r) => setTimeout(r, 1500)) // 模拟长任务
      return json(res, 200, { updated: 0 })
    }
    case 'GET /filtering/check_host': {
      const name = url.searchParams.get('name') || ''
      const hit = BLOCKED.find((d) => name.endsWith(d.replace(/^www\./, '')))
      return hit
        ? json(res, 200, { reason: 'FilteredBlackList', rule: `||${hit}^`, filter_list_id: 1 })
        : json(res, 200, { reason: 'NotFilteredNotFound' })
    }
    case 'GET /clients': {
      const auto = CLIENT_IPS.slice(1).map((ip) => ({ ip, name: CLIENT_NAMES[ip], source: 'etc_hosts', whois_info: {} }))
      return json(res, 200, { clients: state.clients, auto_clients: auto })
    }
    case 'POST /clients/add': state.clients.push({ use_global_settings: true, filtering_enabled: true, safebrowsing_enabled: false, parental_enabled: false, use_global_blocked_services: true, blocked_services: [], ignore_querylog: false, ignore_statistics: false, upstreams_cache_enabled: true, upstreams_cache_size: 1000, ...body }); return json(res, 200, {})
    case 'POST /clients/update': {
      const i = state.clients.findIndex((c) => c.name === body.name)
      if (i >= 0) state.clients[i] = { ...state.clients[i], ...body.data }
      return json(res, 200, {})
    }
    case 'POST /clients/delete': {
      state.clients = state.clients.filter((c) => c.name !== body.name)
      return json(res, 200, {})
    }
    case 'GET /rewrite': return json(res, 200, { servers: state.rewrites })
    case 'GET /rewrite/settings': return json(res, 200, state.rewriteSettings)
    case 'PUT /rewrite/settings/update': state.rewriteSettings = { enabled: !!body.enabled }; return json(res, 200, {})
    case 'POST /rewrite/add': state.rewrites.push({ domain: body.domain, answer: body.answer, enabled: true }); return json(res, 200, {})
    case 'POST /rewrite/delete': state.rewrites = state.rewrites.filter((r) => !(r.domain === body.domain && r.answer === body.answer)); return json(res, 200, {})
    case 'PUT /rewrite/update': {
      const i = state.rewrites.findIndex((r) => r.domain === body.target.domain)
      if (i >= 0) state.rewrites[i] = { ...state.rewrites[i], ...body.update }
      return json(res, 200, {})
    }
    case 'GET /blocked_services/all': return json(res, 200, BLOCKED_SERVICES)
    case 'GET /blocked_services/get': return json(res, 200, { ids: state.blockedServiceIds, schedule: { time_zone: 'Local', entries: [] } })
    case 'PUT /blocked_services/update': state.blockedServiceIds = body.ids || []; return json(res, 200, {})
    case 'GET /querylog/config': return json(res, 200, state.querylogConfig)
    case 'PUT /querylog/config/update': state.querylogConfig = { ...state.querylogConfig, ...body }; return json(res, 200, {})
    case 'GET /stats/config': return json(res, 200, state.statsConfig)
    case 'PUT /stats/config/update': state.statsConfig = { ...state.statsConfig, ...body }; return json(res, 200, {})
    case 'GET /dns_info':
    case 'GET /dns/info': return json(res, 200, state.dnsInfo)
    case 'POST /dns_config':
    case 'PUT /dns/config': state.dnsInfo = { ...state.dnsInfo, ...body }; return json(res, 200, {})
    case 'POST /test_upstream_dns': return json(res, 200, {})
    case 'GET /access/list': return json(res, 200, state.accessList)
    case 'POST /access/set':
    case 'PUT /access/set': state.accessList = { allowed_clients: body.allowed_clients || [], disallowed_clients: body.disallowed_clients || [], blocked_hosts: body.blocked_hosts || [] }; return json(res, 200, {})
    case 'POST /tls/validate': return json(res, 200, { valid_pair: true, warning_validation: '' })
    case 'POST /tls/configure': return json(res, 200, {})
    case 'GET /tls/status': return json(res, 200, { enabled: false, server_name: '', force_https: false, serve_plain_dns: true, port_https: 443, port_dns_over_tls: 853, port_dns_over_quic: 853, valid_cert: false, valid_chain: false, valid_key: false, valid_pair: false })
    case 'GET /dhcp/status': return json(res, 200, { enabled: false, interface_name: '', v4: { gateway_ip: '', subnet_mask: '', range_start: '', range_end: '', lease_duration: 0 }, v6: { range_start: '', lease_duration: 0 }, leases: [], static_leases: [] })
    case 'GET /dhcp/interfaces': return json(res, 200, { interfaces: [] })
    case 'POST /dhcp/set_config': return json(res, 200, {})
    case 'POST /dhcp/find_active_dhcp': return json(res, 200, { v4: null, v6: null })
    case 'POST /dhcp/add_static_lease': return json(res, 200, {})
    case 'POST /dhcp/remove_static_lease': return json(res, 200, {})
    case 'GET /parental/status': return json(res, 200, { enabled: false })
    case 'POST /parental/update': return json(res, 200, {})
    case 'GET /safebrowsing/status': return json(res, 200, { enabled: false })
    case 'POST /safebrowsing/update': return json(res, 200, {})
    case 'GET /safesearch/status': return json(res, 200, { enabled: false, bing: false, duckduckgo: false, ecosia: false, google: false, mozillagateway: false, qwant: false, searx: false, yandex: false })
    case 'PUT /safesearch/settings': return json(res, 200, {})
    case 'POST /cache_clear': return json(res, 200, {})
    case 'POST /version.json': return json(res, 200, { disabled: true })
    case 'POST /update': return json(res, 200, {})
    default: return json(res, 400, { error: `mock 未实现: ${req.method} /control${p}` })
  }
})

server.listen(PORT, '127.0.0.1', () => console.log(`[mock-agh] listening on http://127.0.0.1:${PORT} (any non-empty Basic credentials accepted)`))
process.on('uncaughtException', (e) => console.error('[mock-agh] uncaught:', e.message))
