/** Contract quirks of the KVMap helpers: the shapes AGH returns (v0.107.79
 *  single-key object arrays vs the legacy dictionary) and the top_clients key
 *  candidates are easy to break silently, so they are pinned here. */
import { describe, expect, it } from 'vitest'
import { aggregateStats, kvCount, mergeKV, mergeUpstreamAvg, toMap, topEntries } from './stats'
import type { Stats as ImportedStats } from './api'

describe('toMap', () => {
  it('merges the single-key object array shape', () => {
    expect(toMap([{ 'a.com': 3 }, { 'b.com': 1 }])).toEqual({ 'a.com': 3, 'b.com': 1 })
  })

  it('accepts the legacy dictionary shape unchanged', () => {
    expect(toMap({ 'a.com': 3 })).toEqual({ 'a.com': 3 })
  })

  it('treats missing or unusable values as an empty map', () => {
    expect(toMap(undefined)).toEqual({})
    expect(toMap(null)).toEqual({})
    expect(toMap([null, 5, { 'a.com': 1 }])).toEqual({ 'a.com': 1 })
  })
})

describe('topEntries', () => {
  it('sorts by count descending', () => {
    expect(topEntries([{ a: 1 }, { b: 9 }, { c: 5 }])).toEqual([
      ['b', 9],
      ['c', 5],
      ['a', 1],
    ])
  })

  it('keeps only the first n when n is given', () => {
    expect(topEntries({ a: 1, b: 2, c: 3 }, 2)).toEqual([
      ['c', 3],
      ['b', 2],
    ])
    expect(topEntries({ a: 1 }, 0)).toEqual([])
  })

  it('returns every entry when n is omitted', () => {
    expect(topEntries({ a: 1, b: 2 })).toHaveLength(2)
  })

  it('keeps insertion order for equal counts', () => {
    expect(topEntries([{ a: 1 }, { b: 1 }])).toEqual([
      ['a', 1],
      ['b', 1],
    ])
  })
})

describe('kvCount', () => {
  it('sums an exact key match', () => {
    expect(kvCount([{ '192.168.1.50': 10 }], ['192.168.1.50'])).toBe(10)
  })

  it('matches "name|IP" keys by their name half', () => {
    expect(kvCount([{ 'Cindy-MacBook|192.168.1.50': 7 }], ['Cindy-MacBook'])).toBe(7)
    // Only the name half is compared (k.split('|')[0]); every caller passes the name
    // next to the IP, so the candidate list still finds these entries
  })

  it('sums across several candidate keys in both shapes', () => {
    expect(kvCount([{ a: 1 }, { b: 2 }], ['a', 'b', 'missing'])).toBe(3)
    expect(kvCount({ a: 4 }, ['a'])).toBe(4)
  })

  it('ignores unrelated keys and undefined candidates', () => {
    expect(kvCount([{ other: 5 }], [undefined, 'a'])).toBeUndefined()
  })

  it('returns undefined when the map is missing', () => {
    expect(kvCount(undefined, ['a'])).toBeUndefined()
  })
})

// ---------- Cross-instance aggregation ----------

const mkStats = (over: Partial<ImportedStats>): ImportedStats => ({
  time_units: 'hours',
  num_dns_queries: 0,
  num_blocked_filtering: 0,
  num_replaced_safebrowsing: 0,
  num_replaced_safesearch: 0,
  num_replaced_parental: 0,
  avg_processing_time: 0,
  dns_queries: [],
  blocked_filtering: [],
  replaced_safebrowsing: [],
  replaced_parental: [],
  top_queried_domains: [],
  top_blocked_domains: [],
  top_clients: [],
  top_upstreams_responses: [],
  top_upstreams_avg_time: [],
  ...over,
})

describe('mergeKV', () => {
  it('sums entries across instances and shapes', () => {
    expect(mergeKV([[{ a: 1 }, { b: 2 }], { a: 4, c: 7 }, undefined])).toEqual({ a: 5, b: 2, c: 7 })
  })
})

describe('mergeUpstreamAvg', () => {
  it('weights each average by the same instance\'s response count', () => {
    const out = mergeUpstreamAvg([
      { avg: { 'dns:1.1.1.1': 10 }, resp: { 'dns:1.1.1.1': 3 } },
      { avg: { 'dns:1.1.1.1': 20 }, resp: { 'dns:1.1.1.1': 1 } },
    ])
    // (10*3 + 20*1) / (3+1) = 12.5
    expect(out['dns:1.1.1.1']).toBeCloseTo(12.5)
  })

  it('drops upstreams without a response count and tolerates missing parts', () => {
    expect(mergeUpstreamAvg([{ avg: { up: 5 } }, { resp: { up: 9 } }, {}])).toEqual({})
  })
})

describe('aggregateStats', () => {
  it('sums totals, weights avg time, merges leaderboards, keeps primary curves', () => {
    const primary = mkStats({
      num_dns_queries: 100,
      num_blocked_filtering: 10,
      avg_processing_time: 0.02,
      dns_queries: [1, 2],
      blocked_filtering: [0, 1],
      top_queried_domains: [{ 'a.com': 60 }],
      top_upstreams_responses: [{ 'dns:1.1.1.1': 100 }],
      top_upstreams_avg_time: [{ 'dns:1.1.1.1': 0.02 }],
    })
    const other = mkStats({
      num_dns_queries: 300,
      num_blocked_filtering: 50,
      avg_processing_time: 0.06,
      dns_queries: [9, 9],
      top_queried_domains: [{ 'b.com': 200 }, { 'a.com': 40 }],
      top_upstreams_responses: [{ 'dns:8.8.8.8': 300 }],
      top_upstreams_avg_time: [{ 'dns:8.8.8.8': 0.06 }],
    })
    const out = aggregateStats(primary, [other, undefined])
    expect(out.num_dns_queries).toBe(400)
    expect(out.num_blocked_filtering).toBe(60)
    // (0.02*100 + 0.06*300) / 400 = 0.05
    expect(out.avg_processing_time).toBeCloseTo(0.05)
    // Curves stay per-instance
    expect(out.dns_queries).toEqual([1, 2])
    expect(out.blocked_filtering).toEqual([0, 1])
    // Merged leaderboard re-ranks by count
    expect(topEntries(out.top_queried_domains)[0]).toEqual(['b.com', 200])
    expect(topEntries(out.top_queried_domains)[1]).toEqual(['a.com', 100])
    expect(out.top_upstreams_responses).toEqual({ 'dns:1.1.1.1': 100, 'dns:8.8.8.8': 300 })
    expect(out.top_upstreams_avg_time).toEqual({ 'dns:1.1.1.1': 0.02, 'dns:8.8.8.8': 0.06 })
  })

  it('falls back to the primary avg when there are no queries at all', () => {
    const primary = mkStats({ avg_processing_time: 0.03 })
    expect(aggregateStats(primary, [mkStats({})]).avg_processing_time).toBe(0.03)
  })
})
