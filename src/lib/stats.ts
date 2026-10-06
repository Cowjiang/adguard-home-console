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
