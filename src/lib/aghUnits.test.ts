import { describe, expect, it } from 'vitest'
import {
  FILTER_INTERVAL_HOURS,
  MAX_FILTER_INTERVAL_HOURS,
  QUERYLOG_RETENTION_HOURS,
  STATS_RETENTION_HOURS,
  retentionFits,
  retentionMs,
} from './aghUnits'

/** Guards the unit contract with AGH: an option outside the window AGH accepts
 *  saves nothing (filtering 400s with `Unsupported interval`, the retention
 *  endpoints 422). Both used to ship broken options — see the bug-fix proposal
 *  2026-10-18-agh-unit-contract */
describe('AGH unit contract', () => {
  it('offers filter update intervals inside the 365-day cap', () => {
    for (const h of FILTER_INTERVAL_HOURS) {
      expect(h).toBeGreaterThan(0)
      expect(h).toBeLessThanOrEqual(MAX_FILTER_INTERVAL_HOURS)
    }
  })

  it('maps every retention choice into the hour-to-year window in milliseconds', () => {
    for (const h of [...QUERYLOG_RETENTION_HOURS, ...STATS_RETENTION_HOURS]) {
      expect(retentionFits(retentionMs(h))).toBe(true)
    }
  })

  it('keeps retention choices in milliseconds, not in label units', () => {
    // Both rows label their choices in hours and send milliseconds: "1 day" must
    // leave as 86_400_000. The stats row used to multiply by a day instead, so
    // "1 day" sent 24 days and the 30/90-day choices were rejected by AGH
    expect(retentionMs(24)).toBe(86_400_000)
    expect(retentionMs(720)).toBe(2_592_000_000)
    expect(retentionFits(retentionMs(720 * 24))).toBe(false)
  })
})
