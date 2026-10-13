import { describe, it, expect } from 'vitest'
import {
  analyzeQueryLogs,
  mergeQueryLogLists,
  keyOfAggregated,
  type AggregatedQueryLogItem,
} from './analytics'
import type { QueryLogItem } from '../api'

function mockItem(partial: Partial<AggregatedQueryLogItem>): AggregatedQueryLogItem {
  return {
    time: '2026-10-13T10:00:00.000Z',
    question: { name: 'example.com', type: 'A', class: 'IN' },
    status: 'NOERROR',
    reason: 'NotFilteredNotFound',
    client: '192.168.1.100',
    client_proto: 'udp',
    client_info: { name: 'iPhone', whois: {} },
    upstream: 'https://dns.alidns.com/dns-query',
    cached: false,
    answer_dnssec: false,
    elapsedMs: '15.2',
    ...partial,
  }
}

describe('query log analytics', () => {
  it('handles empty query log list gracefully', () => {
    const res = analyzeQueryLogs([])
    expect(res.totalCount).toBe(0)
    expect(res.cachedCount).toBe(0)
    expect(res.cacheHitRate).toBe(0)
    expect(res.avgElapsedMs).toBe(0)
    expect(res.slowQueries).toEqual([])
    expect(res.reasonsDistribution).toEqual([])
    expect(res.topDomains).toEqual([])
    expect(res.topClients).toEqual([])
    expect(res.topUpstreams).toEqual([])
  })

  it('computes cache hit rate and average latency accurately', () => {
    const items: AggregatedQueryLogItem[] = [
      mockItem({ time: '2026-10-13T10:00:01Z', cached: true, elapsedMs: '1.0' }),
      mockItem({ time: '2026-10-13T10:00:02Z', cached: false, elapsedMs: '20.0' }),
      mockItem({ time: '2026-10-13T10:00:03Z', cached: false, elapsedMs: '30.0' }),
      mockItem({ time: '2026-10-13T10:00:04Z', cached: true, elapsedMs: '2.0' }),
    ]
    const res = analyzeQueryLogs(items)
    expect(res.totalCount).toBe(4)
    expect(res.cachedCount).toBe(2)
    expect(res.cacheHitRate).toBe(50) // 50.0%
    expect(res.avgElapsedMs).toBe(13.3) // (1 + 20 + 30 + 2) / 4 = 13.25 -> 13.3
  })

  it('sorts and extracts slow queries descending by elapsedMs', () => {
    const items: AggregatedQueryLogItem[] = [
      mockItem({ question: { name: 'fast.com', type: 'A', class: 'IN' }, elapsedMs: '5' }),
      mockItem({ question: { name: 'very-slow.com', type: 'A', class: 'IN' }, elapsedMs: '120.5' }),
      mockItem({ question: { name: 'slow.com', type: 'A', class: 'IN' }, elapsedMs: '65.2' }),
    ]
    const res = analyzeQueryLogs(items)
    expect(res.slowQueries.length).toBe(3)
    expect(res.slowQueries[0].domain).toBe('very-slow.com')
    expect(res.slowQueries[0].elapsedMs).toBe(120.5)
    expect(res.slowQueries[1].domain).toBe('slow.com')
    expect(res.slowQueries[2].domain).toBe('fast.com')
  })

  it('aggregates reasons distribution with kinds and percentages', () => {
    const items: AggregatedQueryLogItem[] = [
      mockItem({ reason: 'FilteredBlackList' }),
      mockItem({ reason: 'FilteredBlackList' }),
      mockItem({ reason: 'NotFilteredNotFound' }),
      mockItem({ reason: 'Rewrite' }),
    ]
    const res = analyzeQueryLogs(items)
    expect(res.reasonsDistribution.length).toBe(3)
    const filtered = res.reasonsDistribution.find((r) => r.reason === 'FilteredBlackList')
    expect(filtered).toBeDefined()
    expect(filtered?.count).toBe(2)
    expect(filtered?.percentage).toBe(50)
    expect(filtered?.kind).toBe('blocked')

    const rewrite = res.reasonsDistribution.find((r) => r.reason === 'Rewrite')
    expect(rewrite?.kind).toBe('rewrite')
  })

  it('aggregates top domains and clients ranking', () => {
    const items: AggregatedQueryLogItem[] = [
      mockItem({ question: { name: 'github.com', type: 'A', class: 'IN' }, client: '192.168.1.5' }),
      mockItem({ question: { name: 'google.com', type: 'A', class: 'IN' }, client: '192.168.1.5' }),
      mockItem({ question: { name: 'github.com', type: 'A', class: 'IN' }, client: '192.168.1.6' }),
      mockItem({ question: { name: 'github.com', type: 'A', class: 'IN' }, client: '192.168.1.5' }),
    ]
    const res = analyzeQueryLogs(items)
    expect(res.topDomains[0].name).toBe('github.com')
    expect(res.topDomains[0].count).toBe(3)
    expect(res.topDomains[0].percentage).toBe(75)

    expect(res.topClients[0].name).toBe('192.168.1.5')
    expect(res.topClients[0].count).toBe(3)
  })

  it('merges multiple instance query log lists, deduplicates, and sorts by time descending', () => {
    const list1: QueryLogItem[] = [
      mockItem({ time: '2026-10-13T10:00:10Z', question: { name: 'a.com', type: 'A', class: 'IN' } }),
      mockItem({ time: '2026-10-13T10:00:05Z', question: { name: 'b.com', type: 'A', class: 'IN' } }),
    ]
    const list2: QueryLogItem[] = [
      mockItem({ time: '2026-10-13T10:00:15Z', question: { name: 'c.com', type: 'A', class: 'IN' } }),
      // duplicate on list2 with same time & domain & client & instance
      mockItem({ time: '2026-10-13T10:00:15Z', question: { name: 'c.com', type: 'A', class: 'IN' } }),
    ]

    const merged = mergeQueryLogLists([
      { instanceId: 'inst-1', instanceLabel: 'Primary Node', items: list1 },
      { instanceId: 'inst-2', instanceLabel: 'Backup Node', items: list2 },
    ])

    expect(merged.length).toBe(3)
    expect(merged[0].question.name).toBe('c.com')
    expect(merged[0]._instanceId).toBe('inst-2')
    expect(merged[0]._instanceLabel).toBe('Backup Node')
    expect(merged[1].question.name).toBe('a.com')
    expect(merged[2].question.name).toBe('b.com')
  })

  it('generates consistent keyOfAggregated keys', () => {
    const itm = mockItem({ _instanceId: 'inst-a' })
    const k1 = keyOfAggregated(itm)
    const k2 = keyOfAggregated(itm)
    expect(k1).toBe(k2)
    expect(k1).toContain('inst-a')
  })
})
