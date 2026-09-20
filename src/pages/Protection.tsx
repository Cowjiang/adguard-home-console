/** 过滤器中心:过滤规则入口 + 内容安全开关 + 过滤常规(防护总开关在概览页) */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import {
  ListFilter, CheckCircle, FileCode2, AppWindow, ArrowLeftRight, ScanSearch,
  ShieldAlert, Baby, SearchCheck, Timer, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { api, swrFetcher, type FilteringStatus, type RewriteEntry } from '../lib/api'
import { Card, Group, GroupTitle, Rows, Row, Switch, Badge, useSheet, Button, toast } from '../components/ui'
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

export default function Protection() {
  const nav = useNavigate()
  const { cfg } = useAuth()
  const sheet = useSheet()
  const [refreshing, setRefreshing] = useState(false)

  const { data: filtering, mutate: mFiltering } = useSWR<FilteringStatus>(cfg ? ['fs', cfg, '/filtering/status'] : null, swrFetcher, { refreshInterval: 15000 })
  const { data: rewrites } = useSWR<{ total: number } | RewriteEntry[]>(cfg ? ['rw', cfg, '/rewrite/list'] : null, swrFetcher)
  const { data: bsCurrent } = useSWR<{ ids: string[] }>(cfg ? ['bsg', cfg, '/blocked_services/get'] : null, swrFetcher)
  const { data: sb, mutate: mSb } = useSWR<any>(cfg ? ['sb', cfg, '/safesearch/status'] : null, swrFetcher)
  const { data: sbB, mutate: mSbB } = useSWR<any>(cfg ? ['sbb', cfg, '/safebrowsing/status'] : null, swrFetcher)
  const { data: pc, mutate: mPc } = useSWR<any>(cfg ? ['pc', cfg, '/parental/status'] : null, swrFetcher)

  const rewriteCount = Array.isArray(rewrites) ? rewrites.length : (rewrites as any)?.total ?? 0
  const filterCount = filtering?.filters?.length ?? 0
  const allowCount = filtering?.whitelist_filters?.length ?? 0
  const ruleCount = (filtering?.user_rules ?? []).filter((r) => r && !r.trim().startsWith('!') && !r.trim().startsWith('#')).length

  // 状态卡:规则总数 = 启用的过滤器规则之和 + 自定义规则;上次更新取所有过滤器最近一次
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
      toast(enabled ? '过滤已开启' : '过滤已关闭')
    } catch (e: any) {
      toast('操作失败:' + e.message, 'err')
    }
  }

  async function refreshAllFilters() {
    if (!cfg) return
    setRefreshing(true)
    try {
      // /filtering/refresh 一次只刷一侧,黑白名单各调一次
      const [a, b] = await Promise.all([
        api<{ updated: number }>(cfg, '/filtering/refresh', { method: 'POST', body: { whitelist: false } }),
        api<{ updated: number }>(cfg, '/filtering/refresh', { method: 'POST', body: { whitelist: true } }),
      ])
      mFiltering()
      toast(`过滤器已更新,共 ${(a?.updated ?? 0) + (b?.updated ?? 0)} 条规则`)
    } catch (e: any) {
      toast('更新失败:' + e.message, 'err')
    } finally {
      setRefreshing(false)
    }
  }

  async function toggleEndpoint(path: string, on: boolean, mutate: () => void) {
    if (!cfg) return
    try {
      await api(cfg, `/${path}/${on ? 'enable' : 'disable'}`, { method: 'POST', body: {} })
      mutate()
      toast(on ? '已开启' : '已关闭')
    } catch (e: any) {
      toast('操作失败:' + e.message, 'err')
    }
  }  async function saveSafeSearch(enabled: boolean, engines: Record<string, boolean>) {
    if (!cfg) return
    try {
      await api(cfg, '/safesearch/settings', { method: 'PUT', body: { enabled, ...engines } })
      toast('安全搜索设置已保存')
    } catch (e: any) {
      toast('保存失败:' + e.message, 'err')
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
    <div className="page-in mx-auto w-full page-shell px-4">
      <h1 className="mb-4 text-[26px] font-bold tracking-tight text-t1">过滤器</h1>

      {/* 过滤器状态:移动端两个独立小方块(尺寸与概览页 StatTile 一致,圆形按钮在右侧居中);桌面端长条卡 */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:hidden">
        <div className="glass specular relative overflow-hidden rounded-2xl px-3.5 py-3">
          <div className="text-[12px] text-t2">规则总数</div>
          <div className="mt-0.5 text-[22px] font-bold leading-tight num" style={{ color: 'var(--accent)' }}>{fmtNum(totalRules)}</div>
          <div className="text-[11.5px] text-t3 num">含 {ruleCount} 条自定义</div>
        </div>
        <div className="glass specular relative overflow-hidden rounded-2xl px-3.5 py-3">
          <div className="flex items-center">
            <div className="min-w-0 flex-1 pr-1">
              <div className="text-[12px] text-t2">过滤器列表</div>
              <div className="mt-0.5 whitespace-nowrap text-[22px] font-bold leading-tight num">
                <span style={{ color: 'var(--danger)' }}>黑{filterCount}</span>
                <span className="text-t3"> / </span>
                <span style={{ color: 'var(--ok)' }}>白{allowCount}</span>
              </div>
              <div className="truncate text-[11.5px] text-t3 num" title={lastUpdated ? fmtDate(lastUpdated) : undefined}>
                {lastUpdated ? `${relTime(lastUpdated)}更新` : '从未更新'}
              </div>
            </div>
            <Button
              variant="glass"
              size="sm"
              className="!h-9 !w-9 !flex-none !rounded-full !p-0"
              loading={refreshing}
              onClick={refreshAllFilters}
              label="立即更新过滤器"
            >
              <RefreshCw size={15} />
            </Button>
          </div>
        </div>
      </div>
      <Card className="mb-4 hidden lg:flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
          <div>
            <div className="text-[12px] text-t2">规则总数</div>
            <div className="text-[20px] font-bold leading-tight num text-t1">{fmtNum(totalRules)}</div>
            <div className="text-[11.5px] text-t3">含 {ruleCount} 条自定义规则</div>
          </div>
          <div>
            <div className="text-[12px] text-t2">过滤器列表</div>
            <div className="text-[20px] font-bold leading-tight num text-t1">{filterCount + allowCount}</div>
            <div className="text-[11.5px] text-t3">黑名单 {filterCount} · 白名单 {allowCount}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[12px] text-t2">上次更新</div>
            <div className="text-[20px] font-bold leading-tight num text-t1">{lastUpdated ? relTime(lastUpdated) : '—'}</div>
            <div className="text-[11.5px] text-t3">每 {filtering ? hoursLabel(filtering.interval) : '…'} 自动更新</div>
          </div>
          <div className="ml-auto">
            <Button variant="glass" loading={refreshing} onClick={refreshAllFilters}>
              <RefreshCw size={15} /> 立即更新
            </Button>
          </div>
      </Card>

      {/* 桌面两列:左=过滤功能,右=安全防护+常规;移动端保持原纵向顺序 */}
      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle className="lg:mt-0">过滤功能</GroupTitle>
          <Group>
        <Rows>
          <Row
            icon={<IconBubble color="var(--danger)" bg="var(--danger-soft)"><ListFilter size={17} /></IconBubble>}
            title="黑名单过滤器"
            subtitle={`广告与跟踪规则库 · ${filterCount} 个列表${ruleCount ? ` · ${ruleCount} 条自定义规则` : ''}`}
            onClick={() => nav('/protection/filters')}
          />
          <Row
            icon={<IconBubble color="var(--ok)" bg="var(--ok-soft)"><CheckCircle size={17} /></IconBubble>}
            title="白名单过滤器"
            subtitle={`${allowCount} 个例外列表`}
            onClick={() => nav('/protection/allowlist')}
          />
          <Row
            icon={<IconBubble color="var(--violet)" bg="var(--violet-soft)"><FileCode2 size={17} /></IconBubble>}
            title="自定义过滤规则"
            subtitle="直接编写 AdGuard 过滤语法"
            onClick={() => nav('/protection/rules')}
          />
          <Row
            icon={<IconBubble color="var(--warn)" bg="var(--warn-soft)"><AppWindow size={17} /></IconBubble>}
            title="拦截服务"
            subtitle={`按服务拦截(YouTube、抖音等)· 已选 ${bsCurrent?.ids?.length ?? 0} 个`}
            onClick={() => nav('/protection/services')}
          />
          <Row
            icon={<IconBubble color="var(--accent-2)" bg="color-mix(in srgb, var(--accent-2) 14%, transparent)"><ArrowLeftRight size={17} /></IconBubble>}
            title="DNS 重写"
            subtitle={`自定义域名解析记录 · ${rewriteCount} 条`}
            onClick={() => nav('/rewrites')}
          />
          <Row
            icon={<IconBubble color="var(--accent)" bg="var(--accent-soft)"><ScanSearch size={17} /></IconBubble>}
            title="规则检测工具"
            subtitle="测试某域名会被哪条规则命中"
            onClick={() => nav('/protection/check')}
            last
          />
        </Rows>
      </Group>
        </div>
        <div>
          <GroupTitle className="lg:mt-0">安全防护</GroupTitle>
          <Group>
        <Rows>
          <Row
            icon={<IconBubble color="var(--accent)" bg="var(--accent-soft)"><ShieldAlert size={17} /></IconBubble>}
            title="浏览安全防护"
            subtitle="拦截钓鱼与恶意软件域名"
            right={<Switch on={!!sbB?.enabled} onChange={(v) => toggleEndpoint('safebrowsing', v, mSbB)} />}
          />
          <Row
            icon={<IconBubble color="var(--violet)" bg="var(--violet-soft)"><Baby size={17} /></IconBubble>}
            title="家长控制"
            subtitle="限制成人内容"
            right={<Switch on={!!pc?.enabled} onChange={(v) => toggleEndpoint('parental', v, mPc)} />}
          />
          <Row
            icon={<IconBubble color="var(--warn)" bg="var(--warn-soft)"><SearchCheck size={17} /></IconBubble>}
            title="安全搜索"
            subtitle="搜索引擎强制过滤成人结果"
            right={<Switch on={!!sb?.enabled} onChange={(v) => { saveSafeSearch(v, SAFE_ENGINES.reduce((a, e) => ({ ...a, [e.key]: !!sb?.[e.key] }), {})); mSb() }} />}
            onClick={openSafeSearchSheet}
            last
          />
        </Rows>
      </Group>

      <GroupTitle>常规</GroupTitle>
      <Group>
        <Rows>
          <Row
            icon={<IconBubble color="var(--accent-2)" bg="color-mix(in srgb, var(--accent-2) 14%, transparent)"><ListFilter size={17} /></IconBubble>}
            title="启用过滤"
            subtitle="总过滤开关,DNS 层防护的暂停/恢复在概览页"
            right={<Switch on={filtering?.enabled ?? false} onChange={toggleFiltering} />}
          />
          <Row
            icon={<IconBubble color="var(--t2)" bg="var(--glass)"><Timer size={17} /></IconBubble>}
            title="过滤器更新间隔"
            value={filtering ? hoursLabel(filtering.interval) : '…'}
            onClick={() => nav('/protection/filters')}
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
  const [enabled, setEnabled] = useState(initial)
  const [eng, setEng] = useState({ ...engines })
  return (
    <div>
      <div className="glass mb-3 flex items-center justify-between rounded-2xl px-4 py-3">
        <span className="text-[15px] font-medium text-t1">启用安全搜索</span>
        <Switch
          on={enabled}
          onChange={(v) => {
            setEnabled(v)
            onChange(v, eng)
          }}
        />
      </div>
      <p className="mb-1.5 px-2 text-[12.5px] font-semibold text-t3">对以下搜索引擎生效</p>
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
        保存
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
