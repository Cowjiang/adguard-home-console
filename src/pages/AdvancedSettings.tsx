/** 高级设置:DNS、访问控制、加密、DHCP */
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import {
  Play, ShieldCheck, Plus, Trash2, Wifi,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { api, swrFetcher, type DnsInfo, type TlsStatus, type DhcpStatus } from '../lib/api'
import {
  PageHeader, Screen, Card, Group, GroupTitle, Rows, Row, Switch, Button,
  Loading, useConfirm, useSheet, toast, Badge, EmptyState, usePick,
} from '../components/ui'
import { fmtBytes, fmtDate } from '../lib/format'


/* ================= DNS 设置 ================= */

export function DnsSettings() {
  const { cfg } = useAuth()
  const { data, mutate, isLoading } = useSWR<DnsInfo>(cfg ? ['dns', cfg, '/dns_info'] : null, swrFetcher)
  const [draft, setDraft] = useState<DnsInfo | null>(null)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<Record<string, string> | null | undefined>(undefined)

  useEffect(() => {
    if (data && draft === null) setDraft(structuredClone(data))
  }, [data, draft])

  const d = draft
  const set = <K extends keyof DnsInfo>(k: K, v: DnsInfo[K]) => setDraft((s) => (s ? { ...s, [k]: v } : s))
  const dirty = !!d && !!data && JSON.stringify(d) !== JSON.stringify(data)

  async function save() {
    if (!cfg || !d) return
    setSaving(true)
    try {
      await api(cfg, '/dns_config', { method: 'POST', body: d })
      mutate()
      setDraft(null)
      toast('DNS 设置已保存')
    } catch (e: any) {
      toast('保存失败:' + e.message, 'err')
    } finally {
      setSaving(false)
    }
  }

  async function testUpstreams() {
    if (!cfg || !d) return
    try {
      const r = await api<Record<string, string> | null>(cfg, '/test_upstream_dns', {
        method: 'POST',
        body: { upstream_dns: toLines(d.upstream_dns) },
      })
      setTestResult(r ?? null)
      toast(!r || Object.keys(r).length === 0 ? '全部上游测试通过 ✓' : '部分上游存在问题', !r || Object.keys(r).length === 0 ? 'ok' : 'err')
    } catch (e: any) {
      toast('测试失败:' + e.message, 'err')
    }
  }

  if (isLoading || !d) return <Screen><PageHeader back title="DNS 设置" /><Loading /></Screen>

  const lines = (arr: string[] | undefined) => (arr ?? []).join('\n')
  function toLines(arr: string[] | undefined): string[] {
    return (arr ?? []).map((s) => s.trim()).filter(Boolean)
  }

  return (
    <Screen>
      <PageHeader back title="DNS 设置" right={
        dirty ? <Button size="sm" loading={saving} onClick={save}>保存</Button> : undefined
      } />

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle>上游 DNS 服务器</GroupTitle>
          <Card className="p-4 flex flex-col gap-3">
        <Field label="上游 DNS(每行一个)" value={lines(d.upstream_dns)} onChange={(v) => set('upstream_dns', v.split('\n'))} mono
          placeholder={'223.5.5.5\ntls://1.1.1.1\nhttps://dns.google/dns-query'} />
        <Field label="Bootstrap DNS(解析 DoH/DoT 域名用)" value={lines(d.bootstrap_dns)} onChange={(v) => set('bootstrap_dns', v.split('\n'))} mono
          placeholder={'223.5.5.5\n119.29.29.29'} />
        <Field label="Fallback DNS(备用)" value={lines(d.fallback_dns)} onChange={(v) => set('fallback_dns', v.split('\n'))} mono />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-t2">多上游模式</span>
            <select className="field" value={d.upstream_mode} onChange={(e) => set('upstream_mode', e.target.value)}>
              <option value="load_balance">负载均衡</option>
              <option value="parallel">并行请求(最快)</option>
              <option value="fastest_addr">最快地址</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-t2">上游超时(秒)</span>
            <input className="field num" type="number" value={d.upstream_timeout} onChange={(e) => set('upstream_timeout', Number(e.target.value))} />
          </label>
        </div>

        <Button variant="glass" onClick={testUpstreams}>
          <Play size={14} /> 测试上游
        </Button>
        {testResult !== undefined && testResult !== null && Object.keys(testResult).length > 0 && (
          <div className="rounded-xl px-3.5 py-3 text-[12px]" style={{ background: 'var(--danger-soft)' }}>
            {Object.entries(testResult).map(([up, err]) => (
              <p key={up} className="break-all py-0.5 text-t2">
                <span className="font-semibold text-danger">{up}</span>: {err}
              </p>
            ))}
          </div>
        )}
      </Card>
        </div>
        <div>
          <GroupTitle>缓存</GroupTitle>
          <Group>
        <Rows>
          <Row title="启用 DNS 缓存" right={<Switch on={d.cache_enabled ?? d.cache_size > 0} onChange={(v) => set('cache_size', v ? Math.max(4 * 1024 * 1024, d.cache_size) : 0)} />} />
          <Row title="缓存大小" value={fmtBytes(d.cache_size)} onClick={() => {
            const sizes = [4 * 1024 * 1024, 16 * 1024 * 1024, 64 * 1024 * 1024, 256 * 1024 * 1024]
            // 循环切换缓存大小
            const i = sizes.findIndex((s) => s >= d.cache_size)
            set('cache_size', sizes[(i + 1) % sizes.length])
          }} />
          <Row title="乐观缓存" subtitle="TTL 过期后仍返回旧值并后台刷新" right={<Switch on={d.cache_optimistic} onChange={(v) => set('cache_optimistic', v)} />} />
          <Row title="最小 TTL(秒)" right={<input className="field num w-20 !py-1.5 text-right" type="number" value={d.cache_ttl_min} onChange={(e) => set('cache_ttl_min', Number(e.target.value))} />} />
          <Row title="最大 TTL(秒)" right={<input className="field num w-20 !py-1.5 text-right" type="number" value={d.cache_ttl_max} onChange={(e) => set('cache_ttl_max', Number(e.target.value))} />} last />
        </Rows>
      </Group>
        </div>
        <div>
          <GroupTitle>安全与协议</GroupTitle>
          <Group>
        <Rows>
          <Row title="DNSSEC" subtitle="验证上游响应签名" right={<Switch on={d.dnssec_enabled} onChange={(v) => set('dnssec_enabled', v)} />} />
          <Row title="EDNS Client Subnet" right={<Switch on={d.edns_cs_enabled} onChange={(v) => set('edns_cs_enabled', v)} />} />
          {d.edns_cs_enabled && (
            <Row title="使用自定义 ECS IP" right={<Switch on={d.edns_cs_use_custom} onChange={(v) => set('edns_cs_use_custom', v)} />} />
          )}
          {d.edns_cs_enabled && d.edns_cs_use_custom && (
            <Row title="自定义 ECS" right={<input className="field num w-36 !py-1.5 text-right" value={d.edns_cs_custom_ip} onChange={(e) => set('edns_cs_custom_ip', e.target.value)} />} />
          )}
          <Row title="禁用 IPv6 解析" subtitle="不返回 AAAA 记录" right={<Switch on={d.disable_ipv6} onChange={(v) => set('disable_ipv6', v)} />} last />
        </Rows>
      </Group>
        </div>
        <div>
          <GroupTitle>拦截模式</GroupTitle>
          <Group>
        <Rows>
          <Row title="被拦截域名的响应方式" value={blockingModeLabel(d.blocking_mode)} onClick={() => {
            const modes: DnsInfo['blocking_mode'][] = ['default', 'nxdomain', 'null_ip', 'custom_ip', 'refused']
            const i = modes.indexOf(d.blocking_mode)
            set('blocking_mode', modes[(i + 1) % modes.length])
          }} />
          {d.blocking_mode === 'custom_ip' && (
            <>
              <Row title="自定义 IPv4" right={<input className="field num w-36 !py-1.5 text-right" value={d.blocking_ipv4} onChange={(e) => set('blocking_ipv4', e.target.value)} />} />
              <Row title="自定义 IPv6" right={<input className="field num w-36 !py-1.5 text-right" value={d.blocking_ipv6} onChange={(e) => set('blocking_ipv6', e.target.value)} />} />
            </>
          )}
          <Row title="被拦截响应 TTL(秒)" right={<input className="field num w-20 !py-1.5 text-right" type="number" value={d.blocked_response_ttl} onChange={(e) => set('blocked_response_ttl', Number(e.target.value))} />} />
          <Row title="限速(每分钟请次)" subtitle="0 表示不限速" right={<input className="field num w-20 !py-1.5 text-right" type="number" value={d.ratelimit} onChange={(e) => set('ratelimit', Number(e.target.value))} />} last />
        </Rows>
      </Group>
        </div>
      </div>

      {dirty && (
        <div className="mt-4 flex gap-2.5">
          <Button variant="glass" className="flex-1" onClick={() => setDraft(structuredClone(data!))}>放弃修改</Button>
          <Button className="flex-1" loading={saving} onClick={save}>保存修改</Button>
        </div>
      )}
    </Screen>
  )
}

function blockingModeLabel(m: string): string {
  return {
    default: '默认(A 记录返回 0.0.0.0)',
    nxdomain: 'NXDOMAIN(域名不存在)',
    null_ip: 'Null IP(0.0.0.0 / ::)',
    custom_ip: '自定义 IP',
    refused: 'REFUSED(拒绝)',
  }[m] ?? m
}

function Field({ label, value, onChange, mono, placeholder }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] text-t2">{label}</span>
      <textarea
        className="field"
        style={mono ? undefined : { minHeight: 60 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
    </label>
  )
}

/* ================= 访问控制 ================= */

export function AccessSettings() {
  const { cfg } = useAuth()
  const { data, mutate, isLoading } = useSWR<any>(cfg ? ['acl', cfg, '/access/list'] : null, swrFetcher)
  const [draft, setDraft] = useState<null | { allowed: string; disallowed: string; hosts: string }>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data && draft === null)
      setDraft({
        allowed: (data.allowed_clients ?? []).join('\n'),
        disallowed: (data.disallowed_clients ?? []).join('\n'),
        hosts: (data.blocked_hosts ?? []).join('\n'),
      })
  }, [data, draft])

  const dirty = !!draft && !!data && (draft.allowed !== (data.allowed_clients ?? []).join('\n') || draft.disallowed !== (data.disallowed_clients ?? []).join('\n') || draft.hosts !== (data.blocked_hosts ?? []).join('\n'))

  async function save() {
    if (!cfg || !draft) return
    setSaving(true)
    try {
      const toArr = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
      await api(cfg, '/access/set', {
        method: 'POST',
        body: { allowed_clients: toArr(draft.allowed), disallowed_clients: toArr(draft.disallowed), blocked_hosts: toArr(draft.hosts) },
      })
      mutate()
      toast('访问控制已保存')
    } catch (e: any) {
      toast('保存失败:' + e.message, 'err')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !draft) return <Screen><PageHeader back title="访问控制" /><Loading /></Screen>

  return (
    <Screen>
      <PageHeader back title="访问控制" right={dirty ? <Button size="sm" loading={saving} onClick={save}>保存</Button> : undefined} />

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle>客户端</GroupTitle>
          <Card className="p-4 flex flex-col gap-3">
            <Field label="允许列表(为空则允许全部)" value={draft.allowed} onChange={(v) => setDraft({ ...draft, allowed: v })} placeholder="192.168.1.0/24" />
            <Field label="阻止列表" value={draft.disallowed} onChange={(v) => setDraft({ ...draft, disallowed: v })} placeholder="10.0.0.1" />
          </Card>
        </div>
        <div>
          <GroupTitle>域名</GroupTitle>
          <Card className="p-4">
            <Field label="阻止的域名(含 AdBlock 风格通配)" value={draft.hosts} onChange={(v) => setDraft({ ...draft, hosts: v })} placeholder={'version.bind\nid.server'} />
          </Card>
        </div>
      </div>

      <div className="mt-4 rounded-2xl px-4 py-3 text-[12px] leading-relaxed" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
        注意:允许列表非空时,不在列表内的客户端将被拒绝。保存前请确认当前设备在允许列表中,否则会失去管理入口。
      </div>

      {dirty && (
        <div className="mt-4 flex gap-2.5">
          <Button variant="glass" className="flex-1" onClick={() => setDraft(null)}>放弃修改</Button>
          <Button className="flex-1" loading={saving} onClick={save}>保存修改</Button>
        </div>
      )}
    </Screen>
  )
}

