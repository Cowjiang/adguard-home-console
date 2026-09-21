/** 概览仪表盘 */
import useSWR from 'swr'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, ChevronDown, Globe, Laptop, ShieldAlert, Zap, Database, Timer } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { api, swrFetcher, type Stats, type ClientsData } from '../lib/api'
import { AreaChart, BarList, Donut, StatTile } from '../components/charts'
import { Card, Loading, Segmented, Badge, EmptyState, Button, usePick, PickSelect } from '../components/ui'
import { isAppleMobile } from '../lib/nativePickers'
import { ProtectionCard } from '../components/ProtectionCard'
import { fmtCompact, fmtNum, fmtPct, fmtMs, fmtUptime } from '../lib/format'


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

const RANGE_OPTS = [
  { value: '6h', label: '6 小时' },
  { value: '12h', label: '12 小时' },
  { value: '24h', label: '24 小时' },
] as const
type RangeKey = (typeof RANGE_OPTS)[number]['value']
const RANGE_PICK_OPTS: { label: string; value: RangeKey }[] = RANGE_OPTS.map((o) => ({ label: o.label, value: o.value }))

export default function Dashboard() {
  const { cfg, status } = useAuth()
  const nav = useNavigate()
  const [topTab, setTopTab] = useState<'clients' | 'domains' | 'blocked'>('domains')

  const { data: stats, error } = useSWR<Stats>(cfg ? ['stats', cfg, '/stats'] : null, swrFetcher, {
    refreshInterval: 5000,
    keepPreviousData: true,
  })
  const { data: clients } = useSWR<ClientsData>(cfg ? ['clients', cfg, '/clients'] : null, swrFetcher, {
    refreshInterval: 60000,
  })
  const [range, setRange] = useState<RangeKey>('24h')
  const pick = usePick({ menuOnMobile: true })

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

  const rangeLabel = RANGE_OPTS.find((o) => o.value === range)?.label ?? ''
  const openRangePicker = (e: React.MouseEvent<HTMLElement>) => {
    pick({
      title: '时间范围',
      anchor: e.currentTarget,
      align: 'right',
      value: range,
      options: RANGE_OPTS.map((o) => ({ label: o.label, value: o.value })),
      onPick: setRange,
    })
  }

  if (error) return <Loading text="连接服务器中…" />
  if (!stats) return <Loading />

  // 移动端扩展指标(统计页合并):请求构成
  const safeBrowsing = stats.num_replaced_safebrowsing
  const safeSearch = stats.num_replaced_safesearch
  const parental = stats.num_replaced_parental
  const passed = Math.max(0, stats.num_dns_queries - stats.num_blocked_filtering - safeBrowsing - safeSearch - parental)

  const blockedPct = fmtPct(stats.num_blocked_filtering, stats.num_dns_queries)

  return (
    <div className="page-in mx-auto w-full page-shell px-4">
      {/* 防护主卡 + 统计块:桌面并排 */}
      <div className="mt-0 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ProtectionCard />
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="今日查询" value={fmtCompact(stats.num_dns_queries)} sub={`${fmtNum(stats.num_dns_queries)} 次`} onClick={() => nav('/log?filter=all')} />
          <StatTile label="已拦截" value={fmtCompact(stats.num_blocked_filtering)} sub={`拦截率 ${blockedPct}`} accent="var(--danger)" onClick={() => nav('/log?filter=blocked')} />
          <StatTile label="平均耗时" value={fmtMs(stats.avg_processing_time)} sub="单次解析" accent="var(--accent-2)" />
          <StatTile
            label="客户端"
            value={fmtCompact((clients?.clients?.length ?? 0) + (clients?.auto_clients?.length ?? 0))}
            sub={`${clients?.clients?.length ?? 0} 个持久 · ${clients?.auto_clients?.length ?? 0} 个自动`}
            accent="var(--accent-2)"
            onClick={() => nav('/clients')}
          />
        </div>
      </div>

      {/* 流量趋势 */}
      <Card className="mt-4 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="text-[15.5px] font-bold text-t1">流量趋势</h2>
            <div className="flex items-center gap-2 text-[10.5px] text-t2">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--chart-1)' }} /> 查询
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--chart-2)' }} /> 拦截
              </span>
            </div>
          </div>
          {isAppleMobile() ? (
            <span className="press glass relative flex h-[30px] flex-none items-center gap-1 rounded-full pl-3 pr-7 text-[12.5px] font-semibold text-t1">
              <PickSelect
                className="absolute inset-0 h-[30px] w-full cursor-pointer appearance-none bg-transparent text-transparent"
                value={range}
                options={RANGE_PICK_OPTS}
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

      {/* 请求构成(移动端;桌面完整版在统计页) */}
      <Card className="mt-4 p-4 lg:hidden">
        <h2 className="mb-3 text-[15.5px] font-bold text-t1">请求构成</h2>
        <Donut
          size={140}
          thickness={20}
          centerLabel={fmtCompact(stats.num_dns_queries)}
          centerSub="总请求"
          segments={[
            { label: '正常放行', value: passed, color: 'var(--chart-1)' },
            { label: '已拦截', value: stats.num_blocked_filtering, color: 'var(--danger)' },
            { label: '安全浏览', value: safeBrowsing, color: 'var(--warn)' },
            { label: '安全搜索', value: safeSearch, color: 'var(--accent-2)' },
            { label: '家长控制', value: parental, color: 'var(--violet)' },
          ]}
        />
      </Card>

      {/* Top 榜单(桌面占 2/3)+ 上游/服务器(右列) */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <Segmented
            value={topTab}
            onChange={setTopTab}
            options={[
              { value: 'domains', label: '热门域名' },
              { value: 'blocked', label: '拦截域名' },
              { value: 'clients', label: '活跃客户端' },
            ]}
          />
          <div className="mt-4">
            {topTab === 'domains' && (
              <>
                <BarList items={topN(stats.top_queried_domains, 10)} />
                <Button variant="glass" size="sm" className="mt-3 w-full" onClick={() => nav('/top/queried')}>
                  查看更多
                </Button>
              </>
            )}
            {topTab === 'blocked' && (
              topN(stats.top_blocked_domains, 10).length ? (
                <>
                  <BarList items={topN(stats.top_blocked_domains, 10)} color="var(--danger)" />
                  <Button variant="glass" size="sm" className="mt-3 w-full" onClick={() => nav('/top/blocked')}>
                    查看更多
                  </Button>
                </>
              ) : (
                <EmptyState icon={<ShieldAlert size={30} className="text-t3" />} title="暂无拦截记录" subtitle="你的网络环境非常干净" />
              )
            )}
            {topTab === 'clients' && (
              <BarList
                items={topN(stats.top_clients, 10).map(([ip, v]) => [clientName(ip), v] as [string, number])}
                color="var(--accent-2)"
              />
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          {/* 上游 DNS */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15.5px] font-bold text-t1">上游服务器</h2>
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
              {!topN(stats.top_upstreams_responses, 1).length && <p className="py-2 text-center text-[13px] text-t3">暂无上游数据</p>}
            </div>
          </Card>

          {/* 服务器信息 */}
          {status && (
            <Card className="p-4">
              <div className="grid grid-cols-3 gap-y-3 text-center">
                <InfoCell icon={<Zap size={14} />} label="运行状态" value={status.running ? '正常' : '停止'} good={status.running} />
                <InfoCell icon={<Laptop size={14} />} label="DNS 端口" value={String(status.dns_port)} />
                <InfoCell icon={<Timer size={14} />} label="已运行" value={fmtUptime(status.start_time)} />
              </div>
            </Card>
          )}
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
