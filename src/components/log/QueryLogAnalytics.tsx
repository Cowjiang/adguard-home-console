/** Query log analytics view: multidimensional drill-down dashboard, shared by the
 *  desktop centered sheet and the mobile /logs/analytics sub-page */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Zap,
  Clock,
  Layers,
  ArrowRight,
  ShieldAlert,
  Server,
  Users,
  Globe,
  AlertTriangle,
} from 'lucide-react'
import { Card } from '../ui/primitives'
import { Badge } from '../ui/atoms'
import { fmtMs } from '../../lib/format'
import {
  analyzeQueryLogs,
  type AggregatedQueryLogItem,
} from '../../lib/log/analytics'
import { reasonMeta } from './LogDetail'

interface QueryLogAnalyticsProps {
  items: AggregatedQueryLogItem[]
  onDrillDown: (type: 'domain' | 'client' | 'filter', value: string) => void
}

export function QueryLogAnalytics({ items, onDrillDown }: QueryLogAnalyticsProps) {
  const { t } = useTranslation()
  const stats = useMemo(() => analyzeQueryLogs(items), [items])

  const resolveFilterKey = (reason: string, kind: string): string => {
    if (kind === 'blocked') return 'blocked'
    if (kind === 'rewrite') return 'rewritten'
    if (reason === 'NotFilteredWhiteList') return 'whitelist'
    if (kind === 'ok') return 'allowed'
    return 'all'
  }

  return (
    <div className="space-y-4 text-left">
      {/* Metric Cards Banner */}
      <div className="grid grid-cols-3 gap-2.5">
        <Card className="flex flex-col items-center justify-center p-3 text-center !rounded-xl">
          <span className="flex items-center gap-1 text-[11px] font-medium text-t3">
            <Layers size={13} /> {t('querylog.totalSample')}
          </span>
          <span className="num mt-1 text-[20px] font-bold text-t1">{stats.totalCount}</span>
        </Card>

        <Card className="flex flex-col items-center justify-center p-3 text-center !rounded-xl">
          <span className="flex items-center gap-1 text-[11px] font-medium text-t3">
            <Zap size={13} style={{ color: 'var(--ok)' }} /> {t('querylog.cacheHitRate')}
          </span>
          <span className="num mt-1 text-[20px] font-bold" style={{ color: 'var(--ok)' }}>
            {stats.cacheHitRate}%
          </span>
        </Card>

        <Card className="flex flex-col items-center justify-center p-3 text-center !rounded-xl">
          <span className="flex items-center gap-1 text-[11px] font-medium text-t3">
            <Clock size={13} style={{ color: 'var(--warn)' }} /> {t('querylog.avgLatency')}
          </span>
          <span className="num mt-1 text-[20px] font-bold text-t1">
            {stats.avgElapsedMs} <span className="text-[11px] font-normal text-t3">ms</span>
          </span>
        </Card>
      </div>

      {/* Drill-down hint */}
      <div className="glass rounded-xl px-3 py-1.5 text-center text-[11.5px] text-t3">
        {t('querylog.drillDownHint')}
      </div>

      {/* Slow Queries Section */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-t2">
          <AlertTriangle size={14} style={{ color: 'var(--warn)' }} />
          <span>{t('querylog.slowQueries')}</span>
        </div>

        <Card className="overflow-hidden !rounded-xl">
          {stats.slowQueries.length === 0 ? (
            <p className="p-4 text-center text-[12px] text-t3">{t('querylog.noSlowQueries')}</p>
          ) : (
            <div className="divide-y divide-[var(--glass-border)]">
              {stats.slowQueries.slice(0, 5).map((sq, idx) => (
                <button
                  key={`${sq.domain}-${sq.time}-${idx}`}
                  onClick={() => onDrillDown('domain', sq.domain)}
                  className="press flex w-full items-center justify-between p-2.5 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-t1">{sq.domain}</span>
                      {sq.instanceLabel && (
                        <span className="flex-none rounded bg-white/10 px-1 py-0.5 text-[9.5px] text-t3">
                          {sq.instanceLabel}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-t3">
                      <span>{sq.clientName || sq.client}</span>
                      {sq.upstream && <span>· {sq.upstream}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="num text-[13px] font-bold" style={{ color: sq.elapsedMs > 50 ? 'var(--danger)' : 'var(--warn)' }}>
                      {fmtMs(sq.elapsedMs)}
                    </span>
                    <ArrowRight size={13} className="text-t3" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Reasons & Block Distribution */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-t2">
          <ShieldAlert size={14} style={{ color: 'var(--accent)' }} />
          <span>{t('querylog.reasonsDist')}</span>
        </div>

        <Card className="p-2 !rounded-xl divide-y divide-[var(--glass-border)]">
          {stats.reasonsDistribution.map((item) => {
            const meta = reasonMeta(item.reason, t)
            const fk = resolveFilterKey(item.reason, meta.kind)
            return (
              <button
                key={item.reason}
                onClick={() => onDrillDown('filter', fk)}
                className="press flex w-full flex-col gap-1.5 p-2 text-left transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex w-full items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 text-t2">
                    <Badge kind={meta.kind}>{meta.label}</Badge>
                    <span className="text-[11px] text-t3">({item.reason})</span>
                  </span>
                  <span className="num font-medium text-t2">
                    {item.count} <span className="text-[10px] text-t3">({item.percentage}%)</span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, item.percentage)}%`,
                      background:
                        meta.kind === 'blocked'
                          ? 'var(--danger)'
                          : meta.kind === 'rewrite'
                          ? 'var(--violet)'
                          : meta.kind === 'warn'
                          ? 'var(--warn)'
                          : 'var(--ok)',
                    }}
                  />
                </div>
              </button>
            )
          })}
        </Card>
      </div>

      {/* Two-column section: Top Domains & Top Clients */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Top Domains */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-t2">
            <Globe size={14} style={{ color: 'var(--accent)' }} />
            <span>{t('querylog.topDomains')}</span>
          </div>

          <Card className="overflow-hidden !rounded-xl">
            <div className="divide-y divide-[var(--glass-border)]">
              {stats.topDomains.slice(0, 5).map((td) => (
                <button
                  key={td.name}
                  onClick={() => onDrillDown('domain', td.name)}
                  className="press flex w-full items-center justify-between p-2 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <span className="truncate pr-2 text-[12px] text-t1">{td.name}</span>
                  <span className="num flex-none text-[11px] font-semibold text-t2">
                    {td.count} <span className="text-[10px] text-t3">({td.percentage}%)</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Top Clients */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-t2">
            <Users size={14} style={{ color: 'var(--accent)' }} />
            <span>{t('querylog.topClients')}</span>
          </div>

          <Card className="overflow-hidden !rounded-xl">
            <div className="divide-y divide-[var(--glass-border)]">
              {stats.topClients.slice(0, 5).map((tc) => (
                <button
                  key={tc.name}
                  onClick={() => onDrillDown('client', tc.name)}
                  className="press flex w-full items-center justify-between p-2 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <div className="min-w-0 flex-1 truncate pr-2">
                    <p className="truncate text-[12px] text-t1">{tc.sub || tc.name}</p>
                    {tc.sub && <p className="text-[10px] text-t3">{tc.name}</p>}
                  </div>
                  <span className="num flex-none text-[11px] font-semibold text-t2">
                    {tc.count} <span className="text-[10px] text-t3">({tc.percentage}%)</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Upstreams Stats */}
      {stats.topUpstreams.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-t2">
            <Server size={14} style={{ color: 'var(--accent)' }} />
            <span>{t('querylog.topUpstreams')}</span>
          </div>

          <Card className="overflow-hidden !rounded-xl">
            <div className="divide-y divide-[var(--glass-border)]">
              {stats.topUpstreams.slice(0, 4).map((up) => (
                <div
                  key={up.upstream}
                  className="flex items-center justify-between p-2.5 text-[12px]"
                >
                  <span className="truncate pr-2 font-mono text-[11.5px] text-t2">
                    {up.upstream}
                  </span>
                  <div className="flex flex-none items-center gap-3">
                    <span className="num text-t3">
                      {up.count} {t('querylog.queriesUnit')}
                    </span>
                    <span className="num font-semibold text-t1">{fmtMs(up.avgElapsedMs)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