/* ================= 加密设置 ================= */

export function EncryptionSettings() {
  const { cfg } = useAuth()
  const { data, mutate, isLoading } = useSWR<TlsStatus>(cfg ? ['tls', cfg, '/tls/status'] : null, swrFetcher)
  const [draft, setDraft] = useState<null | Partial<TlsStatus>>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data && draft === null) setDraft({ ...data })
  }, [data, draft])

  const d = draft
  const set = <K extends keyof TlsStatus>(k: K, v: TlsStatus[K]) => setDraft((s) => (s ? { ...s, [k]: v } : s))
  const dirty = !!d && !!data && JSON.stringify(d) !== JSON.stringify(data)

  async function save() {
    if (!cfg || !d) return
    setSaving(true)
    try {
      // 先验证,再应用
      const validate = await api<any>(cfg, '/tls/validate', { method: 'POST', body: d })
      const hasError = validate?.warning_validation && !validate?.valid_pair
      if (hasError) {
        toast('证书校验失败:' + validate.warning_validation, 'err')
        setSaving(false)
        return
      }
      await api(cfg, '/tls/configure', { method: 'POST', body: d })
      mutate()
      setDraft(null)
      toast('加密设置已保存')
    } catch (e: any) {
      toast('保存失败:' + e.message, 'err')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !d || !data) return <Screen><PageHeader back title="加密设置" /><Loading /></Screen>

  const expiring = data.not_after && new Date(data.not_after).getTime() - Date.now() < 30 * 86400_000

  return (
    <Screen>
      <PageHeader back title="加密设置" right={dirty ? <Button size="sm" loading={saving} onClick={save}>保存</Button> : undefined} />

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 flex-none items-center justify-center rounded-[15px]" style={{ background: data.enabled ? 'var(--ok-soft)' : 'var(--glass)', color: data.enabled ? 'var(--ok)' : 'var(--t3)' }}>
            <ShieldCheck size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15.5px] font-bold text-t1">{data.enabled ? '加密已启用' : '加密未启用'}</p>
            <p className="text-[12.5px] text-t2">
              {data.valid_pair ? '证书链有效' : '证书存在问题'} · {data.key_type}
            </p>
          </div>
          {data.valid_pair && <Badge kind={expiring ? 'warn' : 'ok'}>{expiring ? '即将到期' : '证书有效'}</Badge>}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px]">
          <CertInfo label="通用名称" value={data.subject} />
          <CertInfo label="颁发者" value={data.issuer} />
          <CertInfo label="生效时间" value={fmtDate(data.not_before)} />
          <CertInfo label="到期时间" value={fmtDate(data.not_after)} />
          <CertInfo label="DNS 名称" value={(data.dns_names ?? []).join(', ')} />
          <CertInfo label="服务器名称" value={data.server_name} />
        </div>
        {data.warning_validation && (
          <p className="mt-3 rounded-xl px-3.5 py-2.5 text-[12px] leading-relaxed" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
            {data.warning_validation}
          </p>
        )}
      </Card>

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle>端口与协议</GroupTitle>
          <Group>
        <Rows>
          <Row title="启用加密(DNS-over-HTTPS/TLS/QUIC)" right={<Switch on={d.enabled ?? false} onChange={(v) => set('enabled', v)} />} />
          <Row title="强制 HTTPS 访问" subtitle="网页管理界面强制跳转 HTTPS" right={<Switch on={d.force_https ?? false} onChange={(v) => set('force_https', v)} />} />
          <Row title="允许明文 DNS" subtitle="关闭后仅接受加密 DNS 请求" right={<Switch on={d.serve_plain_dns ?? true} onChange={(v) => set('serve_plain_dns', v)} />} />
          <Row title="HTTPS 端口" right={<input className="field num w-20 !py-1.5 text-right" type="number" value={d.port_https ?? 443} onChange={(e) => set('port_https', Number(e.target.value))} />} />
          <Row title="DoT 端口" right={<input className="field num w-20 !py-1.5 text-right" type="number" value={d.port_dns_over_tls ?? 853} onChange={(e) => set('port_dns_over_tls', Number(e.target.value))} />} />
          <Row title="DoQ 端口" right={<input className="field num w-20 !py-1.5 text-right" type="number" value={d.port_dns_over_quic ?? 784} onChange={(e) => set('port_dns_over_quic', Number(e.target.value))} />} last />
        </Rows>
      </Group>
        </div>
        <div>
          <GroupTitle>证书</GroupTitle>
          <Card className="p-4 flex flex-col gap-3">
        <Field label="服务器名称(SNI)" value={d.server_name ?? ''} onChange={(v) => set('server_name', v)} placeholder="dns.example.com" />
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-t2">证书链(PEM,留空沿用现有证书)</span>
          <textarea className="field" style={{ minHeight: 80 }} value={d.certificate_chain ?? ''} onChange={(e) => set('certificate_chain', e.target.value)} spellCheck={false} placeholder={data.certificate_chain ? '已加载现有证书' : '-----BEGIN CERTIFICATE-----…'} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-t2">私钥(PEM,留空沿用现有私钥)</span>
          <textarea className="field" style={{ minHeight: 80 }} value={d.private_key ?? ''} onChange={(e) => set('private_key', e.target.value)} spellCheck={false} placeholder={data.private_key_saved ? '私钥已保存在服务器' : '-----BEGIN PRIVATE KEY-----…'} />
        </label>
      </Card>
        </div>
      </div>

      {dirty && (
        <div className="mt-4 flex gap-2.5">
          <Button variant="glass" className="flex-1" onClick={() => setDraft({ ...data! })}>放弃修改</Button>
          <Button className="flex-1" loading={saving} onClick={save}>验证并保存</Button>
        </div>
      )}
    </Screen>
  )
}

