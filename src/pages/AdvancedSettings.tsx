/** 高级设置:DNS、访问控制、加密、DHCP */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
      toast(t('advanced.savedDns'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
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
toast(Object.keys(errs).length === 0 ? t('advanced.testAllOk') : t('advanced.testSomeFailed'), Object.keys(errs).length === 0 ? 'ok' : 'err')
} catch (e: any) {
toast(t('common.testFailed', { msg: e.message }), 'err')
}
}

async function clearCache() {
if (!cfg) return
try {
await api(cfg, '/cache_clear', { method: 'POST' })
toast(t('advanced.cacheClearedDns'), 'ok')
} catch (e: any) {
toast(t('advanced.clearCacheFailed', { msg: e.message }), 'err')
}
}

  if (isLoading || !d) return <Screen><PageHeader back title={t('advanced.titleDns')} /><Loading /></Screen>

  const lines = (arr: string[] | undefined) => (arr ?? []).join('\n')
  function toLines(arr: string[] | undefined): string[] {
    return (arr ?? []).map((s) => s.trim()).filter(Boolean)
  }

  return (
    <Screen>
      <PageHeader back title={t('advanced.titleDns')} right={
        dirty ? <Button size="header" loading={saving} onClick={save} native={{ label: t('common.save'), foreground: 'accent' }}>{t('common.save')}</Button> : undefined
      } />

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle>{t('advanced.upstreamGroup')}</GroupTitle>
          <Card className="p-4 flex flex-col gap-3">
            <Field
              label={t('advanced.upstreamsLabel')}
              value={lines(d.upstream_dns)}
              onChange={(v) => set('upstream_dns', v.split('\n'))}
              mono
              placeholder={'223.5.5.5\ntls://1.1.1.1\nhttps://dns.google/dns-query'}
              hint={t('advanced.upstreamsHint')}
            />
            <div className="block">
              <span className="mb-1 block text-[12.5px] text-t2">{t('advanced.upstreamMode')}</span>
              <select className="field" value={d.upstream_mode || 'load_balance'} onChange={(e) => {
              set('upstream_mode', e.target.value)
              selectAfterChange(e.currentTarget)
            }}>
                <option value="load_balance">{t('advanced.modeLoadBalance')}</option>
                <option value="parallel">{t('advanced.modeParallel')}</option>
                <option value="fastest_addr">{t('advanced.modeFastestAddr')}</option>
              </select>
              <span className="mt-1.5 block text-[11.5px] leading-relaxed text-t3">{upstreamModeHint(d.upstream_mode, t)}</span>
            </div>
            <Field
              label={t('advanced.fallbackLabel')}
              value={lines(d.fallback_dns)}
              onChange={(v) => set('fallback_dns', v.split('\n'))}
              mono
              placeholder={t('advanced.fallbackPlaceholder')}
            />
            <Field
              label={t('advanced.bootstrapLabel')}
              value={lines(d.bootstrap_dns)}
              onChange={(v) => set('bootstrap_dns', v.split('\n'))}
              mono
              placeholder={'9.9.9.10\n149.112.112.10'}
              hint={t('advanced.bootstrapHint')}
            />
            <Field
              label={t('advanced.privatePtrLabel')}
              value={lines(d.local_ptr_upstreams)}
              onChange={(v) => set('local_ptr_upstreams', v.split('\n'))}
              mono
              placeholder={(data?.default_local_ptr_upstreams ?? []).join('\n')}
              hint={t('advanced.privatePtrHint', { defaults: data?.default_local_ptr_upstreams?.length ? t('advanced.privatePtrDefaults', { list: data.default_local_ptr_upstreams.join(', ') }) : '' })}
            />
            <Group>
              <Rows>
                <Row
                  title={t('advanced.usePrivatePtr')}
                  subtitle={t('advanced.usePrivatePtrSub')}
                  right={<Switch on={d.use_private_ptr_resolvers} onChange={(v) => set('use_private_ptr_resolvers', v)} />}
                />
                <Row
                  title={t('advanced.resolveClients')}
                  subtitle={t('advanced.resolveClientsSub')}
                  right={<Switch on={d.resolve_clients} onChange={(v) => set('resolve_clients', v)} />}
                  last
                />
              </Rows>
            </Group>
            <div className="grid grid-cols-2 gap-3">
              <div className="block">
                <span className="mb-1 block text-[12.5px] text-t2">{t('advanced.upstreamTimeout')}</span>
                <input className="field num" type="number" value={d.upstream_timeout} onChange={(e) => set('upstream_timeout', Number(e.target.value))} />
              </div>
              <div className="flex items-end">
                <Button variant="glass" className="w-full" onClick={testUpstreams}>
                  <Play size={14} /> {t('advanced.testUpstreams')}
                </Button>
              </div>
            </div>
            {testResult !== undefined && (testResult === null || Object.keys(testResult).length === 0) && (
              <p className="rounded-xl px-3.5 py-2.5 text-[12.5px]" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>{t('advanced.testAllOk')}</p>
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
          <GroupTitle>{t('advanced.serviceGroup')}</GroupTitle>
          <Group>
            <Rows>
              <Row title={t('advanced.ratelimit')} subtitle={t('advanced.ratelimitSub')} right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.ratelimit} onChange={(e) => set('ratelimit', Number(e.target.value))} /></div>} />
              <Row title={t('advanced.subnetLen4')} subtitle={t('advanced.subnetLen4Sub')} right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.ratelimit_subnet_len_ipv4} onChange={(e) => set('ratelimit_subnet_len_ipv4', Number(e.target.value))} /></div>} />
              <Row title={t('advanced.subnetLen6')} subtitle={t('advanced.subnetLen6Sub')} right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.ratelimit_subnet_len_ipv6} onChange={(e) => set('ratelimit_subnet_len_ipv6', Number(e.target.value))} /></div>} />
              <div className="px-4 pb-4 pt-2">
                <div className="text-[15.5px] font-medium text-t1">{t('advanced.ratelimitWhitelist')}</div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-t2">{t('advanced.ratelimitWhitelistSub')}</div>
                <textarea className="field mt-2" style={{ minHeight: 56 }} value={lines(d.ratelimit_whitelist)} onChange={(e) => set('ratelimit_whitelist', e.target.value.split('\n'))} spellCheck={false} placeholder={t('advanced.ratelimitWhitelistPlaceholder')} />
              </div>
              <Row title={t('advanced.ednsCs')} right={<Switch on={d.edns_cs_enabled} onChange={(v) => set('edns_cs_enabled', v)} />} />
              {d.edns_cs_enabled && (
                <Row title={t('advanced.ednsCustomIp')} right={<Switch on={d.edns_cs_use_custom} onChange={(v) => set('edns_cs_use_custom', v)} />} />
              )}
              {d.edns_cs_enabled && d.edns_cs_use_custom && (
                <Row title={t('advanced.ednsCustomIpField')} right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={d.edns_cs_custom_ip} onChange={(e) => set('edns_cs_custom_ip', e.target.value)} /></div>} />
              )}
              <Row title={t('advanced.dnssec')} subtitle={t('advanced.dnssecSub')} right={<Switch on={d.dnssec_enabled} onChange={(v) => set('dnssec_enabled', v)} />} />
              <Row title={t('advanced.disableIpv6')} subtitle={t('advanced.disableIpv6Sub')} right={<Switch on={d.disable_ipv6} onChange={(v) => set('disable_ipv6', v)} />} />
              <div className="px-4 pb-4 pt-2">
                <div className="text-[15.5px] font-medium text-t1">{t('advanced.blockingMode')}</div>
                <select className="field mt-2" value={d.blocking_mode} onChange={(e) => {
                set('blocking_mode', e.target.value as DnsInfo['blocking_mode'])
                selectAfterChange(e.currentTarget)
              }}>
                  <option value="default">{t('advanced.modeDefault')}</option>
                  <option value="refused">REFUSED</option>
                  <option value="nxdomain">NXDOMAIN</option>
                  <option value="null_ip">{t('advanced.modeNullIp')}</option>
                  <option value="custom_ip">{t('advanced.modeCustomIp')}</option>
                </select>
                <div className="mt-1.5 text-[12.5px] leading-snug text-t2">{blockingModeDesc(d.blocking_mode, t)}</div>
                {d.blocking_mode === 'custom_ip' && (
                  <div className="mt-2.5 grid grid-cols-2 gap-3">
                    <input className="field num !py-2 !text-[13px]" value={d.blocking_ipv4} onChange={(e) => set('blocking_ipv4', e.target.value)} placeholder={t('advanced.blockingIpv4')} />
                    <input className="field num !py-2 !text-[13px]" value={d.blocking_ipv6} onChange={(e) => set('blocking_ipv6', e.target.value)} placeholder={t('advanced.blockingIpv6')} />
                  </div>
                )}
              </div>
              <Row title={t('advanced.blockedTtl')} subtitle={t('advanced.blockedTtlSub')} right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.blocked_response_ttl} onChange={(e) => set('blocked_response_ttl', Number(e.target.value))} /></div>} last />
            </Rows>
          </Group>

          <GroupTitle>{t('advanced.cacheGroup')}</GroupTitle>
          <Group>
            <Rows>
              <Row title={t('advanced.cacheEnabled')} subtitle={t('advanced.cacheEnabledSub')} right={<Switch on={d.cache_enabled ?? d.cache_size > 0} onChange={(v) => set('cache_enabled', v)} />} />
              <Row title={t('advanced.cacheSize')} subtitle={t('advanced.cacheSizeSub')} right={<div className="w-28 flex-none"><select className="field !py-1.5 !pr-8 text-right" value={d.cache_size} onChange={(e) => {
                set('cache_size', Number(e.target.value))
                selectAfterChange(e.currentTarget)
              }}>
                {(cacheSizes.includes(d.cache_size) ? cacheSizes : [d.cache_size, ...cacheSizes]).map((s) => (
                  <option key={s} value={s}>{fmtBytes(s)}</option>
                ))}
              </select></div>} />
              <Row title={t('advanced.ttlMin')} subtitle={t('advanced.ttlMinSub')} right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.cache_ttl_min} onChange={(e) => set('cache_ttl_min', Number(e.target.value))} /></div>} />
              <Row title={t('advanced.ttlMax')} right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.cache_ttl_max} onChange={(e) => set('cache_ttl_max', Number(e.target.value))} /></div>} />
              <Row title={t('advanced.optimisticCache')} subtitle={t('advanced.optimisticCacheSub')} right={<Switch on={d.cache_optimistic} onChange={(v) => set('cache_optimistic', v)} />} last />
            </Rows>
            <div className="flex items-center justify-between gap-3 px-4 pb-4">
              <p className="text-[12.5px] text-t2">{t('advanced.clearCacheHint')}</p>
              <Button variant="danger" onClick={clearCache}>
                <Trash2 size={14} /> {t('advanced.clearCache')}
              </Button>
            </div>
          </Group>

          <GroupTitle>{t('advanced.accessEntry')}</GroupTitle>
          <Group>
            <Rows>
              <Row title={t('advanced.accessEntryRow')} subtitle={t('advanced.accessEntrySub')} onClick={() => nav('/settings/access')} last />
            </Rows>
          </Group>
        </div>
      </div>

      {dirty && (
        <div className="mt-4 flex gap-2.5">
          <Button variant="glass" className="flex-1" onClick={() => setDraft(structuredClone(data!))}>{t('advanced.discard')}</Button>
          <Button className="flex-1" loading={saving} onClick={save}>{t('advanced.saveChanges')}</Button>
        </div>
      )}
    </Screen>
  )
}

