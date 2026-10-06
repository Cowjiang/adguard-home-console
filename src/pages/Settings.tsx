/** Settings hub + general settings + system management + appearance / instances / about */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import useSWR from 'swr'
import {
  ScrollText, Network, Lock, Wifi, Wrench,
  Trash, RotateCcw, DownloadCloud, Server, Plus, SunMoon,
  Info, Eraser, ShieldQuestion,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/auth'
import { activeEndpoint, labelFromUrl } from '../lib/instances'
import { api, swrFetcher, type QueryLogConfig, type StatsConfig, type VersionInfo } from '../lib/api'
import { setAppLang, getLangSetting, type LangSetting } from '../lib/i18n'
import {
  PageHeader, Screen, Card, Group, GroupTitle, Rows, Row, Switch, Button,
  Loading, useConfirm, toast, Badge, usePick, PickSelect, ErrorBox,
} from '../components/ui'
import { IconBubble } from './Protection'
import { isAppleMobile } from '../lib/nativePickers'
import { hoursLabel, fmtDate } from '../lib/format'
import { APP_NAME, APP_VERSION } from '../lib/constants'
import { useIsDesktop } from '../lib/useIsDesktop'


/* ================= Settings hub ================= */

export default function Settings() {
  const nav = useNavigate()
  const { t } = useTranslation()
  const isDesktop = useIsDesktop()
  const { offline } = useAuth()

  const serverItems = [
    { icon: <ScrollText size={17} />, color: 'var(--accent-2)', title: t('settings.itemQueryStats'), desc: t('settings.itemQueryStatsDesc'), to: '/settings/general' },
    { icon: <Network size={17} />, color: 'var(--accent)', title: t('settings.itemDns'), desc: t('settings.itemDnsDesc'), to: '/settings/dns' },
    { icon: <Wrench size={17} />, color: 'var(--violet)', title: t('settings.itemAccess'), desc: t('settings.itemAccessDesc'), to: '/settings/access' },
    { icon: <Lock size={17} />, color: 'var(--warn)', title: t('settings.itemEncryption'), desc: t('settings.itemEncryptionDesc'), to: '/settings/encryption' },
    { icon: <Wifi size={17} />, color: 'var(--ok)', title: t('settings.itemDhcp'), desc: t('settings.itemDhcpDesc'), to: '/settings/dhcp' },
    { icon: <ShieldQuestion size={17} />, color: 'var(--danger)', title: t('settings.itemSystem'), desc: t('settings.itemSystemDesc'), to: '/settings/system' },
  ]
  const appItems = [
    { icon: <SunMoon size={17} />, color: 'var(--accent-2)', title: t('settings.appearance'), desc: t('settings.itemAppearanceDesc'), to: '/settings/appearance' },
    { icon: <Server size={17} />, color: 'var(--accent)', title: t('settings.itemServer'), desc: t('settings.itemServerDesc'), to: '/settings/server' },
    { icon: <Info size={17} />, color: 'var(--violet)', title: t('settings.itemAbout'), desc: `${APP_NAME} v${APP_VERSION}`, to: '/settings/about' },
  ]

  // Hide the AGH-server-dependent "server settings" group while offline, keeping the page
  // usable: the user may need to change the server address via "server connection";
  // the group comes back automatically once offline resets on reconnect
  const groups = [
    ...(!offline ? [{ title: t('settings.groupServer'), items: serverItems }] : []),
    { title: t('settings.groupApp'), items: appItems },
  ]

  return (
    <Screen>
      <PageHeader title={t('settings.title')} />

      <div className={isDesktop ? 'grid grid-cols-2 items-start gap-x-4' : ''}>
        {groups.map((g) => (
          <div key={g.title}>
            <GroupTitle>{g.title}</GroupTitle>
            <Group>
              <Rows>
                {g.items.map((it, i) => (
                  <Row
                    key={it.to}
                    icon={<IconBubble color={it.color} bg="color-mix(in srgb, currentColor 12%, transparent)">{it.icon}</IconBubble>}
                    title={it.title}
                    subtitle={it.desc}
                    onClick={() => nav(it.to)}
                    last={i === g.items.length - 1}
                  />
                ))}
              </Rows>
            </Group>
          </div>
        ))}
      </div>
    </Screen>
  )
}

/* ================= General settings ================= */

export function GeneralSettings() {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const pick = usePick()
  const { data: ql, mutate: mQl, isLoading: qlLoading } = useSWR<QueryLogConfig>(cfg ? ['qlc', cfg, '/querylog/config'] : null, swrFetcher)
  const { data: sc, mutate: mSc, isLoading: scLoading } = useSWR<StatsConfig>(cfg ? ['stc', cfg, '/stats/config'] : null, swrFetcher)
  // 与 DNS 设置页一致的「草稿 + 页头保存」：所有行编辑本地草稿，右上角出现
  // 保存按钮时才整体下发；被忽略的域名在保存时按行拆分、trim、去空行并去重
  const [qlDraft, setQlDraft] = useState<QueryLogConfig | null>(null)
  const [scDraft, setScDraft] = useState<StatsConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (ql && qlDraft === null) setQlDraft(structuredClone(ql))
  }, [ql, qlDraft])
  useEffect(() => {
    if (sc && scDraft === null) setScDraft(structuredClone(sc))
  }, [sc, scDraft])

  const setQl = (patch: Partial<QueryLogConfig>) => setQlDraft((s) => (s ? { ...s, ...patch } : s))
  const setSc = (patch: Partial<StatsConfig>) => setScDraft((s) => (s ? { ...s, ...patch } : s))
  const normList = (s: string) => [...new Set(s.split('\n').map((x) => x.trim()).filter(Boolean))]
  const qlDirty = !!qlDraft && !!ql && JSON.stringify(qlDraft) !== JSON.stringify(ql)
  const scDirty = !!scDraft && !!sc && JSON.stringify(scDraft) !== JSON.stringify(sc)
  const dirty = qlDirty || scDirty

  // Newer v0.107.79 API: interval is in ms (GET returns 604800000 = 7 days)
  const HOUR = 3_600_000
  const DAY = 86_400_000
  // Retention labels use hoursLabel directly (units dictionary), consistent with the
  // formatted output
  const QL_RETENTIONS = [6, 24, 168, 720, 2160].map((h) => ({ label: hoursLabel(h), value: h * HOUR }))
  const STAT_RETENTIONS = [24, 168, 720, 2160].map((h) => ({ label: hoursLabel(h), value: h * DAY }))

  async function save() {
    if (!cfg) return
    setSaving(true)
    try {
      // 等 refetch 拿到服务端新值再回填草稿：先置 null 会立即用旧数据重填，
      // 之后数据更新不再同步，dirty 永远清不掉
      if (qlDirty && qlDraft) {
        await api(cfg, '/querylog/config/update', { method: 'PUT', body: { ...qlDraft, ignored: normList(qlDraft.ignored.join('\n')) } })
        const fresh = await mQl()
        setQlDraft(fresh ? structuredClone(fresh) : null)
      }
      if (scDirty && scDraft) {
        await api(cfg, '/stats/config/update', { method: 'PUT', body: { ...scDraft, ignored: normList(scDraft.ignored.join('\n')) } })
        const fresh = await mSc()
        setScDraft(fresh ? structuredClone(fresh) : null)
      }
      toast(t('settings.generalSaved'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
    } finally {
      setSaving(false)
    }
  }

  if (qlLoading || scLoading || !qlDraft || !scDraft) {
    return <Screen><PageHeader back title={t('settings.itemQueryStats')} /><Loading /></Screen>
  }

  return (
    <Screen>
      <PageHeader back title={t('settings.itemQueryStats')} right={
        dirty ? <Button size="header" loading={saving} onClick={save} native={{ label: t('common.save'), foreground: 'accent' }}>{t('common.save')}</Button> : undefined
      } />

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle>{t('settings.queryLogGroup')}</GroupTitle>
          <Group>
        <Rows>
          <Row
            title={t('settings.enableQueryLog')}
            subtitle={t('settings.enableQueryLogSub')}
            right={<Switch on={qlDraft.enabled} onChange={(v) => setQl({ enabled: v })} />}
          />
          <Row
            title={t('settings.logRetention')}
            value={isAppleMobile() ? undefined : hoursLabel(qlDraft.interval / HOUR)}
            right={isAppleMobile() ? (
              <div className="w-28 flex-none">
                <PickSelect
                  className="field num !py-1.5 !pr-8 text-right"
                  value={qlDraft.interval}
                  options={QL_RETENTIONS}
                  onPick={(v) => setQl({ interval: v })}
                />
              </div>
            ) : undefined}
            onClick={isAppleMobile() ? undefined : (e) => {
              pick({
                title: t('settings.logRetention'),
                anchor: e.currentTarget,
                align: 'right',
                value: qlDraft.interval,
                options: QL_RETENTIONS,
                onPick: (v) => setQl({ interval: v }),
              })
            }}
          />
          <Row
            title={t('settings.anonymizeIp')}
            subtitle={t('settings.anonymizeIpSub')}
            right={<Switch on={qlDraft.anonymize_client_ip} onChange={(v) => setQl({ anonymize_client_ip: v })} />}
          />
          <Row
            title={t('settings.ignoredDomains')}
            subtitle={t('settings.ignoredDomainsSubQl')}
            right={<Switch on={qlDraft.ignored_enabled} onChange={(v) => setQl({ ignored_enabled: v })} />}
          />
          <div className="px-4 pb-4 pt-2">
            <textarea
              className="field"
              value={qlDraft.ignored.join('\n')}
              onChange={(e) => setQl({ ignored: e.target.value.split('\n') })}
              placeholder={t('settings.ignoredDomainsPlaceholder')}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        </Rows>
      </Group>
        </div>
        <div>
          <GroupTitle>{t('settings.statsGroupTitle')}</GroupTitle>
          <Group>
        <Rows>
          <Row
            title={t('settings.enableStats')}
            subtitle={t('settings.enableStatsSub')}
            right={<Switch on={scDraft.enabled} onChange={(v) => setSc({ enabled: v })} />}
          />
          <Row
            title={t('settings.statsRetention')}
            value={isAppleMobile() ? undefined : hoursLabel(scDraft.interval / HOUR)}
            right={isAppleMobile() ? (
              <div className="w-28 flex-none">
                <PickSelect
                  className="field num !py-1.5 !pr-8 text-right"
                  value={scDraft.interval}
                  options={STAT_RETENTIONS}
                  onPick={(v) => setSc({ interval: v })}
                />
              </div>
            ) : undefined}
            onClick={isAppleMobile() ? undefined : (e) => {
              pick({
                title: t('settings.statsRetention'),
                anchor: e.currentTarget,
                align: 'right',
                value: scDraft.interval,
                options: STAT_RETENTIONS,
                onPick: (v) => setSc({ interval: v }),
              })
            }}
          />
          <Row
            title={t('settings.ignoredDomains')}
            subtitle={t('settings.ignoredDomainsSubStats')}
            right={<Switch on={scDraft.ignored_enabled} onChange={(v) => setSc({ ignored_enabled: v })} />}
          />
          <div className="px-4 pb-4 pt-2">
            <textarea
              className="field"
              value={scDraft.ignored.join('\n')}
              onChange={(e) => setSc({ ignored: e.target.value.split('\n') })}
              placeholder={t('settings.ignoredDomainsPlaceholder')}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        </Rows>
      </Group>
        </div>
      </div>

      <p className="mt-4 px-2 text-[12px] leading-relaxed text-t3">
        {t('settings.retentionHint')}
      </p>
    </Screen>
  )
}

/* ================= System management ================= */

export function SystemPage() {
  const { cfg, status } = useAuth()
  const { t } = useTranslation()
  const confirm = useConfirm()
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)

  async function checkUpdate() {
    if (!cfg) return
    setChecking(true)
    try {
      const r = await api<VersionInfo>(cfg, '/version.json', { method: 'POST', body: { recheck_now: true } })
      setVersionInfo(r)
      if (r.disabled) toast(t('settings.updateDisabled'))
      else if (r.new_version && r.new_version !== status?.version) toast(t('settings.newVersionFound', { v: r.new_version }))
      else toast(t('settings.upToDate'))
    } catch (e: any) {
      toast(t('settings.checkFailed', { msg: e.message }), 'err')
    } finally {
      setChecking(false)
    }
  }

  async function autoUpdate() {
    if (!cfg) return
    setUpdating(true)
    try {
      await api(cfg, '/update', { method: 'POST', body: {} })
      toast(t('settings.autoUpdateStarted'))
    } catch (e: any) {
      toast(t('common.updateFailed', { msg: e.message }), 'err')
    } finally {
      setUpdating(false)
    }
  }

  // doneKey/failKey point to the settings-domain success/failure toasts
  async function maintenance(path: string, doneKey: 'settings.cacheDone' | 'settings.statsDone' | 'settings.logDone', failKey: 'settings.cacheFail' | 'settings.statsFail' | 'settings.logFail') {
    if (!cfg) return
    try {
      await api(cfg, path, { method: 'POST', body: {} })
      toast(t(doneKey))
    } catch (e: any) {
      toast(t(failKey, { msg: e.message }), 'err')
    }
  }

  const hasNew = versionInfo?.new_version && versionInfo.new_version !== status?.version

  return (
    <Screen>
      <PageHeader back title={t('settings.systemTitle')} />

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle>{t('settings.versionGroup')}</GroupTitle>
          <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[15px] font-semibold text-t1">AdGuard Home</p>
            <p className="text-[13px] text-t2 num">{t('settings.currentVersion', { v: status?.version ?? '—' })}</p>
          </div>
          <Button variant="glass" size="sm" loading={checking} onClick={checkUpdate}>
            <DownloadCloud size={14} /> {t('settings.checkUpdate')}
          </Button>
        </div>
        {versionInfo && !versionInfo.disabled && (
          <div className="mt-3 rounded-2xl px-4 py-3" style={{ background: 'var(--accent-soft)' }}>
            <div className="flex items-center gap-2">
              <Badge kind={hasNew ? 'ok' : 'info'}>{hasNew ? t('settings.newVersionBadge', { v: versionInfo.new_version }) : t('settings.upToDateBadge')}</Badge>
            </div>
            {versionInfo.announcement && <p className="mt-1.5 text-[12.5px] leading-relaxed text-t2">{versionInfo.announcement}</p>}
            {hasNew && versionInfo.can_autoupdate && (
              <Button size="sm" className="mt-2.5" loading={updating} onClick={() => confirm({
                title: t('settings.autoUpdateConfirmTitle'),
                message: t('settings.autoUpdateConfirmMsg'),
                confirmText: t('settings.startUpdate'),
                onConfirm: autoUpdate,
              })}>
                {t('settings.autoUpdateAction')}
              </Button>
            )}
          </div>
        )}
      </Card>
        </div>
        <div>
          <GroupTitle>{t('settings.maintenanceGroup')}</GroupTitle>
          <Group>
        <Rows>
          <Row
            icon={<IconBubble color="var(--accent-2)" bg="color-mix(in srgb, var(--accent-2) 14%, transparent)"><Eraser size={17} /></IconBubble>}
            title={t('settings.clearDnsCache')}
            subtitle={t('settings.clearDnsCacheSub')}
            onClick={() => maintenance('/cache_clear', 'settings.cacheDone', 'settings.cacheFail')}
          />
          <Row
            icon={<IconBubble color="var(--warn)" bg="var(--warn-soft)"><RotateCcw size={17} /></IconBubble>}
            title={t('settings.resetStats')}
            subtitle={t('settings.resetStatsSub')}
            onClick={() => confirm({
              title: t('settings.resetStatsConfirmTitle'),
              message: t('settings.resetStatsConfirmMsg'),
              destructive: true,
              confirmText: t('settings.resetConfirm'),
              onConfirm: () => maintenance('/stats_reset', 'settings.statsDone', 'settings.statsFail'),
            })}
          />
          <Row
            icon={<IconBubble color="var(--danger)" bg="var(--danger-soft)"><Trash size={17} /></IconBubble>}
            title={t('settings.clearQueryLog')}
            subtitle={t('settings.clearQueryLogSub')}
            onClick={() => confirm({
              title: t('settings.clearLogConfirmTitle'),
              message: t('settings.clearLogConfirmMsg'),
              destructive: true,
              confirmText: t('settings.clearConfirm'),
              onConfirm: () => maintenance('/querylog_clear', 'settings.logDone', 'settings.logFail'),
            })}
            last
          />
        </Rows>
      </Group>
        </div>
      </div>

      {status && (
        <p className="mt-4 px-2 text-center text-[11.5px] text-t3 num">
          {t('settings.startedAt', { time: fmtDate(new Date(status.start_time).toISOString()) })}
        </p>
      )}
    </Screen>
  )
}

