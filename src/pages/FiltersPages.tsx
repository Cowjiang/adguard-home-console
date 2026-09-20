/** 过滤器管理:黑/白名单列表、自定义规则、拦截服务 */
import { useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import {
  Plus, RefreshCw, Trash2, Globe2, Search, Ban, ExternalLink,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { api, swrFetcher, type FilteringStatus, type Filter, type BlockedService, type SvrConfig } from '../lib/api'
import {
  PageHeader, Screen, Card, Group, GroupTitle, Rows, Row, Switch, Button,
  Loading, EmptyState, useSheet, useConfirm, toast, SearchBar, Badge, usePick, Chip,
} from '../components/ui'
import { IconBubble } from './Protection'
import { hoursLabel, relTime, fmtNum } from '../lib/format'
import { SERVICE_CACHE_KEY } from '../lib/constants'


/* ================= 黑名单 / 白名单过滤器 ================= */

export function FiltersPage({ whitelist }: { whitelist: boolean }) {
  const { cfg } = useAuth()
  const sheet = useSheet()
  const pick = usePick()
  const confirm = useConfirm()
  const [refreshing, setRefreshing] = useState(false)

  const { data, mutate, isLoading } = useSWR<FilteringStatus>(
    cfg ? ['fs', cfg, '/filtering/status'] : null, swrFetcher, { refreshInterval: 20000 }
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
      toast('操作失败:' + e.message, 'err')
    }
  }

  async function removeFilter(f: Filter) {
    if (!cfg) return
    try {
      await api(cfg, '/filtering/remove_url', { method: 'POST', body: { url: f.url, whitelist } })
      mutate()
      toast('已删除过滤器')
    } catch (e: any) {
      toast('删除失败:' + e.message, 'err')
    }
  }

  async function refreshAll() {
    if (!cfg) return
    setRefreshing(true)
    try {
      await api(cfg, '/filtering/refresh', { method: 'POST', body: { whitelist } })
      mutate()
      toast('过滤器更新完成')
    } catch (e: any) {
      toast('更新失败:' + e.message, 'err')
    } finally {
      setRefreshing(false)
    }
  }

  async function saveInterval(hours: number) {
    if (!cfg || !data) return
    try {
      await api(cfg, '/filtering/config', { method: 'POST', body: { enabled: data.enabled, interval: hours } })
      mutate()
      toast('更新间隔已保存')
    } catch (e: any) {
      toast('保存失败:' + e.message, 'err')
    }
  }

  function openAddSheet() {
    let name = ''
    let url = ''
    sheet.open(
      <div>
        <p className="mb-4 text-center text-[17px] font-bold text-t1">添加过滤器</p>
        <div className="flex flex-col gap-3">
          <input className="field" placeholder="名称(可选,如 anti-AD)" onChange={(e) => (name = e.target.value)} />
          <input className="field" placeholder="https://example.com/list.txt" inputMode="url" onChange={(e) => (url = e.target.value)} />
          <Button
            size="lg"
            className="mt-1"
            onClick={async () => {
              if (!url.trim()) return toast('请输入 URL', 'err')
              try {
                await api(cfg!, '/filtering/add_url', { method: 'POST', body: { name: name.trim(), url: url.trim(), whitelist } })
                mutate()
                sheet.close()
                toast('过滤器已添加')
              } catch (e: any) {
                toast('添加失败:' + e.message, 'err')
              }
            }}
          >
            添加
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Screen>
      <PageHeader back title={whitelist ? '白名单过滤器' : '黑名单过滤器'} subtitle={`${filters.length} 个列表 · 更新间隔 ${data ? hoursLabel(data.interval) : '…'}`} right={
        <button onClick={refreshAll} className="press glass flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-t1">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> 更新
        </button>
      } />

      {isLoading && <Loading />}
      {!isLoading && filters.length === 0 && (
        <EmptyState icon={<Globe2 size={30} className="text-t3" />} title="还没有过滤器" subtitle="添加一个规则列表开始工作,例如 https://anti-ad.net/adguard.txt" />
      )}

      <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
        {filters.map((f) => (
          <Card key={f.id} className="!rounded-2xl px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-semibold text-t1">{f.name || '未命名过滤器'}</span>
                  {!f.enabled && <Badge kind="warn">已停用</Badge>}
                </div>
                <p className="mt-0.5 truncate text-[11.5px] text-t3">{f.url}</p>
                <p className="mt-0.5 text-[11.5px] text-t2 num">
                  {fmtNum(f.rules_count)} 条规则 · 更新于 {relTime(f.last_updated ?? '')}
                </p>
              </div>
              <Switch on={f.enabled} onChange={(v) => toggleFilter(f, v)} />
            </div>
            <div className="mt-2.5 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => confirm({
                title: `删除「${f.name}」?`,
                message: '删除后此列表的规则将立即失效。',
                destructive: true,
                confirmText: '删除',
                onConfirm: () => removeFilter(f),
              })}>
                <Trash2 size={13} /> 删除
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <GroupTitle>常规设置</GroupTitle>
      <Group>
        <Rows>
          <Row
            title="过滤器更新间隔"
            value={data ? hoursLabel(data.interval) : '…'}
            onClick={(e) => {
              pick({
                title: '过滤器更新间隔',
                anchor: e.currentTarget,
                align: 'right',
                value: data?.interval,
                options: [1, 12, 24, 72].map((h) => ({ label: hoursLabel(h), value: h })),
                onPick: (v) => saveInterval(v),
              })
            }}
          />
          <Row
            icon={<IconBubble color="var(--accent)" bg="var(--accent-soft)"><Plus size={16} /></IconBubble>}
            title="添加过滤器"
            onClick={openAddSheet}
            last
          />
        </Rows>
      </Group>
    </Screen>
  )
}

/* ================= 自定义过滤规则 ================= */

export function RulesPage() {
  const { cfg } = useAuth()
  const { data, mutate } = useSWR<FilteringStatus>(cfg ? ['fs', cfg, '/filtering/status'] : null, swrFetcher)
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
      toast('规则已保存')
    } catch (e: any) {
      toast('保存失败:' + e.message, 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <PageHeader back title="自定义过滤规则" subtitle={`${activeCount} 条生效规则`} />
      <Card className="p-4">
        <textarea
          className="field"
          style={{ minHeight: 300 }}
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={'||example.com^\n@@||allowed.example.com^$important\n! 注释行'}
          spellCheck={false}
        />
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11.5px] leading-relaxed text-t3">
            支持 AdGuard 语法:<code>||domain^</code> 拦截,
            <code>@@</code> 白名单,<code>$important</code> 高优先级
          </p>
          <Button loading={saving} disabled={draft === null} onClick={save}>
            保存
          </Button>
        </div>
      </Card>
    </Screen>
  )
}

/* ================= 拦截服务 ================= */

/** 拦截服务分类(group_id 来自 /blocked_services/all 目录) */
const SERVICE_GROUPS: { id: string; label: string }[] = [
  { id: 'streaming', label: '流媒体' },
  { id: 'social_network', label: '社交网络' },
  { id: 'gaming', label: '游戏' },
  { id: 'messenger', label: '即时通讯' },
  { id: 'ai', label: '人工智能' },
  { id: 'shopping', label: '购物' },
  { id: 'gambling', label: '博彩' },
  { id: 'dating', label: '交友' },
  { id: 'privacy', label: '隐私' },
  { id: 'hosting', label: '网站托管' },
  { id: 'software', label: '软件' },
  { id: 'cdn', label: '内容分发' },
]

export function ServicesPage() {
  const { cfg } = useAuth()
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState<string>('all')
  const [pending, setPending] = useState<Set<string> | null>(null)
  const { data: catalog } = useSWR<{ blocked_services: BlockedService[] }>(
    cfg ? ['bsAll', cfg, '/blocked_services/all'] : null,
    async ([_k, c, p]) => {
      const cached = localStorage.getItem(SERVICE_CACHE_KEY)
      try {
        const fresh = await api<{ blocked_services: BlockedService[] }>(c as SvrConfig, p as string)
        localStorage.setItem(SERVICE_CACHE_KEY, JSON.stringify(fresh))
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

  // 点击即生效:乐观更新 + 保存队列串行化,期间 pending 保持住,避免"绿→灰→绿"闪烁
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
        toast(on ? `已取消拦截 ${id}` : `已拦截 ${id}`)
      } catch (e: any) {
        mutateCurrent()
        toast('保存失败:' + e.message, 'err')
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
  // 无分类归属的服务归入"其他"
  const otherItems = visible.filter((x) => !SERVICE_GROUPS.some((g) => g.id === x.group_id))
  if (otherItems.length) sections.push({ group: { id: 'other', label: '其他' }, items: otherItems })

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
      <PageHeader back title="拦截服务" subtitle={`已选 ${ids.size} / ${catalog?.blocked_services?.length ?? 0} 个服务`} />
      {/* 吸顶容器自身不拦截指针;吸附位置让出移动端悬浮顶栏,自然位置不留空行 */}
      <div
        className="pointer-events-none sticky top-[calc(env(safe-area-inset-top,0px)+52px)] z-10 -mx-4 px-4 pb-2 lg:top-0"
        style={{ background: 'linear-gradient(var(--bg) 55%, transparent)' }}
      >
        <div className="pointer-events-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="搜索服务,如 YouTube…" />
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <Chip active={group === 'all'} onClick={() => setGroup('all')}>
              全部{ids.size > 0 ? ` ${ids.size}` : ''}
            </Chip>
            {SERVICE_GROUPS.map((g) => {
              const selCount = (catalog?.blocked_services ?? [])
                .filter((x) => x.group_id === g.id && ids.has(x.id)).length
              return (
                <Chip key={g.id} active={group === g.id} onClick={() => setGroup(g.id)}>
                  {g.label}{selCount > 0 ? ` ${selCount}` : ''}
                </Chip>
              )
            })}
          </div>
        </div>
      </div>

      {!catalog && <Loading />}
      {sections.map(({ group: g, items }) => (
        <div key={g.id} className="mb-3">
          <div className="mb-1.5 mt-3 flex items-baseline gap-2 px-1">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-t3">{g.label}</span>
            <span className="text-[11px] num text-t3">{items.length}</span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10 xl:grid-cols-12">
            {items.map(renderTile)}
          </div>
        </div>
      ))}
      {catalog && !sections.length && <EmptyState icon={<Search size={28} className="text-t3" />} title="没有匹配的服务" />}
    </Screen>
  )
}

/* ================= DNS 重写 ================= */

export function RewritesPage() {
  const { cfg } = useAuth()
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
      toast('重写记录已添加')
    } catch (e: any) {
      toast('添加失败:' + e.message, 'err')
    }
  }

  async function remove(entry: any) {
    if (!cfg) return
    try {
      await api(cfg, '/rewrite/delete', { method: 'POST', body: { domain: entry.domain, answer: entry.answer } })
      mutate()
      toast('已删除')
    } catch (e: any) {
      toast('删除失败:' + e.message, 'err')
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
      toast('操作失败:' + e.message, 'err')
    }
  }

  function openAdd() {
    let domain = ''
    let answer = ''
    sheet.open(
      <div>
        <p className="mb-4 text-center text-[17px] font-bold text-t1">添加 DNS 重写</p>
        <div className="flex flex-col gap-3">
          <input className="field" placeholder="域名,如 nas.home.lan" autoCapitalize="off" onChange={(e) => (domain = e.target.value)} />
          <input className="field" placeholder="解析到,如 192.168.1.10" autoCapitalize="off" onChange={(e) => (answer = e.target.value)} />
          <Button size="lg" className="mt-1" onClick={() => (domain.trim() && answer.trim() ? add(domain, answer) : toast('请填写完整', 'err'))}>
            添加
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Screen>
      <PageHeader back title="DNS 重写" subtitle={`${entries?.length ?? 0} 条记录`} right={
        <button onClick={openAdd} className="press glass flex h-10 w-10 items-center justify-center rounded-full text-accent" aria-label="添加">
          <Plus size={19} />
        </button>
      } />

      <Group>
        <Rows>
          <Row
            title="启用 DNS 重写"
            subtitle="关闭后所有重写记录不再生效"
            right={<Switch on={!!settings?.enabled} onChange={async (v) => {
              try {
                await api(cfg!, '/rewrite/settings/update', { method: 'PUT', body: { enabled: v } })
                mSettings()
              } catch (e: any) {
                toast('操作失败:' + e.message, 'err')
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
                  → {e.answer || '<A> 按请求 IP 响应'}
                </p>
              </div>
              <Switch on={e.enabled !== false} onChange={(v) => toggle(e, v)} />
              <button onClick={() => confirm({ title: `删除 ${e.domain}?`, destructive: true, confirmText: '删除', onConfirm: () => remove(e) })} className="press flex-none text-t3" aria-label="删除">
                <Trash2 size={16} />
              </button>
            </div>
          </Card>
        ))}
        {entries && entries.length === 0 && (
          <EmptyState icon={<ExternalLink size={28} className="text-t3" />} title="暂无重写记录" subtitle="把内网域名指向自定义 IP,例如 nas.home.lan → 192.168.1.10" />
        )}
      </div>
    </Screen>
  )
}

/* ================= 规则检测工具 ================= */

export function CheckHostPage() {
  const { cfg } = useAuth()
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
      toast('检测失败:' + e.message, 'err')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen>
      <PageHeader back title="规则检测" subtitle="查询域名会命中哪条过滤规则" />
      <Card className="p-4">
        <div className="flex gap-2.5">
          <input
            className="field flex-1"
            placeholder="输入域名,如 ads.example.com"
            autoCapitalize="off"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check()}
          />
          <Button loading={loading} disabled={!domain.trim()} onClick={check}>
            检测
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="mt-4 p-4 rise-in">
          <div className="mb-3 flex items-center gap-2">
            {result.reason === 'NotFilteredNotFound' ? (
              <Badge kind="ok">不会被拦截</Badge>
            ) : result.reason?.startsWith('Filtered') ? (
              <Badge kind="blocked">将被拦截</Badge>
            ) : (
              <Badge kind="rewrite">重写 / 其他</Badge>
            )}
            <span className="text-[12.5px] text-t2 num">{result.reason}</span>
          </div>
          {result.service_name && <p className="mb-2 text-[13px] text-t1">匹配服务:{result.service_name}</p>}
          {result.ip_addrs?.length ? (
            <p className="mb-2 break-all text-[13px] text-t1 num">重写到:{result.ip_addrs.join(', ')}</p>
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
            <p className="text-[13px] text-t3">没有命中任何规则</p>
          )}
        </Card>
      )}

      <div className="mt-4 flex items-start gap-2 px-2 text-[12px] leading-relaxed text-t3">
        <Ban size={14} className="mt-0.5 flex-none" />
        直接调用 AdGuard Home 的过滤引擎,结果与真实 DNS 查询一致,支持通配符与自定义规则匹配。
      </div>
    </Screen>
  )
}
