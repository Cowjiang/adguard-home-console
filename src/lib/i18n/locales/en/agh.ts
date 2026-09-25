/** AGH domain vocabulary: block reasons, log filters, caching and other
 *  enum labels from the AdGuard Home API */

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
