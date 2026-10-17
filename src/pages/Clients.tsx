/** Client management: persistent client CRUD + auto-detected clients (tap into a detail view
 *  on both platforms, see components/ClientDetail); mobile cards/list with inline sort entry,
 *  desktop persistent/auto dual tables, sort + pagination on both; add/edit goes to a
 *  standalone subpage (mobile) or centered modal (desktop) */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import {
  Plus, Laptop, Smartphone, Globe, ShieldAlert, Baby,
  UserRound, ArrowDownUp, ChevronDown, ChevronUp, ArrowLeftRight,
} from 'lucide-react'
import { useAuth } from '../lib/session/auth'
import { api, swrFetcher, type ClientsData, type AghClient, type AutoClient, type Stats } from '../lib/api'
import { useIsDesktop } from '../lib/useIsDesktop'
import { ClientDetail, type ClientDetailData } from '../components/clients/ClientDetail'
import { ClientTable, IconB, type SortKey, type ClientRowModel } from '../components/clients/ClientTable'
import { ClientForm, emptyClient } from '../components/clients/ClientForm'
import { kvCount } from '../lib/stats'
import { fmtNum } from '../lib/format'
import { isAppleMobile } from '../lib/native/shell'
import { PageHeader, Screen, Card, Group, GroupTitle, Rows, Row, Switch, Button, HeaderAction } from '../components/ui/primitives'
import { useSheet, useConfirm } from '../components/ui/sheet'
import { runMutation } from '../lib/mutation'
import { Loading, EmptyState, SearchBar, Badge, SourceBadge, Pagination } from '../components/ui/atoms'
import { usePick, PickSelect } from '../components/ui/menu'
import { SyncForm } from '../components/protection/SyncForm'
import { syncClientsToInstances } from '../lib/session/rulesSync'


/* ---------- Sorting ---------- */

const SORT_OPTIONS = [
  { value: 'requests-desc', labelKey: 'clients.sortRequestsDesc' },
  { value: 'requests-asc', labelKey: 'clients.sortRequestsAsc' },
  { value: 'name-asc', labelKey: 'clients.sortNameAsc' },
  { value: 'name-desc', labelKey: 'clients.sortNameDesc' },
  { value: 'source-asc', labelKey: 'clients.sortSourceAsc' },
] as const

function sortRows(rows: ClientRowModel[], sortKey: SortKey, sortAsc: boolean): ClientRowModel[] {
  const dir = sortAsc ? 1 : -1
  return [...rows].sort((a, b) => {
    if (sortKey === 'requests') return ((a.requests ?? -1) - (b.requests ?? -1)) * dir
    if (sortKey === 'source') return (a.source ?? '').localeCompare(b.source ?? '') * dir
    return a.name.localeCompare(b.name, 'zh-Hans-CN') * dir
  })
}

const whoisLine = (w: Record<string, string> | undefined) =>
  [w?.country, w?.orgname].filter(Boolean).join(' ')

