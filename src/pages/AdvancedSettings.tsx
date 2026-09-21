/** 高级设置:DNS、访问控制、加密、DHCP */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const nav = useNavigate()
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
const errs = Object.fromEntries(Object.entries(r ?? {}).filter(([, v]) => v && v.toLowerCase() !== 'ok'))
setTestResult(errs)
toast(Object.keys(errs).length === 0 ? '全部上游测试通过 ✓' : '部分上游存在问题', Object.keys(errs).length === 0 ? 'ok' : 'err')
} catch (e: any) {
toast('测试失败:' + e.message, 'err')
}
}

async function clearCache() {
if (!cfg) return
try {
await api(cfg, '/cache_clear', { method: 'POST' })
toast('DNS 缓存已清除', 'ok')
} catch (e: any) {
toast('清除失败:' + e.message, 'err')
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
            <Field
              label="上游 DNS(每行一个)"
              value={lines(d.upstream_dns)}
              onChange={(v) => set('upstream_dns', v.split('\n'))}
              mono
              placeholder={'223.5.5.5\ntls://1.1.1.1\nhttps://dns.google/dns-query'}
              hint="支持 udp://、tcp://、tls://、https://、quic://、h3://、sdns:// 等形式;[/example.local/]223.5.5.5 表示仅指定域名走此上游;# 开头为注释。"
            />
            <div className="block">
              <span className="mb-1 block text-[12.5px] text-t2">负载均衡模式</span>
              <select className="field" value={d.upstream_mode || 'load_balance'} onChange={(e) => {
              set('upstream_mode', e.target.value)
              selectAfterChange(e.currentTarget)
            }}>
                <option value="load_balance">负载均衡</option>
                <option value="parallel">并行请求</option>
                <option value="fastest_addr">最快的 IP 地址</option>
              </select>
              <span className="mt-1.5 block text-[11.5px] leading-relaxed text-t3">{upstreamModeHint(d.upstream_mode)}</span>
            </div>
            <Field
              label="后备 DNS 服务器"
              value={lines(d.fallback_dns)}
              onChange={(v) => set('fallback_dns', v.split('\n'))}
              mono
              placeholder="上游全部无响应时使用,语法同上"
            />
            <Field
              label="Bootstrap DNS"
              value={lines(d.bootstrap_dns)}
              onChange={(v) => set('bootstrap_dns', v.split('\n'))}
              mono
              placeholder={'9.9.9.10\n149.112.112.10'}
              hint="用于解析 DoH/DoT 上游的域名,只允许 IP 地址,不允许注释。"
            />
            <Field
              label="私人反向 DNS 服务器"
              value={lines(d.local_ptr_upstreams)}
              onChange={(v) => set('local_ptr_upstreams', v.split('\n'))}
              mono
              placeholder={(data?.default_local_ptr_upstreams ?? []).join('\n')}
              hint={`用于私人 PTR/SOA/NS 请求;未设置时使用系统默认解析器${data?.default_local_ptr_upstreams?.length ? `(当前默认: ${data.default_local_ptr_upstreams.join(', ')})` : ''}。`}
            />
            <Group>
              <Rows>
                <Row
                  title="使用私人反向 DNS 解析器"
                  subtitle="用私有上游、DHCP、/etc/hosts 等解析私有 IP 的 PTR 请求;关闭时对这类请求回 NXDOMAIN"
                  right={<Switch on={d.use_private_ptr_resolvers} onChange={(v) => set('use_private_ptr_resolvers', v)} />}
                />
                <Row
                  title="客户端 IP 反向解析"
                  subtitle="将客户端 IP 反向解析为主机名,查询日志中显示设备名"
                  right={<Switch on={d.resolve_clients} onChange={(v) => set('resolve_clients', v)} />}
                  last
                />
              </Rows>
            </Group>
            <div className="grid grid-cols-2 gap-3">
              <div className="block">
                <span className="mb-1 block text-[12.5px] text-t2">上游超时(秒)</span>
                <input className="field num" type="number" value={d.upstream_timeout} onChange={(e) => set('upstream_timeout', Number(e.target.value))} />
              </div>
              <div className="flex items-end">
                <Button variant="glass" className="w-full" onClick={testUpstreams}>
                  <Play size={14} /> 测试上游
                </Button>
              </div>
            </div>
            {testResult !== undefined && (testResult === null || Object.keys(testResult).length === 0) && (
              <p className="rounded-xl px-3.5 py-2.5 text-[12.5px]" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>全部上游测试通过 ✓</p>
            )}
            {testResult && Object.keys(testResult).length > 0 && (
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
          <GroupTitle>DNS 服务配置</GroupTitle>
          <Group>
            <Rows>
              <Row title="限速(每客户端每秒)" subtitle="0 表示不限速" right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.ratelimit} onChange={(e) => set('ratelimit', Number(e.target.value))} /></div>} />
              <Row title="IPv4 子网前缀长度" subtitle="按子网聚合限速,默认 24" right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.ratelimit_subnet_len_ipv4} onChange={(e) => set('ratelimit_subnet_len_ipv4', Number(e.target.value))} /></div>} />
              <Row title="IPv6 子网前缀长度" subtitle="按子网聚合限速,默认 56" right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.ratelimit_subnet_len_ipv6} onChange={(e) => set('ratelimit_subnet_len_ipv6', Number(e.target.value))} /></div>} />
              <div className="px-4 pb-4 pt-2">
                <div className="text-[15.5px] font-medium text-t1">速率限制白名单</div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-t2">排除在速率限制之外的 IP 地址</div>
                <textarea className="field mt-2" style={{ minHeight: 56 }} value={lines(d.ratelimit_whitelist)} onChange={(e) => set('ratelimit_whitelist', e.target.value.split('\n'))} spellCheck={false} placeholder="每行一个 IP 或 CIDR" />
              </div>
              <Row title="启用 EDNS 客户端子网" right={<Switch on={d.edns_cs_enabled} onChange={(v) => set('edns_cs_enabled', v)} />} />
              {d.edns_cs_enabled && (
                <Row title="为 EDNS 使用自定义 IP" right={<Switch on={d.edns_cs_use_custom} onChange={(v) => set('edns_cs_use_custom', v)} />} />
              )}
              {d.edns_cs_enabled && d.edns_cs_use_custom && (
                <Row title="自定义 ECS" right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={d.edns_cs_custom_ip} onChange={(e) => set('edns_cs_custom_ip', e.target.value)} /></div>} />
              )}
              <Row title="DNSSEC" subtitle="设置 DNSSEC 标志并校验上游响应(需上游支持)" right={<Switch on={d.dnssec_enabled} onChange={(v) => set('dnssec_enabled', v)} />} />
              <Row title="禁用 IPv6 解析" subtitle="丢弃 AAAA 查询并移除 HTTPS 响应中的 IPv6 信息" right={<Switch on={d.disable_ipv6} onChange={(v) => set('disable_ipv6', v)} />} />
              <div className="px-4 pb-4 pt-2">
                <div className="text-[15.5px] font-medium text-t1">拦截模式</div>
                <select className="field mt-2" value={d.blocking_mode} onChange={(e) => {
                set('blocking_mode', e.target.value as DnsInfo['blocking_mode'])
                selectAfterChange(e.currentTarget)
              }}>
                  <option value="default">默认</option>
                  <option value="refused">REFUSED</option>
                  <option value="nxdomain">NXDOMAIN</option>
                  <option value="null_ip">空 IP</option>
                  <option value="custom_ip">自定义 IP</option>
                </select>
                <div className="mt-1.5 text-[12.5px] leading-snug text-t2">{blockingModeDesc(d.blocking_mode)}</div>
                {d.blocking_mode === 'custom_ip' && (
                  <div className="mt-2.5 grid grid-cols-2 gap-3">
                    <input className="field num !py-2 !text-[13px]" value={d.blocking_ipv4} onChange={(e) => set('blocking_ipv4', e.target.value)} placeholder="自定义 IPv4" />
                    <input className="field num !py-2 !text-[13px]" value={d.blocking_ipv6} onChange={(e) => set('blocking_ipv6', e.target.value)} placeholder="自定义 IPv6" />
                  </div>
                )}
              </div>
              <Row title="被拦截响应 TTL(秒)" subtitle="客户端缓存已过滤响应的秒数" right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.blocked_response_ttl} onChange={(e) => set('blocked_response_ttl', Number(e.target.value))} /></div>} last />
            </Rows>
          </Group>

          <GroupTitle>DNS 缓存配置</GroupTitle>
          <Group>
            <Rows>
              <Row title="启用缓存" subtitle="在本地存储 DNS 响应" right={<Switch on={d.cache_enabled ?? d.cache_size > 0} onChange={(v) => set('cache_enabled', v)} />} />
              <Row title="缓存大小" subtitle="DNS 缓存大小(字节)" right={<div className="w-28 flex-none"><select className="field !py-1.5 !pr-8 text-right" value={d.cache_size} onChange={(e) => {
                set('cache_size', Number(e.target.value))
                selectAfterChange(e.currentTarget)
              }}>
                {(cacheSizes.includes(d.cache_size) ? cacheSizes : [d.cache_size, ...cacheSizes]).map((s) => (
                  <option key={s} value={s}>{fmtBytes(s)}</option>
                ))}
              </select></div>} />
              <Row title="覆盖最小 TTL(秒)" subtitle="延长上游返回的 TTL 值" right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.cache_ttl_min} onChange={(e) => set('cache_ttl_min', Number(e.target.value))} /></div>} />
              <Row title="覆盖最大 TTL(秒)" right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.cache_ttl_max} onChange={(e) => set('cache_ttl_max', Number(e.target.value))} /></div>} />
              <Row title="乐观缓存" subtitle="条目过期后仍先用缓存响应并后台刷新" right={<Switch on={d.cache_optimistic} onChange={(v) => set('cache_optimistic', v)} />} last />
            </Rows>
            <div className="flex items-center justify-between gap-3 px-4 pb-4">
              <p className="text-[12.5px] text-t2">修改过滤规则后清除缓存可立即生效</p>
              <Button variant="danger" onClick={clearCache}>
                <Trash2 size={14} /> 清除缓存
              </Button>
            </div>
          </Group>

          <GroupTitle>访问设置</GroupTitle>
          <Group>
            <Rows>
              <Row title="允许 / 阻止的客户端与域名" subtitle="在独立的访问设置页面中配置" onClick={() => nav('/settings/access')} last />
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

