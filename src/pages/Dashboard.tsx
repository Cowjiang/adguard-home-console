/** Overview dashboard: hero + trend are shared; mobile keeps the tabbed top
 *  lists and upstream quick list, desktop (>=lg) carries the full stats
 *  analysis section merged from the former /stats page */
import useSWR from 'swr'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Globe, Laptop, ShieldAlert, Users, Zap, Database, Timer, PieChart } from 'lucide-react'
import { useAuth } from '../lib/session/auth'
import { api, swrFetcher, type Stats, type SvrConfig, type ClientsData } from '../lib/api'
import { activeEndpoint } from '../lib/session/instances'
import { AreaChart, BarList, Donut, RankTable, StatTile } from '../components/charts'
import { usePageInClass, Card, Loading, Segmented, Badge, EmptyState, Button, usePick, PickSelect, TabContent } from '../components/ui'
import { isAppleMobile } from '../lib/native/shell'
import { useTabJump } from '../lib/nav/navMeta'
import { useEnterSkip } from '../lib/routeTransition'
import { ProtectionCard } from '../components/protection/ProtectionCard'
import { fmtCompact, fmtNum, fmtPct, fmtMs, fmtUptime } from '../lib/format'
import { toMap, topEntries, aggregateStats } from '../lib/stats'

const RANGE_OPTS = [
  { value: '6h', labelKey: 'dashboard.range6h' },
  { value: '12h', labelKey: 'dashboard.range12h' },
  { value: '24h', labelKey: 'dashboard.range24h' },
] as const
type RangeKey = (typeof RANGE_OPTS)[number]['value']

const hourLabel = (hoursAgo: number) => {
  const dte = new Date(Date.now() - hoursAgo * 3600_000)
  return `${String(dte.getHours()).padStart(2, '0')}:00`
}

