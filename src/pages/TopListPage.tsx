/** 榜单全量子页(概览页"查看更多"入口):全量排行 + 搜索 + 计数 */
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import useSWR from 'swr'
import { Globe } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { swrFetcher, type Stats } from '../lib/api'
import { RankTable } from '../components/charts'
import { usePageInClass, Loading, EmptyState, SearchBar, Card, PageHeader } from '../components/ui'
import { fmtNum } from '../lib/format'

/** v0.107.79 的 top_* 字段是单键对象数组,兼容旧版字典结构 */
function toMap(v: unknown): Record<string, number> {
  if (Array.isArray(v)) {
    return Object.assign({}, ...v.filter((o) => o && typeof o === 'object'))
  }
  return (v as Record<string, number>) ?? {}
}

const KINDS = {
  queried: { title: '热门域名', field: 'top_queried_domains', color: 'var(--accent)', unit: '个域名' },
  blocked: { title: '拦截域名', field: 'top_blocked_domains', color: 'var(--danger)', unit: '个域名' },
} as const

export default function TopListPage() {
  const pageIn = usePageInClass()
  const { kind } = useParams<{ kind: keyof typeof KINDS }>()
  const { cfg } = useAuth()
  const [search, setSearch] = useState('')
  const conf = KINDS[kind ?? 'queried'] ?? KINDS.queried

  const { data: stats, error } = useSWR<Stats>(cfg ? ['stats', cfg, '/stats'] : null, swrFetcher, {
    refreshInterval: 5000,
    keepPreviousData: true,
  })

  const items = useMemo(() => {
    const all = Object.entries(toMap(stats?.[conf.field]))
      .sort((a, b) => b[1] - a[1])
    const s = search.trim().toLowerCase()
    return s ? all.filter(([k]) => k.toLowerCase().includes(s)) : all
  }, [stats, conf.field, search])

  if (error) return <Loading text="连接服务器中…" />
  if (!stats) return <Loading />

  const totalRequests = items.reduce((s, [, v]) => s + v, 0)

  return (
    <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
      <PageHeader back title={conf.title} subtitle={`共 ${fmtNum(items.length)} ${conf.unit}${search.trim() ? '(已过滤)' : ''} · ${fmtNum(totalRequests)} 次请求`} />

      <div className="mb-3">
        <SearchBar value={search} onChange={setSearch} placeholder="搜索域名…" />
      </div>

      <Card className="p-3">
        {items.length ? (
          <RankTable items={items as [string, number][]} color={conf.color} />
        ) : (
          <EmptyState
            icon={<SearchIcon />}
            title={search.trim() ? '没有匹配的域名' : '暂无数据'}
            subtitle={search.trim() ? '换个关键词试试' : undefined}
          />
        )}
      </Card>
    </div>
  )
}

function SearchIcon() {
  return <Globe size={30} className="text-t3" />
}