export default function Clients() {
  const { cfg, instances } = useAuth()
  const { t } = useTranslation()
  const sheet = useSheet()
  const confirm = useConfirm()
  const isDesktop = useIsDesktop()
  const nav = useNavigate()
  const pick = usePick()
  const [search, setSearch] = useState('')

  // Sorting and pagination (sort shared by both; desktop persistent/auto tables paginate
  // separately)
  const [sortKey, setSortKey] = useState<SortKey>('requests')
  const [sortAsc, setSortAsc] = useState(false)
  const [pageSize, setPageSize] = useState(20)
  const [pageAuto, setPageAuto] = useState(1)
  const [pagePersist, setPagePersist] = useState(1)

  const { data, mutate, isLoading } = useSWR<ClientsData>(cfg ? ['clients', cfg, '/clients'] : null, swrFetcher, {
    refreshInterval: 30000,
  })
  // Shares the SWR cache with ClientDetail via the same key; uses top_clients to compute
  // each client's request count
  const { data: stats } = useSWR<Stats>(cfg ? ['stats', cfg, '/stats'] : null, swrFetcher, {
    refreshInterval: 30000,
  })

  const clients = data?.clients ?? []
  const autos = data?.auto_clients ?? []

  const persistMatch = useMemo(() => {
    const map = new Map<string, AghClient>()
    for (const c of clients) for (const id of c.ids ?? []) map.set(id, c)
    return map
  }, [clients])

  const autoByIp = useMemo(() => new Map(autos.map((a) => [a.ip, a])), [autos])

  // Public-IP WHOIS info is attached to auto-detected clients; persistent client details
  // borrow it to fill in too
  const whoisMatch = useMemo(() => {
    const map = new Map<string, Record<string, string>>()
    for (const a of autos) if (a.whois_info && Object.keys(a.whois_info).length) map.set(a.ip, a.whois_info)
    return map
  }, [autos])

  /** Merged view: persistent clients (carrying source/WHOIS from same-IP auto-detected
   *  entries) + unconfigured auto-detected clients */
  const rows = useMemo<ClientRowModel[]>(() => {
    const list: ClientRowModel[] = []
    for (const c of clients) {
      const ids = c.ids ?? []
      const ip = ids[0]
      const auto = ip ? autoByIp.get(ip) : undefined
      const w = ids.map((id) => whoisMatch.get(id)).find(Boolean) ?? auto?.whois_info
      list.push({
        key: 'p:' + c.name,
        name: c.name,
        ip,
        ids,
        source: auto?.source,
        whois: w,
        whoisText: whoisLine(w),
        requests: kvCount(stats?.top_clients, [c.name, ip, ...ids]),
        persistent: c,
      })
    }
    for (const a of autos) {
      if (persistMatch.has(a.ip)) continue
      list.push({
        key: 'a:' + a.ip,
        name: a.name || a.ip,
        ip: a.ip,
        ids: [a.ip],
        source: a.source || undefined,
        whois: a.whois_info,
        whoisText: whoisLine(a.whois_info),
        requests: kvCount(stats?.top_clients, [a.name, a.ip]),
      })
    }
    return list
  }, [clients, autos, persistMatch, autoByIp, whoisMatch, stats])

  /** Detail on both platforms: desktop opens a centered modal, mobile goes to a standalone
   *  subpage (same pattern as log detail) */
  function openDetail(d: ClientDetailData) {
    if (isDesktop) {
      sheet.open(
        <ClientDetail
          data={d}
          onOpenLog={(k) => { sheet.close(); nav('/logs?q=' + encodeURIComponent(k)) }}
          onDelete={d.persistent ? () => {
            confirm({ title: t('clients.deleteConfirmTitle', { name: d.persistent!.name }), destructive: true, confirmText: t('common.delete'), onConfirm: async () => { await remove(d.persistent!); sheet.close() } })
          } : undefined}
          onAdd={d.persistent ? undefined : () => openForm(null, d.ip)}
        />
      )
    } else {
      nav('/clients/detail', { state: { data: d } })
    }
  }

  const detailOfRow = (r: ClientRowModel): ClientDetailData => ({
    ip: r.ip,
    name: r.name === r.ip ? undefined : r.name,
    source: r.source,
    whois: r.whois,
    persistent: r.persistent,
  })

  /** Add/edit: desktop centered modal; mobile goes to a standalone subpage (not the
   *  slide-up sheet) */
  function openForm(existing: AghClient | null, prefillIp?: string) {
    const c = existing ?? { ...emptyClient(), ids: prefillIp ? [prefillIp] : [] }
    if (isDesktop) {
      sheet.open(<ClientForm initial={c} isNew={!existing} onClose={sheet.close} onSaved={() => { sheet.close(); mutate() }} />)
    } else {
      nav('/clients/form', { state: { initial: c, isNew: !existing } })
    }
  }

  async function remove(c: AghClient) {
    if (!cfg) return
    await runMutation({
      action: () => api(cfg, '/clients/delete', { method: 'POST', body: { name: c.name } }),
      invalidate: mutate,
      okKey: 'clients.deleted',
      failKey: 'common.deleteFailed',
    })
  }

  const s = search.trim().toLowerCase()
  const filteredRows = useMemo(
    () => (s ? rows.filter((r) => r.name.toLowerCase().includes(s) || r.ids.some((i) => i.toLowerCase().includes(s))) : rows),
    [rows, s]
  )

  const persistentRows = useMemo(() => filteredRows.filter((r) => r.persistent), [filteredRows])
  const sortedAutos = useMemo(() => sortRows(filteredRows.filter((r) => !r.persistent), sortKey, sortAsc), [filteredRows, sortKey, sortAsc])
  const sortedPersist = useMemo(() => sortRows(persistentRows, sortKey, sortAsc), [persistentRows, sortKey, sortAsc])

  // Mobile: persistent cards (API order) + auto-detected list (sorted + paginated)
  const autoPages = Math.max(1, Math.ceil(sortedAutos.length / pageSize))
  const mobileAutoPage = Math.min(pageAuto, autoPages)
  const pagedAutos = sortedAutos.slice((mobileAutoPage - 1) * pageSize, mobileAutoPage * pageSize)

  // Desktop: two tables (shared sorting, independent pagination)
  const persistPages = Math.max(1, Math.ceil(sortedPersist.length / pageSize))
  const deskPersistPage = Math.min(pagePersist, persistPages)
  const pagedPersist = sortedPersist.slice((deskPersistPage - 1) * pageSize, deskPersistPage * pageSize)
  const deskAutoPage = Math.min(pageAuto, autoPages)
  const pagedDeskAutos = sortedAutos.slice((deskAutoPage - 1) * pageSize, deskAutoPage * pageSize)

  useEffect(() => { setPageAuto(1); setPagePersist(1) }, [search, sortKey, sortAsc, pageSize])

  const sortValue = `${sortKey}-${sortAsc ? 'asc' : 'desc'}`
  const sortOpt = SORT_OPTIONS.find((o) => o.value === sortValue)
  const sortLabel = sortOpt ? t(sortOpt.labelKey) : ''
  const sortOpts = SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))

  function applySort(v: string) {
    const [k, d] = v.split('-')
    setSortKey(k as SortKey)
    setSortAsc(d === 'asc')
  }

  function pickSort(e: any) {
    pick({
      options: sortOpts,
      value: sortValue,
      title: t('clients.sortTitle'),
      anchor: e.currentTarget,
      onPick: applySort,
    })
  }

  const sortButton = isAppleMobile() ? (
    <span
      className="press glass relative flex flex-none items-center justify-center gap-1 self-stretch rounded-full px-3 text-t2 lg:hidden"
      title={t('clients.sortPrefix', { mode: sortLabel })}
    >
      <ArrowDownUp size={15} className="pointer-events-none" />
      <ChevronDown size={13} className="pointer-events-none" />
      <PickSelect
        ariaLabel={t('clients.sortTitle')}
        className="absolute inset-0 h-full w-full cursor-pointer bg-transparent text-transparent"
        value={sortValue}
        options={sortOpts}
        onPick={applySort}
      />
    </span>
  ) : (
    <button
      onClick={pickSort}
      className="press glass flex flex-none items-center gap-1 self-stretch rounded-full px-3 text-t2 lg:hidden"
      aria-label={t('clients.sortTitle')}
      title={t('clients.sortPrefix', { mode: sortLabel })}
    >
      <ArrowDownUp size={15} />
      <ChevronDown size={13} />
    </button>
  )

  function onSort(k: SortKey) {
    if (k === sortKey) {
      setSortAsc((v) => !v)
    } else {
      setSortKey(k)
      setSortAsc(k !== 'requests')
    }
  }

  return (
    <Screen>
      <PageHeader
        back
        title={t('clients.title')}
        subtitle={t('clients.countSub', { p: clients.length, a: autos.length })}
        right={
          <div className="flex items-center gap-1.5">
            {instances.length > 1 && (
              <HeaderAction
                onClick={() => {
                  if (!isDesktop) {
                    nav('/sync/clients')
                    return
                  }
                  sheet.open(
                    <SyncForm
                      itemCount={clients.length}
                      itemTypeLabel={t('clients.title')}
                      onSync={(targets) => syncClientsToInstances(targets, clients)}
                      onClose={() => sheet.close()}
                    />,
                    { title: t('filters.syncModalTitle') }
                  )
                }}
                label={t('filters.syncAction')}
                className="w-11 text-t2 hover:text-accent lg:w-10"
              >
                <ArrowLeftRight size={17} />
              </HeaderAction>
            )}
            <HeaderAction
              onClick={() => openForm(null)}
              label={t('clients.add')}
              className="w-11 text-accent lg:w-10"
              native={{ sfSymbol: 'plus', foreground: 'accent', iconOnly: true }}
            >
              <Plus size={19} />
            </HeaderAction>
          </div>
        }
      />

      <div className="flex items-center gap-2">
        <SearchBar value={search} onChange={setSearch} placeholder={t('clients.searchPlaceholder')} className="min-w-0 flex-1" />
        {sortButton}
      </div>

      {isLoading && <Loading />}

      {isDesktop ? (
        <>
          {sortedPersist.length > 0 && (
            <>
              <GroupTitle className="mt-1">{t('clients.persistent')}</GroupTitle>
              <ClientTable
                rows={pagedPersist}
                sortKey={sortKey}
                sortAsc={sortAsc}
                onSort={onSort}
                onRow={(r) => openDetail(detailOfRow(r))}
              />
              <Pagination
                page={deskPersistPage}
                pages={persistPages}
                onChange={setPagePersist}
                total={sortedPersist.length}
                pageSize={pageSize}
                onPageSize={setPageSize}
              />
            </>
          )}
          {sortedAutos.length > 0 && (
            <>
              <GroupTitle className="mt-1">{t('clients.auto')}</GroupTitle>
              <ClientTable
                rows={pagedDeskAutos}
                sortKey={sortKey}
                sortAsc={sortAsc}
                onSort={onSort}
                onRow={(r) => openDetail(detailOfRow(r))}
              />
              <Pagination
                page={deskAutoPage}
                pages={autoPages}
                onChange={setPageAuto}
                total={sortedAutos.length}
                pageSize={pageSize}
                onPageSize={setPageSize}
              />
            </>
          )}
        </>
      ) : (
        <>
          {persistentRows.length > 0 && (
            <>
              <GroupTitle>{t('clients.persistent')}</GroupTitle>
              <div className="grid gap-2.5">
                {persistentRows.map((r) => {
                  const c = r.persistent!
                  return (
                    <Card key={r.key} onClick={() => openDetail(detailOfRow(r))} className="!rounded-2xl px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                          {/phone|mobile|iphone|android|pad/i.test(r.name) ? <Smartphone size={18} /> : <Laptop size={18} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-semibold text-t1">{r.name}</span>
                            {c.use_global_settings ? <Badge kind="info">{t('clients.globalBadge')}</Badge> : <Badge kind="rewrite">{t('clients.independentBadge')}</Badge>}
                          </div>
                          <p className="mt-0.5 truncate text-[12px] text-t2 num">{r.ids.join(' · ')}</p>
                        </div>
                        <div className="flex flex-none flex-col items-end gap-1">
                          {r.source && <SourceBadge source={r.source} />}
                          <span
                            className="num rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ background: 'var(--glass)', color: 'var(--t2)' }}
                          >
                            {r.requests != null ? t('clients.times', { n: fmtNum(r.requests) }) : '–'}
                          </span>
                        </div>
                      </div>
                      {!c.use_global_settings && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {c.filtering_enabled && <Badge kind="info">{t('clients.filterBadge')}</Badge>}
                          {c.safebrowsing_enabled && <Badge kind="warn">{t('clients.safeBrowsingBadge')}</Badge>}
                          {c.parental_enabled && <Badge kind="rewrite">{t('clients.parentalBadge')}</Badge>}
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            </>
          )}

          {sortedAutos.length > 0 && (
            <>
              <GroupTitle>{t('clients.auto')}</GroupTitle>
              <Group>
                <Rows>
                  {pagedAutos.map((r) => (
                    <Row
                      key={r.key}
                      icon={<IconB><UserRound size={16} /></IconB>}
                      title={r.name}
                      subtitle={(
                        <>
                          {r.name !== r.ip && <span className="num block truncate">{r.ip}</span>}
                          {r.whoisText && <span className="block truncate">{r.whoisText}</span>}
                        </>
                      )}
                      onClick={() => openDetail(detailOfRow(r))}
                      right={
                        <div className="flex flex-none flex-col items-end gap-1">
                          {r.source && <SourceBadge source={r.source} />}
                          <span
                            className="num rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ background: 'var(--glass)', color: 'var(--t2)' }}
                          >
                            {r.requests != null ? t('clients.times', { n: fmtNum(r.requests) }) : '–'}
                          </span>
                        </div>
                      }
                    />
                  ))}
                </Rows>
              </Group>
              <Pagination page={mobileAutoPage} pages={autoPages} onChange={setPageAuto} total={sortedAutos.length} />
            </>
          )}
        </>
      )}

      {!isLoading && !filteredRows.length && (
        <EmptyState icon={<Laptop size={30} className="text-t3" />} title={t('clients.noClientsTitle')} subtitle={t('clients.noClientsSub')} />
      )}
    </Screen>
  )
}
