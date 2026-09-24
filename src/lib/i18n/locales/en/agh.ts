/** AGH 领域词汇:拦截原因、日志筛选、缓存等来自 AdGuard Home API 的枚举标签 */

const enAgh = {
  reasonBlackList: 'Blocklist',
  reasonBlockedService: 'Blocked service',
  reasonSafeBrowsing: 'Safe Browsing',
  reasonParental: 'Parental control',
  reasonInvalid: 'Invalid request',
  reasonSafeSearch: 'SafeSearch',
  reasonWhiteList: 'Allowlist',
  reasonNotFound: 'Allowed',
  reasonUpstreamError: 'Upstream error',
  reasonRewrite: 'Rewrite',
  reasonEtcHosts: 'System Hosts',
  reasonRewriteRule: 'Rewrite rule',
  filterAll: 'All',
  filterBlocked: 'Blocked',
  filterAllowed: 'Allowed',
  filterWhitelist: 'Allowlist',
  filterRewritten: 'Rewritten',
  cacheHit: 'Hit',
  cacheMiss: 'Miss',
  dnssecVerified: 'Verified',
  unknown: 'Unknown',
}

export default enAgh
