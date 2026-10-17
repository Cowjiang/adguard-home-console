/** AGH field units and the windows AGH itself validates, for the values this
 *  console writes. Kept in one place because a mismatch here fails only against
 *  a real AGH: the mock mirrors these windows so local runs catch it too.
 *  Facts and source references: docs/agh-api.md */

/** Milliseconds in an hour */
export const HOUR_MS = 3_600_000

/** Filter update interval choices, in HOURS — /filtering/config takes hours */
export const FILTER_INTERVAL_HOURS = [1, 12, 24, 72]

/** AGH's cap for the filter update interval: 365 days, in hours */
export const MAX_FILTER_INTERVAL_HOURS = 365 * 24

/** Retention choices in HOURS; /querylog and /stats config take milliseconds */
export const QUERYLOG_RETENTION_HOURS = [6, 24, 168, 720, 2160]
export const STATS_RETENTION_HOURS = [24, 168, 720, 2160]

/** AGH's window for the rotation interval of both retention endpoints */
const MIN_RETENTION_MS = HOUR_MS
const MAX_RETENTION_MS = 365 * 24 * HOUR_MS

/** Retention hours as the millisecond value both endpoints expect */
export function retentionMs(hours: number): number {
  return hours * HOUR_MS
}

/** Whether AGH would accept this rotation interval */
export function retentionFits(ms: number): boolean {
  return ms >= MIN_RETENTION_MS && ms <= MAX_RETENTION_MS
}
