/** AGH API 常量:类型、状态、拦截原因、服务目录等 */

/** 拦截原因标签的词典 key(LogDetail 展示时经 t() 翻译) */
export type ReasonLabelKey =
  | 'agh.reasonBlackList'
  | 'agh.reasonBlockedService'
  | 'agh.reasonSafeBrowsing'
  | 'agh.reasonParental'
  | 'agh.reasonInvalid'
  | 'agh.reasonSafeSearch'
  | 'agh.reasonWhiteList'
  | 'agh.reasonNotFound'
  | 'agh.reasonUpstreamError'
  | 'agh.reasonRewrite'
  | 'agh.reasonEtcHosts'
  | 'agh.reasonRewriteRule'

export type FilterLabelKey =
  | 'agh.filterAll'
  | 'agh.filterBlocked'
  | 'agh.filterAllowed'
  | 'agh.filterWhitelist'
  | 'agh.filterRewritten'

export const REASON_META: Record<string, { labelKey: ReasonLabelKey; kind: 'blocked' | 'ok' | 'rewrite' | 'warn' }> = {
  FilteredBlackList: { labelKey: 'agh.reasonBlackList', kind: 'blocked' },
  FilteredBlockedService: { labelKey: 'agh.reasonBlockedService', kind: 'blocked' },
  FilteredSafeBrowsing: { labelKey: 'agh.reasonSafeBrowsing', kind: 'blocked' },
  FilteredParental: { labelKey: 'agh.reasonParental', kind: 'blocked' },
  FilteredInvalid: { labelKey: 'agh.reasonInvalid', kind: 'warn' },
  FilteredSafeSearch: { labelKey: 'agh.reasonSafeSearch', kind: 'rewrite' },
  NotFilteredWhiteList: { labelKey: 'agh.reasonWhiteList', kind: 'ok' },
  NotFilteredNotFound: { labelKey: 'agh.reasonNotFound', kind: 'ok' },
  NotFilteredError: { labelKey: 'agh.reasonUpstreamError', kind: 'warn' },
  Rewrite: { labelKey: 'agh.reasonRewrite', kind: 'rewrite' },
  RewriteEtcHosts: { labelKey: 'agh.reasonEtcHosts', kind: 'rewrite' },
  RewriteRule: { labelKey: 'agh.reasonRewriteRule', kind: 'rewrite' },
}

export const LOG_FILTERS: { key: string; labelKey: FilterLabelKey; reasons?: string[] }[] = [
  { key: 'all', labelKey: 'agh.filterAll' },
  { key: 'blocked', labelKey: 'agh.filterBlocked', reasons: ['FilteredBlackList', 'FilteredBlockedService', 'FilteredSafeBrowsing', 'FilteredParental', 'FilteredInvalid'] },
  { key: 'allowed', labelKey: 'agh.filterAllowed', reasons: ['NotFilteredNotFound', 'NotFilteredError'] },
  { key: 'whitelist', labelKey: 'agh.filterWhitelist', reasons: ['NotFilteredWhiteList'] },
  { key: 'rewritten', labelKey: 'agh.filterRewritten', reasons: ['Rewrite', 'RewriteEtcHosts', 'RewriteRule', 'FilteredSafeSearch'] },
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
