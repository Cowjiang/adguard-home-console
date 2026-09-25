/** Overview dashboard */
import useSWR from 'swr'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowDownRight, ArrowUpRight, ChevronDown, Globe, Laptop, ShieldAlert, Zap, Database, Timer } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { api, swrFetcher, type Stats, type ClientsData } from '../lib/api'
import { AreaChart, BarList, Donut, StatTile } from '../components/charts'
import { usePageInClass, Card, Loading, Segmented, Badge, EmptyState, Button, usePick, PickSelect, TabContent } from '../components/ui'
import { isAppleMobile } from '../lib/nativePickers'
import { useTabJump } from '../lib/navMeta'
import { useEnterSkip } from '../lib/routeTransition'
import { ProtectionCard } from '../components/ProtectionCard'
import { fmtCompact, fmtNum, fmtPct, fmtMs, fmtUptime } from '../lib/format'


/** v0.107.79 top_* fields are single-key object arrays; also accepts the legacy dictionary
 *  shape */
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

const RANGE_OPTS = [
  { value: '6h', labelKey: 'dashboard.range6h' },
  { value: '12h', labelKey: 'dashboard.range12h' },
  { value: '24h', labelKey: 'dashboard.range24h' },
] as const
type RangeKey = (typeof RANGE_OPTS)[number]['value']

