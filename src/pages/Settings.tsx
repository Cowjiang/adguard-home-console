/** 设置中心 + 通用设置 + 系统管理 + 外观/服务器连接/关于 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import {
  ScrollText, Network, Lock, Wifi, Wrench,
  Trash, RotateCcw, DownloadCloud, Server, LogOut, SunMoon,
  Info, Eraser, ShieldQuestion,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { api, swrFetcher, type QueryLogConfig, type StatsConfig, type VersionInfo } from '../lib/api'
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
  const isDesktop = useIsDesktop()

  const serverItems = [
    { icon: <ScrollText size={17} />, color: 'var(--accent-2)', title: '查询日志与统计', desc: '保留时长、隐私选项', to: '/settings/general' },
    { icon: <Network size={17} />, color: 'var(--accent)', title: 'DNS 设置', desc: '上游、缓存、DNSSEC、拦截模式', to: '/settings/dns' },
    { icon: <Wrench size={17} />, color: 'var(--violet)', title: '访问控制', desc: '允许/阻止的客户端与域名', to: '/settings/access' },
    { icon: <Lock size={17} />, color: 'var(--warn)', title: '加密设置', desc: 'HTTPS、DoH、DoT、DoQ 证书', to: '/settings/encryption' },
    { icon: <Wifi size={17} />, color: 'var(--ok)', title: 'DHCP 服务器', desc: '地址分配与静态租约', to: '/settings/dhcp' },
    { icon: <ShieldQuestion size={17} />, color: 'var(--danger)', title: '系统管理', desc: '版本更新、重置数据', to: '/settings/system' },
  ]
  const appItems = [
    { icon: <SunMoon size={17} />, color: 'var(--accent-2)', title: '外观', desc: '主题:跟随系统 / 浅色 / 深色', to: '/settings/appearance' },
    { icon: <Server size={17} />, color: 'var(--accent)', title: '服务器连接', desc: '地址、凭据与重新连接', to: '/settings/server' },
    { icon: <Info size={17} />, color: 'var(--violet)', title: '关于', desc: `${APP_NAME} v${APP_VERSION}`, to: '/settings/about' },
  ]

  const groups = [
    { title: '服务器设置', items: serverItems },
    { title: '应用设置', items: appItems },
  ]

  return (
    <Screen>
      <PageHeader title="设置" />

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
  const pick = usePick({ menuOnMobile: true })
  const { data: ql, mutate: mQl } = useSWR<QueryLogConfig>(cfg ? ['qlc', cfg, '/querylog/config'] : null, swrFetcher)
  const { data: sc, mutate: mSc } = useSWR<StatsConfig>(cfg ? ['stc', cfg, '/stats/config'] : null, swrFetcher)

  // v0.107.79 新版 API 的 interval 单位是毫秒(GET 返回 604800000 = 7 天)
  const HOUR = 3_600_000
  const DAY = 86_400_000
  const QL_RETENTIONS = [
    { label: '6 小时', value: 6 * HOUR },
    { label: '1 天', value: DAY },
    { label: '7 天', value: 7 * DAY },
    { label: '30 天', value: 30 * DAY },
    { label: '90 天', value: 90 * DAY },
  ]
  const STAT_RETENTIONS = [
    { label: '1 天', value: DAY },
    { label: '7 天', value: 7 * DAY },
    { label: '30 天', value: 30 * DAY },
    { label: '90 天', value: 90 * DAY },
  ]

  async function saveQl(patch: Partial<QueryLogConfig>) {
    if (!cfg || !ql) return
    try {
      await api(cfg, '/querylog/config/update', { method: 'PUT', body: { ...ql, ...patch } })
      mQl()
      toast('查询日志设置已保存')
    } catch (e: any) {
      toast('保存失败:' + e.message, 'err')
    }
  }
  async function saveSc(patch: Partial<StatsConfig>) {
    if (!cfg || !sc) return
    try {
      await api(cfg, '/stats/config/update', { method: 'PUT', body: { ...sc, ...patch } })
      mSc()
      toast('统计设置已保存')
    } catch (e: any) {
      toast('保存失败:' + e.message, 'err')
    }
  }

  return (
    <Screen>
      <PageHeader back title="查询日志与统计" />

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle>查询日志</GroupTitle>
          <Group>
        <Rows>
          <Row
            title="启用查询日志"
            subtitle="记录所有 DNS 请求"
            right={<Switch on={ql?.enabled ?? false} onChange={(v) => saveQl({ enabled: v })} />}
          />
          <Row
            title="日志保留时长"
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
                title: '日志保留时长',
                anchor: e.currentTarget,
                align: 'right',
                value: ql?.interval,
                options: QL_RETENTIONS,
                onPick: (v) => saveQl({ interval: v }),
              })
            }}
          />
          <Row
            title="匿名化客户端 IP"
            subtitle="日志中隐藏客户端 IP 的最后一段"
            right={<Switch on={ql?.anonymize_client_ip ?? false} onChange={(v) => saveQl({ anonymize_client_ip: v })} />}
            last
          />
        </Rows>
      </Group>
        </div>
        <div>
          <GroupTitle>统计信息</GroupTitle>
          <Group>
        <Rows>
          <Row
            title="启用统计"
            subtitle="仪表盘图表与 Top 榜单的数据来源"
            right={<Switch on={sc?.enabled ?? true} onChange={(v) => saveSc({ enabled: v })} />}
          />
          <Row
            title="统计保留时长"
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
                title: '统计保留时长',
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
        缩短保留时长可显著减少磁盘占用。查询日志用于排查问题,统计用于仪表盘展示。
      </p>
    </Screen>
  )
}

/* ================= 系统管理 ================= */

