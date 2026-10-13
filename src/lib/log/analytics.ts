/** Query log analytics: aggregation, slow queries, caching, and distribution stats */
import type { QueryLogItem } from '../api'
import { REASON_META } from '../constants'

export interface AggregatedQueryLogItem extends QueryLogItem {
  _instanceId?: string
  _instanceLabel?: string
}

export interface SlowQueryItem {
  domain: string
  client: string
  clientName?: string
  elapsedMs: number
  upstream?: string
  reason: string
  time: string
  instanceLabel?: string
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

/** Generates a collision-resistant unique key for query log item including qtype */
export function keyOfAggregated(item: AggregatedQueryLogItem): string {
  return `${item.time}|${item.question?.name ?? ''}|${item.question?.type ?? ''}|${item.client ?? ''}|${item._instanceId ?? ''}`
}

/** Merges multiple query log lists from different instances into a unified, time-sorted list */
export function mergeQueryLogLists(
  lists: { instanceId: string; instanceLabel: string; items: QueryLogItem[] }[],
  maxItems = 500
): AggregatedQueryLogItem[] {
  const merged: AggregatedQueryLogItem[] = []
  const seen = new Set<string>()

  for (const list of lists) {
    for (const item of list.items) {
      const aggItem: AggregatedQueryLogItem = {
        ...item,
        _instanceId: list.instanceId,
        _instanceLabel: list.instanceLabel,
      }
      const k = keyOfAggregated(aggItem)
      if (!seen.has(k)) {
        seen.add(k)
        merged.push(aggItem)
      }
    }
  }

  // Sort descending by time
  merged.sort((a, b) => {
    const ta = new Date(a.time).getTime() || 0
    const tb = new Date(b.time).getTime() || 0
    return tb - ta
  })

  return merged.length > maxItems ? merged.slice(0, maxItems) : merged
}

/** Computes multidimensional analytics from query log items */
export function analyzeQueryLogs(
  items: AggregatedQueryLogItem[],
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
      instanceLabel: item._instanceLabel,
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