export default function Dashboard() {
  const pageIn = usePageInClass()
  // Mounted mid-slide-transition (e.g. gesture back landing) → skip the content-in
  // entrance, so a pending animation cannot leave the whole page blank during the gesture
  const enterSkip = useEnterSkip()
  const { cfg, status } = useAuth()
  const nav = useNavigate()
  // Cross-tab jump (tab root → another tab root): replace keeps it out of the history
  // stack (swipe-back cannot return across tabs) + push transition animation; hierarchical
  // drill-down (e.g. /top/*) still uses nav push
  const jump = useTabJump()
  const [topTab, setTopTab] = useState<'clients' | 'domains' | 'blocked'>('domains')

  const { data: stats, error } = useSWR<Stats>(cfg ? ['stats', cfg, '/stats'] : null, swrFetcher, {
    refreshInterval: 5000,
    keepPreviousData: true,
  })
  const { data: clients } = useSWR<ClientsData>(cfg ? ['clients', cfg, '/clients'] : null, swrFetcher, {
    refreshInterval: 60000,
  })
  const [range, setRange] = useState<RangeKey>('24h')
  const pick = usePick()
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
      labels: Array.from({ length: len }, (_, i) => {
        const dte = new Date(Date.now() - (len - 1 - i) * 3600_000)
        return `${String(dte.getHours()).padStart(2, '0')}:00`
      }),
    }
  }, [range, stats])

  const rangeOpts = RANGE_OPTS.map((o) => ({ label: t(o.labelKey), value: o.value }))
  const rangeOpt = RANGE_OPTS.find((o) => o.value === range)
  const rangeLabel = rangeOpt ? t(rangeOpt.labelKey) : ''
  const openRangePicker = (e: React.MouseEvent<HTMLElement>) => {
    pick({
      title: t('dashboard.rangeTitle'),
      anchor: e.currentTarget,
      align: 'right',
      value: range,
      options: rangeOpts,
      onPick: setRange,
    })
  }

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

  return (
      <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
      <div className={enterSkip ? '' : 'content-in'}>
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

      {/* Traffic trend */}
      <Card className="mt-4 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="text-[15.5px] font-bold text-t1">{t('dashboard.trend')}</h2>
            <div className="flex items-center gap-2 text-[10.5px] text-t2">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--chart-1)' }} /> {t('dashboard.legendQueries')}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--chart-2)' }} /> {t('dashboard.legendBlocked')}
              </span>
            </div>
          </div>
          {isAppleMobile() ? (
            <span className="press glass relative flex h-[30px] flex-none items-center gap-1 rounded-full pl-3 pr-7 text-[12.5px] font-semibold text-t1">
              <PickSelect
                className="absolute inset-0 h-[30px] w-full cursor-pointer appearance-none bg-transparent text-transparent"
                value={range}
                options={rangeOpts}
                onPick={setRange}
              />
              <span className="pointer-events-none">{rangeLabel}</span>
              <ChevronDown size={14} className="pointer-events-none absolute right-2 text-t2" />
            </span>
          ) : (
            <button
              onClick={openRangePicker}
              className="press glass flex flex-none items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-t1"
            >
              {rangeLabel}
              <ChevronDown size={14} className="text-t2" />
            </button>
          )}
        </div>
        <AreaChart series={{ queries: chart.queries, blocked: chart.blocked }} labels={chart.labels} height={160} />
      </Card>

      {/* Request composition (mobile; full version lives on the stats page) */}
      <Card className="mt-4 p-4 lg:hidden">
        <h2 className="mb-3 text-[15.5px] font-bold text-t1">{t('dashboard.composition')}</h2>
        <Donut
          size={140}
          thickness={20}
          centerLabel={fmtCompact(stats.num_dns_queries)}
          centerSub={t('dashboard.totalRequests')}
          segments={[
            { label: t('dashboard.passed'), value: passed, color: 'var(--chart-1)' },
            { label: t('dashboard.blocked'), value: stats.num_blocked_filtering, color: 'var(--danger)' },
            { label: t('dashboard.safeBrowsing'), value: safeBrowsing, color: 'var(--warn)' },
            { label: t('dashboard.safeSearch'), value: safeSearch, color: 'var(--accent-2)' },
            { label: t('dashboard.parental'), value: parental, color: 'var(--violet)' },
          ]}
        />
      </Card>

      {/* Top lists (2/3 width on desktop) + upstreams/server (right column) */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
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
                <BarList items={topN(stats.top_queried_domains, 10)} />
                <Button variant="glass" size="sm" className="mt-3 w-full" onClick={() => nav('/top/queried')}>
                  {t('dashboard.viewMore')}
                </Button>
              </>
            )}
            {topTab === 'blocked' && (
              topN(stats.top_blocked_domains, 10).length ? (
                <>
                  <BarList items={topN(stats.top_blocked_domains, 10)} color="var(--danger)" />
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
                  items={topN(stats.top_clients, 10).map(([ip, v]) => [clientName(ip), v] as [string, number])}
                  color="var(--accent-2)"
                />
                <Button variant="glass" size="sm" className="mt-3 w-full" onClick={() => nav('/clients')}>
                  {t('dashboard.viewMore')}
                </Button>
              </>
            )}
          </TabContent>
        </Card>

        <div className="flex flex-col gap-4">
          {/* Upstream DNS */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15.5px] font-bold text-t1">{t('dashboard.upstreams')}</h2>
              <Database size={16} className="text-t3" />
            </div>
            <div className="flex flex-col gap-3">
              {topN(stats.top_upstreams_responses, 6).map(([up, count]) => {
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
              {!topN(stats.top_upstreams_responses, 1).length && <p className="py-2 text-center text-[13px] text-t3">{t('dashboard.noUpstreams')}</p>}
            </div>
          </Card>

          {/* Server info */}
          {status && (
            <Card className="p-4">
              <div className="grid grid-cols-3 gap-y-3 text-center">
                <InfoCell icon={<Zap size={14} />} label={t('dashboard.status')} value={status.running ? t('dashboard.running') : t('dashboard.stopped')} good={status.running} />
                <InfoCell icon={<Laptop size={14} />} label={t('dashboard.dnsPort')} value={String(status.dns_port)} />
                <InfoCell icon={<Timer size={14} />} label={t('dashboard.uptime')} value={fmtUptime(status.start_time)} />
              </div>
            </Card>
          )}
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
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className={`${block} h-[300px] lg:col-span-2`} />
        <div className="flex flex-col gap-4">
          <div className={`${block} h-[220px]`} />
          <div className={`${block} h-[92px]`} />
        </div>
      </div>
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
