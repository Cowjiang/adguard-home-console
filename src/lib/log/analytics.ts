/** Query log analytics: slow queries, caching, and distribution stats */
import type { QueryLogItem } from '../api'
import { REASON_META } from '../constants'

export interface SlowQueryItem {
  domain: string
  client: string
  clientName?: string
  elapsedMs: number
  upstream?: string
  reason: string
  time: string
}

export interface ReasonStat {
  reason: string
  kind: string
  count: number
  percentage: number
}

export interface TopStatItem {
  name: string
  sub?: string
  count: number
  percentage: number
}

export interface UpstreamStat {
  upstream: string
  count: number
  avgElapsedMs: number
  percentage: number
}

export interface QueryLogAnalyticsResult {
  totalCount: number
  cachedCount: number
  cacheHitRate: number
  avgElapsedMs: number
  slowQueries: SlowQueryItem[]
  reasonsDistribution: ReasonStat[]
  topDomains: TopStatItem[]
  topClients: TopStatItem[]
  topUpstreams: UpstreamStat[]
}

/** Row identity key for the log list: qtype is part of it, so concurrent A and
 *  AAAA queries at the same time / domain / client stay distinct */
export function keyOf(item: QueryLogItem): string {
  return `${item.time}|${item.question?.name ?? ''}|${item.question?.type ?? ''}|${item.client ?? ''}`
}

/** Computes multidimensional analytics from query log items */
export function analyzeQueryLogs(
  items: QueryLogItem[],
  maxTop = 10
): QueryLogAnalyticsResult {
  const totalCount = items.length
  if (totalCount === 0) {
    return {
      totalCount: 0,
      cachedCount: 0,
      cacheHitRate: 0,
      avgElapsedMs: 0,
      slowQueries: [],
      reasonsDistribution: [],
      topDomains: [],
      topClients: [],
      topUpstreams: [],
    }
  }

  let cachedCount = 0
  let totalElapsed = 0

  const reasonMap = new Map<string, number>()
  const domainMap = new Map<string, number>()
  const clientMap = new Map<string, { count: number; name?: string }>()
  const upstreamMap = new Map<string, { count: number; totalElapsed: number }>()
  const slowQueryCandidates: SlowQueryItem[] = []

  for (const item of items) {
    if (item.cached) {
      cachedCount++
    }

    const elapsed = Math.max(0, Number(item.elapsedMs) || 0)
    totalElapsed += elapsed

    // Reasons
    const reason = item.reason || 'NotFilteredNotFound'
    reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1)

    // Domains
    const domain = item.question?.name || 'unknown'
    domainMap.set(domain, (domainMap.get(domain) || 0) + 1)

    // Clients
    const client = item.client || 'unknown'
    const clientName = item.client_info?.name
    const prevClient = clientMap.get(client)
    if (prevClient) {
      prevClient.count++
      if (!prevClient.name && clientName) prevClient.name = clientName
    } else {
      clientMap.set(client, { count: 1, name: clientName })
    }

    // Upstreams
    if (item.upstream) {
      const prevUp = upstreamMap.get(item.upstream)
      if (prevUp) {
        prevUp.count++
        prevUp.totalElapsed += elapsed
      } else {
        upstreamMap.set(item.upstream, { count: 1, totalElapsed: elapsed })
      }
    }

    // Slow query candidate
    slowQueryCandidates.push({
      domain,
      client,
      clientName,
      elapsedMs: elapsed,
      upstream: item.upstream,
      reason,
      time: item.time,
    })
  }

  // Sort slow queries descending by elapsedMs
  slowQueryCandidates.sort((a, b) => b.elapsedMs - a.elapsedMs)
  const slowQueries = slowQueryCandidates.slice(0, maxTop)

  // Reasons distribution
  const reasonsDistribution: ReasonStat[] = Array.from(reasonMap.entries())
    .map(([reason, count]) => {
      const meta = REASON_META[reason]
      return {
        reason,
        kind: meta?.kind || 'info',
        count,
        percentage: Math.round((count / totalCount) * 1000) / 10,
      }
    })
    .sort((a, b) => b.count - a.count)

  // Top domains
  const topDomains: TopStatItem[] = Array.from(domainMap.entries())
    .map(([domain, count]) => ({
      name: domain,
      count,
      percentage: Math.round((count / totalCount) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxTop)

  // Top clients
  const topClients: TopStatItem[] = Array.from(clientMap.entries())
    .map(([client, data]) => ({
      name: client,
      sub: data.name,
      count: data.count,
      percentage: Math.round((data.count / totalCount) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxTop)

  // Top upstreams
  const topUpstreams: UpstreamStat[] = Array.from(upstreamMap.entries())
    .map(([upstream, data]) => ({
      upstream,
      count: data.count,
      avgElapsedMs: Math.round((data.totalElapsed / data.count) * 10) / 10,
      percentage: Math.round((data.count / totalCount) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxTop)

  const cacheHitRate = Math.round((cachedCount / totalCount) * 1000) / 10
  const avgElapsedMs = Math.round((totalElapsed / totalCount) * 10) / 10

  return {
    totalCount,
    cachedCount,
    cacheHitRate,
    avgElapsedMs,
    slowQueries,
    reasonsDistribution,
    topDomains,
    topClients,
    topUpstreams,
  }
}
