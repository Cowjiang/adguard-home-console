/** Filter management: blacklist/whitelist filters, custom rules, blocked services */
import { useMemo, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import useSWR from 'swr'
import {
  Plus, RefreshCw, Trash2, Globe2, Search, Ban, ExternalLink,
} from 'lucide-react'
import { useAuth } from '../lib/session/auth'
import { api, swrFetcher, type FilteringStatus, type Filter, type BlockedService, type SvrConfig } from '../lib/api'
import { PageHeader, Screen, Card, Group, GroupTitle, Rows, Row, Switch, Button, HeaderAction, TabContent } from '../components/ui/primitives'
import { useSheet, useConfirm } from '../components/ui/sheet'
import { toast } from '../components/ui/toast'
import { Loading, EmptyState, SearchBar, Badge, Chip } from '../components/ui/atoms'
import { usePick, PickSelect } from '../components/ui/menu'
import { isAppleMobile } from '../lib/native/shell'
import { IconBubble } from '../components/ui/atoms'
import { hoursLabel, relTime, fmtNum } from '../lib/format'
import { SERVICE_CACHE_KEY } from '../lib/constants'

// AGH /filtering interval is milliseconds; labels and picker options work in hours
const HOUR_MS = 3_600_000


/* ================= Blacklist / whitelist filters ================= */

export function FiltersPage({ whitelist }: { whitelist: boolean }) {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const sheet = useSheet()
  const pick = usePick()
  const confirm = useConfirm()
  const [refreshing, setRefreshing] = useState(false)

  const { data, mutate, isLoading } = useSWR<FilteringStatus>(
    cfg ? ['filtering', cfg, '/filtering/status'] : null, swrFetcher, { refreshInterval: 20000 }
  )

  const filters = (whitelist ? data?.whitelist_filters : data?.filters) ?? []

  async function toggleFilter(f: Filter, enabled: boolean) {
    if (!cfg) return
    try {
      await api(cfg, '/filtering/set_url', {
        method: 'POST',
        body: { url: f.url, whitelist, data: { url: f.url, name: f.name, enabled } },
      })
      mutate()
    } catch (e: any) {
      toast(t('common.opFailed', { msg: e.message }), 'err')
    }
  }

  async function removeFilter(f: Filter) {
    if (!cfg) return
    try {
      await api(cfg, '/filtering/remove_url', { method: 'POST', body: { url: f.url, whitelist } })
      mutate()
      toast(t('filters.deleted'))
    } catch (e: any) {
      toast(t('common.deleteFailed', { msg: e.message }), 'err')
    }
  }

  async function refreshAll() {
    if (!cfg) return
    setRefreshing(true)
    try {
      await api(cfg, '/filtering/refresh', { method: 'POST', body: { whitelist } })
      mutate()
      toast(t('filters.refreshed'))
    } catch (e: any) {
      toast(t('common.updateFailed', { msg: e.message }), 'err')
    } finally {
      setRefreshing(false)
    }
  }

  async function saveInterval(hours: number) {
    if (!cfg || !data) return
    try {
      await api(cfg, '/filtering/config', { method: 'POST', body: { enabled: data.enabled, interval: hours * HOUR_MS } })
      mutate()
      toast(t('filters.intervalSaved'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
    }
  }

  function openAddSheet() {
    let name = ''
    let url = ''
    sheet.open(
      <div>
        <p className="mb-4 text-center text-[17px] font-bold text-t1">{t('filters.addTitle')}</p>
        <div className="flex flex-col gap-3">
          <input className="field" placeholder={t('filters.namePlaceholder')} onChange={(e) => (name = e.target.value)} />
          <input className="field" placeholder="https://example.com/list.txt" inputMode="url" onChange={(e) => (url = e.target.value)} />
          <Button
            size="lg"
            className="mt-1"
            onClick={async () => {
              if (!url.trim()) return toast(t('filters.urlRequired'), 'err')
              try {
                await api(cfg!, '/filtering/add_url', { method: 'POST', body: { name: name.trim(), url: url.trim(), whitelist } })
                mutate()
                sheet.close()
                toast(t('filters.added'))
              } catch (e: any) {
                toast(t('common.addFailed', { msg: e.message }), 'err')
              }
            }}
          >
            {t('common.add')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Screen>
      <PageHeader back title={whitelist ? t('filters.whitelistTitle') : t('filters.blacklistTitle')} subtitle={t('filters.listCountSub', { n: filters.length, interval: data ? hoursLabel(data.interval / HOUR_MS) : '…' })} right={
        <HeaderAction onClick={refreshAll} className="px-4 font-semibold text-t1" native={{ label: t('filters.refresh'), sfSymbol: 'arrow.clockwise' }}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {t('filters.refresh')}
        </HeaderAction>
      } />

      {isLoading && <Loading />}
      {!isLoading && filters.length === 0 && (
        <EmptyState icon={<Globe2 size={30} className="text-t3" />} title={t('filters.emptyTitle')} subtitle={t('filters.emptySub')} />
      )}

      <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
        {filters.map((f) => (
          <Card key={f.id} className="!rounded-2xl px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-semibold text-t1">{f.name || t('filters.unnamed')}</span>
                  {!f.enabled && <Badge kind="warn">{t('filters.disabledBadge')}</Badge>}
                </div>
                <p className="mt-0.5 truncate text-[11.5px] text-t3">{f.url}</p>
                <p className="mt-0.5 text-[11.5px] text-t2 num">
                  {t('filters.rulesInfo', { n: fmtNum(f.rules_count), time: relTime(f.last_updated ?? '') })}
                </p>
              </div>
              <Switch on={f.enabled} onChange={(v) => toggleFilter(f, v)} />
            </div>
            <div className="mt-2.5 flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="!text-danger" onClick={() => confirm({
                title: t('filters.deleteTitle', { name: f.name }),
                message: t('filters.deleteMsg'),
                destructive: true,
                confirmText: t('common.delete'),
                onConfirm: () => removeFilter(f),
              })}>
                <Trash2 size={13} /> {t('common.delete')}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <GroupTitle>{t('filters.generalGroup')}</GroupTitle>
      <Group>
        <Rows>
          <Row
            title={t('filters.intervalTitle')}
            value={isAppleMobile() ? undefined : (data ? hoursLabel(data.interval / HOUR_MS) : '…')}
            right={isAppleMobile() ? (
              <div className="w-28 flex-none">
                <PickSelect
                  className="field num !py-1.5 !pr-8 text-right"
                  value={data ? data.interval / HOUR_MS : undefined}
                  options={[1, 12, 24, 72].map((h) => ({ label: hoursLabel(h), value: h }))}
                  onPick={(v) => saveInterval(v)}
                />
              </div>
            ) : undefined}
            onClick={isAppleMobile() ? undefined : (e) => {
              pick({
                title: t('filters.intervalTitle'),
                anchor: e.currentTarget,
                align: 'right',
                value: data ? data.interval / HOUR_MS : undefined,
                options: [1, 12, 24, 72].map((h) => ({ label: hoursLabel(h), value: h })),
                onPick: (v) => saveInterval(v),
              })
            }}
          />
          <Row
            icon={<IconBubble color="var(--accent)" bg="var(--accent-soft)"><Plus size={16} /></IconBubble>}
            title={t('filters.addTitle')}
            onClick={openAddSheet}
            last
          />
        </Rows>
      </Group>
    </Screen>
  )
}

/* ================= Custom filtering rules ================= */

export function RulesPage() {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const { data, mutate } = useSWR<FilteringStatus>(cfg ? ['filtering', cfg, '/filtering/status'] : null, swrFetcher)
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const text = draft ?? (data?.user_rules ?? []).join('\n')
  const activeCount = useMemo(
    () => (data?.user_rules ?? []).filter((r) => r.trim() && !r.trim().startsWith('!') && !r.trim().startsWith('#')).length,
    [data]
  )

  async function save() {
    if (!cfg) return
    setSaving(true)
    try {
      const rules = text.split('\n').map((s) => s.trim()).filter(Boolean)
      await api(cfg, '/filtering/set_rules', { method: 'POST', body: { rules } })
      setDraft(null)
      mutate()
      toast(t('filters.rulesSaved'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <PageHeader back title={t('filters.customTitle')} subtitle={t('filters.customSub', { n: activeCount })} />
      <Card className="p-4">
        <textarea
          className="field"
          style={{ minHeight: 300 }}
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('filters.customPlaceholder')}
          spellCheck={false}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="min-w-0 text-[11.5px] leading-relaxed text-t3">
            <Trans i18nKey="filters.customHint" components={[<code key="0" />, <code key="1" />, <code key="2" />]} />
          </p>
          <Button loading={saving} disabled={draft === null} onClick={save} className="flex-none whitespace-nowrap">
            {t('common.save')}
          </Button>
        </div>
      </Card>
    </Screen>
  )
}

/* ================= Blocked services ================= */

/** Blocked service categories (group_id from the /blocked_services/all catalog) */
const SERVICE_GROUPS: { id: string; labelKey: 'filters.svcStreaming' | 'filters.svcSocial' | 'filters.svcGaming' | 'filters.svcMessenger' | 'filters.svcAi' | 'filters.svcShopping' | 'filters.svcGambling' | 'filters.svcDating' | 'filters.svcPrivacy' | 'filters.svcHosting' | 'filters.svcSoftware' | 'filters.svcCdn' | 'filters.svcOther' }[] = [
  { id: 'streaming', labelKey: 'filters.svcStreaming' },
  { id: 'social_network', labelKey: 'filters.svcSocial' },
  { id: 'gaming', labelKey: 'filters.svcGaming' },
  { id: 'messenger', labelKey: 'filters.svcMessenger' },
  { id: 'ai', labelKey: 'filters.svcAi' },
  { id: 'shopping', labelKey: 'filters.svcShopping' },
  { id: 'gambling', labelKey: 'filters.svcGambling' },
  { id: 'dating', labelKey: 'filters.svcDating' },
  { id: 'privacy', labelKey: 'filters.svcPrivacy' },
  { id: 'hosting', labelKey: 'filters.svcHosting' },
  { id: 'software', labelKey: 'filters.svcSoftware' },
  { id: 'cdn', labelKey: 'filters.svcCdn' },
]

export function ServicesPage() {
  const { cfg, activeId } = useAuth()
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState<string>('all')
  const [pending, setPending] = useState<Set<string> | null>(null)
  // Catalog content depends on the AGH version, so the local cache is keyed
  // per instance instead of shared app-wide
  const cacheKey = activeId ? `${SERVICE_CACHE_KEY}.${activeId}` : SERVICE_CACHE_KEY
  const { data: catalog } = useSWR<{ blocked_services: BlockedService[] }>(
    cfg ? ['bsAll', cfg, '/blocked_services/all'] : null,
    async ([_k, c, p]) => {
      const cached = localStorage.getItem(cacheKey)
      try {
        const fresh = await api<{ blocked_services: BlockedService[] }>(c as SvrConfig, p as string)
        localStorage.setItem(cacheKey, JSON.stringify(fresh))
        return fresh
      } catch {
        return cached ? JSON.parse(cached) : { blocked_services: [] }
      }
    },
    { revalidateOnFocus: false, refreshInterval: 0 }
  )
  const { data: current, mutate: mutateCurrent } = useSWR<{ ids: string[]; schedule?: unknown }>(
    cfg ? ['bsg', cfg, '/blocked_services/get'] : null, swrFetcher
  )

  const ids = pending ?? new Set(current?.ids ?? [])

  const list = useMemo(() => {
    const all = catalog?.blocked_services ?? []
    const s = search.trim().toLowerCase()
    return (s ? all.filter((x) => x.name.toLowerCase().includes(s) || x.id.includes(s)) : all)
  }, [catalog, search])

  // Click applies instantly: optimistic update + serialized save queue; pending is held so
  // the tile does not flicker "green → gray → green"
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const latestIdsRef = useRef<Set<string> | null>(null)

  function toggleService(id: string) {
    if (!cfg) return
    const on = ids.has(id)
    const next = new Set(latestIdsRef.current ?? ids)
    if (on) next.delete(id)
    else next.add(id)
    latestIdsRef.current = next
    setPending(next)
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        const body: any = { ids: Array.from(next) }
        if (current?.schedule) body.schedule = current.schedule
        await api(cfg, '/blocked_services/update', { method: 'PUT', body })
        await mutateCurrent({ ids: Array.from(next), schedule: current?.schedule }, { revalidate: false })
        toast(on ? t('filters.svcUnblockedToast', { id }) : t('filters.svcBlockedToast', { id }))
      } catch (e: any) {
        mutateCurrent()
        toast(t('common.saveFailed', { msg: e.message }), 'err')
      } finally {
        if (latestIdsRef.current === next) {
          latestIdsRef.current = null
          setPending(null)
        }
      }
    })
  }

  const visible = group === 'all' ? list : list.filter((x) => x.group_id === group)
  const sections = (group === 'all' ? SERVICE_GROUPS : SERVICE_GROUPS.filter((g) => g.id === group))
    .map((g) => ({ group: g, items: visible.filter((x) => x.group_id === g.id) }))
    .filter((s) => s.items.length)
  // Services without a category go under "other"
  const otherItems = visible.filter((x) => !SERVICE_GROUPS.some((g) => g.id === x.group_id))
  if (otherItems.length) sections.push({ group: { id: 'other', labelKey: 'filters.svcOther' as const }, items: otherItems })

  const renderTile = (svc: BlockedService) => {
    const on = ids.has(svc.id)
    return (
      <button
        key={svc.id}
        onClick={() => toggleService(svc.id)}
        className="press specular relative flex flex-col items-center gap-1.5 overflow-hidden rounded-xl px-1 py-2.5"
        style={{
          background: on ? 'var(--accent-soft)' : 'var(--glass)',
          border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--glass-border)'}`,
        }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center [&_svg]:h-5 [&_svg]:w-5"
          style={{ color: on ? 'var(--accent)' : 'var(--t2)' }}
          dangerouslySetInnerHTML={{ __html: atob(svc.icon_svg ?? '') }}
        />
        <span className="w-full truncate text-center text-[10.5px] font-medium text-t1" title={svc.name}>
          {svc.name}
        </span>
        {on && (
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
        )}
      </button>
    )
  }

  return (
    <Screen>
      <PageHeader back title={t('filters.svcTitle')} subtitle={t('filters.svcSub', { n: ids.size, total: catalog?.blocked_services?.length ?? 0 })} />
      {/* The sticky container itself does not capture pointers; its stuck position clears
          the mobile floating top bar, and its natural position leaves no blank row */}
      <div
        className="pointer-events-none sticky top-[calc(env(safe-area-inset-top,0px)+52px)] z-10 -mx-4 px-4 pb-2 lg:top-0"
        style={{ background: 'linear-gradient(var(--bg) 55%, transparent)' }}
      >
        <div className="pointer-events-auto">
          <SearchBar value={search} onChange={setSearch} placeholder={t('filters.svcSearchPlaceholder')} />
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <Chip active={group === 'all'} onClick={() => setGroup('all')}>
              {t('filters.svcAll')}{ids.size > 0 ? ` ${ids.size}` : ''}
            </Chip>
            {SERVICE_GROUPS.map((g) => {
              const selCount = (catalog?.blocked_services ?? [])
                .filter((x) => x.group_id === g.id && ids.has(x.id)).length
              return (
                <Chip key={g.id} active={group === g.id} onClick={() => setGroup(g.id)}>
                  {t(g.labelKey)}{selCount > 0 ? ` ${selCount}` : ''}
                </Chip>
              )
            })}
          </div>
        </div>
      </div>

      {!catalog && <Loading />}
      <TabContent value={group}>
        {sections.map(({ group: g, items }) => (
        <div key={g.id} className="mb-3">
          <div className="mb-1.5 mt-3 flex items-baseline gap-2 px-1">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-t3">{t(g.labelKey)}</span>
            <span className="text-[11px] num text-t3">{items.length}</span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10 xl:grid-cols-12">
            {items.map(renderTile)}
          </div>
        </div>
        ))}
        {catalog && !sections.length && <EmptyState icon={<Search size={28} className="text-t3" />} title={t('filters.svcNoMatch')} />}
      </TabContent>
    </Screen>
  )
}

/* ================= DNS rewrites ================= */

export function RewritesPage() {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const sheet = useSheet()
  const confirm = useConfirm()
  const { data: entries, mutate } = useSWR<any[]>(cfg ? ['rw', cfg, '/rewrite/list'] : null, swrFetcher)
  const { data: settings, mutate: mSettings } = useSWR<any>(cfg ? ['rws', cfg, '/rewrite/settings'] : null, swrFetcher)

  async function add(domain: string, answer: string) {
    if (!cfg) return
    try {
      await api(cfg, '/rewrite/add', { method: 'POST', body: { domain: domain.trim(), answer: answer.trim() } })
      mutate()
      sheet.close()
      toast(t('filters.rwAdded'))
    } catch (e: any) {
      toast(t('common.addFailed', { msg: e.message }), 'err')
    }
  }

  async function remove(entry: any) {
    if (!cfg) return
    try {
      await api(cfg, '/rewrite/delete', { method: 'POST', body: { domain: entry.domain, answer: entry.answer } })
      mutate()
      toast(t('filters.rwDeleted'))
    } catch (e: any) {
      toast(t('common.deleteFailed', { msg: e.message }), 'err')
    }
  }

  async function toggle(entry: any, enabled: boolean) {
    if (!cfg) return
    try {
      await api(cfg, '/rewrite/update', {
        method: 'PUT',
        body: { target: { domain: entry.domain, answer: entry.answer }, update: { domain: entry.domain, answer: entry.answer, enabled } },
      })
      mutate()
    } catch (e: any) {
      toast(t('common.opFailed', { msg: e.message }), 'err')
    }
  }

  function openAdd() {
    let domain = ''
    let answer = ''
    sheet.open(
      <div>
        <p className="mb-4 text-center text-[17px] font-bold text-t1">{t('filters.rwAddTitle')}</p>
        <div className="flex flex-col gap-3">
          <input className="field" placeholder={t('filters.rwDomainPlaceholder')} autoCapitalize="off" onChange={(e) => (domain = e.target.value)} />
          <input className="field" placeholder={t('filters.rwAnswerPlaceholder')} autoCapitalize="off" onChange={(e) => (answer = e.target.value)} />
          <Button size="lg" className="mt-1" onClick={() => (domain.trim() && answer.trim() ? add(domain, answer) : toast(t('filters.rwIncomplete'), 'err'))}>
            {t('common.add')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Screen>
      <PageHeader back title={t('filters.rwTitle')} subtitle={t('filters.rwCountSub', { n: entries?.length ?? 0 })} right={
        <HeaderAction
          onClick={openAdd}
          label={t('common.add')}
          className="w-11 text-accent lg:w-10"
          native={{ sfSymbol: 'plus', foreground: 'accent', iconOnly: true }}
        >
          <Plus size={19} />
        </HeaderAction>
      } />

      <Group>
        <Rows>
          <Row
            title={t('filters.rwEnable')}
            subtitle={t('filters.rwEnableSub')}
            right={<Switch on={!!settings?.enabled} onChange={async (v) => {
              try {
                await api(cfg!, '/rewrite/settings/update', { method: 'PUT', body: { enabled: v } })
                mSettings()
              } catch (e: any) {
                toast(t('common.opFailed', { msg: e.message }), 'err')
              }
            }} />}
            last
          />
        </Rows>
      </Group>

      <div className="mt-3 grid gap-2.5 lg:grid-cols-2 lg:items-start">
        {(entries ?? []).map((e, i) => (
          <Card key={i} className="!rounded-2xl px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold text-t1">{e.domain}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-t2 num">
                  → {e.answer || t('filters.rwByRequestIp')}
                </p>
              </div>
              <Switch on={e.enabled !== false} onChange={(v) => toggle(e, v)} />
              <button onClick={() => confirm({ title: t('filters.rwDeleteTitle', { domain: e.domain }), destructive: true, confirmText: t('common.delete'), onConfirm: () => remove(e) })} className="press flex-none text-t3" aria-label={t('common.delete')}>
                <Trash2 size={16} />
              </button>
            </div>
          </Card>
        ))}
        {entries && entries.length === 0 && (
          <EmptyState icon={<ExternalLink size={28} className="text-t3" />} title={t('filters.rwEmptyTitle')} subtitle={t('filters.rwEmptySub')} />
        )}
      </div>
    </Screen>
  )
}

/* ================= Rule check tool ================= */

export function CheckHostPage() {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const [domain, setDomain] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function check() {
    if (!cfg || !domain.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const r = await api<any>(cfg, '/filtering/check_host' + '?name=' + encodeURIComponent(domain.trim()))
      setResult(r)
    } catch (e: any) {
      toast(t('filters.checkFailed', { msg: e.message }), 'err')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen>
      <PageHeader back title={t('filters.checkTitle')} subtitle={t('filters.checkSub')} />
      <Card className="p-4">
        <div className="flex gap-2.5">
          <input
            className="field flex-1"
            placeholder={t('filters.checkPlaceholder')}
            autoCapitalize="off"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check()}
          />
          <Button loading={loading} disabled={!domain.trim()} onClick={check}>
            {t('filters.checkAction')}
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="mt-4 p-4 rise-in">
          <div className="mb-3 flex items-center gap-2">
            {result.reason === 'NotFilteredNotFound' ? (
              <Badge kind="ok">{t('filters.checkNotBlocked')}</Badge>
            ) : result.reason?.startsWith('Filtered') ? (
              <Badge kind="blocked">{t('filters.checkBlocked')}</Badge>
            ) : (
              <Badge kind="rewrite">{t('filters.checkOther')}</Badge>
            )}
            <span className="text-[12.5px] text-t2 num">{result.reason}</span>
          </div>
          {result.service_name && <p className="mb-2 text-[13px] text-t1">{t('filters.checkMatchedService', { name: result.service_name })}</p>}
          {result.ip_addrs?.length ? (
            <p className="mb-2 break-all text-[13px] text-t1 num">{t('filters.checkRewrittenTo', { ip: result.ip_addrs.join(', ') })}</p>
          ) : null}
          {result.rules?.length ? (
            <div className="glass rounded-xl px-3.5 py-3">
              {result.rules.map((r: any, i: number) => (
                <p key={i} className="break-all py-0.5 font-mono text-[12.5px] text-t1">
                  {r.text}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-t3">{t('filters.checkNoMatch')}</p>
          )}
        </Card>
      )}

      <div className="mt-4 flex items-start gap-2 px-2 text-[12px] leading-relaxed text-t3">
        <Ban size={14} className="mt-0.5 flex-none" />
        {t('filters.checkHint')}
      </div>
    </Screen>
  )
}
