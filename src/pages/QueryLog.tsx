/** Query log: live streaming, filters, search, multi-instance aggregation, analytics */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import {
  Radar,
  Play,
  ChevronDown,
  Globe,
  Activity,
  Server,
} from 'lucide-react'
import { useAuth } from '../lib/session/auth'
import { api, qs, swrFetcher, type QueryLogItem, type FilteringStatus } from '../lib/api'
import { usePageInClass, TabContent } from '../components/ui/primitives'
import { SearchBar, Chip, EmptyState, Spinner } from '../components/ui/atoms'
import { useSheet } from '../components/ui/sheet'
import { toast } from '../components/ui/toast'
import { LogDetail } from '../components/log/LogDetail'
import { LogRow, keyOf } from '../components/log/LogRow'
import { LogTable } from '../components/log/LogTable'
import { LOG_FILTERS } from '../lib/constants'
import { useIsDesktop } from '../lib/useIsDesktop'
import { runMutation } from '../lib/mutation'
import { activeEndpoint } from '../lib/session/instances'
import {
  mergeQueryLogLists,
  keyOfAggregated,
  type AggregatedQueryLogItem,
} from '../lib/log/analytics'
import { QueryLogAnalyticsSheet } from '../components/log/QueryLogAnalyticsSheet'
import { consumeLogDrill, peekLogDrill } from '../lib/log/drillIntent'

