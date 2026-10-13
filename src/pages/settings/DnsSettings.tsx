/** DNS settings: upstreams, bootstrap, protection mode, cache */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { Play, Trash2, Zap } from 'lucide-react'
import { useAuth } from '../../lib/session/auth'
import { api, swrFetcher, type DnsInfo } from '../../lib/api'
import { PageHeader, Screen, Card, Group, GroupTitle, Rows, Row, Switch, Button } from '../../components/ui/primitives'
import { toast } from '../../components/ui/toast'
import { Loading } from '../../components/ui/atoms'
import { fmtBytes } from '../../lib/format'
import { runMutation } from '../../lib/mutation'
import { useDraftForm } from '../../lib/useDraftForm'
import { useSheet } from '../../components/ui/sheet'
import { UpstreamBenchmarkSheet } from '../../components/dns/UpstreamBenchmarkSheet'
import { Field } from './Field'
/* ================= DNS settings ================= */

export function DnsSettings() {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()
  const sheet = useSheet()
  const { data, mutate, isLoading } = useSWR<DnsInfo>(cfg ? ['dns', cfg, '/dns_info'] : null, swrFetcher)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<Record<string, string> | null | undefined>(undefined)
  const form = useDraftForm(data)

  const d = form.draft
  const set = form.patch
  const dirty = form.dirty

  async function save() {
    if (!cfg || !d) return
    await runMutation({
      action: async () => {
        await api(cfg, '/dns_config', { method: 'POST', body: d })
        // Refetch before refilling: the server copy becomes the dirty baseline
        form.reset(await mutate())
      },
      okKey: 'advanced.savedDns',
      setBusy: setSaving,
    })
  }

  // Upstream test: the result list stays on the page, so only the toast is shared
  async function testUpstreams() {
    if (!cfg || !d) return
    try {
      const r = await api<Record<string, string> | null>(cfg, '/test_upstream_dns', {
        method: 'POST',
        body: { upstream_dns: toCleanUpstreamLines(d.upstream_dns) },
      })
      const errs = Object.fromEntries(Object.entries(r ?? {}).filter(([, v]) => v && v.toLowerCase() !== 'ok'))
      setTestResult(errs)
      toast(Object.keys(errs).length === 0 ? t('advanced.testAllOk') : t('advanced.testSomeFailed'), Object.keys(errs).length === 0 ? 'ok' : 'err')
    } catch (e: any) {
      toast(t('common.testFailed', { msg: e.message }), 'err')
    }
  }

  function openBenchmark() {
    if (!d) return
    sheet.open(
      <UpstreamBenchmarkSheet
        initialUpstreams={d.upstream_dns ?? []}
        onApply={(bestUpstreams) => {
          set('upstream_dns', bestUpstreams)
        }}
        onClose={sheet.close}
      />,
      { title: t('advanced.benchmarkTitle') }
    )
  }

  async function clearCache() {
    if (!cfg) return
    await runMutation({
      action: () => api(cfg, '/cache_clear', { method: 'POST' }),
      okKey: 'advanced.cacheClearedDns',
      failKey: 'advanced.clearCacheFailed',
    })
  }

  if (isLoading || !d) return <Screen><PageHeader back title={t('advanced.titleDns')} /><Loading /></Screen>

  const lines = (arr: string[] | undefined) => (arr ?? []).join('\n')
  function toLines(arr: string[] | undefined): string[] {
    return (arr ?? []).map((s) => s.trim()).filter(Boolean)
  }
  function toCleanUpstreamLines(arr: string[] | undefined): string[] {
    return (arr ?? []).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="block">
                <span className="mb-1 block text-[12.5px] text-t2">{t('advanced.upstreamTimeout')}</span>
                <input className="field num" type="number" value={d.upstream_timeout} onChange={(e) => set('upstream_timeout', Number(e.target.value))} />
              </div>
              <div className="flex items-end">
                <Button variant="glass" className="w-full" onClick={testUpstreams}>
                  <Play size={14} /> {t('advanced.testUpstreams')}
                </Button>
              </div>
              <div className="flex items-end">
                <Button variant="primary" className="w-full gap-1.5" onClick={openBenchmark}>
                  <Zap size={14} /> {t('advanced.benchmarkTitle')}
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
          <Button variant="glass" className="flex-1" onClick={() => form.reset(data)}>{t('advanced.discard')}</Button>
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

