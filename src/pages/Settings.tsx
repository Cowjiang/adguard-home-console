/** 设置中心 + 通用设置 + 系统管理 + 外观/服务器连接/关于 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import {
  ScrollText, Network, Lock, Wifi, Wrench,
  Trash, RotateCcw, DownloadCloud, Server, LogOut, SunMoon,
  Info, Eraser, ShieldQuestion, Languages,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/auth'
import { api, swrFetcher, type QueryLogConfig, type StatsConfig, type VersionInfo } from '../lib/api'
import { setAppLang, type Lang } from '../lib/i18n'
import {
  PageHeader, Screen, Card, Group, GroupTitle, Rows, Row, Switch, Button,
  useConfirm, toast, Segmented, Badge, usePick, PickSelect,
} from '../components/ui'
import { IconBubble } from './Protection'
import { isAppleMobile } from '../lib/nativePickers'
import { hoursLabel, fmtDate } from '../lib/format'
import { APP_NAME, APP_VERSION } from '../lib/constants'
import type { ThemeSetting } from '../lib/auth'
import { useIsDesktop } from '../lib/useIsDesktop'


/* ================= 设置中心 ================= */

export default function Settings() {
  const nav = useNavigate()
  const { t } = useTranslation()
  const isDesktop = useIsDesktop()

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

  const groups = [
    { title: t('settings.groupServer'), items: serverItems },
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

/* ================= 通用设置 ================= */

export function GeneralSettings() {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const pick = usePick()
  const { data: ql, mutate: mQl } = useSWR<QueryLogConfig>(cfg ? ['qlc', cfg, '/querylog/config'] : null, swrFetcher)
  const { data: sc, mutate: mSc } = useSWR<StatsConfig>(cfg ? ['stc', cfg, '/stats/config'] : null, swrFetcher)

  // v0.107.79 新版 API 的 interval 单位是毫秒(GET 返回 604800000 = 7 天)
  const HOUR = 3_600_000
  const DAY = 86_400_000
  // 档位标签直接用 hoursLabel(走 units 词典),与格式化输出保持一致
  const QL_RETENTIONS = [6, 24, 168, 720, 2160].map((h) => ({ label: hoursLabel(h), value: h * HOUR }))
  const STAT_RETENTIONS = [24, 168, 720, 2160].map((h) => ({ label: hoursLabel(h), value: h * DAY }))

  async function saveQl(patch: Partial<QueryLogConfig>) {
    if (!cfg || !ql) return
    try {
      await api(cfg, '/querylog/config/update', { method: 'PUT', body: { ...ql, ...patch } })
      mQl()
      toast(t('settings.queryLogSaved'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
    }
  }
  async function saveSc(patch: Partial<StatsConfig>) {
    if (!cfg || !sc) return
    try {
      await api(cfg, '/stats/config/update', { method: 'PUT', body: { ...sc, ...patch } })
      mSc()
      toast(t('settings.statsSaved'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
    }
  }

  return (
    <Screen>
      <PageHeader back title={t('settings.itemQueryStats')} />

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle>{t('settings.queryLogGroup')}</GroupTitle>
          <Group>
        <Rows>
          <Row
            title={t('settings.enableQueryLog')}
            subtitle={t('settings.enableQueryLogSub')}
            right={<Switch on={ql?.enabled ?? false} onChange={(v) => saveQl({ enabled: v })} />}
          />
          <Row
            title={t('settings.logRetention')}
            value={isAppleMobile() ? undefined : (ql ? hoursLabel(ql.interval / HOUR) : '…')}
            right={isAppleMobile() ? (
              <div className="w-28 flex-none">
                <PickSelect
                  className="field num !py-1.5 !pr-8 text-right"
                  value={ql?.interval}
                  options={QL_RETENTIONS}
                  onPick={(v) => saveQl({ interval: v })}
                />
              </div>
            ) : undefined}
            onClick={isAppleMobile() ? undefined : (e) => {
              pick({
                title: t('settings.logRetention'),
                anchor: e.currentTarget,
                align: 'right',
                value: ql?.interval,
                options: QL_RETENTIONS,
                onPick: (v) => saveQl({ interval: v }),
              })
            }}
          />
          <Row
            title={t('settings.anonymizeIp')}
            subtitle={t('settings.anonymizeIpSub')}
            right={<Switch on={ql?.anonymize_client_ip ?? false} onChange={(v) => saveQl({ anonymize_client_ip: v })} />}
            last
          />
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
            right={<Switch on={sc?.enabled ?? true} onChange={(v) => saveSc({ enabled: v })} />}
          />
          <Row
            title={t('settings.statsRetention')}
            value={isAppleMobile() ? undefined : (sc ? hoursLabel(sc.interval / HOUR) : '…')}
            right={isAppleMobile() ? (
              <div className="w-28 flex-none">
                <PickSelect
                  className="field num !py-1.5 !pr-8 text-right"
                  value={sc?.interval}
                  options={STAT_RETENTIONS}
                  onPick={(v) => saveSc({ interval: v })}
                />
              </div>
            ) : undefined}
            onClick={isAppleMobile() ? undefined : (e) => {
              pick({
                title: t('settings.statsRetention'),
                anchor: e.currentTarget,
                align: 'right',
                value: sc?.interval,
                options: STAT_RETENTIONS,
                onPick: (v) => saveSc({ interval: v }),
              })
            }}
            last
          />
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

/* ================= 系统管理 ================= */

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

  // doneKey/failKey 指向 settings 域的完成/失败 toast
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

/* ================= 外观 ================= */

export function AppearanceSettings() {
  const { theme, setTheme } = useAuth()
  const { t, i18n } = useTranslation()
  const lang: Lang = i18n.language === 'en' ? 'en' : 'zh'
  return (
    <Screen>
      <PageHeader back title={t('settings.appearance')} />

      <GroupTitle>{t('settings.themeGroup')}</GroupTitle>
      <Card className="p-4">
        <div className="mb-2.5 flex items-center gap-2 text-[13.5px] font-medium text-t1">
          <SunMoon size={15} className="text-t2" /> {t('settings.appearanceMode')}
        </div>
        <Segmented
          value={theme}
          onChange={(v) => setTheme(v as ThemeSetting)}
          options={[
            { value: 'auto', label: t('settings.themeAuto') },
            { value: 'light', label: t('settings.themeLight') },
            { value: 'dark', label: t('settings.themeDark') },
          ]}
        />
      </Card>

      <GroupTitle>{t('settings.language')}</GroupTitle>
      <Card className="p-4">
        <div className="mb-2.5 flex items-center gap-2 text-[13.5px] font-medium text-t1">
          <Languages size={15} className="text-t2" /> {t('settings.language')}
        </div>
        {/* 语言名以各自语言原文展示(中文 / English),不随界面语言翻译 */}
        <Segmented
          value={lang}
          onChange={(v) => setAppLang(v as Lang)}
          options={[
            { value: 'zh', label: '中文' },
            { value: 'en', label: 'English' },
          ]}
        />
      </Card>

      <p className="mt-4 px-2 text-[12px] leading-relaxed text-t3">
        {t('settings.themeHint')}
      </p>
    </Screen>
  )
}

/* ================= 服务器连接 ================= */

export function ServerSettings() {
  const { cfg, connect, logout } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()
  const [url, setUrl] = useState(cfg?.url ?? '')
  const [username, setUsername] = useState(cfg?.username ?? '')
  const [password, setPassword] = useState(cfg?.password ?? '')
  const [saving, setSaving] = useState(false)

  async function saveServer() {
    setSaving(true)
    const ok = await connect({ url: url.trim().replace(/\/+$/, ''), username: username.trim(), password })
    setSaving(false)
    if (ok) toast(t('settings.serverSaved'))
  }

  return (
    <Screen>
      <PageHeader back title={t('settings.serverTitle')} />

      <GroupTitle>{t('settings.connectionGroup')}</GroupTitle>
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.1.2:3000" inputMode="url" autoCapitalize="off" />
          <div className="grid grid-cols-2 gap-3">
            <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('settings.usernamePlaceholder')} autoCapitalize="off" />
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('settings.passwordPlaceholder')} />
          </div>
          <div className="flex gap-2.5">
            <Button className="flex-1" loading={saving} onClick={saveServer}>
              <Server size={15} /> {t('settings.reconnect')}
            </Button>
            <Button variant="glass" className="flex-1" onClick={() => { logout(); nav('/login', { replace: true }) }}>
              <LogOut size={15} /> {t('settings.logout')}
            </Button>
          </div>
        </div>
      </Card>

      <p className="mt-4 px-2 text-[12px] leading-relaxed text-t3">
        {t('settings.serverNote')}
      </p>
    </Screen>
  )
}

/* ================= 关于 ================= */

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