export function SystemPage() {
  const { cfg, status } = useAuth()
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
      if (r.disabled) toast('服务器已禁用更新检查')
      else if (r.new_version && r.new_version !== status?.version) toast('发现新版本 ' + r.new_version)
      else toast('已是最新版本')
    } catch (e: any) {
      toast('检查失败:' + e.message, 'err')
    } finally {
      setChecking(false)
    }
  }

  async function autoUpdate() {
    if (!cfg) return
    setUpdating(true)
    try {
      await api(cfg, '/update', { method: 'POST', body: {} })
      toast('自动更新已开始,服务器将自动重启')
    } catch (e: any) {
      toast('更新失败:' + e.message, 'err')
    } finally {
      setUpdating(false)
    }
  }

  async function maintenance(path: string, title: string) {
    if (!cfg) return
    try {
      await api(cfg, path, { method: 'POST', body: {} })
      toast(title + '完成')
    } catch (e: any) {
      toast(title + '失败:' + e.message, 'err')
    }
  }

  const hasNew = versionInfo?.new_version && versionInfo.new_version !== status?.version

  return (
    <Screen>
      <PageHeader back title="系统管理" />

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle>版本</GroupTitle>
          <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[15px] font-semibold text-t1">AdGuard Home</p>
            <p className="text-[13px] text-t2 num">当前版本 {status?.version ?? '—'}</p>
          </div>
          <Button variant="glass" size="sm" loading={checking} onClick={checkUpdate}>
            <DownloadCloud size={14} /> 检查更新
          </Button>
        </div>
        {versionInfo && !versionInfo.disabled && (
          <div className="mt-3 rounded-2xl px-4 py-3" style={{ background: 'var(--accent-soft)' }}>
            <div className="flex items-center gap-2">
              <Badge kind={hasNew ? 'ok' : 'info'}>{hasNew ? `新版本 ${versionInfo.new_version}` : '已是最新'}</Badge>
            </div>
            {versionInfo.announcement && <p className="mt-1.5 text-[12.5px] leading-relaxed text-t2">{versionInfo.announcement}</p>}
            {hasNew && versionInfo.can_autoupdate && (
              <Button size="sm" className="mt-2.5" loading={updating} onClick={() => confirm({
                title: '自动更新 AdGuard Home?',
                message: '更新过程中 DNS 服务会短暂中断,完成后自动恢复。建议在低峰期进行。',
                confirmText: '开始更新',
                onConfirm: autoUpdate,
              })}>
                一键自动更新
              </Button>
            )}
          </div>
        )}
      </Card>
        </div>
        <div>
          <GroupTitle>维护</GroupTitle>
          <Group>
        <Rows>
          <Row
            icon={<IconBubble color="var(--accent-2)" bg="color-mix(in srgb, var(--accent-2) 14%, transparent)"><Eraser size={17} /></IconBubble>}
            title="清除 DNS 缓存"
            subtitle="立即丢弃全部缓存记录"
            onClick={() => maintenance('/cache_clear', '清除缓存')}
          />
          <Row
            icon={<IconBubble color="var(--warn)" bg="var(--warn-soft)"><RotateCcw size={17} /></IconBubble>}
            title="重置统计数据"
            subtitle="清空仪表盘全部历史统计"
            onClick={() => confirm({
              title: '重置全部统计?',
              message: '仪表盘的图表、Top 榜单将被清空,此操作不可恢复。',
              destructive: true,
              confirmText: '重置',
              onConfirm: () => maintenance('/stats_reset', '重置统计'),
            })}
          />
          <Row
            icon={<IconBubble color="var(--danger)" bg="var(--danger-soft)"><Trash size={17} /></IconBubble>}
            title="清空查询日志"
            subtitle="删除所有已记录的 DNS 查询"
            onClick={() => confirm({
              title: '清空查询日志?',
              message: '所有查询日志将被永久删除。',
              destructive: true,
              confirmText: '清空',
              onConfirm: () => maintenance('/querylog_clear', '清空日志'),
            })}
            last
          />
        </Rows>
      </Group>
        </div>
      </div>

      {status && (
        <p className="mt-4 px-2 text-center text-[11.5px] text-t3 num">
          启动于 {fmtDate(new Date(status.start_time).toISOString())}
        </p>
      )}
    </Screen>
  )
}

