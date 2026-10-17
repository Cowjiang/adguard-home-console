/** Overview dashboard: hero + trend are shared; mobile keeps the tabbed top
 *  lists and upstream quick list, desktop (>=lg) carries the full stats
 *  analysis section merged from the former /stats page */
import useSWR from 'swr'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Globe, ShieldAlert, Users, Database, PieChart } from 'lucide-react'
import { useAuth } from '../lib/session/auth'
import { api, swrFetcher, type Stats, type ClientsData } from '../lib/api'
import { AreaChart, BarList, Donut, RankTable, StatTile } from '../components/charts'
import { usePageInClass, Card, Segmented, Button, TabContent } from '../components/ui/primitives'
import { Loading, Badge, EmptyState } from '../components/ui/atoms'
import { useTabJump } from '../lib/nav/navMeta'
import { useEnterSkip } from '../lib/routeTransition'
import { ProtectionCard } from '../components/protection/ProtectionCard'
import { DashSkeleton } from '../components/dashboard/DashSkeleton'
import { RangePicker, type RangeKey } from '../components/dashboard/RangePicker'
import { ServerInfoCard } from '../components/dashboard/ServerInfoCard'
import { UpstreamTable } from '../components/dashboard/UpstreamTable'
import { InfoCell } from '../components/dashboard/InfoCell'
import { fmtCompact, fmtNum, fmtPct, fmtMsFromSeconds } from '../lib/format'
import { toMap, topEntries } from '../lib/stats'


/** AGH buckets the series per hour, or per day once the retention passes 7 days
 *  (`time_units` in the /stats response); axis labels follow the declared unit */
const bucketLabel = (units: string | undefined, bucketsAgo: number) => {
  const days = units === 'days'
  const dte = new Date(Date.now() - bucketsAgo * (days ? 86_400_000 : 3_600_000))
  if (days) return `${dte.getMonth() + 1}/${dte.getDate()}`
  return `${String(dte.getHours()).padStart(2, '0')}:00`
}

