/** Query log: live streaming, filters, search, detail actions */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import {
  Radar, Play, ChevronDown, Globe,
} from 'lucide-react'
import { useAuth } from '../lib/session/auth'
import { api, qs, swrFetcher, type QueryLogItem, type FilteringStatus } from '../lib/api'
import { usePageInClass, SearchBar, Chip, Badge, Card, EmptyState, Spinner, useSheet, toast, TabContent } from '../components/ui'
import { LogDetail, reasonMeta } from '../components/log/LogDetail'
import { LOG_FILTERS, qtypeColor } from '../lib/constants'
import { fmtTime, fmtMs } from '../lib/format'
import { useIsDesktop } from '../lib/useIsDesktop'

const keyOf = (i: QueryLogItem) => `${i.time}|${i.question.name}|${i.client}|${i.question.type}`

export default function QueryLog() {
  const pageIn = usePageInClass()
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const sheet = useSheet()
  const isDesktop = useIsDesktop()
  const nav = useNavigate()

  const [searchParams, setSearchParams] = useSearchParams()
  // ?q= pre-fills the search (entered from the client detail page's "view queries" jump)
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [debounced, setDebounced] = useState(() => searchParams.get('q') ?? '')
  const urlFilter = searchParams.get('filter') ?? 'all'
  const [filterKey, setFilterKey] = useState(LOG_FILTERS.some((f) => f.key === urlFilter) ? urlFilter : 'all')
  const [live, setLive] = useState(true)
  const [items, setItems] = useState<QueryLogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [olderLoading, setOlderLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  /**
   * Filter and search are page-local state: synced to the URL but with replace so they do
   * not push history (same convention as tab switching). Otherwise, returning from log
   * detail or a refresh rebuilds from the stale ?filter= of when the page was entered and
   * drags the filter back.
   */
  const syncUrl = useCallback(
    (next: { filter?: string; q?: string }) => {
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(next)) {
          if (v) p.set(k, v)
          else p.delete(k)
        }
        return p
      }, { replace: true })
    },
    [setSearchParams]
  )

  const pickFilter = (key: string) => {
    setFilterKey(key)
    syncUrl({ filter: key })
  }

  const reasons = LOG_FILTERS.find((f) => f.key === filterKey)?.reasons
  const basePath = '/querylog' + qs({
    limit: 100,
    search: debounced || undefined,
    reason: reasons,
  })

  // Fetch one page (first page or older)
  const fetchPage = useCallback(
    async (mode: 'reset' | 'older') => {
      if (!cfg) return
      mode === 'reset' ? setLoading(true) : setOlderLoading(true)
      try {
        let path = basePath
        if (mode === 'older') {
          const oldest = items[items.length - 1]?.time
          if (!oldest) return
          path = '/querylog' + qs({ limit: 100, older_than: oldest, search: debounced || undefined, reason: reasons })
        }
        const data = await api<{ data: QueryLogItem[] }>(cfg, path)
        const list = data?.data ?? []
        if (mode === 'reset') {
          setItems(list)
          setExhausted(list.length < 100)
        } else {
          setItems((cur) => {
            const seen = new Set(cur.map(keyOf))
            return [...cur, ...list.filter((x) => !seen.has(keyOf(x)))]
          })
          setExhausted(list.length < 100)
        }
      } catch (e: any) {
        toast(t('querylog.loadFailed', { msg: e.message }), 'err')
      } finally {
        setLoading(false)
        setOlderLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg, basePath, items.length ? items[items.length - 1]?.time : null, debounced, filterKey]
  )

  // Load on first mount / filter change
  useEffect(() => {
    setItems([])
    setExhausted(false)
    fetchPage('reset')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, filterKey])

  // Live mode: fetch the newest page every 2s and merge in new entries
  const liveRef = useRef(live)
  liveRef.current = live
  const fetchingRef = useRef(false)
  useEffect(() => {
    if (!cfg || !live) return
    const tick = async () => {
      if (fetchingRef.current) return
      fetchingRef.current = true
      try {
        const data = await api<{ data: QueryLogItem[] }>(cfg, '/querylog' + qs({ limit: 30, search: debounced || undefined, reason: reasons }))
        const fresh = data?.data ?? []
        if (!liveRef.current) return
        setItems((cur) => {
          const seen = new Set(cur.map(keyOf))
          const add = fresh.filter((x) => !seen.has(keyOf(x)))
          if (!add.length) return cur
          const merged = [...add, ...cur]
          return merged.length > 500 ? merged.slice(0, 500) : merged
        })
      } catch {
        /* Silent retry */
      } finally {
        fetchingRef.current = false
      }
    }
    const id = setInterval(tick, 2000)
    tick()
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, live, debounced, filterKey])

  const { data: filtering, mutate: mutateFiltering } = useSWR<FilteringStatus>(
    cfg ? ['filtering', cfg, '/filtering/status'] : null,
    swrFetcher
  )

  const openDetail = (item: QueryLogItem) => {
    if (isDesktop) {
      sheet.open(<LogDetail item={item} filtering={filtering} onSaveRule={saveRule} />)
    } else {
      nav('/logs/detail', { state: { item } })
    }
  }

  async function saveRule(rule: string, block: boolean) {
    if (!cfg || !filtering) return
    const rules = [...(filtering.user_rules ?? []), rule]
    try {
      await api(cfg, '/filtering/set_rules', { method: 'POST', body: { rules } })
      mutateFiltering()
      toast(block ? t('querylog.blockedToast', { domain: itemDomain(rule) }) : t('querylog.whitelistedToast'))
      sheet.close()
    } catch (e: any) {
      toast(t('querylog.ruleSaveFailed', { msg: e.message }), 'err')
    }
  }

  function itemDomain(rule: string) {
    return rule.replace(/^@@\|\|/, '').replace(/^\|\|/, '').replace(/\^$/, '')
  }

  return (
    <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[26px] font-bold tracking-tight text-t1">{t('querylog.title')}</h1>
        <button
          onClick={() => setLive((v) => !v)}
          className="press glass flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold"
          style={live ? { color: 'var(--accent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)' } : { color: 'var(--t2)' }}
        >
          {live ? (
            <>
              <span className="pulse-dot h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
              <Radar size={14} /> {t('querylog.live')}
            </>
          ) : (
            <>
              <Play size={14} /> {t('querylog.paused')}
            </>
          )}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="lg:w-96 lg:flex-none">
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); syncUrl({ q: v.trim() }) }}
            placeholder={t('querylog.searchPlaceholder')}
          />
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0 lg:pb-0">
          {LOG_FILTERS.map((f) => (
            <Chip key={f.key} active={filterKey === f.key} onClick={() => pickFilter(f.key)}>
              {t(f.labelKey)}
            </Chip>
          ))}
        </div>
      </div>

      <TabContent value={filterKey}>
        <div className="mt-2 flex flex-col gap-2">
        {loading && items.length === 0 && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {isDesktop ? (
          <LogTable items={items} onRow={openDetail} />
        ) : (
          items.map((item) => <LogRow key={keyOf(item)} item={item} onClick={() => openDetail(item)} />)
        )}

        {!loading && items.length === 0 && (
          <EmptyState icon={<Globe size={30} className="text-t3" />} title={t('querylog.emptyTitle')} subtitle={t('querylog.emptySub')} />
        )}

        {items.length > 0 && !exhausted && (
          <button
            onClick={() => fetchPage('older')}
            className="press glass flex items-center justify-center gap-2 rounded-2xl py-3 text-[13.5px] font-medium text-t2"
          >
            {olderLoading ? <Spinner size={16} /> : <ChevronDown size={16} />} {t('querylog.loadOlder')}
          </button>
        )}
        {items.length > 0 && exhausted && (
          <p className="py-3 text-center text-[12px] text-t3">{t('querylog.earliest')}</p>
        )}
        </div>
      </TabContent>
    </div>
  )
}