export default function QueryLog() {
  const pageIn = usePageInClass()
  const { cfg, instances, store } = useAuth()
  const { t } = useTranslation()
  const sheet = useSheet()
  const isDesktop = useIsDesktop()
  const nav = useNavigate()

  const [searchParams, setSearchParams] = useSearchParams()
  // Drill handoff from the mobile analytics sub-page: read during render so the
  // initializers below already start from the drilled value, then cleared after
  // commit (the URL catch-up runs in the effect under syncUrl)
  const drill = peekLogDrill()
  // ?q= pre-fills the search (entered from the client detail page's "view
  // queries" jump or from an analytics drill-down)
  const initialQ = drill?.q ?? searchParams.get('q') ?? ''
  const [search, setSearch] = useState(initialQ)
  const [debounced, setDebounced] = useState(initialQ)
  const urlFilter = drill?.filter ?? searchParams.get('filter') ?? 'all'
  const [filterKey, setFilterKey] = useState(LOG_FILTERS.some((f) => f.key === urlFilter) ? urlFilter : 'all')
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('current')
  const [live, setLive] = useState(true)
  const [items, setItems] = useState<AggregatedQueryLogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [olderLoading, setOlderLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 350)
    return () => clearTimeout(timer)
  }, [search])

  /**
   * Filter and search are page-local state: synced to the URL but with replace so they do
   * not push history.
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

  // Consume the drill handoff: the state above already started from it, only the
  // URL has to catch up (replace, no history entry) — same net effect as the
  // desktop sheet's in-place drill
  useEffect(() => {
    if (!drill) return
    consumeLogDrill()
    const next: { filter?: string; q?: string } = {}
    if (drill.q !== undefined) next.q = drill.q
    if (drill.filter !== undefined) next.filter = drill.filter
    syncUrl(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reasons = LOG_FILTERS.find((f) => f.key === filterKey)?.reasons

  // Target config(s) resolution
  const targetEndpoints = useMemo(() => {
    if (selectedInstanceId === 'all') {
      return instances
        .filter((iv) => iv.online !== 'down')
        .map((iv) => {
          const inst = store?.instances.find((x) => x.id === iv.id)
          const ep = inst ? activeEndpoint(inst) : null
          return ep ? { id: iv.id, label: iv.label, cfg: ep } : null
        })
        .filter((x): x is { id: string; label: string; cfg: NonNullable<ReturnType<typeof activeEndpoint>> } => x !== null)
    }

    if (selectedInstanceId !== 'current') {
      const inst = store?.instances.find((x) => x.id === selectedInstanceId)
      const ep = inst ? activeEndpoint(inst) : null
      const iv = instances.find((x) => x.id === selectedInstanceId)
      if (ep && iv) {
        return [{ id: iv.id, label: iv.label, cfg: ep }]
      }
    }

    return cfg ? [{ id: 'current', label: instances.find((x) => x.id === store?.activeId)?.label || '', cfg }] : []
  }, [selectedInstanceId, instances, store, cfg])

  // Fetch one page (first page or older)
  const fetchPage = useCallback(
    async (mode: 'reset' | 'older') => {
      if (!targetEndpoints.length) return
      mode === 'reset' ? setLoading(true) : setOlderLoading(true)

      try {
        if (selectedInstanceId === 'all') {
          // Multi-instance aggregation mode
          const oldest = mode === 'older' ? items[items.length - 1]?.time : undefined
          if (mode === 'older' && !oldest) return

          const results = await Promise.allSettled(
            targetEndpoints.map(async (target) => {
              const path = '/querylog' + qs({
                limit: 80,
                older_than: oldest,
                search: debounced || undefined,
                reason: reasons,
              })
              const data = await api<{ data: QueryLogItem[] }>(target.cfg, path)
              return {
                instanceId: target.id,
                instanceLabel: target.label,
                items: data?.data ?? [],
              }
            })
          )

          if (results.length > 0 && results.every((r) => r.status === 'rejected')) {
            toast(t('querylog.loadFailed', { msg: 'All instances unreachable' }), 'err')
          }

          const lists = results
            .filter((r): r is PromiseFulfilledResult<{ instanceId: string; instanceLabel: string; items: QueryLogItem[] }> => r.status === 'fulfilled')
            .map((r) => r.value)

          const merged = mergeQueryLogLists(lists, 500)
          if (mode === 'reset') {
            setItems(merged)
            setExhausted(merged.length === 0)
          } else {
            let addedCount = 0
            setItems((cur) => {
              const seen = new Set(cur.map(keyOfAggregated))
              const add = merged.filter((x) => !seen.has(keyOfAggregated(x)))
              addedCount = add.length
              return [...cur, ...add]
            })
            setExhausted(addedCount === 0 || merged.length === 0)
          }
        } else {
          // Single instance mode
          const single = targetEndpoints[0]
          let path = '/querylog' + qs({ limit: 100, search: debounced || undefined, reason: reasons })
          if (mode === 'older') {
            const oldest = items[items.length - 1]?.time
            if (!oldest) return
            path = '/querylog' + qs({ limit: 100, older_than: oldest, search: debounced || undefined, reason: reasons })
          }

          const data = await api<{ data: QueryLogItem[] }>(single.cfg, path)
          const list: AggregatedQueryLogItem[] = (data?.data ?? []).map((i) => ({
            ...i,
            _instanceId: single.id !== 'current' ? single.id : undefined,
            _instanceLabel: single.label,
          }))

          if (mode === 'reset') {
            setItems(list)
            setExhausted(list.length < 100)
          } else {
            setItems((cur) => {
              const seen = new Set(cur.map(keyOfAggregated))
              return [...cur, ...list.filter((x) => !seen.has(keyOfAggregated(x)))]
            })
            setExhausted(list.length < 100)
          }
        }
      } catch (e: any) {
        toast(t('querylog.loadFailed', { msg: e.message }), 'err')
      } finally {
        setLoading(false)
        setOlderLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetEndpoints, selectedInstanceId, items.length ? items[items.length - 1]?.time : null, debounced, filterKey]
  )

  // Load on first mount / filter / target instance change
  useEffect(() => {
    setItems([])
    setExhausted(false)
    fetchPage('reset')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, filterKey, selectedInstanceId])

  // Live mode: fetch the newest page every 2s and merge in new entries
  const liveRef = useRef(live)
  liveRef.current = live
  const fetchingRef = useRef(false)
  useEffect(() => {
    if (!targetEndpoints.length || !live) return

    const tick = async () => {
      if (fetchingRef.current) return
      fetchingRef.current = true

      try {
        if (selectedInstanceId === 'all') {
          const results = await Promise.allSettled(
            targetEndpoints.map(async (target) => {
              const data = await api<{ data: QueryLogItem[] }>(
                target.cfg,
                '/querylog' + qs({ limit: 20, search: debounced || undefined, reason: reasons })
              )
              return {
                instanceId: target.id,
                instanceLabel: target.label,
                items: data?.data ?? [],
              }
            })
          )

          const lists = results
            .filter((r): r is PromiseFulfilledResult<{ instanceId: string; instanceLabel: string; items: QueryLogItem[] }> => r.status === 'fulfilled')
            .map((r) => r.value)

          const fresh = mergeQueryLogLists(lists, 100)
          if (!liveRef.current) return
          setItems((cur) => {
            const seen = new Set(cur.map(keyOfAggregated))
            const add = fresh.filter((x) => !seen.has(keyOfAggregated(x)))
            if (!add.length) return cur
            const merged = [...add, ...cur]
            return merged.length > 500 ? merged.slice(0, 500) : merged
          })
        } else {
          const single = targetEndpoints[0]
          const data = await api<{ data: QueryLogItem[] }>(
            single.cfg,
            '/querylog' + qs({ limit: 30, search: debounced || undefined, reason: reasons })
          )
          const fresh: AggregatedQueryLogItem[] = (data?.data ?? []).map((i) => ({
            ...i,
            _instanceId: single.id !== 'current' ? single.id : undefined,
            _instanceLabel: single.label,
          }))

          if (!liveRef.current) return
          setItems((cur) => {
            const seen = new Set(cur.map(keyOfAggregated))
            const add = fresh.filter((x) => !seen.has(keyOfAggregated(x)))
            if (!add.length) return cur
            const merged = [...add, ...cur]
            return merged.length > 500 ? merged.slice(0, 500) : merged
          })
        }
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
  }, [targetEndpoints, selectedInstanceId, live, debounced, filterKey])

  const activeFilteringCfg = targetEndpoints[0]?.cfg ?? cfg
  const { data: filtering, mutate: mutateFiltering } = useSWR<FilteringStatus>(
    activeFilteringCfg ? ['filtering', activeFilteringCfg, '/filtering/status'] : null,
    swrFetcher
  )

  const openDetail = (item: AggregatedQueryLogItem) => {
    if (isDesktop) {
      sheet.open(<LogDetail item={item} filtering={filtering} onSaveRule={saveRule} />)
    } else {
      nav('/logs/detail', { state: { item } })
    }
  }

  /** Drill-down: apply the metric to the log's own search / filter, syncing the
   *  URL. On mobile the analytics view is a sub-page, so its drill arrives as a
   *  handoff consumed below instead of a callback */
  const applyDrill = (type: 'domain' | 'client' | 'filter', value: string) => {
    if (type === 'domain' || type === 'client') {
      setSearch(value)
      setDebounced(value.trim())
      syncUrl({ q: value })
    } else {
      setFilterKey(value)
      syncUrl({ filter: value })
    }
  }

  const openAnalytics = () => {
    if (isDesktop) {
      sheet.open(
        <QueryLogAnalyticsSheet items={items} onDrillDown={applyDrill} onClose={() => sheet.close()} />
      )
    } else {
      nav('/logs/analytics', { state: { items } })
    }
  }

  async function saveRule(rule: string, block: boolean) {
    if (!activeFilteringCfg || !filtering) return
    const rules = [...(filtering.user_rules ?? []), rule]
    const ok = await runMutation({
      action: () => api(activeFilteringCfg, '/filtering/set_rules', { method: 'POST', body: { rules } }),
      invalidate: mutateFiltering,
      okKey: block ? 'querylog.blockedToast' : 'querylog.whitelistedToast',
      okVars: block ? () => ({ domain: itemDomain(rule) }) : undefined,
      failKey: 'querylog.ruleSaveFailed',
    })
    if (ok) sheet.close()
  }

  function itemDomain(rule: string) {
    return rule.replace(/^@@\|\|/, '').replace(/^\|\|/, '').replace(/\^$/, '')
  }

  return (
    <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[26px] font-bold tracking-tight text-t1">{t('querylog.title')}</h1>
        <div className="flex items-center gap-2">
          {/* Analytics Sheet Trigger */}
          <button
            onClick={openAnalytics}
            disabled={items.length === 0}
            className="press glass flex items-center gap-1.5 rounded-full px-3 py-2 text-[12.5px] font-semibold text-t2 transition-opacity disabled:opacity-40"
            title={t('querylog.analyticsTitle')}
          >
            <Activity size={14} style={{ color: 'var(--accent)' }} />
            <span>{t('querylog.analytics')}</span>
          </button>

          {/* Live / Paused Button */}
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
      </div>

      {/* Multi-instance switcher if more than 1 instance */}
      {instances.length > 1 && (
        <div className="mb-3 flex items-center gap-2 overflow-x-auto text-[12px]">
          <span className="flex items-center gap-1 font-semibold text-t3">
            <Server size={13} /> {t('querylog.instanceFilter')}:
          </span>
          <button
            onClick={() => setSelectedInstanceId('current')}
            className={`press rounded-lg px-2.5 py-1 font-medium transition-all ${
              selectedInstanceId === 'current'
                ? 'bg-white/15 text-t1 shadow-sm'
                : 'glass text-t3 hover:text-t2'
            }`}
          >
            {instances.find((i) => i.id === store?.activeId)?.label || t('querylog.node')}
          </button>
          <button
            onClick={() => setSelectedInstanceId('all')}
            className={`press rounded-lg px-2.5 py-1 font-medium transition-all ${
              selectedInstanceId === 'all'
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'glass text-t3 hover:text-t2'
            }`}
          >
            {t('querylog.allInstances')}
          </button>
          {instances
            .filter((i) => i.id !== store?.activeId)
            .map((i) => (
              <button
                key={i.id}
                onClick={() => setSelectedInstanceId(i.id)}
                className={`press rounded-lg px-2.5 py-1 font-medium transition-all ${
                  selectedInstanceId === i.id
                    ? 'bg-white/15 text-t1 shadow-sm'
                    : 'glass text-t3 hover:text-t2'
                }`}
              >
                {i.label}
              </button>
            ))}
        </div>
      )}

      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
