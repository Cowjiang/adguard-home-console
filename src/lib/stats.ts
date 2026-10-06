/** Helpers for the KVMap-shaped fields of /stats (top_* rankings) */
import type { Stats } from './api'

/** v0.107.79 top_* fields are single-key object arrays; also accepts the legacy dictionary
 *  shape */
export function toMap(v: unknown): Record<string, number> {
  if (Array.isArray(v)) {
    return Object.assign({}, ...v.filter((o) => o && typeof o === 'object'))
  }
  return (v as Record<string, number>) ?? {}
}

/** Sorted (desc by count) [key, count] entries; `n` keeps only the first n */
export function topEntries(v: unknown, n?: number): [string, number][] {
  const entries = Object.entries(toMap(v)).sort((a, b) => b[1] - a[1])
  return n === undefined ? entries : entries.slice(0, n)
}

/** top_clients keys can be "name" / "IP" / "name|IP"; sum recent query counts by candidate
 *  keys (shared by the clients list and the detail view) */
export function kvCount(map: Stats['top_clients'] | undefined, keys: (string | undefined)[]): number | undefined {
  if (!map) return undefined
  const want = keys.filter((x): x is string => !!x)
  let total: number | undefined
  for (const o of Array.isArray(map) ? map : [map]) {
    for (const k in o) {
      if (want.includes(k) || want.includes(k.split('|')[0])) total = (total ?? 0) + o[k]
    }
  }
  return total
}

// ---------- Cross-instance aggregation (totals + leaderboards only) ----------

/** Entry-wise sum of several top_* maps (missing entries count 0) */
export function mergeKV(maps: (Stats['top_queried_domains'] | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of maps) {
    if (!m) continue
    for (const o of Array.isArray(m) ? m : [m]) {
      for (const k in o) out[k] = (out[k] ?? 0) + o[k]
    }
  }
  return out
}

/** top_upstreams_avg_time cannot be summed (the values are averages): each
 *  instance's per-upstream average weights by its own top_upstreams_responses
 *  count; upstreams without a response count are dropped */
export function mergeUpstreamAvg(
  parts: { avg?: Stats['top_upstreams_avg_time']; resp?: Stats['top_upstreams_responses'] }[]
): Record<string, number> {
  const wsum: Record<string, number> = {}
  const total: Record<string, number> = {}
  for (const { avg, resp } of parts) {
    if (!avg) continue
    const counts = toMap(resp)
    for (const o of Array.isArray(avg) ? avg : [avg]) {
      for (const k in o) {
        const w = counts[k]
        if (!w) continue
        wsum[k] = (wsum[k] ?? 0) + o[k] * w
        total[k] = (total[k] ?? 0) + w
      }
    }
  }
  const out: Record<string, number> = {}
  for (const k in wsum) out[k] = wsum[k] / total[k]
  return out
}

/** Merge the primary (active) instance's /stats with the other instances':
 *  totals sum, leaderboards merge, avg_processing_time weights by query
 *  volume. Curves are NOT aggregated — dns_queries carries no timestamps, so
 *  buckets from different instances cannot be aligned; the primary's arrays
 *  are kept here and the caller shows one instance's curve at a time */
export function aggregateStats(primary: Stats, others: (Stats | undefined)[]): Stats {
  const all = [primary, ...others.filter((s): s is Stats => !!s)]
  const sum = (f: (s: Stats) => number) => all.reduce((a, s) => a + f(s), 0)
  const queries = sum((s) => s.num_dns_queries)
  return {
    time_units: primary.time_units,
    num_dns_queries: queries,
    num_blocked_filtering: sum((s) => s.num_blocked_filtering),
    num_replaced_safebrowsing: sum((s) => s.num_replaced_safebrowsing),
    num_replaced_safesearch: sum((s) => s.num_replaced_safesearch),
    num_replaced_parental: sum((s) => s.num_replaced_parental),
    avg_processing_time:
      queries > 0 ? sum((s) => s.avg_processing_time * s.num_dns_queries) / queries : primary.avg_processing_time,
    dns_queries: primary.dns_queries,
    blocked_filtering: primary.blocked_filtering,
    replaced_safebrowsing: primary.replaced_safebrowsing,
    replaced_parental: primary.replaced_parental,
    top_queried_domains: mergeKV(all.map((s) => s.top_queried_domains)),
    top_blocked_domains: mergeKV(all.map((s) => s.top_blocked_domains)),
    top_clients: mergeKV(all.map((s) => s.top_clients)),
    top_upstreams_responses: mergeKV(all.map((s) => s.top_upstreams_responses)),
    top_upstreams_avg_time: mergeUpstreamAvg(
      all.map((s) => ({ avg: s.top_upstreams_avg_time, resp: s.top_upstreams_responses }))
    ),
  }
}