function LogRow({ item, onClick }: { item: QueryLogItem; onClick: () => void }) {
  const { t } = useTranslation()
  const meta = reasonMeta(item.reason, t)
  const cname = item.client_info?.name || item.client
  return (
    <Card onClick={onClick} className="!rounded-2xl px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <span
          className="h-8 w-1 flex-none rounded-full"
          style={{ background: meta.kind === 'blocked' ? 'var(--danger)' : meta.kind === 'rewrite' ? 'var(--violet)' : meta.kind === 'warn' ? 'var(--warn)' : 'var(--ok)' }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14.5px] font-medium text-t1">{item.question.name}</span>
            <span
              className="flex-none rounded-md px-1.5 py-0.5 text-[10px] font-bold"
              style={{ color: qtypeColor(item.question.type), background: 'var(--glass)' }}
            >
              {item.question.type}
            </span>
            {item.cached && (
              <span className="flex-none text-[10px] text-t3" title={t('querylog.cachedTitle')}>
                {t('querylog.cached')}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-t2">
            <span className="max-w-[45%] truncate">{cname}</span>
            <span className="num">{fmtTime(item.time)}</span>
            <span className="num text-t3">{fmtMs(Number(item.elapsedMs))}</span>
          </div>
        </div>
        <Badge kind={meta.kind}>{meta.label}</Badge>
      </div>
    </Card>
  )
}

const LOG_COLS = 'grid grid-cols-[88px_minmax(0,1fr)_180px_128px_72px] items-center gap-3'

function reasonDot(kind: string) {
  return kind === 'blocked' ? 'var(--danger)' : kind === 'rewrite' ? 'var(--violet)' : kind === 'warn' ? 'var(--warn)' : 'var(--ok)'
}

/** Desktop table view: high-density columns; clicking a row opens the same detail
 *  overlay */
function LogTable({ items, onRow }: { items: QueryLogItem[]; onRow: (i: QueryLogItem) => void }) {
  const { t } = useTranslation()
  return (
    <Card className="overflow-hidden !rounded-2xl">
      <div
        className={`${LOG_COLS} px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-t3`}
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <span>{t('querylog.colTime')}</span>
        <span>{t('querylog.colDomain')}</span>
        <span>{t('querylog.colClient')}</span>
        <span>{t('querylog.colResult')}</span>
        <span className="text-right">{t('querylog.colElapsed')}</span>
      </div>
      <div className="max-h-[calc(100dvh-330px)] overflow-y-auto">
        {items.map((item) => {
          const meta = reasonMeta(item.reason, t)
          const cname = item.client_info?.name || item.client
          return (
            <button
              key={keyOf(item)}
              onClick={() => onRow(item)}
              className={`${LOG_COLS} w-full px-4 py-2.5 text-left transition-colors hover:bg-white/[0.035]`}
              style={{ borderBottom: '1px solid var(--glass-border)' }}
            >
              <span className="num text-[12px] text-t3">{fmtTime(item.time)}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: reasonDot(meta.kind) }} />
                <span className="truncate text-[13.5px] text-t1">{item.question.name}</span>
                <span
                  className="flex-none rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ color: qtypeColor(item.question.type), background: 'var(--glass)' }}
                >
                  {item.question.type}
                </span>
                {item.cached && <span className="flex-none text-[10px] text-t3">{t('querylog.cached')}</span>}
              </span>
              <span className="truncate text-[12.5px] text-t2">{cname}</span>
              <span>
                <Badge kind={meta.kind}>{meta.label}</Badge>
              </span>
              <span className="text-right num text-[12px] text-t2">{fmtMs(Number(item.elapsedMs))}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
