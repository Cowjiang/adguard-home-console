/** 统计分析(桌面端专属):环形图 + 24h 趋势 + 域名/客户端/上游排行表格 */
import useSWR from 'swr'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShieldAlert, Globe, Users, Database, Timer, PieChart } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { swrFetcher, type Stats, type ClientsData } from '../lib/api'
import { AreaChart, Donut, RankTable, StatTile } from '../components/charts'
import { usePageInClass, Card, Loading, EmptyState, Button } from '../components/ui'
import { fmtCompact, fmtNum, fmtPct, fmtMs } from '../lib/format'

/** v0.107.79 的 top_* 字段是单键对象数组,兼容旧版字典结构 */
function toMap(v: unknown): Record<string, number> {
  if (Array.isArray(v)) {
    return Object.assign({}, ...v.filter((o) => o && typeof o === 'object'))
  }
  return (v as Record<string, number>) ?? {}
}

function topN(obj: unknown, n: number): [string, number][] {
  return Object.entries(toMap(obj))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
}

export default function StatsPage() {
  const pageIn = usePageInClass()
  const { t } = useTranslation()
  const { cfg } = useAuth()
  const nav = useNavigate()
  const { data: stats, error } = useSWR<Stats>(cfg ? ['stats', cfg, '/stats'] : null, swrFetcher, {
    refreshInterval: 5000,
    keepPreviousData: true,
  })
  const { data: clients } = useSWR<ClientsData>(cfg ? ['clients', cfg, '/clients'] : null, swrFetcher, {
    refreshInterval: 60000,
  })

  const clientName = (ip: string): string => {
    const c = clients?.clients?.find((x) => x.ids.includes(ip))
    if (c) return c.name
    const a = clients?.auto_clients?.find((x) => x.ip === ip)
    return a?.name || ip
  }

  const trend = useMemo(() => {
    const q = stats?.dns_queries ?? []
    const b = stats?.blocked_filtering ?? []
    const len = Math.min(24, q.length)
    return {
      queries: q.slice(-len),
      blocked: b.slice(-len),
      labels: Array.from({ length: len }, (_, i) => {
        const dte = new Date(Date.now() - (len - 1 - i) * 3600_000)
        return `${String(dte.getHours()).padStart(2, '0')}:00`
      }),
    }
  }, [stats])

  if (error) return <Loading text={t('dashboard.loading')} />
  if (!stats) return <Loading />

  const total = stats.num_dns_queries
  const blocked = stats.num_blocked_filtering
  const safeBrowsing = stats.num_replaced_safebrowsing
  const safeSearch = stats.num_replaced_safesearch
  const parental = stats.num_replaced_parental
  const passed = Math.max(0, total - blocked - safeBrowsing - safeSearch - parental)
  const blockedPct = fmtPct(blocked, total)

  const peak = Math.max(0, ...trend.queries)
  const peakLabel = trend.labels[trend.queries.indexOf(peak)] ?? '—'

  return (
    <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
      <div className="mb-4 flex items-end justify-between">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-t1">{t('stats.title')}</h1>
      </div>

      {/* 关键指标 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label={t('stats.totalQueries')} value={fmtCompact(total)} sub={t('stats.countSub', { n: fmtNum(total) })} />
        <StatTile label={t('dashboard.blocked')} value={fmtCompact(blocked)} sub={t('dashboard.blockRateSub', { pct: blockedPct })} accent="var(--danger)" />
        <StatTile label={t('dashboard.safeBrowsing')} value={fmtCompact(safeBrowsing)} sub={t('stats.safeBrowsingSub')} accent="var(--warn)" />
        <StatTile label={t('dashboard.avgLatency')} value={fmtMs(stats.avg_processing_time)} sub={t('dashboard.perQuery')} accent="var(--accent-2)" />
        <StatTile label={t('stats.peakHour')} value={fmtCompact(peak)} sub={peakLabel} accent="var(--violet)" />
      </div>

      {/* 趋势 + 请求构成 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15.5px] font-bold text-t1">{t('stats.trend24h')}</h2>
            <div className="flex items-center gap-2 text-[10.5px] text-t2">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--chart-1)' }} /> {t('dashboard.legendQueries')}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--chart-2)' }} /> {t('dashboard.legendBlocked')}
              </span>
            </div>
          </div>
          <AreaChart series={{ queries: trend.queries, blocked: trend.blocked }} labels={trend.labels} height={210} />
        </Card>
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <PieChart size={16} className="text-t2" />
            <h2 className="text-[15.5px] font-bold text-t1">{t('dashboard.composition')}</h2>
          </div>
          <Donut
            centerLabel={fmtCompact(total)}
            centerSub={t('dashboard.totalRequests')}
            segments={[
              { label: t('dashboard.passed'), value: passed, color: 'var(--chart-1)' },
              { label: t('dashboard.blocked'), value: blocked, color: 'var(--danger)' },
              { label: t('dashboard.safeBrowsing'), value: safeBrowsing, color: 'var(--warn)' },
              { label: t('dashboard.safeSearch'), value: safeSearch, color: 'var(--accent-2)' },
              { label: t('dashboard.parental'), value: parental, color: 'var(--violet)' },
            ]}
          />
        </Card>
      </div>

      {/* 排行表格 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <Globe size={16} className="text-t2" />
            <h2 className="text-[15.5px] font-bold text-t1">{t('stats.topDomains15')}</h2>
          </div>
          <RankTable items={topN(stats.top_queried_domains, 15)} />
          <Button variant="glass" size="sm" className="mt-3 w-full" onClick={() => nav('/top/queried')}>
            {t('dashboard.viewMore')}
          </Button>
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <ShieldAlert size={16} className="text-t2" />
            <h2 className="text-[15.5px] font-bold text-t1">{t('stats.topBlocked15')}</h2>
          </div>
          {topN(stats.top_blocked_domains, 15).length ? (
            <>
              <RankTable items={topN(stats.top_blocked_domains, 15)} color="var(--danger)" />
              <Button variant="glass" size="sm" className="mt-3 w-full" onClick={() => nav('/top/blocked')}>
                {t('dashboard.viewMore')}
              </Button>
            </>
          ) : (
            <EmptyState icon={<ShieldAlert size={30} className="text-t3" />} title={t('dashboard.noBlockedTitle')} subtitle={t('dashboard.noBlockedSub')} />
          )}
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <Users size={16} className="text-t2" />
            <h2 className="text-[15.5px] font-bold text-t1">{t('stats.topClients10')}</h2>
          </div>
          <RankTable items={topN(stats.top_clients, 10)} color="var(--accent-2)" resolve={clientName} />
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <Database size={16} className="text-t2" />
            <h2 className="text-[15.5px] font-bold text-t1">{t('dashboard.upstreams')}</h2>
          </div>
          <UpstreamTable stats={stats} />
        </Card>
      </div>
    </div>
  )
}

function UpstreamTable({ stats }: { stats: Stats }) {
  const { t } = useTranslation()
  const rows = topN(stats.top_upstreams_responses, 8).map(([up, count]) => {
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
