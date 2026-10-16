import { describe, it, expect } from 'vitest'
import { analyzeQueryLogs, keyOf } from './analytics'
import type { QueryLogItem } from '../api'

function mockItem(partial: Partial<QueryLogItem>): QueryLogItem {
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
    const items: QueryLogItem[] = [
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
    const items: QueryLogItem[] = [
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
    const items: QueryLogItem[] = [
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
    const items: QueryLogItem[] = [
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

  it('keeps concurrent A and AAAA queries at the same timestamp and domain apart in the row key', () => {
    const aQuery = mockItem({
      time: '2026-10-13T10:00:00.123Z',
      question: { name: 'dualstack.com', type: 'A', class: 'IN' },
      client: '192.168.1.50',
    })
    const aaaaQuery = mockItem({
      time: '2026-10-13T10:00:00.123Z',
      question: { name: 'dualstack.com', type: 'AAAA', class: 'IN' },
      client: '192.168.1.50',
    })

    expect(keyOf(aQuery)).not.toBe(keyOf(aaaaQuery))
  })

  it('generates a stable row key for the same entry', () => {
    const itm = mockItem({})
    expect(keyOf(itm)).toBe(keyOf(itm))
    expect(keyOf(itm)).toContain('example.com')
  })
})