function blockingModeDesc(m: string): string {
  return {
    default: '被广告拦截规则拦截时返回零 IP(A 记录 0.0.0.0;AAAA 记录 ::);被 /etc/hosts 规则拦截时返回规则中指定的 IP。',
    refused: '以 REFUSED 码响应请求。',
    nxdomain: '以 NXDOMAIN(域名不存在)码响应。',
    null_ip: '以零 IP 地址响应(A 记录 0.0.0.0;AAAA 记录 ::)。',
    custom_ip: '以手动设置的 IP 地址响应。',
  }[m] ?? ''
}

function selectAfterChange(el: HTMLSelectElement) {
  if (window.matchMedia('(hover: hover)').matches) {
    el.blur()
    return
  }
  el.classList.add('no-ring')
  el.addEventListener('blur', () => el.classList.remove('no-ring'), { once: true })
}

function upstreamModeHint(m: string): string {
  if (m === 'parallel') return '同时查询所有上游服务器,取最快的响应,加快解析速度。'
  if (m === 'fastest_addr') return '等待所有响应并测速,返回连接最快的 IP;上游不稳定时会显著拖慢查询,请确保上游稳定且超时较短。'
  return '一次查询一台服务器,按加权随机选择失败最少、平均耗时最低的上游。'
}

const cacheSizes = [4, 16, 64, 256, 512].map((mb) => mb * 1024 * 1024)

