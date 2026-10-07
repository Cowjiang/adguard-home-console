/** Upstream latency table: response-count bar + fastest-highlight avg time;
 *  the desktop counterpart of the mobile upstream quick list */
import { useTranslation } from 'react-i18next'
import { Database, Timer } from 'lucide-react'
import type { Stats } from '../../lib/api'
import { toMap, topEntries } from '../../lib/stats'
import { fmtCompact, fmtMs } from '../../lib/format'

export function UpstreamTable({ stats }: { stats: Stats }) {
  const { t } = useTranslation()
  const rows = topEntries(stats.top_upstreams_responses, 8).map(([up, count]) => {
    const avg = toMap(stats.top_upstreams_avg_time)[up]
    return [up, count, avg ?? 0] as [string, number, number]
  })
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-t3">{t('charts.empty')}</p>
  const maxCount = Math.max(1, ...rows.map((r) => r[1]))
  const fastest = Math.min(...rows.filter((r) => r[2] > 0).map((r) => r[2]), Infinity)
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-t3">
        <span className="min-w-0 flex-1">{t('stats.colUpstream')}</span>
        <span className="w-20 text-right">{t('stats.colResponses')}</span>
        <span className="w-24 text-right">{t('stats.colAvgTime')}</span>
      </div>
      {rows.map(([up, count, avg]) => (
        <div key={up} className="flex items-center gap-3 rounded-lg px-2 py-[7px] transition-colors hover:bg-white/[0.04]">
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <Database size={13} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-t1">{up}</span>
          <span className="flex w-20 flex-none items-center justify-end gap-2">
            <span className="h-[6px] w-10 overflow-hidden rounded-full" style={{ background: 'var(--glass)' }}>
              <span
                className="block h-full rounded-full transition-all duration-500"
                style={{ width: `${(count / maxCount) * 100}%`, background: 'var(--accent)' }}
              />
            </span>
            <span className="w-10 text-right text-[12.5px] num text-t2">{fmtCompact(count)}</span>
          </span>
          <span className="w-24 flex-none text-right">
            {avg > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] num font-semibold"
                style={{
                  color: avg <= fastest + 0.01 ? 'var(--ok)' : 'var(--t2)',
                  background: avg <= fastest + 0.01 ? 'var(--ok-soft)' : 'transparent',
                }}
              >
                {avg <= fastest + 0.01 && <Timer size={11} />}
                {fmtMs(avg)}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
