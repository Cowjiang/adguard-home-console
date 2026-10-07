/**
 * AGH API client — owner of the frontend proxy contract.
 * All requests go through this app's proxy (/api/agh/* → target AGH /control/*);
 * X-AGH-Target selects the target server, Authorization carries Basic credentials.
 *
 * Proxy contract (implemented by two adapters, pinned by
 * contract/agh-proxy.contract.json — server/proxy.mjs for web/PWA,
 * src-tauri/src/proxy.rs `agh_fetch` for the Tauri shell):
 * - Request: `<method> /api/agh<path>` with X-AGH-Target + Authorization
 *   (Basic); non-GET bodies are JSON strings.
 * - Result: upstream status + raw body text; responses pass through untouched.
 * - Adapter-generated failures are `{"error","kind"}` JSON with status 400/502;
 *   `kind` is mapped to localized copy here (AghProxyErrorKind), upstream
 *   errors are surfaced as-is.
 */
import { i18n } from './i18n'
import type { SvrConfig } from './auth'
export type { SvrConfig }

/** Request the contract adapters accept */
export interface AghProxyRequest {
  method: string
  target: string
  authHeader: string
  pathWithQuery: string
  bodyJson?: string
}

/** Result both adapters return (serde field names stay snake_case on the Rust side) */
export interface AghProxyResult {
  status: number
  contentType: string
  bodyText: string
}

/** Machine-readable failure kinds emitted by the adapters as `{"error","kind"}`;
 *  mapped to localized messages here so no copy lives in either adapter */
export type AghProxyErrorKind =
  | 'missing_target'
  | 'invalid_target'
  | 'timeout'
  | 'cross_host_redirect'
  | 'invalid_redirect'
  | 'network'

const PROXY_ERROR_KEYS = {
  missing_target: 'proxy.missingTarget',
  invalid_target: 'proxy.invalidTarget',
  timeout: 'proxy.timeout',
  cross_host_redirect: 'proxy.crossHostRedirect',
  invalid_redirect: 'proxy.invalidRedirect',
  network: 'proxy.network',
} as const satisfies Record<AghProxyErrorKind, string>

/** Shared SWR fetcher: useSWR<T>([name, cfg, path], swrFetcher) */
export const swrFetcher = <T,>(args: readonly [string, SvrConfig, string]): Promise<T> =>
  api<T>(args[1], args[2])

export class ApiError extends Error {
  status: number
  /** Present when the failure was adapter-generated (vs upstream passthrough) */
  kind?: AghProxyErrorKind
  /** Adapter-supplied technical detail; messages shown to users are localized */
  detail?: string
  constructor(status: number, message: string, opts?: { kind?: AghProxyErrorKind; detail?: string }) {
    super(message)
    this.status = status
    this.kind = opts?.kind
    this.detail = opts?.detail
  }
}

function basicAuth(user: string, pass: string): string {
  return 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass)))
}

/** Tauri shell detection: inside the iOS/desktop shell go through the Rust
 *  proxy (agh_fetch), bypassing WebView CORS */
type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
function getTauriInvoke(): TauriInvoke | null {
  const w = window as unknown as { __TAURI_INTERNALS__?: { invoke?: TauriInvoke } }
  return w.__TAURI_INTERNALS__?.invoke ?? null
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
    // Tauri shell: Rust proxy — the same contract as the Express adapter
    // (path normalization /api/agh → /control, redirects, timeouts and error
    // kinds are all implemented Rust-side per contract/agh-proxy.contract.json)
    const req: AghProxyRequest = {
      method,
      target: cfg.url,
      authHeader: basicAuth(cfg.username, cfg.password),
      pathWithQuery: '/api/agh' + path,
      bodyJson: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
    }
    try {
      const r = (await invoke('agh_fetch', { ...req })) as {
        status: number
        content_type: string
        body_text: string
      }
      status = r.status
      text = r.body_text ?? ''
    } catch (e) {
      // IPC failure (missing command / serialization error etc.): same
      // semantics as a network error
      const detail = String((e as Error)?.message ?? e)
      throw new ApiError(502, i18n.t(PROXY_ERROR_KEYS.network), { kind: 'network', detail })
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
    /* Non-JSON response */
  }
  if (status < 200 || status >= 300) {
    // Adapter-generated failures carry a machine-readable kind; the copy for
    // it lives here. Upstream errors pass through untouched.
    const kind = (data?.kind as AghProxyErrorKind) in PROXY_ERROR_KEYS ? (data.kind as AghProxyErrorKind) : undefined
    if (kind) {
      throw new ApiError(status, i18n.t(PROXY_ERROR_KEYS[kind]), {
        kind,
        detail: typeof data?.error === 'string' ? data.error : undefined,
      })
    }
    const msg = data?.error || data?.message || text?.slice(0, 200) || `HTTP ${status}`
    throw new ApiError(status, msg)
  }
  return data as T
}

/** GET path with query string */
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

// ---------- Type definitions (v0.107.79) ----------

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

/** v0.107.79 returns single-key object arrays; older versions use dictionaries */
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
