/** 客户端管理:持久客户端 CRUD + 自动识别客户端 */
import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  Plus, Laptop, Smartphone, Globe, ShieldAlert, Baby, SearchCheck,
  Trash2, Pencil, UserRound, Cpu,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { api, swrFetcher, type ClientsData, type AghClient, type AutoClient } from '../lib/api'
import {
  PageHeader, Screen, Card, Group, GroupTitle, Rows, Row, Switch, Button,
  Loading, EmptyState, useSheet, useConfirm, toast, SearchBar, Badge,
} from '../components/ui'


const emptyClient = (): Partial<AghClient> => ({
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

export default function Clients() {
  const { cfg } = useAuth()
  const sheet = useSheet()
  const confirm = useConfirm()
  const [search, setSearch] = useState('')

  const { data, mutate, isLoading } = useSWR<ClientsData>(cfg ? ['clients', cfg, '/clients'] : null, swrFetcher, {
    refreshInterval: 30000,
  })

  const clients = data?.clients ?? []
  const autos = data?.auto_clients ?? []

  const persistMatch = useMemo(() => {
    const map = new Map<string, AghClient>()
    for (const c of clients) for (const id of c.ids ?? []) map.set(id, c)
    return map
  }, [clients])

  const s = search.trim().toLowerCase()
  const filteredClients = s
    ? clients.filter((c) => c.name.toLowerCase().includes(s) || c.ids.some((i) => i.toLowerCase().includes(s)))
    : clients
  const filteredAutos = s
    ? autos.filter((a) => (a.name || '').toLowerCase().includes(s) || a.ip.toLowerCase().includes(s))
    : autos

  function openForm(existing: AghClient | null, prefillIp?: string) {
    const c = existing ?? { ...emptyClient(), ids: prefillIp ? [prefillIp] : [] }
    sheet.open(<ClientForm initial={c} isNew={!existing} onClose={sheet.close} onSaved={() => { sheet.close(); mutate() }} />)
  }

  async function remove(c: AghClient) {
    if (!cfg) return
    try {
      await api(cfg, '/clients/delete', { method: 'POST', body: { name: c.name } })
      mutate()
      toast('客户端已删除')
    } catch (e: any) {
      toast('删除失败:' + e.message, 'err')
    }
  }

  return (
    <Screen>
      <PageHeader
        back
        title="客户端"
        subtitle={`${clients.length} 个持久 · ${autos.length} 个自动识别`}
        right={
          <button onClick={() => openForm(null)} className="press glass flex h-10 w-10 items-center justify-center rounded-full text-accent" aria-label="添加客户端">
            <Plus size={19} />
          </button>
        }
      />

      <SearchBar value={search} onChange={setSearch} placeholder="搜索名称或 IP…" />

      {isLoading && <Loading />}

      {filteredClients.length > 0 && (
        <>
          <GroupTitle>持久客户端</GroupTitle>
          <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
            {filteredClients.map((c) => (
              <Card key={c.name} onClick={() => openForm(c)} className="!rounded-2xl px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    {/phone|mobile|iphone|android|pad/i.test(c.name) ? <Smartphone size={18} /> : <Laptop size={18} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-t1">{c.name}</span>
                      {c.use_global_settings ? <Badge kind="info">全局设置</Badge> : <Badge kind="rewrite">独立设置</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-t2 num">{c.ids.join(' · ')}</p>
                  </div>
                  <button
                    onClick={(e: any) => {
                      e.stopPropagation?.()
                      confirm({ title: `删除客户端「${c.name}」?`, destructive: true, confirmText: '删除', onConfirm: () => remove(c) })
                    }}
                    className="press flex-none px-1 text-t3"
                    aria-label="删除"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {!c.use_global_settings && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {c.filtering_enabled && <Badge kind="info">过滤</Badge>}
                    {c.safebrowsing_enabled && <Badge kind="warn">安全防护</Badge>}
                    {c.parental_enabled && <Badge kind="rewrite">家长控制</Badge>}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {filteredAutos.length > 0 && (
        <>
          <GroupTitle>自动识别客户端</GroupTitle>
          <Group>
            <Rows>
              {filteredAutos.slice(0, 30).map((a: AutoClient) => {
                const known = persistMatch.has(a.ip)
                // WHOIS 信息与官方一致:国家/城市 + 运营商(如 "CN UNICOM-GD")
                const w = a.whois_info ?? {}
                const whoisText = [w.country, w.city, w.orgname].filter(Boolean).join(' ')
                return (
                  <Row
                    key={a.ip}
                    icon={<IconB><UserRound size={16} /></IconB>}
                    title={a.name || a.ip}
                    subtitle={`${a.ip}${a.source ? ' · ' + a.source : ''}${whoisText ? ' · ' + whoisText : ''}${known ? ' · 已配置' : ''}`}
                    right={known ? <Badge kind="ok">已配置</Badge> : (
                      <button
                        onClick={(e: any) => { e.stopPropagation?.(); openForm(null, a.ip) }}
                        className="press rounded-full px-3 py-1 text-[12px] font-semibold"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                      >
                        添加
                      </button>
                    )}
                  />
                )
              })}
            </Rows>
          </Group>
          {filteredAutos.length > 30 && (
            <p className="mt-2 text-center text-[12px] text-t3">仅显示前 30 个,可搜索精确定位</p>
          )}
        </>
      )}

      {!isLoading && !filteredClients.length && !filteredAutos.length && (
        <EmptyState icon={<Laptop size={30} className="text-t3" />} title="没有客户端" subtitle="添加持久客户端可为不同设备配置独立过滤策略" />
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

/* ---------- 客户端编辑表单 ---------- */

function ClientForm({
  initial, isNew, onClose, onSaved,
}: {
  initial: Partial<AghClient>
  isNew: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { cfg } = useAuth()
  const [c, setC] = useState<Partial<AghClient>>({ ...initial })
  const [idsText, setIdsText] = useState((initial.ids ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof AghClient>(k: K, v: AghClient[K]) => setC((s) => ({ ...s, [k]: v }))

  async function save() {
    if (!cfg) return
    if (!c.name?.trim()) return toast('请填写客户端名称', 'err')
    const ids = idsText.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean)
    if (!ids.length) return toast('请至少填写一个 IP 或 MAC', 'err')
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
      toast(isNew ? '客户端已添加' : '已保存')
    } catch (e: any) {
      toast('保存失败:' + e.message, 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxHeight: '72vh', overflowY: 'auto' }}>
      <p className="mb-4 text-center text-[17px] font-bold text-t1">{isNew ? '添加客户端' : '编辑客户端'}</p>

      <div className="flex flex-col gap-3">
        <input className="field" placeholder="名称,如 我的手机" value={c.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        <input className="field" placeholder="IP / MAC / CIDR,逗号分隔" value={idsText} onChange={(e) => setIdsText(e.target.value)} autoCapitalize="off" />

        <div className="glass flex items-center justify-between rounded-2xl px-4 py-3">
          <div>
            <p className="text-[14.5px] font-medium text-t1">使用全局设置</p>
            <p className="text-[11.5px] text-t2">关闭后可为该设备单独配置过滤策略</p>
          </div>
          <Switch on={!!c.use_global_settings} onChange={(v) => set('use_global_settings', v)} />
        </div>

        {c.use_global_settings === false && (
          <div className="glass rounded-2xl px-4">
            {[
              { k: 'filtering_enabled' as const, label: '过滤广告与跟踪', icon: <Globe size={15} /> },
              { k: 'safebrowsing_enabled' as const, label: '浏览安全防护', icon: <ShieldAlert size={15} /> },
              { k: 'parental_enabled' as const, label: '家长控制', icon: <Baby size={15} /> },
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
            <p className="text-[14.5px] font-medium text-t1">使用全局拦截服务</p>
            <p className="text-[11.5px] text-t2">服务的独立配置可在防护页设置</p>
          </div>
          <Switch on={c.use_global_blocked_services !== false} onChange={(v) => set('use_global_blocked_services', v)} />
        </div>

        <div className="flex gap-2.5 pt-1">
          <Button variant="glass" size="lg" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button size="lg" className="flex-1" loading={saving} onClick={save}>
            保存
          </Button>
        </div>
      </div>
    </div>
  )
}