/* ================= Appearance ================= */

export function AppearanceSettings() {
  const { theme, setTheme } = useAuth()
  const { t } = useTranslation()
  const pick = usePick()
  const apple = isAppleMobile()
  // Local state drives the language row value; picking may not change
  // i18n.language (auto can resolve to the already-active language)
  const [lang, setLang] = useState<LangSetting>(getLangSetting)
  const themeOptions = [
    { value: 'auto' as const, label: t('settings.themeAuto') },
    { value: 'light' as const, label: t('settings.themeLight') },
    { value: 'dark' as const, label: t('settings.themeDark') },
  ]
  const langOptions: { label: string; value: LangSetting }[] = [
    { value: 'auto', label: t('settings.langAuto') },
    // Language names are shown in their own language (Chinese / English), never
    // translated with the UI language
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' },
  ]
  const applyLang = (v: LangSetting) => {
    setAppLang(v)
    setLang(v)
  }
  const themeLabel = themeOptions.find((o) => o.value === theme)?.label
  const langLabel = langOptions.find((o) => o.value === lang)?.label
  // Apple mobile gets a real native <select> in the row (PickSelect); desktop
  // opens the anchored dropdown from the row itself
  const pickRow = <T extends string>(opts: {
    title: string
    value: T
    valueLabel?: string
    options: { label: string; value: T }[]
    onPick: (v: T) => void
    last?: boolean
  }) => (
    <Row
      title={opts.title}
      value={apple ? undefined : opts.valueLabel}
      right={apple ? (
        <div className="w-28 flex-none">
          <PickSelect
            className="field num !py-1.5 !pr-8 text-right"
            ariaLabel={opts.title}
            value={opts.value}
            options={opts.options}
            onPick={opts.onPick}
          />
        </div>
      ) : undefined}
      onClick={apple ? undefined : (e) => {
        pick({
          title: opts.title,
          anchor: e.currentTarget,
          align: 'right',
          value: opts.value,
          options: opts.options,
          onPick: opts.onPick,
        })
      }}
      last={opts.last}
    />
  )

  return (
    <Screen>
      <PageHeader back title={t('settings.appearance')} />

      <GroupTitle>{t('settings.appearance')}</GroupTitle>
      <Group>
        <Rows>
          {pickRow({
            title: t('settings.appTheme'),
            value: theme,
            valueLabel: themeLabel,
            options: themeOptions,
            onPick: setTheme,
          })}
          {pickRow({
            title: t('settings.language'),
            value: lang,
            valueLabel: langLabel,
            options: langOptions,
            onPick: applyLang,
            last: true,
          })}
        </Rows>
      </Group>
    </Screen>
  )
}

