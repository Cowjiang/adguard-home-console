/** AGH 领域词汇:拦截原因、日志筛选、缓存等来自 AdGuard Home API 的枚举标签 */

const zhAgh = {
  reasonBlackList: '黑名单',
  reasonBlockedService: '服务拦截',
  reasonSafeBrowsing: '安全浏览',
  reasonParental: '家长控制',
  reasonInvalid: '无效请求',
  reasonSafeSearch: '安全搜索',
  reasonWhiteList: '白名单',
  reasonNotFound: '已放行',
  reasonUpstreamError: '上游错误',
  reasonRewrite: '重写',
  reasonEtcHosts: '系统 Hosts',
  reasonRewriteRule: '重写规则',
  filterAll: '全部',
  filterBlocked: '已拦截',
  filterAllowed: '已放行',
  filterWhitelist: '白名单',
  filterRewritten: '重写',
  cacheHit: '命中',
  cacheMiss: '未命中',
  dnssecVerified: '已验证',
  unknown: '未知',
}

export default zhAgh