function Field({ label, value, onChange, mono, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; placeholder?: string; hint?: string }) {
  return (
    <div className="block">
      <span className="mb-1 block text-[12.5px] text-t2">{label}</span>
      <textarea
        className="field"
        style={mono ? undefined : { minHeight: 60 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
      {hint && <span className="mt-1.5 block text-[11.5px] leading-relaxed text-t3">{hint}</span>}
    </div>
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
              证书链{data.valid_chain ? '有效' : '无效'} · 私钥{data.valid_key ? '有效' : '无效'}{data.key_type ? ` · ${data.key_type}` : ''}
            </p>
          </div>
          <Badge kind={!data.valid_pair || expiring ? 'warn' : 'ok'}>{!data.valid_pair ? '配对无效' : expiring ? '即将到期' : '证书有效'}</Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px]">
          <CertInfo label="通用名称" value={data.subject} />
          <CertInfo label="颁发者" value={data.issuer} />
          <CertInfo label="生效时间" value={fmtDate(data.not_before)} />
          <CertInfo label="到期时间" value={fmtDate(data.not_after)} />
          <CertInfo label="DNS 名称" value={(data.dns_names ?? []).join(', ')} />
          <CertInfo label="证书路径" value={data.certificate_path} />
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
          <Row
            title="启用加密"
            subtitle="启用后管理界面经 HTTPS 访问,DNS 服务器监听 DoH/DoT/DoQ 加密请求"
            right={<Switch on={d.enabled ?? false} onChange={(v) => set('enabled', v)} />}
          />
          <Row
            title="允许明文 DNS"
            subtitle="默认开启;关闭后强制所有设备使用加密 DNS,须至少启用一个加密协议"
            right={<Switch on={d.serve_plain_dns ?? true} onChange={(v) => set('serve_plain_dns', v)} />}
          />
          <Row
            title="强制 HTTPS 访问"
            subtitle="勾选后自动将 HTTP 重定向到 HTTPS 地址"
            right={<Switch on={d.force_https ?? false} onChange={(v) => set('force_https', v)} />}
          />
          <Row
            title="HTTPS 端口"
            subtitle="配置后管理界面可经 HTTPS 访问,并在 /dns-query 提供 DoH"
            right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.port_https ?? 443} onChange={(e) => set('port_https', Number(e.target.value))} /></div>}
          />
          <Row
            title="DNS-over-TLS 端口"
            subtitle="配置后在此端口运行 DNS-over-TLS 服务器"
            right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.port_dns_over_tls ?? 853} onChange={(e) => set('port_dns_over_tls', Number(e.target.value))} /></div>}
          />
          <Row
            title="DNS-over-QUIC 端口"
            subtitle="配置后在此端口运行 DNS-over-QUIC 服务器"
            right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.port_dns_over_quic ?? 784} onChange={(e) => set('port_dns_over_quic', Number(e.target.value))} /></div>}
            last
          />
        </Rows>
      </Group>
        </div>
        <div>
          <GroupTitle>服务器名称与证书</GroupTitle>
          <Card className="p-4 flex flex-col gap-3">
        <div className="block">
          <span className="mb-1 block text-[12.5px] text-t2">服务器名称(SNI)</span>
          <input className="field !py-2.5 !text-[14px]" value={d.server_name ?? ''} onChange={(e) => set('server_name', e.target.value)} placeholder="dns.example.com" autoCapitalize="off" spellCheck={false} />
          <span className="mt-1.5 block text-[11.5px] leading-relaxed text-t3">须与证书中的一个 DNS 名称匹配;设置后 AGH 会检测客户端标识号、响应 DDR 查询,未设置则该功能禁用</span>
        </div>
        <div className="block">
          <span className="mb-1 block text-[12.5px] text-t2">证书文件路径</span>
          <input className="field num !py-2.5 !text-[13px]" value={d.certificate_path ?? ''} onChange={(e) => set('certificate_path', e.target.value)} placeholder="/opt/adguardhome/conf/ssl/cert.pem" autoCapitalize="off" spellCheck={false} />
          <span className="mt-1.5 block text-[11.5px] leading-relaxed text-t3">状态:证书链{data.valid_chain ? '有效' : '无效'} · 证书{data.valid_cert ? '有效' : '无效'}</span>
        </div>
        <div className="block">
          <span className="mb-1 block text-[12.5px] text-t2">证书内容(PEM,可选)</span>
          <textarea className="field" style={{ minHeight: 72 }} value={d.certificate_chain ?? ''} onChange={(e) => set('certificate_chain', e.target.value)} spellCheck={false} placeholder={'留空则使用上方路径或服务器已加载的证书\n-----BEGIN CERTIFICATE-----…'} />
        </div>
      </Card>

          <GroupTitle>私钥</GroupTitle>
          <Card className="p-4 flex flex-col gap-3">
        <div className="block">
          <span className="mb-1 block text-[12.5px] text-t2">私钥文件路径</span>
          <input className="field num !py-2.5 !text-[13px]" value={d.private_key_path ?? ''} onChange={(e) => set('private_key_path', e.target.value)} placeholder="/opt/adguardhome/conf/ssl/key.pem" autoCapitalize="off" spellCheck={false} />
          <span className="mt-1.5 block text-[11.5px] leading-relaxed text-t3">状态:{data.key_type ? `该 ${data.key_type} 私钥` : '私钥'}{data.valid_key ? '有效' : '无效'}{data.private_key_saved ? ' · 已保存在服务器' : ''}</span>
        </div>
        <div className="block">
          <span className="mb-1 block text-[12.5px] text-t2">私钥内容(PEM,可选)</span>
          <textarea className="field" style={{ minHeight: 72 }} value={d.private_key ?? ''} onChange={(e) => set('private_key', e.target.value)} spellCheck={false} placeholder={'留空则使用上方路径或服务器已加载的私钥\n-----BEGIN PRIVATE KEY-----…'} />
        </div>
        <p className="text-[11.5px] leading-relaxed text-t3">使用加密需为域名提供有效 SSL 证书链,可从 letsencrypt.org 免费获取或向受信任 CA 购买;PEM 内容与路径二选一,内容优先。</p>
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
              <Row title="网关" right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={cur.v4.gateway_ip} onChange={(e) => setD({ v4: { ...cur.v4, gateway_ip: e.target.value } })} /></div>} />
              <Row title="子网掩码" right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={cur.v4.subnet_mask} onChange={(e) => setD({ v4: { ...cur.v4, subnet_mask: e.target.value } })} /></div>} />
              <Row title="起始 IP" right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={cur.v4.range_start} onChange={(e) => setD({ v4: { ...cur.v4, range_start: e.target.value } })} /></div>} />
              <Row title="结束 IP" right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={cur.v4.range_end} onChange={(e) => setD({ v4: { ...cur.v4, range_end: e.target.value } })} /></div>} />
              <Row title="租约时长(秒)" right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={cur.v4.lease_duration} onChange={(e) => setD({ v4: { ...cur.v4, lease_duration: Number(e.target.value) } })} /></div>} last />
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
