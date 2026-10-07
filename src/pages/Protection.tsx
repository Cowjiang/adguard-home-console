/** Filter hub: rules entry + content safety switches + filtering general (the master
 *  protection switch lives on the dashboard) */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import {
  ListFilter, CheckCircle, FileCode2, AppWindow, ArrowLeftRight, ScanSearch,
  ShieldAlert, Baby, SearchCheck, Timer, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../lib/session/auth'
import { api, swrFetcher, type FilteringStatus, type RewriteEntry } from '../lib/api'
import { usePageInClass, Card, Group, GroupTitle, Rows, Row, Switch, Badge, useSheet, Button, toast, usePick, PickSelect } from '../components/ui'
import { isAppleMobile } from '../lib/native/shell'
import { hoursLabel, relTime, fmtNum, fmtDate } from '../lib/format'


const SAFE_ENGINES = [
  { key: 'google', label: 'Google' },
  { key: 'bing', label: 'Bing' },
  { key: 'duckduckgo', label: 'DuckDuckGo' },
  { key: 'yandex', label: 'Yandex' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'pixabay', label: 'Pixabay' },
  { key: 'ecosia', label: 'Ecosia' },
] as const

// AGH /filtering interval is milliseconds; labels and picker options work in hours
const HOUR_MS = 3_600_000

export default function Protection() {
  const pageIn = usePageInClass()
  const nav = useNavigate()
  const { t } = useTranslation()
  const { cfg } = useAuth()
  const sheet = useSheet()
  const pick = usePick()
  const [refreshing, setRefreshing] = useState(false)
  const { data: filtering, mutate: mFiltering } = useSWR<FilteringStatus>(cfg ? ['filtering', cfg, '/filtering/status'] : null, swrFetcher, { refreshInterval: 15000 })

  async function saveInterval(hours: number) {
    if (!cfg || !filtering) return
    try {
      await api(cfg, '/filtering/config', { method: 'POST', body: { enabled: filtering.enabled, interval: hours * HOUR_MS } })
      mFiltering()
      toast(t('filters.intervalSaved'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
    }
  }
  const { data: rewrites } = useSWR<{ total: number } | RewriteEntry[]>(cfg ? ['rw', cfg, '/rewrite/list'] : null, swrFetcher)
  const { data: bsCurrent } = useSWR<{ ids: string[] }>(cfg ? ['bsg', cfg, '/blocked_services/get'] : null, swrFetcher)
  const { data: sb, mutate: mSb } = useSWR<any>(cfg ? ['sb', cfg, '/safesearch/status'] : null, swrFetcher)
  const { data: sbB, mutate: mSbB } = useSWR<any>(cfg ? ['sbb', cfg, '/safebrowsing/status'] : null, swrFetcher)
  const { data: pc, mutate: mPc } = useSWR<any>(cfg ? ['pc', cfg, '/parental/status'] : null, swrFetcher)

  const rewriteCount = Array.isArray(rewrites) ? rewrites.length : (rewrites as any)?.total ?? 0
  const filterCount = filtering?.filters?.length ?? 0
  const allowCount = filtering?.whitelist_filters?.length ?? 0
  const ruleCount = (filtering?.user_rules ?? []).filter((r) => r && !r.trim().startsWith('!') && !r.trim().startsWith('#')).length

  // Status card: total rules = sum of enabled filter rules + custom rules; last update is
  // the most recent across all filters
  const listRuleCount = (filtering?.filters ?? []).filter((f) => f.enabled).reduce((s, f) => s + (f.rules_count || 0), 0)
  const totalRules = listRuleCount + ruleCount
  const lastUpdated = [...(filtering?.filters ?? []), ...(filtering?.whitelist_filters ?? [])]
    .map((f) => f.last_updated)
    .filter(Boolean)
    .sort()
    .pop()

  async function toggleFiltering(enabled: boolean) {
    if (!cfg || !filtering) return
    try {
      await api(cfg, '/filtering/config', { method: 'POST', body: { enabled, interval: filtering.interval } })
      mFiltering()
      toast(enabled ? t('protection.filteringOn') : t('protection.filteringOff'))
    } catch (e: any) {
      toast(t('common.opFailed', { msg: e.message }), 'err')
    }
  }

  async function refreshAllFilters() {
    if (!cfg) return
    setRefreshing(true)
    try {
      // /filtering/refresh refreshes one side at a time, so call it once per list
      const [a, b] = await Promise.all([
        api<{ updated: number }>(cfg, '/filtering/refresh', { method: 'POST', body: { whitelist: false } }),
        api<{ updated: number }>(cfg, '/filtering/refresh', { method: 'POST', body: { whitelist: true } }),
      ])
      mFiltering()
      toast(t('protection.refreshedToast', { n: (a?.updated ?? 0) + (b?.updated ?? 0) }))
    } catch (e: any) {
      toast(t('common.updateFailed', { msg: e.message }), 'err')
    } finally {
      setRefreshing(false)
    }
  }

  async function toggleEndpoint(path: string, on: boolean, mutate: () => void) {
    if (!cfg) return
    try {
      await api(cfg, `/${path}/${on ? 'enable' : 'disable'}`, { method: 'POST', body: {} })
      mutate()
      toast(on ? t('protection.turnedOn') : t('protection.turnedOff'))
    } catch (e: any) {
      toast(t('common.opFailed', { msg: e.message }), 'err')
    }
  }  async function saveSafeSearch(enabled: boolean, engines: Record<string, boolean>) {
    if (!cfg) return
    try {
      await api(cfg, '/safesearch/settings', { method: 'PUT', body: { enabled, ...engines } })
      toast(t('protection.safeSearchSaved'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
    }
  }

  function openSafeSearchSheet() {
    if (!sb) return
    const engines: Record<string, boolean> = {}
    for (const e of SAFE_ENGINES) engines[e.key] = !!sb[e.key]
    let enabled = !!sb.enabled
    const setEngine = (k: string, v: boolean) => {
      engines[k] = v
    }
    sheet.open(
      <SafeSearchSheet
        initial={enabled}
        engines={{ ...engines }}
        onChange={(v, e) => {
          enabled = v
          Object.assign(engines, e)
        }}
        onSave={() => {
          sheet.close()
          saveSafeSearch(enabled, engines)
        }}
      />
    )
  }

  return (
    <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
      <h1 className="mb-4 text-[26px] font-bold tracking-tight text-t1">{t('nav.protection')}</h1>

      {/* Filter status: two separate small tiles on mobile (sized like the dashboard StatTile,
          round button centered at right); a wide card on desktop */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:hidden">
        <div className="glass specular relative overflow-hidden rounded-2xl px-3.5 py-3">
          <div className="text-[12px] text-t2">{t('protection.totalRules')}</div>
          <div className="mt-0.5 text-[22px] font-bold leading-tight num" style={{ color: 'var(--accent)' }}>{fmtNum(totalRules)}</div>
          <div className="text-[11.5px] text-t3 num">{t('protection.rulesCustomSub', { n: ruleCount })}</div>
        </div>
        <div className="glass specular relative overflow-hidden rounded-2xl px-3.5 py-3">
          <div className="flex items-center">
            <div className="min-w-0 flex-1 pr-1">
              <div className="text-[12px] text-t2">{t('protection.listCount')}</div>
              <div className="mt-0.5 truncate text-[22px] font-bold leading-tight num text-t1" title={lastUpdated ? fmtDate(lastUpdated) : undefined}>
                {lastUpdated ? relTime(lastUpdated) : t('protection.neverUpdated')}
              </div>
              <div className="truncate text-[11.5px] text-t3">{t('protection.lastUpdated')}</div>
            </div>
            <Button
              variant="glass"
              size="sm"
              className="!h-9 !w-9 !flex-none !rounded-full !p-0"
              loading={refreshing}
              onClick={refreshAllFilters}
              label={t('protection.refreshNowLabel')}
            >
              {!refreshing && <RefreshCw size={15} />}
            </Button>
          </div>
        </div>
      </div>
      <Card className="mb-4 hidden lg:flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
          <div>
            <div className="text-[12px] text-t2">{t('protection.totalRules')}</div>
            <div className="text-[20px] font-bold leading-tight num text-t1">{fmtNum(totalRules)}</div>
            <div className="text-[11.5px] text-t3">{t('protection.rulesCustomSubFull', { n: ruleCount })}</div>
          </div>
          <div>
            <div className="text-[12px] text-t2">{t('protection.listCount')}</div>
            <div className="text-[20px] font-bold leading-tight num text-t1">{filterCount + allowCount}</div>
            <div className="text-[11.5px] text-t3">{t('protection.blackWhiteSub', { b: filterCount, w: allowCount })}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[12px] text-t2">{t('protection.lastUpdated')}</div>
            <div className="text-[20px] font-bold leading-tight num text-t1">{lastUpdated ? relTime(lastUpdated) : '—'}</div>
            <div className="text-[11.5px] text-t3">{t('protection.autoUpdateEvery', { interval: filtering ? hoursLabel(filtering.interval / HOUR_MS) : '…' })}</div>
          </div>
          <div className="ml-auto">
            <Button variant="glass" loading={refreshing} onClick={refreshAllFilters}>
              {!refreshing && <RefreshCw size={15} />} {t('protection.refreshNow')}
            </Button>
          </div>
      </Card>

      {/* Desktop two columns: left = filtering, right = safety + general; mobile keeps the
          original vertical order */}
      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle className="lg:mt-0">{t('protection.funcGroup')}</GroupTitle>
          <Group>
        <Rows>
          <Row
            icon={<IconBubble color="var(--danger)" bg="var(--danger-soft)"><ListFilter size={17} /></IconBubble>}
            title={t('protection.blacklistRow')}
            subtitle={t('protection.blacklistSub', { n: filterCount })}
            onClick={() => nav('/protection/filters')}
          />
          <Row
            icon={<IconBubble color="var(--ok)" bg="var(--ok-soft)"><CheckCircle size={17} /></IconBubble>}
            title={t('protection.whitelistRow')}
            subtitle={t('protection.whitelistSub', { n: allowCount })}
            onClick={() => nav('/protection/allowlist')}
          />
          <Row
            icon={<IconBubble color="var(--violet)" bg="var(--violet-soft)"><FileCode2 size={17} /></IconBubble>}
            title={t('protection.customRulesRow')}
            subtitle={t('protection.customRulesSub', { n: ruleCount })}
            onClick={() => nav('/protection/rules')}
          />
          <Row
            icon={<IconBubble color="var(--warn)" bg="var(--warn-soft)"><AppWindow size={17} /></IconBubble>}
            title={t('protection.servicesRow')}
            subtitle={t('protection.servicesRowSub', { n: bsCurrent?.ids?.length ?? 0 })}
            onClick={() => nav('/protection/services')}
          />
          <Row
            icon={<IconBubble color="var(--accent-2)" bg="color-mix(in srgb, var(--accent-2) 14%, transparent)"><ArrowLeftRight size={17} /></IconBubble>}
            title={t('protection.rewritesRow')}
            subtitle={t('protection.rewritesRowSub', { n: rewriteCount })}
            onClick={() => nav('/rewrites')}
          />
          <Row
            icon={<IconBubble color="var(--accent)" bg="var(--accent-soft)"><ScanSearch size={17} /></IconBubble>}
            title={t('protection.checkRow')}
            subtitle={t('protection.checkRowSub')}
            onClick={() => nav('/protection/check')}
            last
          />
        </Rows>
      </Group>
        </div>
        <div>
          <GroupTitle className="lg:mt-0">{t('protection.safetyGroup')}</GroupTitle>
          <Group>
        <Rows>
          <Row
            icon={<IconBubble color="var(--accent)" bg="var(--accent-soft)"><ShieldAlert size={17} /></IconBubble>}
            title={t('protection.safeBrowsingRow')}
            subtitle={t('protection.safeBrowsingRowSub')}
            right={<Switch on={!!sbB?.enabled} onChange={(v) => toggleEndpoint('safebrowsing', v, mSbB)} />}
          />
          <Row
            icon={<IconBubble color="var(--violet)" bg="var(--violet-soft)"><Baby size={17} /></IconBubble>}
            title={t('protection.parentalRow')}
            subtitle={t('protection.parentalRowSub')}
            right={<Switch on={!!pc?.enabled} onChange={(v) => toggleEndpoint('parental', v, mPc)} />}
          />
          <Row
            icon={<IconBubble color="var(--warn)" bg="var(--warn-soft)"><SearchCheck size={17} /></IconBubble>}
            title={t('protection.safeSearchRow')}
            subtitle={t('protection.safeSearchRowSub')}
            right={<Switch on={!!sb?.enabled} onChange={(v) => { saveSafeSearch(v, SAFE_ENGINES.reduce((a, e) => ({ ...a, [e.key]: !!sb?.[e.key] }), {})); mSb() }} />}
            onClick={openSafeSearchSheet}
            last
          />
        </Rows>
      </Group>

      <GroupTitle>{t('protection.generalGroup')}</GroupTitle>
      <Group>
        <Rows>
          <Row
            icon={<IconBubble color="var(--accent-2)" bg="color-mix(in srgb, var(--accent-2) 14%, transparent)"><ListFilter size={17} /></IconBubble>}
            title={t('protection.enableFiltering')}
            subtitle={t('protection.enableFilteringSub')}
            right={<Switch on={filtering?.enabled ?? false} onChange={toggleFiltering} />}
          />
          <Row
            icon={<IconBubble color="var(--t2)" bg="var(--glass)"><Timer size={17} /></IconBubble>}
            title={t('protection.intervalRow')}
            value={isAppleMobile() ? undefined : (filtering ? hoursLabel(filtering.interval / HOUR_MS) : '…')}
            right={isAppleMobile() ? (
              <div className="w-28 flex-none">
                <PickSelect
                  className="field num !py-1.5 !pr-8 text-right"
                  value={filtering ? filtering.interval / HOUR_MS : undefined}
                  options={[1, 12, 24, 72].map((h) => ({ label: hoursLabel(h), value: h }))}
                  onPick={(v) => saveInterval(v)}
                />
              </div>
            ) : undefined}
            onClick={isAppleMobile() ? undefined : (e) => {
              pick({
                title: t('protection.intervalRow'),
                anchor: e.currentTarget,
                align: 'right',
                value: filtering ? filtering.interval / HOUR_MS : undefined,
                options: [1, 12, 24, 72].map((h) => ({ label: hoursLabel(h), value: h })),
                onPick: (v) => saveInterval(v),
              })
            }}
            last
          />
        </Rows>
          </Group>
        </div>
      </div>
    </div>
  )
}

function SafeSearchSheet({
  initial, engines, onChange, onSave,
}: {
  initial: boolean
  engines: Record<string, boolean>
  onChange: (enabled: boolean, engines: Record<string, boolean>) => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(initial)
  const [eng, setEng] = useState({ ...engines })
  return (
    <div>
      <div className="glass mb-3 flex items-center justify-between rounded-2xl px-4 py-3">
        <span className="text-[15px] font-medium text-t1">{t('protection.safeSearchEnable')}</span>
        <Switch
          on={enabled}
          onChange={(v) => {
            setEnabled(v)
            onChange(v, eng)
          }}
        />
      </div>
      <p className="mb-1.5 px-2 text-[12.5px] font-semibold text-t3">{t('protection.safeSearchEngines')}</p>
      <div className="glass mb-4 rounded-2xl px-4">
        {SAFE_ENGINES.map((e, i) => (
          <div key={e.key}>
            {i > 0 && <div className="h-px" style={{ background: 'var(--glass-border)' }} />}
            <div className="flex items-center justify-between py-2.5">
              <span className="text-[14.5px] text-t1">{e.label}</span>
              <Switch
                on={eng[e.key]}
                onChange={(v) => {
                  const next = { ...eng, [e.key]: v }
                  setEng(next)
                  onChange(enabled, next)
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <Button className="w-full" size="lg" onClick={onSave}>
        {t('common.save')}
      </Button>
    </div>
  )
}

export function IconBubble({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-[11px]" style={{ color, background: bg }}>
      {children}
    </div>
  )
}