function blockingModeDesc(m: string, t: (k: 'advanced.modeDescDefault' | 'advanced.modeDescRefused' | 'advanced.modeDescNxdomain' | 'advanced.modeDescNullIp' | 'advanced.modeDescCustomIp') => string): string {
  return {
    default: t('advanced.modeDescDefault'),
    refused: t('advanced.modeDescRefused'),
    nxdomain: t('advanced.modeDescNxdomain'),
    null_ip: t('advanced.modeDescNullIp'),
    custom_ip: t('advanced.modeDescCustomIp'),
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

function upstreamModeHint(m: string, t: (k: 'advanced.modeHintLoadBalance' | 'advanced.modeHintParallel' | 'advanced.modeHintFastest') => string): string {
  if (m === 'parallel') return t('advanced.modeHintParallel')
  if (m === 'fastest_addr') return t('advanced.modeHintFastest')
  return t('advanced.modeHintLoadBalance')
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
  const { t } = useTranslation()
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
      toast(t('advanced.savedAccess'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !draft) return <Screen><PageHeader back title={t('advanced.titleAccess')} /><Loading /></Screen>

  return (
    <Screen>
      <PageHeader back title={t('advanced.titleAccess')} right={dirty ? <Button size="header" loading={saving} onClick={save} native={{ label: t('common.save'), foreground: 'accent' }}>{t('common.save')}</Button> : undefined} />

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle>{t('advanced.groupClients')}</GroupTitle>
          <Card className="p-4 flex flex-col gap-3">
            <Field label={t('advanced.allowedLabel')} value={draft.allowed} onChange={(v) => setDraft({ ...draft, allowed: v })} placeholder="192.168.1.0/24" />
            <Field label={t('advanced.blockedLabel')} value={draft.disallowed} onChange={(v) => setDraft({ ...draft, disallowed: v })} placeholder="10.0.0.1" />
          </Card>
        </div>
        <div>
          <GroupTitle>{t('advanced.groupDomains')}</GroupTitle>
          <Card className="p-4">
            <Field label={t('advanced.blockedHostsLabel')} value={draft.hosts} onChange={(v) => setDraft({ ...draft, hosts: v })} placeholder={'version.bind\nid.server'} />
          </Card>
        </div>
      </div>

      <div className="mt-4 rounded-2xl px-4 py-3 text-[12px] leading-relaxed" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
        {t('advanced.accessWarning')}
      </div>

      {dirty && (
        <div className="mt-4 flex gap-2.5">
          <Button variant="glass" className="flex-1" onClick={() => setDraft(null)}>{t('advanced.discard')}</Button>
          <Button className="flex-1" loading={saving} onClick={save}>{t('advanced.saveChanges')}</Button>
        </div>
      )}
    </Screen>
  )
}

/* ================= 加密设置 ================= */

export function EncryptionSettings() {
  const { cfg } = useAuth()
  const { t } = useTranslation()
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
        toast(t('advanced.validateFailed', { msg: validate.warning_validation }), 'err')
        setSaving(false)
        return
      }
      await api(cfg, '/tls/configure', { method: 'POST', body: d })
      mutate()
      setDraft(null)
      toast(t('advanced.savedEncryption'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !d || !data) return <Screen><PageHeader back title={t('advanced.titleEncryption')} /><Loading /></Screen>

  const expiring = data.not_after && new Date(data.not_after).getTime() - Date.now() < 30 * 86400_000

  return (
    <Screen>
      <PageHeader back title={t('advanced.titleEncryption')} right={dirty ? <Button size="header" loading={saving} onClick={save} native={{ label: t('common.save'), foreground: 'accent' }}>{t('common.save')}</Button> : undefined} />

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 flex-none items-center justify-center rounded-[15px]" style={{ background: data.enabled ? 'var(--ok-soft)' : 'var(--glass)', color: data.enabled ? 'var(--ok)' : 'var(--t3)' }}>
            <ShieldCheck size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15.5px] font-bold text-t1">{data.enabled ? t('advanced.enabledTitle') : t('advanced.disabledTitle')}</p>
            <p className="text-[12.5px] text-t2">
              {t('advanced.chainState', { chain: data.valid_chain ? t('advanced.valid') : t('advanced.invalid'), key: data.valid_key ? t('advanced.valid') : t('advanced.invalid') })}{data.key_type ? ` · ${data.key_type}` : ''}
            </p>
          </div>
          <Badge kind={!data.valid_pair || expiring ? 'warn' : 'ok'}>{!data.valid_pair ? t('advanced.pairInvalid') : expiring ? t('advanced.expiring') : t('advanced.certValid')}</Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px]">
          <CertInfo label={t('advanced.certSubject')} value={data.subject} />
          <CertInfo label={t('advanced.certIssuer')} value={data.issuer} />
          <CertInfo label={t('advanced.certNotBefore')} value={fmtDate(data.not_before)} />
          <CertInfo label={t('advanced.certNotAfter')} value={fmtDate(data.not_after)} />
          <CertInfo label={t('advanced.certDnsNames')} value={(data.dns_names ?? []).join(', ')} />
          <CertInfo label={t('advanced.certPath')} value={data.certificate_path} />
        </div>
        {data.warning_validation && (
          <p className="mt-3 rounded-xl px-3.5 py-2.5 text-[12px] leading-relaxed" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
            {data.warning_validation}
          </p>
        )}
      </Card>

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle>{t('advanced.portsGroup')}</GroupTitle>
          <Group>
        <Rows>
          <Row
            title={t('advanced.enableEncryption')}
            subtitle={t('advanced.enableEncryptionSub')}
            right={<Switch on={d.enabled ?? false} onChange={(v) => set('enabled', v)} />}
          />
          <Row
            title={t('advanced.plainDns')}
            subtitle={t('advanced.plainDnsSub')}
            right={<Switch on={d.serve_plain_dns ?? true} onChange={(v) => set('serve_plain_dns', v)} />}
          />
          <Row
            title={t('advanced.forceHttps')}
            subtitle={t('advanced.forceHttpsSub')}
            right={<Switch on={d.force_https ?? false} onChange={(v) => set('force_https', v)} />}
          />
          <Row
            title={t('advanced.portHttps')}
            subtitle={t('advanced.portHttpsSub')}
            right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.port_https ?? 443} onChange={(e) => set('port_https', Number(e.target.value))} /></div>}
          />
          <Row
            title={t('advanced.portTls')}
            subtitle={t('advanced.portTlsSub')}
            right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.port_dns_over_tls ?? 853} onChange={(e) => set('port_dns_over_tls', Number(e.target.value))} /></div>}
          />
          <Row
            title={t('advanced.portQuic')}
            subtitle={t('advanced.portQuicSub')}
            right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={d.port_dns_over_quic ?? 784} onChange={(e) => set('port_dns_over_quic', Number(e.target.value))} /></div>}
            last
          />
        </Rows>
      </Group>
        </div>
        <div>
          <GroupTitle>{t('advanced.serverNameGroup')}</GroupTitle>
          <Card className="p-4 flex flex-col gap-3">
        <div className="block">
          <span className="mb-1 block text-[12.5px] text-t2">{t('advanced.sni')}</span>
          <input className="field !py-2.5 !text-[14px]" value={d.server_name ?? ''} onChange={(e) => set('server_name', e.target.value)} placeholder="dns.example.com" autoCapitalize="off" spellCheck={false} />
          <span className="mt-1.5 block text-[11.5px] leading-relaxed text-t3">{t('advanced.sniHint')}</span>
        </div>
        <div className="block">
          <span className="mb-1 block text-[12.5px] text-t2">{t('advanced.certPathLabel')}</span>
          <input className="field num !py-2.5 !text-[13px]" value={d.certificate_path ?? ''} onChange={(e) => set('certificate_path', e.target.value)} placeholder="/opt/adguardhome/conf/ssl/cert.pem" autoCapitalize="off" spellCheck={false} />
          <span className="mt-1.5 block text-[11.5px] leading-relaxed text-t3">{t('advanced.certPathHint', { chain: data.valid_chain ? t('advanced.valid') : t('advanced.invalid'), cert: data.valid_cert ? t('advanced.valid') : t('advanced.invalid') })}</span>
        </div>
        <div className="block">
          <span className="mb-1 block text-[12.5px] text-t2">{t('advanced.certContentLabel')}</span>
          <textarea className="field" style={{ minHeight: 72 }} value={d.certificate_chain ?? ''} onChange={(e) => set('certificate_chain', e.target.value)} spellCheck={false} placeholder={t('advanced.certContentPlaceholder')} />
        </div>
      </Card>

          <GroupTitle>{t('advanced.keyGroup')}</GroupTitle>
          <Card className="p-4 flex flex-col gap-3">
        <div className="block">
          <span className="mb-1 block text-[12.5px] text-t2">{t('advanced.keyPathLabel')}</span>
          <input className="field num !py-2.5 !text-[13px]" value={d.private_key_path ?? ''} onChange={(e) => set('private_key_path', e.target.value)} placeholder="/opt/adguardhome/conf/ssl/key.pem" autoCapitalize="off" spellCheck={false} />
          <span className="mt-1.5 block text-[11.5px] leading-relaxed text-t3">
            {t('advanced.keyPathHint', {
              keyType: data.key_type ? t('advanced.keyTypeNamed', { type: data.key_type }) : t('advanced.privateKey'),
              state: data.valid_key ? t('advanced.valid') : t('advanced.invalid'),
              saved: data.private_key_saved ? t('advanced.keySaved') : '',
            })}
          </span>
        </div>
        <div className="block">
          <span className="mb-1 block text-[12.5px] text-t2">{t('advanced.keyContentLabel')}</span>
          <textarea className="field" style={{ minHeight: 72 }} value={d.private_key ?? ''} onChange={(e) => set('private_key', e.target.value)} spellCheck={false} placeholder={t('advanced.keyContentPlaceholder')} />
        </div>
        <p className="text-[11.5px] leading-relaxed text-t3">{t('advanced.encryptionNote')}</p>
      </Card>
        </div>
      </div>

      {dirty && (
        <div className="mt-4 flex gap-2.5">
          <Button variant="glass" className="flex-1" onClick={() => setDraft({ ...data! })}>{t('advanced.discard')}</Button>
          <Button className="flex-1" loading={saving} onClick={save}>{t('advanced.validateAndSave')}</Button>
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
  const { t } = useTranslation()
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
        <PageHeader back title={t('advanced.titleDhcp')} />
        <EmptyState icon={<Wifi size={30} className="text-t3" />} title={t('advanced.dhcpUnavailable')} subtitle={t('advanced.dhcpUnavailableSub')} />
      </Screen>
    )
  }

  if (isLoading || !data) return <Screen><PageHeader back title={t('advanced.titleDhcp')} /><Loading /></Screen>

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
      toast(t('advanced.savedDhcp'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
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
      setSearchResult(v4
        ? t('advanced.dhcpFound', { server: v4.server_ip || v4.gateway_ip || t('advanced.dhcpExists'), state: v4.found ? t('advanced.dhcpConflict') : t('advanced.dhcpNoConflict') })
        : t('advanced.dhcpNoneFound'))
    } catch (e: any) {
      setSearchResult(t('advanced.findFailed', { msg: e.message }))
    }
  }

  async function removeLease(mac: string) {
    if (!cfg) return
    try {
      await api(cfg, '/dhcp/remove_static_lease', { method: 'POST', body: { mac } })
      mutate()
      toast(t('advanced.leaseDeleted'))
    } catch (e: any) {
      toast(t('common.deleteFailed', { msg: e.message }), 'err')
    }
  }

  function openAddLease() {
    let mac = ''
    let ip = ''
    let hostname = ''
    sheet.open(
      <div>
        <p className="mb-4 text-center text-[17px] font-bold text-t1">{t('advanced.addLeaseTitle')}</p>
        <div className="flex flex-col gap-3">
          <input className="field" placeholder={t('advanced.macPlaceholder')} autoCapitalize="characters" onChange={(e) => (mac = e.target.value)} />
          <input className="field" placeholder={t('advanced.ipPlaceholder')} onChange={(e) => (ip = e.target.value)} />
          <input className="field" placeholder={t('advanced.hostnamePlaceholder')} onChange={(e) => (hostname = e.target.value)} />
          <Button size="lg" className="mt-1" onClick={async () => {
            if (!mac.trim() || !ip.trim()) return toast(t('advanced.macIpRequired'), 'err')
            try {
              await api(cfg!, '/dhcp/add_static_lease', { method: 'POST', body: { mac: mac.trim(), ip: ip.trim(), hostname: hostname.trim() } })
              mutate()
              sheet.close()
              toast(t('advanced.leaseAdded'))
            } catch (e: any) {
              toast(t('common.addFailed', { msg: e.message }), 'err')
            }
          }}>
            {t('common.add')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Screen>
      <PageHeader back title={t('advanced.titleDhcp')} right={<Button size="header" loading={saving} onClick={() => saveConfig(cur)} native={{ label: t('common.save'), foreground: 'accent' }}>{t('common.save')}</Button>} />

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <Group>
        <Rows>
          <Row
            title={t('advanced.enableDhcp')}
            subtitle={t('advanced.enableDhcpSub')}
            right={<Switch on={cur.enabled} onChange={(v) => setD({ enabled: v })} />}
          />
          <Row
            title={t('advanced.interface')}
            value={cur.interface_name || t('advanced.choose')}
            onClick={(e) => {
              const ifs = interfaces?.interfaces ?? {}
              pick({
                title: t('advanced.chooseInterface'),
                anchor: e.currentTarget,
                align: 'right',
                value: cur.interface_name,
                options: Object.keys(ifs).map((n) => ({ label: `${n}(${ifs[n].addresses?.join(', ')})`, value: n })),
                onPick: (v) => setD({ interface_name: v }),
              })
            }}
          />
          <Row title={t('advanced.detectOther')} subtitle={t('advanced.detectOtherSub')} onClick={findActive} last />
        </Rows>
          </Group>
          {searchResult && <p className="mt-2 px-2 text-[12.5px] text-t2">{searchResult}</p>}
        </div>
        {cur.enabled ? (
          <div>
            <GroupTitle>{t('advanced.v4Group')}</GroupTitle>
            <Group>
            <Rows>
              <Row title={t('advanced.gateway')} right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={cur.v4.gateway_ip} onChange={(e) => setD({ v4: { ...cur.v4, gateway_ip: e.target.value } })} /></div>} />
              <Row title={t('advanced.subnetMask')} right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={cur.v4.subnet_mask} onChange={(e) => setD({ v4: { ...cur.v4, subnet_mask: e.target.value } })} /></div>} />
              <Row title={t('advanced.rangeStart')} right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={cur.v4.range_start} onChange={(e) => setD({ v4: { ...cur.v4, range_start: e.target.value } })} /></div>} />
              <Row title={t('advanced.rangeEnd')} right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={cur.v4.range_end} onChange={(e) => setD({ v4: { ...cur.v4, range_end: e.target.value } })} /></div>} />
              <Row title={t('advanced.leaseDuration')} right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={cur.v4.lease_duration} onChange={(e) => setD({ v4: { ...cur.v4, lease_duration: Number(e.target.value) } })} /></div>} last />
            </Rows>
            </Group>
          </div>
        ) : (
          <div />
        )}
      </div>

      <GroupTitle>{t('advanced.staticLeases', { n: d.static_leases.length })}</GroupTitle>
      {d.static_leases.length > 0 && (
        <Group>
          <Rows>
            {d.static_leases.map((l, i) => (
              <Row
                key={l.mac}
                title={l.hostname || l.ip}
                subtitle={`${l.mac} · ${l.ip}`}
                right={
                  <button onClick={() => confirm({ title: t('advanced.leaseDeleteTitle', { name: l.hostname || l.ip }), destructive: true, confirmText: t('common.delete'), onConfirm: () => removeLease(l.mac) })} className="press text-t3">
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
        <Row icon={<Plus size={17} className="text-accent" />} title={t('advanced.addLeaseTitle')} onClick={openAddLease} last />
      </Card>
    </Screen>
  )
}