export default function Dashboard() {
  const pageIn = usePageInClass()
  // Mounted mid-slide-transition (e.g. gesture back landing) → skip the content-in
  // entrance, so a pending animation cannot leave the whole page blank during the gesture
  const enterSkip = useEnterSkip()
  const { cfg } = useAuth()
  const nav = useNavigate()
  // Cross-tab jump (tab root → another tab root): replace keeps it out of the history
  // stack (swipe-back cannot return across tabs) + push transition animation; hierarchical
  // drill-down (e.g. /top/*) still uses nav push
  const jump = useTabJump()
  const [topTab, setTopTab] = useState<'clients' | 'domains' | 'blocked'>('domains')

  // Everything on this page describes the active instance
  const { data: stats, error } = useSWR<Stats>(cfg ? ['stats', cfg, '/stats'] : null, swrFetcher, {
    refreshInterval: 5000,
    keepPreviousData: true,
  })

  const { data: clients } = useSWR<ClientsData>(cfg ? ['clients', cfg, '/clients'] : null, swrFetcher, {
    refreshInterval: 60000,
  })
  const [range, setRange] = useState<RangeKey>('24h')
  const { t } = useTranslation()

  const clientName = (ip: string): string => {
    const c = clients?.clients?.find((x) => x.ids.includes(ip))
    if (c) return c.name
    const a = clients?.auto_clients?.find((x) => x.ip === ip)
    return a?.name || ip
  }

  const chart = useMemo(() => {
    const n = range === '6h' ? 6 : range === '12h' ? 12 : 24
    const q = stats?.dns_queries ?? []
    const b = stats?.blocked_filtering ?? []
    const len = Math.min(n, q.length)
    return {
      queries: q.slice(-len),
      blocked: b.slice(-len),
      // Raw 24h filter-block series; each consumer slices to its own range
      safe: stats?.replaced_safebrowsing ?? [],
      parental: stats?.replaced_parental ?? [],
      labels: Array.from({ length: len }, (_, i) => bucketLabel(stats?.time_units, len - 1 - i)),
    }
  }, [range, stats])

  // Filtering-trend card keeps its own picker, mirroring the traffic trend
  const [filterRange, setFilterRange] = useState<RangeKey>('24h')
  const filterLen = filterRange === '6h' ? 6 : filterRange === '12h' ? 12 : 24
  const filterLabels = useMemo(
    () => Array.from({ length: filterLen }, (_, i) => bucketLabel(stats?.time_units, filterLen - 1 - i)),
    [filterLen, stats?.time_units]
  )

  // All three branches share the same root div structure, so React reuses the node and
  // the page-in animation does not replay when switching
  if (error && !stats) {
    return (
      <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
        <div className="flex min-h-[55vh] items-center justify-center">
          <Loading text={t('dashboard.loading')} />
        </div>
      </div>
    )
  }
  if (!stats) {
    return (
      <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
        <DashSkeleton />
      </div>
    )
  }

  // Extra mobile metrics (merged into the stats page): request composition
  const safeBrowsing = stats.num_replaced_safebrowsing
  const safeSearch = stats.num_replaced_safesearch
  const parental = stats.num_replaced_parental
  const passed = Math.max(0, stats.num_dns_queries - stats.num_blocked_filtering - safeBrowsing - safeSearch - parental)

  const blockedPct = fmtPct(stats.num_blocked_filtering, stats.num_dns_queries)

  // Request composition donut, shared by the mobile card and the desktop
  // analysis section
  const compositionSegments = [
    { label: t('dashboard.passed'), value: passed, color: 'var(--chart-1)' },
    { label: t('dashboard.blocked'), value: stats.num_blocked_filtering, color: 'var(--danger)' },
    { label: t('dashboard.safeBrowsing'), value: safeBrowsing, color: 'var(--warn)' },
    { label: t('dashboard.safeSearch'), value: safeSearch, color: 'var(--accent-2)' },
    { label: t('dashboard.parental'), value: parental, color: 'var(--violet)' },
  ]

  return (
      <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
      <div className={enterSkip ? '' : 'content-in'}>
        {/* Protection card + stat tiles: side by side on desktop */}
      <div className="mt-0 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ProtectionCard />
        <div className="grid grid-cols-2 gap-3">
          <StatTile label={t('dashboard.queriesToday')} value={fmtCompact(stats.num_dns_queries)} sub={t('dashboard.queriesSub', { n: fmtNum(stats.num_dns_queries) })} onClick={() => jump('/logs?filter=all')} />
          <StatTile label={t('dashboard.blocked')} value={fmtCompact(stats.num_blocked_filtering)} sub={t('dashboard.blockRateSub', { pct: blockedPct })} accent="var(--danger)" onClick={() => jump('/logs?filter=blocked')} />
          <StatTile label={t('dashboard.avgLatency')} value={fmtMsFromSeconds(stats.avg_processing_time)} sub={t('dashboard.perQuery')} accent="var(--accent-2)" />
          <StatTile
            label={t('dashboard.clients')}
            value={fmtCompact((clients?.clients?.length ?? 0) + (clients?.auto_clients?.length ?? 0))}
            sub={t('dashboard.clientsSub', { p: clients?.clients?.length ?? 0, a: clients?.auto_clients?.length ?? 0 })}
            accent="var(--accent-2)"
            onClick={() => nav('/clients')}
          />
        </div>
      </div>

      {/* Traffic trend: mobile merges the filter-block series into the same
          chart without a legend (long-press preview names each series);
          desktop keeps the two-entry legend beside the title */}
      <Card className="mt-4 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="whitespace-nowrap text-[15.5px] font-bold text-t1">{t('dashboard.trend')}</h2>
            <div className="hidden items-center gap-2 text-[10.5px] text-t2 lg:flex">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--chart-1)' }} /> {t('dashboard.legendQueries')}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--danger)' }} /> {t('dashboard.legendBlocked')}
              </span>
            </div>
          </div>
          <RangePicker value={range} onChange={setRange} units={stats.time_units} />
        </div>
        {/* Blocked is remapped to the danger color: the chart tokens are
            generic, but a red blocked band matches the donut and the lists */}
        <div className="hidden lg:block" style={{ '--chart-2': 'var(--danger)' } as React.CSSProperties}>
          <AreaChart series={{ queries: chart.queries, blocked: chart.blocked }} labels={chart.labels} height={160} />
        </div>
        <div className="lg:hidden" style={{ '--chart-2': 'var(--danger)' } as React.CSSProperties}>
          <AreaChart
            series={{ queries: chart.queries, blocked: chart.blocked }}
            labels={chart.labels}
            height={160}
            extra={[
              { values: chart.safe.slice(-chart.queries.length), label: t('stats.malwareChart'), color: 'var(--warn)' },
              { values: chart.parental.slice(-chart.queries.length), label: t('stats.adultChart'), color: 'var(--violet)' },
            ]}
          />
        </div>
      </Card>

      {/* Request composition (mobile; the desktop analysis section below has
          the full-size donut). Narrow card → no percentage column, so the
          longer English segment names still fit beside the ring */}
      <Card className="mt-4 p-4 lg:hidden">
        <h2 className="mb-3 text-[15.5px] font-bold text-t1">{t('dashboard.composition')}</h2>
        <Donut
          size={140}
          thickness={20}
          centerLabel={fmtCompact(stats.num_dns_queries)}
          centerSub={t('dashboard.totalRequests')}
          segments={compositionSegments}
          hidePct
        />
      </Card>

      {/* Top lists + upstream quick list + server info: mobile layout only —
          on desktop the analysis section below carries the richer equivalents */}
      <div className="mt-4 grid gap-4 lg:hidden">
        <Card className="p-4">
          <Segmented
            value={topTab}
            onChange={setTopTab}
            options={[
              { value: 'domains', label: t('dashboard.topDomains') },
              { value: 'blocked', label: t('dashboard.topBlocked') },
              { value: 'clients', label: t('dashboard.topClients') },
            ]}
          />
          <TabContent value={topTab} className="mt-4">
            {topTab === 'domains' && (
              <>
                <BarList items={topEntries(stats.top_queried_domains, 10)} />
                <Button variant="glass" size="sm" className="mt-3 w-full" onClick={() => nav('/top/queried')}>
                  {t('dashboard.viewMore')}
                </Button>
              </>
            )}
            {topTab === 'blocked' && (
              topEntries(stats.top_blocked_domains, 10).length ? (
                <>
                  <BarList items={topEntries(stats.top_blocked_domains, 10)} color="var(--danger)" />
                  <Button variant="glass" size="sm" className="mt-3 w-full" onClick={() => nav('/top/blocked')}>
                    {t('dashboard.viewMore')}
                  </Button>
                </>
              ) : (
                <EmptyState icon={<ShieldAlert size={30} className="text-t3" />} title={t('dashboard.noBlockedTitle')} subtitle={t('dashboard.noBlockedSub')} />
              )
            )}
            {topTab === 'clients' && (
              <>
                <BarList
                  items={topEntries(stats.top_clients, 10).map(([ip, v]) => [clientName(ip), v] as [string, number])}
                  color="var(--accent-2)"
                />
                <Button variant="glass" size="sm" className="mt-3 w-full" onClick={() => nav('/clients')}>
                  {t('dashboard.viewMore')}
                </Button>
              </>
            )}
          </TabContent>
        </Card>

        {/* Upstream DNS quick list */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15.5px] font-bold text-t1">{t('dashboard.upstreams')}</h2>
            <Database size={16} className="text-t3" />
          </div>
          <div className="flex flex-col gap-3">
            {topEntries(stats.top_upstreams_responses, 6).map(([up, count]) => {
              const avg = toMap(stats.top_upstreams_avg_time)[up]
              return (
                <div key={up} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    <Globe size={15} />
                  </div>
                  <span className="w-0 min-w-0 flex-1 truncate text-[13.5px] text-t1">{up}</span>
                  <Badge kind="info">{fmtMsFromSeconds(avg)}</Badge>
                  <span className="w-14 flex-none text-right text-[12.5px] num text-t2">{fmtNum(count)}</span>
                </div>
              )
            })}
            {!topEntries(stats.top_upstreams_responses, 1).length && <p className="py-2 text-center text-[13px] text-t3">{t('dashboard.noUpstreams')}</p>}
          </div>
        </Card>

        <ServerInfoCard />
      </div>

      {/* Composition + filtering trends: a flex pair, not a fixed ratio — the
          donut card hugs its content width (legend text never truncates) and
          the trend chart takes the rest, shrinking freely with the viewport */}
      <div className="mt-4 hidden items-start gap-4 lg:flex">
        <Card className="flex-none p-4">
          <div className="mb-3 flex items-center gap-2">
            <PieChart size={16} className="text-t2" />
            <h2 className="text-[15.5px] font-bold text-t1">{t('dashboard.composition')}</h2>
          </div>
          <Donut
            centerLabel={fmtCompact(stats.num_dns_queries)}
            centerSub={t('dashboard.totalRequests')}
            segments={compositionSegments}
          />
        </Card>

        {/* Malware/phishing + adult-site blocks in one chart, same header
            form as the traffic trend: legend by the title, range picker right;
            series colors remapped to the donut's segment colors */}
        <Card className="min-w-0 flex-1 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <h2 className="whitespace-nowrap text-[15.5px] font-bold text-t1">{t('stats.filterTrend')}</h2>
              <div className="flex items-center gap-2 text-[10.5px] text-t2">
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--warn)' }} /> {t('stats.malwareChart')}
                </span>
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--violet)' }} /> {t('stats.adultChart')}
                </span>
              </div>
            </div>
            <RangePicker value={filterRange} onChange={setFilterRange} units={stats.time_units} />
          </div>
          <div style={{ '--chart-1': 'var(--warn)', '--chart-2': 'var(--violet)' } as React.CSSProperties}>
            <AreaChart
              series={{ queries: chart.safe.slice(-filterLen), blocked: chart.parental.slice(-filterLen) }}
              labels={filterLabels}
              height={160}
              tooltipLabels={[t('stats.malwareChart'), t('stats.adultChart')]}
            />
          </div>
        </Card>
      </div>

      {/* Rankings as two independent masonry columns: cards hug their own
          height, so e.g. the upstream table follows the blocked list with no
          forced row alignment against the left column */}
      <div className="mt-4 hidden items-start gap-4 lg:grid lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Globe size={16} className="text-t2" />
              <h2 className="text-[15.5px] font-bold text-t1">{t('stats.topDomains15')}</h2>
            </div>
            <RankTable items={topEntries(stats.top_queried_domains, 15)} />
            <Button variant="glass" size="sm" className="mt-3 w-full" onClick={() => nav('/top/queried')}>
              {t('dashboard.viewMore')}
            </Button>
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Users size={16} className="text-t2" />
              <h2 className="text-[15.5px] font-bold text-t1">{t('stats.topClients10')}</h2>
            </div>
            <RankTable items={topEntries(stats.top_clients, 10)} color="var(--accent-2)" resolve={clientName} />
            <Button variant="glass" size="sm" className="mt-3 w-full" onClick={() => nav('/clients')}>
              {t('dashboard.viewMore')}
            </Button>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <ShieldAlert size={16} className="text-t2" />
              <h2 className="text-[15.5px] font-bold text-t1">{t('stats.topBlocked15')}</h2>
            </div>
            {topEntries(stats.top_blocked_domains, 15).length ? (
              <>
                <RankTable items={topEntries(stats.top_blocked_domains, 15)} color="var(--danger)" />
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
              <Database size={16} className="text-t2" />
              <h2 className="text-[15.5px] font-bold text-t1">{t('dashboard.upstreams')}</h2>
            </div>
            <UpstreamTable stats={stats} />
          </Card>

          <ServerInfoCard />
        </div>
      </div>
      </div>
    </div>
  )
}
