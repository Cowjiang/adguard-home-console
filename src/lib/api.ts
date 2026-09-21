/**
 * AGH API 客户端
 * 所有请求经本服务代理(/api/agh/* → 目标 AGH /control/*),
 * 通过 X-AGH-Target 头指定目标服务器,Authorization 携带 Basic 凭据。
 */
import type { SvrConfig } from './auth'
export type { SvrConfig }

/** SWR 通用 fetcher:useSWR<T>([name, cfg, path], swrFetcher) */
export const swrFetcher = <T,>(args: readonly [string, SvrConfig, string]): Promise<T> =>
  api<T>(args[1], args[2])

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function basicAuth(user: string, pass: string): string {
  return 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass)))
}

/** Tauri 壳探测:iOS/桌面壳内走 Rust 代理(agh_fetch),绕过 WebView 的 CORS */
type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
function getTauriInvoke(): TauriInvoke | null {
  const w = window as unknown as { __TAURI_INTERNALS__?: { invoke?: TauriInvoke } }
  return w.__TAURI_INTERNALS__?.invoke ?? null
}

/** agh_fetch 返回结构(Rust 侧 AghFetchResult,serde 字段名保持 snake_case) */
interface AghFetchResult {
  status: number
  content_type: string
  body_text: string
}

export async function api<T = unknown>(
  cfg: SvrConfig,
  path: string,
  opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const method = opts.method ?? 'GET'
  let status: number
  let text: string
  const invoke = getTauriInvoke()
  if (invoke) {
    // Tauri 壳:Rust 代理,行为对齐 server/index.mjs 的 proxyAGH
    // (路径归一 /api/agh → /control、重定向、超时、错误语义均在 Rust 侧完成)
    try {
      const r = (await invoke('agh_fetch', {
        method,
        target: cfg.url,
        authHeader: basicAuth(cfg.username, cfg.password),
        pathWithQuery: '/api/agh' + path,
        bodyJson: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
      })) as AghFetchResult
      status = r.status
      text = r.body_text ?? ''
    } catch (e) {
      // IPC 层失败(命令缺失/序列化异常等):与网络错误同语义
      throw new ApiError(502, String((e as Error)?.message ?? e))
    }
  } else {
    const url = '/api/agh' + path
    const headers: Record<string, string> = {
      'X-AGH-Target': cfg.url,
      Authorization: basicAuth(cfg.username, cfg.password),
    }
    if (method !== 'GET') headers['Content-Type'] = 'application/json'
    const r = await fetch(url, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
      signal: opts.signal,
    })
    status = r.status
    text = await r.text()
  }
  let data: any = undefined
  try {
    data = text ? JSON.parse(text) : undefined
  } catch {
    /* 非 JSON 响应 */
  }
  if (status < 200 || status >= 300) {
    const msg = data?.error || data?.message || text?.slice(0, 200) || `HTTP ${status}`
    throw new ApiError(status, msg)
  }
  return data as T
}

/** 带 query 的 GET 路径 */
export function qs(params: Record<string, string | number | string[] | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue
    if (Array.isArray(v)) for (const item of v) sp.append(k, item)
    else sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? '?' + s : ''
}

// ---------- 类型定义(v0.107.79) ----------

export interface Status {
  version: string
  language: string
  dns_addresses: string[]
  dns_port: number
  http_port: number
  protection_enabled: boolean
  protection_disabled_duration: number
  protection_disabled_until?: string
  dhcp_available: boolean
  running: boolean
  start_time: number
}

export interface Stats {
  time_units: 'hours' | 'days'
  num_dns_queries: number
  num_blocked_filtering: number
  num_replaced_safebrowsing: number
  num_replaced_safesearch: number
  num_replaced_parental: number
  avg_processing_time: number
  dns_queries: number[]
  blocked_filtering: number[]
  replaced_safebrowsing: number[]
  replaced_parental: number[]
  top_queried_domains: KVMap
  top_blocked_domains: KVMap
  top_clients: KVMap
  top_upstreams_responses: KVMap
  top_upstreams_avg_time: KVMap
}

/** v0.107.79 返回单键对象数组,旧版为字典 */
export type KVMap = Record<string, number> | Record<string, number>[]