/* ================= Instances ================= */

/** Instance list: online badge per instance (from /status probes), tap to edit */
export function ServerSettings() {
  const { instances, activeId } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()

  return (
    <Screen>
      <PageHeader back title={t('settings.serverTitle')} />

      <GroupTitle>{t('settings.instancesGroup')}</GroupTitle>
      <Group>
        <Rows>
          {instances.map((it, i) => (
            <Row
              key={it.id}
              icon={
                <IconBubble color={it.online === 'ok' ? 'var(--ok)' : it.online === 'down' ? 'var(--danger)' : 'var(--t3)'} bg="color-mix(in srgb, currentColor 12%, transparent)">
                  <Server size={17} />
                </IconBubble>
              }
              title={it.label}
              subtitle={it.url}
              value={it.id === activeId ? t('settings.instancesActive') : undefined}
              onClick={() => nav(`/settings/server/edit?id=${it.id}`)}
              last={i === instances.length - 1}
            />
          ))}
        </Rows>
      </Group>

      <Button variant="glass" className="mt-4 w-full" onClick={() => nav('/settings/server/edit')}>
        <Plus size={15} /> {t('settings.instancesAdd')}
      </Button>

      <p className="mt-4 px-2 text-[12px] leading-relaxed text-t3">{t('settings.instancesListNote')}</p>
    </Screen>
  )
}

