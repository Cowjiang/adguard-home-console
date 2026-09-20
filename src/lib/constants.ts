/** AGH API 常量:类型、状态、拦截原因、服务目录等 */

export const REASON_META: Record<string, { label: string; kind: 'blocked' | 'ok' | 'rewrite' | 'warn' }> = {
  FilteredBlackList: { label: '黑名单', kind: 'blocked' },
  FilteredBlockedService: { label: '服务拦截', kind: 'blocked' },
  FilteredSafeBrowsing: { label: '安全浏览', kind: 'blocked' },
  FilteredParental: { label: '家长控制', kind: 'blocked' },
  FilteredInvalid: { label: '无效请求', kind: 'warn' },
  FilteredSafeSearch: { label: '安全搜索', kind: 'rewrite' },
  NotFilteredWhiteList: { label: '白名单', kind: 'ok' },
  NotFilteredNotFound: { label: '已放行', kind: 'ok' },
  NotFilteredError: { label: '上游错误', kind: 'warn' },
  Rewrite: { label: '重写', kind: 'rewrite' },
  RewriteEtcHosts: { label: '系统 Hosts', kind: 'rewrite' },
  RewriteRule: { label: '重写规则', kind: 'rewrite' },
}

export const LOG_FILTERS: { key: string; label: string; reasons?: string[] }[] = [
  { key: 'all', label: '全部' },
  { key: 'blocked', label: '已拦截', reasons: ['FilteredBlackList', 'FilteredBlockedService', 'FilteredSafeBrowsing', 'FilteredParental', 'FilteredInvalid'] },
  { key: 'allowed', label: '已放行', reasons: ['NotFilteredNotFound', 'NotFilteredError'] },
  { key: 'whitelist', label: '白名单', reasons: ['NotFilteredWhiteList'] },
  { key: 'rewritten', label: '重写', reasons: ['Rewrite', 'RewriteEtcHosts', 'RewriteRule', 'FilteredSafeSearch'] },
]

export const QTYPE_COLORS: Record<string, string> = {
  A: '#34d399', AAAA: '#38bdf8', HTTPS: '#a78bfa', CNAME: '#fbbf24',
  PTR: '#fb7185', TXT: '#f472b6', MX: '#34d399', SRV: '#38bdf8', NS: '#94a3b8', DS: '#94a3b8',
}

export function qtypeColor(t: string): string {
  return QTYPE_COLORS[t] ?? '#94a3b8'
}

/** 本地缓存的服务目录(id→name/icon),首次成功加载后写入 */
export const SERVICE_CACHE_KEY = 'agh.services.v1'

export const APP_NAME = 'AdGuard Home Console'
export const APP_VERSION = '1.0.0'