export interface QueryLogItem {
  time: string
  question: { name: string; type: string; class: string }
  answer?: { type: string; value: string; ttl: number }[]
  original_answer?: { type: string; value: string; ttl: number }[]
  status: string
  reason: string
  rules?: { filter_list_id: number; text: string }[]
  rule?: string
  filterId?: number
  service_name?: string
  client: string
  client_id?: string
  client_proto: string
  client_info: { name: string; whois: Record<string, string>; disallowed_rule?: string; disallowed?: boolean }
  upstream: string
  cached: boolean
  answer_dnssec: boolean
  elapsedMs: string
  ecs?: string
}

export interface Filter {
  url: string
  name: string
  id: number
  enabled: boolean
  rules_count: number
  last_updated?: string
  last_checked?: string
}

export interface FilteringStatus {
  enabled: boolean
  interval: number
  filters: Filter[]
  whitelist_filters: Filter[]
  user_rules: string[]
}

export interface DnsInfo {
  upstream_dns: string[]
  bootstrap_dns: string[]
  fallback_dns: string[]
  protection_enabled: boolean
  protection_disabled_until?: string
  ratelimit: number
  ratelimit_whitelist: string[]
  ratelimit_subnet_len_ipv4: number
  ratelimit_subnet_len_ipv6: number
  upstream_timeout: number
  upstream_mode: string
  blocking_mode: 'default' | 'refused' | 'nxdomain' | 'null_ip' | 'custom_ip'
  blocking_ipv4: string
  blocking_ipv6: string
  blocked_response_ttl: number
  edns_cs_enabled: boolean
  edns_cs_use_custom: boolean
  edns_cs_custom_ip: string
  disable_ipv6: boolean
  dnssec_enabled: boolean
  cache_enabled: boolean
  cache_size: number
  cache_ttl_min: number
  cache_ttl_max: number
  cache_optimistic: boolean
  use_private_ptr_resolvers: boolean
  resolve_clients: boolean
  local_ptr_upstreams: string[]
  default_local_ptr_upstreams?: string[]
}

export interface TlsStatus {
  enabled: boolean
  server_name: string
  force_https: boolean
  serve_plain_dns?: boolean
  port_https: number
  port_dns_over_tls: number
  port_dns_over_quic: number
  subject?: string
  issuer?: string
  key_type?: string
  not_before?: string
  not_after?: string
  dns_names?: string[]
  valid_cert: boolean
  valid_chain: boolean
  valid_key: boolean
  valid_pair: boolean
  warning_validation?: string
  certificate_chain?: string
  private_key?: string
  private_key_saved?: boolean
  certificate_path?: string
  private_key_path?: string
  port_dnscrypt?: number
  dnscrypt_config_file?: string
}

export interface AghClient {
  name: string
  ids: string[]
  use_global_settings: boolean
  filtering_enabled: boolean
  safebrowsing_enabled: boolean
  parental_enabled: boolean
  safe_search?: { enabled: boolean }
  use_global_blocked_services: boolean
  blocked_services: string[]
  blocked_services_schedule?: unknown
  upstreams?: string[]
  tags?: string[]
  ignore_querylog: boolean
  ignore_statistics: boolean
  upstreams_cache_enabled: boolean
  upstreams_cache_size: number
}

export interface AutoClient {
  ip: string
  name: string
  source: string
  whois_info?: Record<string, string>
}

export interface ClientsData {
  clients: AghClient[] | null
  auto_clients: AutoClient[] | null
}

export interface RewriteEntry {
  domain: string
  answer: string
  enabled?: boolean
}

export interface BlockedService {
  id: string
  name: string
  icon_svg?: string
  rules: string[]
  group_id?: string
}

export interface DhcpStatus {
  enabled: boolean
  interface_name: string
  v4: { gateway_ip: string; subnet_mask: string; range_start: string; range_end: string; lease_duration: number }
  v6: { range_start: string; lease_duration: number }
  leases: { mac: string; ip: string; hostname: string; expires: string }[]
  static_leases: { mac: string; ip: string; hostname: string }[]
}

export interface QueryLogConfig {
  enabled: boolean
  interval: number
  anonymize_client_ip: boolean
  ignored: string[]
  ignored_enabled: boolean
}

export interface StatsConfig {
  enabled: boolean
  interval: number
  ignored: string[]
  ignored_enabled: boolean
}

export interface VersionInfo {
  disabled: boolean
  new_version?: string
  announcement?: string
  announcement_url?: string
  can_autoupdate?: boolean
}