function CertInfo({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-t3">{label}</p>
      <p className="mt-0.5 truncate text-t1 num" title={value}>{value || '—'}</p>
    </div>
  )
}

/* ================= DHCP ================= */

export function DhcpSettings() {
  const { cfg, status } = useAuth()
  const confirm = useConfirm()
  const sheet = useSheet()
  const pick = usePick()
  const { data, mutate, isLoading } = useSWR<DhcpStatus>(cfg ? ['dhcp', cfg, '/dhcp/status'] : null, swrFetcher)
  const { data: interfaces } = useSWR<any>(cfg ? ['dhcpIf', cfg, '/dhcp/interfaces'] : null, swrFetcher, { refreshInterval: 0 })
  const [saving, setSaving] = useState(false)
  const [searchResult, setSearchResult] = useState<string | null>(null)
  const [draftLocal, setDraftLocal] = useState<DhcpStatus | null>(null)

  if (!status?.dhcp_available) {
    return (
      <Screen>
        <PageHeader back title="DHCP 服务器" />
        <EmptyState icon={<Wifi size={30} className="text-t3" />} title="DHCP 不可用" subtitle="当前运行环境中无法启用 DHCP(例如 Docker 内、或已有其他 DHCP 服务器)" />
      </Screen>
    )
  }

  if (isLoading || !data) return <Screen><PageHeader back title="DHCP 服务器" /><Loading /></Screen>

  const d = data
  const cur = draftLocal ?? d
  const setD = (patch: Partial<DhcpStatus>) => setDraftLocal({ ...cur, ...patch })

  async function saveConfig(next: DhcpStatus) {
    if (!cfg) return
    setSaving(true)
    try {
      await api(cfg, '/dhcp/set_config', {
        method: 'POST',
        body: {
          enabled: next.enabled,
          interface_name: next.interface_name,
          v4: next.v4,
          v6: next.v6,
        },
      })
      setDraftLocal(null)
      mutate()
      toast('DHCP 配置已保存')
    } catch (e: any) {
      toast('保存失败:' + e.message, 'err')
    } finally {
      setSaving(false)
    }
  }

  async function findActive() {
    if (!cfg) return
    setSearchResult('…')
    try {
      const r = await api<any>(cfg, '/dhcp/find_active_dhcp', { method: 'POST', body: { interface: cur.interface_name || '' } })
      const v4 = r?.v4
      setSearchResult(v4 ? `检测到其他 DHCP 服务器:${v4.server_ip || v4.gateway_ip || '存在'}(${v4.found ? '干扰' : '无冲突'})` : '未检测到其他 DHCP 服务器')
    } catch (e: any) {
      setSearchResult('检测失败:' + e.message)
    }
  }

  async function removeLease(mac: string) {
    if (!cfg) return
    try {
      await api(cfg, '/dhcp/remove_static_lease', { method: 'POST', body: { mac } })
      mutate()
      toast('静态租约已删除')
    } catch (e: any) {
      toast('删除失败:' + e.message, 'err')
    }
  }

  function openAddLease() {
    let mac = ''
    let ip = ''
    let hostname = ''
    sheet.open(
      <div>
        <p className="mb-4 text-center text-[17px] font-bold text-t1">添加静态租约</p>
        <div className="flex flex-col gap-3">
          <input className="field" placeholder="MAC 地址,如 AA:BB:CC:DD:EE:FF" autoCapitalize="characters" onChange={(e) => (mac = e.target.value)} />
          <input className="field" placeholder="IP 地址" onChange={(e) => (ip = e.target.value)} />
          <input className="field" placeholder="主机名(可选)" onChange={(e) => (hostname = e.target.value)} />
          <Button size="lg" className="mt-1" onClick={async () => {
            if (!mac.trim() || !ip.trim()) return toast('请填写 MAC 与 IP', 'err')
            try {
              await api(cfg!, '/dhcp/add_static_lease', { method: 'POST', body: { mac: mac.trim(), ip: ip.trim(), hostname: hostname.trim() } })
              mutate()
              sheet.close()
              toast('静态租约已添加')
            } catch (e: any) {
              toast('添加失败:' + e.message, 'err')
            }
          }}>
            添加
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Screen>
      <PageHeader back title="DHCP 服务器" right={<Button size="sm" loading={saving} onClick={() => saveConfig(cur)}>保存</Button>} />

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <Group>
        <Rows>
          <Row
            title="启用 DHCP 服务器"
            subtitle="由 AdGuard Home 分配局域网 IP"
            right={<Switch on={cur.enabled} onChange={(v) => setD({ enabled: v })} />}
          />
          <Row
            title="网络接口"
            value={cur.interface_name || '选择…'}
            onClick={(e) => {
              const ifs = interfaces?.interfaces ?? {}
              pick({
                title: '选择网络接口',
                anchor: e.currentTarget,
                align: 'right',
                value: cur.interface_name,
                options: Object.keys(ifs).map((n) => ({ label: `${n}(${ifs[n].addresses?.join(', ')})`, value: n })),
                onPick: (v) => setD({ interface_name: v }),
              })
            }}
          />
          <Row title="检测网络中的其他 DHCP" subtitle="避免与路由器 DHCP 冲突" onClick={findActive} last />
        </Rows>
          </Group>
          {searchResult && <p className="mt-2 px-2 text-[12.5px] text-t2">{searchResult}</p>}
        </div>
        {cur.enabled ? (
          <div>
            <GroupTitle>IPv4 范围</GroupTitle>
            <Group>
            <Rows>
              <Row title="网关" right={<input className="field num w-36 !py-1.5 text-right" value={cur.v4.gateway_ip} onChange={(e) => setD({ v4: { ...cur.v4, gateway_ip: e.target.value } })} />} />
              <Row title="子网掩码" right={<input className="field num w-36 !py-1.5 text-right" value={cur.v4.subnet_mask} onChange={(e) => setD({ v4: { ...cur.v4, subnet_mask: e.target.value } })} />} />
              <Row title="起始 IP" right={<input className="field num w-36 !py-1.5 text-right" value={cur.v4.range_start} onChange={(e) => setD({ v4: { ...cur.v4, range_start: e.target.value } })} />} />
              <Row title="结束 IP" right={<input className="field num w-36 !py-1.5 text-right" value={cur.v4.range_end} onChange={(e) => setD({ v4: { ...cur.v4, range_end: e.target.value } })} />} />
              <Row title="租约时长(秒)" right={<input className="field num w-24 !py-1.5 text-right" type="number" value={cur.v4.lease_duration} onChange={(e) => setD({ v4: { ...cur.v4, lease_duration: Number(e.target.value) } })} />} last />
            </Rows>
            </Group>
          </div>
        ) : (
          <div />
        )}
      </div>

      <GroupTitle>静态租约({d.static_leases.length})</GroupTitle>
      {d.static_leases.length > 0 && (
        <Group>
          <Rows>
            {d.static_leases.map((l, i) => (
              <Row
                key={l.mac}
                title={l.hostname || l.ip}
                subtitle={`${l.mac} · ${l.ip}`}
                right={
                  <button onClick={() => confirm({ title: `删除租约 ${l.hostname || l.ip}?`, destructive: true, confirmText: '删除', onConfirm: () => removeLease(l.mac) })} className="press text-t3">
                    <Trash2 size={15} />
                  </button>
                }
                last={i === d.static_leases.length - 1}
              />
            ))}
          </Rows>
        </Group>
      )}
      <Card className="mt-2.5">
        <Row icon={<Plus size={17} className="text-accent" />} title="添加静态租约" onClick={openAddLease} last />
      </Card>
    </Screen>
  )
}
