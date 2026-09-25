/** Full-ranking subpage (dashboard "view more" entry): complete ranking + search + count */
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { Globe } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { swrFetcher, type Stats } from '../lib/api'
import { RankTable } from '../components/charts'
import { usePageInClass, Loading, EmptyState, SearchBar, Card, PageHeader } from '../components/ui'
import { fmtNum } from '../lib/format'

/** v0.107.79 top_* fields are single-key object arrays; also accepts the legacy dictionary
 *  shape */
function toMap(v: unknown): Record<string, number> {
  if (Array.isArray(v)) {
    return Object.assign({}, ...v.filter((o) => o && typeof o === 'object'))
  }
  return (v as Record<string, number>) ?? {}
}

const KINDS = {
  queried: { titleKey: 'stats.queriedTitle', field: 'top_queried_domains', color: 'var(--accent)', unitKey: 'stats.unitDomains' },
  blocked: { titleKey: 'stats.blockedTitle', field: 'top_blocked_domains', color: 'var(--danger)', unitKey: 'stats.unitDomains' },
} as const

export default function TopListPage() {
  const pageIn = usePageInClass()
  const { kind } = useParams<{ kind: keyof typeof KINDS }>()
  const { t } = useTranslation()
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

  if (error) return <Loading text={t('dashboard.loading')} />
  if (!stats) return <Loading />

  const totalRequests = items.reduce((s, [, v]) => s + v, 0)

  return (
    <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
      <PageHeader
        back
        title={t(conf.titleKey)}
        subtitle={`${t('stats.countTotal', { n: fmtNum(items.length), unit: t(conf.unitKey) })}${search.trim() ? t('stats.filtered') : ''} · ${t('stats.requestsTotal', { n: fmtNum(totalRequests) })}`}
      />

      <div className="mb-3">
        <SearchBar value={search} onChange={setSearch} placeholder={t('stats.searchPlaceholder')} />
      </div>

      <Card className="p-3">
        {items.length ? (
          <RankTable items={items as [string, number][]} color={conf.color} />
        ) : (
          <EmptyState
            icon={<SearchIcon />}
            title={search.trim() ? t('stats.noMatchTitle') : t('charts.empty')}
            subtitle={search.trim() ? t('stats.noMatchSub') : undefined}
          />
        )}
      </Card>
    </div>
  )
}

function SearchIcon() {
  return <Globe size={30} className="text-t3" />
}
