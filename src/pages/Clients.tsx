/** 客户端管理:持久客户端 CRUD + 自动识别客户端(点入双端详情,见 components/ClientDetail);
 *  移动端卡片/列表 + 同行排序入口,桌面端持久/自动识别双表格,双端排序分页,添加/编辑走独立子页(移动)或居中弹窗(桌面) */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import {
  Plus, Laptop, Smartphone, Globe, ShieldAlert, Baby,
  UserRound, ArrowDownUp, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { api, swrFetcher, type ClientsData, type AghClient, type AutoClient, type Stats } from '../lib/api'
import { useIsDesktop } from '../lib/useIsDesktop'
import { ClientDetail, kvCount, type ClientDetailData } from '../components/ClientDetail'
import { fmtNum } from '../lib/format'
import { isAppleMobile } from '../lib/nativePickers'
import {
  PageHeader, Screen, Card, Group, GroupTitle, Rows, Row, Switch, Button, HeaderAction,
  Loading, EmptyState, useSheet, useConfirm, toast, SearchBar, Badge,
  SourceBadge, Pagination, usePick, PickSelect,
} from '../components/ui'


export const emptyClient = (): Partial<AghClient> => ({
  name: '',
  ids: [],
  use_global_settings: true,
  filtering_enabled: true,
  safebrowsing_enabled: false,
  parental_enabled: false,
  use_global_blocked_services: true,
  blocked_services: [],
  tags: [],
  ignore_querylog: false,
  ignore_statistics: false,
})

/* ---------- 排序 ---------- */

type SortKey = 'requests' | 'name' | 'source'
const SORT_OPTIONS = [
  { value: 'requests-desc', labelKey: 'clients.sortRequestsDesc' },
  { value: 'requests-asc', labelKey: 'clients.sortRequestsAsc' },
  { value: 'name-asc', labelKey: 'clients.sortNameAsc' },
  { value: 'name-desc', labelKey: 'clients.sortNameDesc' },
  { value: 'source-asc', labelKey: 'clients.sortSourceAsc' },
] as const

/** 双端共用的行模型:持久客户端与自动识别客户端合并后的展示视图 */
interface ClientRowModel {
  key: string
  name: string
  ip?: string
  ids: string[]
  source?: string
  whois?: Record<string, string>
  /** 国家 + 运营商,官方同款 "CN CHINANET-GD" */
  whoisText?: string
  /** 统计周期内请求次数(来自 /stats top_clients) */
  requests?: number
  persistent?: AghClient
}

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
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const sheet = useSheet()
  const confirm = useConfirm()
  const isDesktop = useIsDesktop()
  const nav = useNavigate()
  const pick = usePick()
  const [search, setSearch] = useState('')

  // 排序与分页(双端共用排序;桌面持久/自动识别两张表各自分页)
  const [sortKey, setSortKey] = useState<SortKey>('requests')
  const [sortAsc, setSortAsc] = useState(false)
  const [pageSize, setPageSize] = useState(20)
  const [pageAuto, setPageAuto] = useState(1)
  const [pagePersist, setPagePersist] = useState(1)

  const { data, mutate, isLoading } = useSWR<ClientsData>(cfg ? ['clients', cfg, '/clients'] : null, swrFetcher, {
    refreshInterval: 30000,
  })
  // 与 ClientDetail 同 key 共享缓存,取 top_clients 计算每个客户端的请求次数
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

  // 公网 IP 的 WHOIS 信息挂在自动识别客户端上,持久客户端详情也借此补全
  const whoisMatch = useMemo(() => {
    const map = new Map<string, Record<string, string>>()
    for (const a of autos) if (a.whois_info && Object.keys(a.whois_info).length) map.set(a.ip, a.whois_info)
    return map
  }, [autos])

  /** 合并视图:持久客户端(带出同 IP 自动识别的源/WHOIS)+ 未配置的自动识别客户端 */
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

  /** 双端详情:桌面弹居中弹窗,移动端进独立子页(同日志详情模式) */
  function openDetail(d: ClientDetailData) {
    if (isDesktop) {
      sheet.open(
        <ClientDetail
          data={d}
          onOpenLog={(k) => { sheet.close(); nav('/log?q=' + encodeURIComponent(k)) }}
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

  /** 添加/编辑:桌面居中弹窗;移动端进独立子页(不再用上滑组件) */
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
    try {
      await api(cfg, '/clients/delete', { method: 'POST', body: { name: c.name } })
      mutate()
      toast(t('clients.deleted'))
    } catch (e: any) {
      toast(t('common.deleteFailed', { msg: e.message }), 'err')
    }
  }

  const s = search.trim().toLowerCase()
  const filteredRows = useMemo(
    () => (s ? rows.filter((r) => r.name.toLowerCase().includes(s) || r.ids.some((i) => i.toLowerCase().includes(s))) : rows),
    [rows, s]
  )

  const persistentRows = useMemo(() => filteredRows.filter((r) => r.persistent), [filteredRows])
  const sortedAutos = useMemo(() => sortRows(filteredRows.filter((r) => !r.persistent), sortKey, sortAsc), [filteredRows, sortKey, sortAsc])
  const sortedPersist = useMemo(() => sortRows(persistentRows, sortKey, sortAsc), [persistentRows, sortKey, sortAsc])

  // 移动端:持久卡片(API 顺序)+ 自动识别列表(排序 + 分页)
  const autoPages = Math.max(1, Math.ceil(sortedAutos.length / pageSize))
  const mobileAutoPage = Math.min(pageAuto, autoPages)
  const pagedAutos = sortedAutos.slice((mobileAutoPage - 1) * pageSize, mobileAutoPage * pageSize)

  // 桌面端:两张表(排序共用,分页各自独立)
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
          <HeaderAction
            onClick={() => openForm(null)}
            label={t('clients.add')}
            className="w-11 text-accent lg:w-10"
            native={{ sfSymbol: 'plus', foreground: 'accent', iconOnly: true }}
          >
            <Plus size={19} />
          </HeaderAction>
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

function IconB({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-[11px]" style={{ background: 'var(--glass)', color: 'var(--t2)' }}>
      {children}
    </div>
  )
}

/* ---------- 桌面端表格视图 ---------- */

const TBL_COLS = 'grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_104px_minmax(0,1.1fr)_88px_92px] items-center gap-3'

function SortTh({ label, k, sortKey, sortAsc, onSort, align }: {
  label: string; k: SortKey; sortKey: SortKey; sortAsc: boolean; onSort: (k: SortKey) => void; align?: 'right'
}) {
  const active = sortKey === k
  return (
    <button
      onClick={() => onSort(k)}
      className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''} ${active ? 'text-accent' : 'hover:text-t1'}`}
    >
      {label}
      {active && (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  )
}

/** 桌面端客户端表:点击行开详情弹窗;客户端/源/请求数可排序 */
function ClientTable({ rows, sortKey, sortAsc, onSort, onRow }: {
  rows: ClientRowModel[]
  sortKey: SortKey
  sortAsc: boolean
  onSort: (k: SortKey) => void
  onRow: (r: ClientRowModel) => void
}) {
  const { t } = useTranslation()
  return (
    <Card className="overflow-hidden !rounded-2xl">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 880 }}>
          <div
            className={`${TBL_COLS} px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-t3`}
            style={{ borderBottom: '1px solid var(--glass-border)' }}
          >
            <SortTh label={t('clients.colName')} k="name" sortKey={sortKey} sortAsc={sortAsc} onSort={onSort} />
            <span>{t('clients.colIds')}</span>
            <SortTh label={t('clients.colSource')} k="source" sortKey={sortKey} sortAsc={sortAsc} onSort={onSort} />
            <span>WHOIS</span>
            <SortTh label={t('clients.colRequests')} k="requests" sortKey={sortKey} sortAsc={sortAsc} onSort={onSort} align="right" />
            <span className="flex justify-end">{t('clients.colStatus')}</span>
          </div>
          {rows.map((r) => (
            <button
              key={r.key}
              onClick={() => onRow(r)}
              className={`${TBL_COLS} w-full px-4 py-2.5 text-left transition-colors hover:bg-white/[0.035]`}
              style={{ borderBottom: '1px solid var(--glass-border)' }}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px]"
                  style={r.persistent
                    ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                    : { background: 'var(--glass)', color: 'var(--t2)' }}
                >
                  {/phone|mobile|iphone|android|pad/i.test(r.name) ? <Smartphone size={14} /> : r.persistent ? <Laptop size={14} /> : <UserRound size={14} />}
                </span>
                <span className="truncate text-[13.5px] font-medium text-t1">{r.name}</span>
              </span>
              <span className="num truncate text-[12.5px] text-t2">{r.ids.join(' · ')}</span>
              <span>{r.source ? <SourceBadge source={r.source} /> : <span className="text-[12.5px] text-t3">–</span>}</span>
              <span className="truncate text-[12.5px] text-t2" title={r.whoisText}>{r.whoisText || '–'}</span>
              <span className="num text-right text-[12.5px] text-t2">{r.requests != null ? fmtNum(r.requests) : '–'}</span>
              <span className="flex justify-end">
                {r.persistent ? <Badge kind="ok">{t('clients.configuredBadge')}</Badge> : <Badge kind="warn">{t('clients.unsetBadge')}</Badge>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}

/* ---------- 客户端编辑表单(桌面居中弹窗 / 移动端独立子页共用) ---------- */

export function ClientForm({
  initial, isNew, onClose, onSaved, showTitle = true,
}: {
  initial: Partial<AghClient>
  isNew: boolean
  onClose: () => void
  onSaved: () => void
  /** 页面形态由 PageHeader 提供标题,可关掉表单内置标题避免重复 */
  showTitle?: boolean
}) {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const [c, setC] = useState<Partial<AghClient>>({ ...initial })
  const [idsText, setIdsText] = useState((initial.ids ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof AghClient>(k: K, v: AghClient[K]) => setC((s) => ({ ...s, [k]: v }))

  async function save() {
    if (!cfg) return
    if (!c.name?.trim()) return toast(t('clients.nameRequired'), 'err')
    const ids = idsText.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean)
    if (!ids.length) return toast(t('clients.idsRequired'), 'err')
    setSaving(true)
    const payload: AghClient = {
      name: c.name.trim(),
      ids,
      use_global_settings: !!c.use_global_settings,
      filtering_enabled: c.filtering_enabled ?? true,
      safebrowsing_enabled: !!c.safebrowsing_enabled,
      parental_enabled: !!c.parental_enabled,
      use_global_blocked_services: c.use_global_blocked_services ?? true,
      blocked_services: c.blocked_services ?? [],
      tags: c.tags ?? [],
      ignore_querylog: !!c.ignore_querylog,
      ignore_statistics: !!c.ignore_statistics,
      upstreams_cache_enabled: false,
      upstreams_cache_size: 64 * 1024,
    }
    try {
      if (isNew) {
        await api(cfg, '/clients/add', { method: 'POST', body: payload })
      } else {
        await api(cfg, '/clients/update', { method: 'POST', body: { name: initial.name, data: payload } })
      }
      onSaved()
      toast(isNew ? t('clients.added') : t('common.saved'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxHeight: '72vh', overflowY: 'auto' }}>
      {showTitle && <p className="mb-4 text-center text-[17px] font-bold text-t1">{isNew ? t('clients.formAddTitle') : t('clients.formEditTitle')}</p>}

      <div className="flex flex-col gap-3">
        <input className="field" placeholder={t('clients.namePlaceholder')} value={c.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        <input className="field" placeholder={t('clients.idsPlaceholder')} value={idsText} onChange={(e) => setIdsText(e.target.value)} autoCapitalize="off" />

        <div className="glass flex items-center justify-between rounded-2xl px-4 py-3">
          <div>
            <p className="text-[14.5px] font-medium text-t1">{t('clients.useGlobal')}</p>
            <p className="text-[11.5px] text-t2">{t('clients.useGlobalSub')}</p>
          </div>
          <Switch on={!!c.use_global_settings} onChange={(v) => set('use_global_settings', v)} />
        </div>

        {c.use_global_settings === false && (
          <div className="glass rounded-2xl px-4">
            {[
              { k: 'filtering_enabled' as const, label: t('clients.filterLabel'), icon: <Globe size={15} /> },
              { k: 'safebrowsing_enabled' as const, label: t('clients.safeBrowsingLabel'), icon: <ShieldAlert size={15} /> },
              { k: 'parental_enabled' as const, label: t('clients.parentalLabel'), icon: <Baby size={15} /> },
            ].map(({ k, label, icon }, i) => (
              <div key={k}>
                {i > 0 && <div className="h-px" style={{ background: 'var(--glass-border)' }} />}
                <div className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-2 text-[14.5px] text-t1">{icon} {label}</span>
                  <Switch on={!!c[k]} onChange={(v) => set(k, v as never)} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="glass flex items-center justify-between rounded-2xl px-4 py-3">
          <div>
            <p className="text-[14.5px] font-medium text-t1">{t('clients.useGlobalServices')}</p>
            <p className="text-[11.5px] text-t2">{t('clients.useGlobalServicesSub')}</p>
          </div>
          <Switch on={c.use_global_blocked_services !== false} onChange={(v) => set('use_global_blocked_services', v)} />
        </div>

        <div className="flex gap-2.5 pt-1">
          <Button variant="glass" size="lg" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="lg" className="flex-1" loading={saving} onClick={save}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