/** Add / edit one instance: the form verifies connectivity via /status before
 *  saving (connect()), delete falls back to the first remaining instance */
export function InstanceEdit() {
  const { store, activeId, connect, removeInstance, connecting, error } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()
  const confirm = useConfirm()
  const [params] = useSearchParams()
  const editId = params.get('id') ?? undefined
  const target = editId ? store?.instances.find((x) => x.id === editId) : undefined
  const ep = target ? activeEndpoint(target) : undefined
  const isNew = !editId

  const [url, setUrl] = useState(ep?.url ?? '')
  const [username, setUsername] = useState(ep?.username ?? '')
  const [password, setPassword] = useState(ep?.password ?? '')
  // Empty name = derived from the address on save
  const [label, setLabel] = useState(
    target && ep && target.label !== labelFromUrl(ep.url) ? target.label : ''
  )

  // Deep link to an instance that no longer exists: back to the list
  useEffect(() => {
    if (editId && !target) nav('/settings/server', { replace: true })
  }, [editId, target, nav])

  async function save() {
    const ok = await connect(
      { url: url.trim().replace(/\/+$/, ''), username: username.trim(), password },
      { id: editId, label: label.trim() || undefined, activate: isNew }
    )
    if (ok) {
      toast(t('settings.serverSaved'))
      nav('/settings/server', { replace: true })
    }
  }

  function del() {
    if (!editId || !target) return
    const isLast = (store?.instances.length ?? 0) === 1
    confirm({
      title: t('settings.instancesDeleteTitle'),
      message: isLast ? t('settings.instancesDeleteLastMsg') : t('settings.instancesDeleteMsg', { name: target.label }),
      destructive: true,
      confirmText: t('settings.instancesDelete'),
      onConfirm: () => {
        removeInstance(editId)
        nav('/settings/server', { replace: true })
      },
    })
  }

  return (
    <Screen>
      <PageHeader back title={isNew ? t('settings.instancesAddTitle') : t('settings.instancesEditTitle')} />

      <GroupTitle>{t('settings.connectionGroup')}</GroupTitle>
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.1.2:3000" inputMode="url" autoCapitalize="off" />
          <div className="grid grid-cols-2 gap-3">
            <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('settings.usernamePlaceholder')} autoCapitalize="off" />
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('settings.passwordPlaceholder')} />
          </div>
          <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('settings.instancesNamePlaceholder')} autoCapitalize="off" />
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="flex gap-2.5">
            <Button className="flex-1" loading={connecting} disabled={!url.trim() || !username.trim()} onClick={save}>
              <Server size={15} /> {t('common.save')}
            </Button>
            {!isNew && (
              <Button variant="glass" className="flex-1" onClick={del}>
                <Trash size={15} /> {t('settings.instancesDelete')}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <p className="mt-4 px-2 text-[12px] leading-relaxed text-t3">{t('settings.serverNote')}</p>
    </Screen>
  )
}

/* ================= About ================= */

export function AboutSettings() {
  const { t } = useTranslation()
  return (
    <Screen>
      <PageHeader back title={t('settings.aboutTitle')} />

      <GroupTitle>{t('settings.aboutGroup')}</GroupTitle>
      <Group>
        <Rows>
          <Row icon={<IconBubble color="var(--accent)" bg="var(--accent-soft)"><Info size={17} /></IconBubble>} title={APP_NAME} value={'v' + APP_VERSION} />
          <Row
            icon={<IconBubble color="var(--violet)" bg="var(--violet-soft)"><Network size={17} /></IconBubble>}
            title={t('settings.compatibility')}
            subtitle={t('settings.compatibilitySub')}
            last
          />
        </Rows>
      </Group>
    </Screen>
  )
}