/* ================= 外观 ================= */

export function AppearanceSettings() {
  const { theme, setTheme } = useAuth()
  return (
    <Screen>
      <PageHeader back title="外观" />

      <GroupTitle>主题</GroupTitle>
      <Card className="p-4">
        <div className="mb-2.5 flex items-center gap-2 text-[13.5px] font-medium text-t1">
          <SunMoon size={15} className="text-t2" /> 外观模式
        </div>
        <Segmented
          value={theme}
          onChange={(v) => setTheme(v as ThemeSetting)}
          options={[
            { value: 'auto', label: '跟随系统' },
            { value: 'light', label: '浅色' },
            { value: 'dark', label: '深色' },
          ]}
        />
      </Card>

      <p className="mt-4 px-2 text-[12px] leading-relaxed text-t3">
        选择“跟随系统”时,深色模式随操作系统的外观设置自动切换。
      </p>
    </Screen>
  )
}

/* ================= 服务器连接 ================= */

export function ServerSettings() {
  const { cfg, connect, logout } = useAuth()
  const nav = useNavigate()
  const [url, setUrl] = useState(cfg?.url ?? '')
  const [username, setUsername] = useState(cfg?.username ?? '')
  const [password, setPassword] = useState(cfg?.password ?? '')
  const [saving, setSaving] = useState(false)

  async function saveServer() {
    setSaving(true)
    const ok = await connect({ url: url.trim().replace(/\/+$/, ''), username: username.trim(), password })
    setSaving(false)
    if (ok) toast('服务器配置已更新')
  }

  return (
    <Screen>
      <PageHeader back title="服务器连接" />

      <GroupTitle>连接</GroupTitle>
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.1.2:3000" inputMode="url" autoCapitalize="off" />
          <div className="grid grid-cols-2 gap-3">
            <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" autoCapitalize="off" />
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码" />
          </div>
          <div className="flex gap-2.5">
            <Button className="flex-1" loading={saving} onClick={saveServer}>
              <Server size={15} /> 重新连接
            </Button>
            <Button variant="glass" className="flex-1" onClick={() => { logout(); nav('/login', { replace: true }) }}>
              <LogOut size={15} /> 退出登录
            </Button>
          </div>
        </div>
      </Card>

      <p className="mt-4 px-2 text-[12px] leading-relaxed text-t3">
        凭据仅保存在本机浏览器中,所有请求经本服务代理转发到 AdGuard Home。
      </p>
    </Screen>
  )
}

/* ================= 关于 ================= */

export function AboutSettings() {
  return (
    <Screen>
      <PageHeader back title="关于" />

      <GroupTitle>应用</GroupTitle>
      <Group>
        <Rows>
          <Row icon={<IconBubble color="var(--accent)" bg="var(--accent-soft)"><Info size={17} /></IconBubble>} title={APP_NAME} value={'v' + APP_VERSION} />
          <Row
            icon={<IconBubble color="var(--violet)" bg="var(--violet-soft)"><Network size={17} /></IconBubble>}
            title="兼容性"
            subtitle="AdGuard Home v0.107.79+ 全新 API"
            last
          />
        </Rows>
      </Group>
    </Screen>
  )
}