export default function Dashboard() {
  const pageIn = usePageInClass()
  // Mounted mid-slide-transition (e.g. gesture back landing) → skip the content-in
  // entrance, so a pending animation cannot leave the whole page blank during the gesture
  const enterSkip = useEnterSkip()
  const { cfg, store, activeId, instances } = useAuth()
  const nav = useNavigate()
  // Cross-tab jump (tab root → another tab root): replace keeps it out of the history
  // stack (swipe-back cannot return across tabs) + push transition animation; hierarchical
  // drill-down (e.g. /top/*) still uses nav push
  const jump = useTabJump()
  const [topTab, setTopTab] = useState<'clients' | 'domains' | 'blocked'>('domains')

  const { data: activeStats, error } = useSWR<Stats>(cfg ? ['stats', cfg, '/stats'] : null, swrFetcher, {
    refreshInterval: 5000,
    keepPreviousData: true,
  })

  // Cross-instance aggregation: non-active instances poll /stats on a slow
  // 30s cadence (the active one keeps the 5s hook above); totals and top_*
  // lists merge, curves stay per-instance (see aggregateStats)
  const others = useMemo(() => {
    const st = store
    if (!st) return []
    return st.instances
      .filter((x) => x.id !== st.activeId)
      .map((x) => {
        const ep = activeEndpoint(x)
        return ep
          ? { id: x.id, label: x.label, cfg: { url: ep.url, username: ep.username, password: ep.password } as SvrConfig }
          : null
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
  }, [store])
  const [otherStats, setOtherStats] = useState<Record<string, Stats | undefined>>({})
  const onOtherStats = useCallback((url: string, s: Stats | undefined) => {
    setOtherStats((prev) => (prev[url] === s ? prev : { ...prev, [url]: s }))
  }, [])
  const [curveId, setCurveId] = useState<string | null>(null)

  // Merged view rendered by the whole page; the curve slots below swap in one
  // instance's arrays
  const stats = useMemo(
    () => (activeStats ? aggregateStats(activeStats, others.map((o) => otherStats[o.cfg.url])) : undefined),
    [activeStats, others, otherStats]
  )
  // Curve source: follows the active instance unless the user picked one;
  // falls back to the active's data until the pick has loaded
  const curveStats = useMemo(() => {
    const want = curveId ?? activeId
    if (!want || want === activeId) return activeStats
    const other = others.find((o) => o.id === want)
    return other ? otherStats[other.cfg.url] : activeStats
  }, [curveId, activeId, others, activeStats, otherStats])
  const { data: clients } = useSWR<ClientsData>(cfg ? ['clients', cfg, '/clients'] : null, swrFetcher, {
    refreshInterval: 60000,
  })
  const [range, setRange] = useState<RangeKey>('24h')
  const { t } = useTranslation()

  // Mobile trend legend: one row when it fits; when it doesn't, reflow as a
  // symmetric 2×2 grid — a ragged 3+1 wrap reads badly next to the picker.
  // Decided from the header box (content-width of items vs the space left
  // beside title and picker) so both modes and live resizes recover; the
  // callback ref re-attaches the observer when the card mounts with data
  const [trendHeader, setTrendHeader] = useState<HTMLDivElement | null>(null)
  const [legendGrid, setLegendGrid] = useState(false)
  useEffect(() => {
    if (!trendHeader) return
    const decide = () => {
      const kids = trendHeader.children as HTMLCollectionOf<HTMLElement>
      const [title, legend, picker] = [kids[0], kids[1], kids[2]]
      if (!legend || !picker) return
      const oneLine = [...legend.children].reduce((w, c) => w + (c as HTMLElement).offsetWidth, 0) + 3 * 6
      const avail = trendHeader.clientWidth - title.offsetWidth - picker.offsetWidth - 16
      setLegendGrid(oneLine > avail)
    }
    const ro = new ResizeObserver(decide)
    ro.observe(trendHeader)
    decide()
    return () => ro.disconnect()
  }, [trendHeader])

  const clientName = (ip: string): string => {
    const c = clients?.clients?.find((x) => x.ids.includes(ip))
    if (c) return c.name
    const a = clients?.auto_clients?.find((x) => x.ip === ip)
    return a?.name || ip
  }

  const chart = useMemo(() => {
    const n = range === '6h' ? 6 : range === '12h' ? 12 : 24
    const q = curveStats?.dns_queries ?? []
    const b = curveStats?.blocked_filtering ?? []
    const len = Math.min(n, q.length)
    return {
      queries: q.slice(-len),
      blocked: b.slice(-len),
      // Raw 24h filter-block series; each consumer slices to its own range
      safe: curveStats?.replaced_safebrowsing ?? [],
      parental: curveStats?.replaced_parental ?? [],
      labels: Array.from({ length: len }, (_, i) => hourLabel(len - 1 - i)),
    }
  }, [range, curveStats])

  // Filtering-trend card keeps its own picker, mirroring the traffic trend
  const [filterRange, setFilterRange] = useState<RangeKey>('24h')
  const filterLen = filterRange === '6h' ? 6 : filterRange === '12h' ? 12 : 24
  const filterLabels = useMemo(
    () => Array.from({ length: filterLen }, (_, i) => hourLabel(filterLen - 1 - i)),
    [filterLen]
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
        {/* Silent /stats fetchers for the non-active instances (aggregation
            feed); they render nothing */}
        {others.map((o) => (
          <OtherStats key={o.id} cfg={o.cfg} onData={onOtherStats} />
        ))}
        {/* Protection card + stat tiles: side by side on desktop */}
      <div className="mt-0 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ProtectionCard />
        <div className="grid grid-cols-2 gap-3">
          <StatTile label={t('dashboard.queriesToday')} value={fmtCompact(stats.num_dns_queries)} sub={t('dashboard.queriesSub', { n: fmtNum(stats.num_dns_queries) })} onClick={() => jump('/logs?filter=all')} />
          <StatTile label={t('dashboard.blocked')} value={fmtCompact(stats.num_blocked_filtering)} sub={t('dashboard.blockRateSub', { pct: blockedPct })} accent="var(--danger)" onClick={() => jump('/logs?filter=blocked')} />
          <StatTile label={t('dashboard.avgLatency')} value={fmtMs(stats.avg_processing_time)} sub={t('dashboard.perQuery')} accent="var(--accent-2)" />
          <StatTile
            label={t('dashboard.clients')}
            value={fmtCompact((clients?.clients?.length ?? 0) + (clients?.auto_clients?.length ?? 0))}
            sub={t('dashboard.clientsSub', { p: clients?.clients?.length ?? 0, a: clients?.auto_clients?.length ?? 0 })}
            accent="var(--accent-2)"
            onClick={() => nav('/clients')}
          />
        </div>
      </div>

      {/* Aggregation scope note: totals/leaderboards merge all instances,
          curves stay per-instance */}
      {instances.length > 1 && (
        <p className="mt-2.5 px-1 text-[11.5px] leading-relaxed text-t3">
          {t('dashboard.aggregateNote', { n: instances.length })}
        </p>
      )}

      {/* Traffic trend: mobile merges the filter-block series into the same
          chart; its 4-entry legend sits right of the title as a 2×2 chip grid
          aligned with the range picker — one inline row cannot fit 390px */}
      <Card className="mt-4 p-4">
        <div ref={setTrendHeader} className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="whitespace-nowrap text-[15.5px] font-bold text-t1">{t('dashboard.trend')}</h2>
            <div className="hidden items-center gap-2 text-[10.5px] text-t2 lg:flex">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--chart-1)' }} /> {t('dashboard.legendQueries')}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--chart-2)' }} /> {t('dashboard.legendBlocked')}
              </span>
            </div>
          </div>
          {/* One row when it fits (wide phones), wraps right-aligned only
              when the space between title and picker runs out */}
          <div
            className={`ml-auto items-center justify-end gap-x-1.5 gap-y-0.5 text-[10.5px] leading-tight text-t2 lg:hidden ${legendGrid ? 'grid grid-cols-2' : 'flex min-w-0 flex-wrap'}`}
          >
            <span className="flex w-max items-center gap-1 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--chart-1)' }} /> {t('dashboard.legendQueries')}
            </span>
            <span className="flex w-max items-center gap-1 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--chart-2)' }} /> {t('dashboard.legendBlocked')}
            </span>
            <span className="flex w-max items-center gap-1 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--warn)' }} /> {t('stats.malwareChart')}
            </span>
            <span className="flex w-max items-center gap-1 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--violet)' }} /> {t('stats.adultChart')}
            </span>
          </div>
          <RangePicker value={range} onChange={setRange} />
        </div>
        {/* Curve source picker (multi-instance only): curves are never
            aggregated, each instance renders its own series */}
        {instances.length > 1 && (
          <div className="mb-3">
            <Segmented
              value={curveId ?? activeId ?? ''}
              onChange={(v) => setCurveId(v)}
              options={instances.map((x) => ({ value: x.id, label: x.label }))}
            />
          </div>
        )}
        <div className="hidden lg:block">
          <AreaChart series={{ queries: chart.queries, blocked: chart.blocked }} labels={chart.labels} height={160} />
        </div>
        <div className="lg:hidden">
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
          the full-size donut) */}
      <Card className="mt-4 p-4 lg:hidden">
        <h2 className="mb-3 text-[15.5px] font-bold text-t1">{t('dashboard.composition')}</h2>
        <Donut
          size={140}
          thickness={20}
          centerLabel={fmtCompact(stats.num_dns_queries)}
          centerSub={t('dashboard.totalRequests')}
          segments={compositionSegments}
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
                  <Badge kind="info">{fmtMs(avg)}</Badge>
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
            <RangePicker value={filterRange} onChange={setFilterRange} />
          </div>
          {instances.length > 1 && (
            <div className="mb-3">
              <Segmented
                value={curveId ?? activeId ?? ''}
                onChange={(v) => setCurveId(v)}
                options={instances.map((x) => ({ value: x.id, label: x.label }))}
              />
            </div>
          )}
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

/** First-load skeleton: mirrors the first screen; the root container stays mounted so data
 *  arrival only swaps content and does not replay the page animation */
function DashSkeleton() {
  const block = 'glass specular rounded-3xl animate-pulse'
  const enterSkip = useEnterSkip()
  return (
    <div className={enterSkip ? '' : 'content-in'}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className={`${block} h-[168px] lg:h-full`} />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${block} h-[78px]`} />
          ))}
        </div>
      </div>
      <div className={`${block} mt-4 h-[228px]`} />
      {/* Mobile: tabbed top lists + upstreams + server info */}
      <div className="mt-4 grid gap-4 lg:hidden">
        <div className={`${block} h-[300px]`} />
        <div className={`${block} h-[220px]`} />
        <div className={`${block} h-[92px]`} />
      </div>
      {/* Desktop: analysis skeleton (adaptive composition/trends pair, then
          two independent masonry ranking columns) */}
      <div className="mt-4 hidden items-start gap-4 lg:flex">
        <div className={`${block} h-[240px] w-[400px] flex-none`} />
        <div className={`${block} h-[240px] min-w-0 flex-1`} />
      </div>
      <div className="mt-4 hidden items-start gap-4 lg:grid lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className={`${block} h-[620px]`} />
          <div className={`${block} h-[500px]`} />
        </div>
        <div className="flex flex-col gap-4">
          <div className={`${block} h-[500px]`} />
          <div className={`${block} h-[400px]`} />
          <div className={`${block} h-[92px]`} />
        </div>
      </div>
    </div>
  )
}

/** Trend range selector shared by the traffic-trend and filtering-trend
 *  cards: anchored menu normally, native select overlay on Apple devices */
function RangePicker({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  const { t } = useTranslation()
  const pick = usePick()
  const options = RANGE_OPTS.map((o) => ({ label: t(o.labelKey), value: o.value }))
  const opt = RANGE_OPTS.find((o) => o.value === value)
  const label = opt ? t(opt.labelKey) : ''
  const open = (e: React.MouseEvent<HTMLElement>) => {
    pick({
      title: t('dashboard.rangeTitle'),
      anchor: e.currentTarget,
      align: 'right',
      value,
      options,
      onPick: onChange,
    })
  }
  if (isAppleMobile()) {
    return (
      <span className="press glass relative flex h-[30px] flex-none items-center gap-1 rounded-full pl-3 pr-7 text-[12.5px] font-semibold text-t1">
        <PickSelect
          className="absolute inset-0 h-[30px] w-full cursor-pointer appearance-none bg-transparent text-transparent"
          value={value}
          options={options}
          onPick={onChange}
        />
        <span className="pointer-events-none">{label}</span>
        <ChevronDown size={14} className="pointer-events-none absolute right-2 text-t2" />
      </span>
    )
  }
  return (
    <button
      onClick={open}
      className="press glass flex flex-none items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-t1"
    >
      {label}
      <ChevronDown size={14} className="text-t2" />
    </button>
  )
}

/** Silent per-instance /stats fetcher for non-active instances, feeding the
 *  aggregation at a slow 30s cadence (the active instance's key is owned by
 *  the 5s hook above — same key shape, so the cache carries over on switch).
 *  One hook per instance is kept legal by mounting as a child component */
function OtherStats({ cfg, onData }: { cfg: SvrConfig; onData: (url: string, s: Stats | undefined) => void }) {
  const { data } = useSWR<Stats>(['stats', cfg, '/stats'], swrFetcher, {
    refreshInterval: 30000,
    keepPreviousData: true,
  })
  useEffect(() => {
    onData(cfg.url, data)
  }, [cfg.url, data, onData])
  return null
}

/** Running status / DNS port / uptime, shared by the mobile right column and
 *  the desktop analysis right column */
function ServerInfoCard() {
  const { status } = useAuth()
  const { t } = useTranslation()
  if (!status) return null
  return (
    <Card className="p-4">
      <div className="grid grid-cols-3 gap-y-3 text-center">
        <InfoCell icon={<Zap size={14} />} label={t('dashboard.status')} value={status.running ? t('dashboard.running') : t('dashboard.stopped')} good={status.running} />
        <InfoCell icon={<Laptop size={14} />} label={t('dashboard.dnsPort')} value={String(status.dns_port)} />
        <InfoCell icon={<Timer size={14} />} label={t('dashboard.uptime')} value={fmtUptime(status.start_time)} />
      </div>
    </Card>
  )
}

/** Upstream latency table: response-count bar + fastest-highlight avg time;
 *  the desktop counterpart of the mobile upstream quick list */
function UpstreamTable({ stats }: { stats: Stats }) {
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

function InfoCell({ icon, label, value, good }: { icon: React.ReactNode; label: string; value: string; good?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="flex items-center gap-1 text-[11.5px] text-t3">
        {icon} {label}
      </span>
      <span className="text-[14px] font-semibold num" style={{ color: good ? 'var(--ok)' : 'var(--t1)' }}>
        {value}
      </span>
    </div>
  )
}
