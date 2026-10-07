/** Encryption settings: TLS config, cert source, validation */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../../lib/session/auth'
import { api, swrFetcher, type TlsStatus } from '../../lib/api'
import { PageHeader, Screen, Card, Group, GroupTitle, Rows, Row, Switch, Button, Segmented } from '../../components/ui/primitives'
import { useConfirm } from '../../components/ui/sheet'
import { toast } from '../../components/ui/toast'
import { Badge, Loading } from '../../components/ui/atoms'
import { fmtDate } from '../../lib/format'
import { runMutation } from '../../lib/mutation'
import { useDraftForm } from '../../lib/useDraftForm'
/* ================= Encryption settings ================= */

// 原生 Encryption Form 的 defaultValues（端口为标准端口常量）
const TLS_DEFAULTS = {
  enabled: false, server_name: '', force_https: false, serve_plain_dns: true,
  port_https: 443, port_dns_over_tls: 853, port_dns_over_quic: 784,
  certificate_chain: '', certificate_path: '', private_key: '', private_key_path: '', private_key_saved: false,
}

export function EncryptionSettings() {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { data, mutate, isLoading } = useSWR<TlsStatus>(cfg ? ['tls', cfg, '/tls/status'] : null, swrFetcher)
  const [saving, setSaving] = useState(false)
  // 原生 certificate_source / key_source radio：路径与内容互斥，保存时清空未选字段
  const [certSource, setCertSource] = useState<'path' | 'content'>('path')
  const [keySource, setKeySource] = useState<'path' | 'content'>('path')
  const form = useDraftForm(data)

  // Seed the source radios from the loaded copy once (stored content → content mode)
  useEffect(() => {
    if (!data || form.draft !== null) return
    setCertSource(data.certificate_chain ? 'content' : 'path')
    setKeySource((data.private_key || data.private_key_saved) ? 'content' : 'path')
  }, [data, form.draft])

  const d = form.draft
  const set = form.patch
  const dirty = form.dirty

  async function save() {
    if (!cfg || !d) return
    // 原生 form_error_equal：HTTPS 与 DoT 端口不得相同
    if (d.port_https === d.port_dns_over_tls) return toast(t('advanced.portConflict'), 'err')
    // 原生 getSubmitValues 语义：只保留所选来源的字段；勾选已存私钥时不回传内容
    const body: Partial<TlsStatus> = { ...d }
    if (certSource === 'content') body.certificate_path = ''
    else body.certificate_chain = ''
    if (keySource === 'content') {
      body.private_key_path = ''
      if (body.private_key_saved) body.private_key = ''
    } else {
      body.private_key = ''
    }
    setSaving(true)
    try {
      // Two-phase save: the pair is validated server-side first, and a
      // rejection carries its own copy (so this copy does not use runMutation)
      const validate = await api<any>(cfg, '/tls/validate', { method: 'POST', body })
      const hasError = validate?.warning_validation && !validate?.valid_pair
      if (hasError) {
        toast(t('advanced.validateFailed', { msg: validate.warning_validation }), 'err')
        return
      }
      await api(cfg, '/tls/configure', { method: 'POST', body })
      // Refetch before refilling: the server copy becomes the dirty baseline
      form.reset(await mutate())
      toast(t('advanced.savedEncryption'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
    } finally {
      setSaving(false)
    }
  }

  // 原生 clearFields：确认后向服务端下发默认配置（不是仅清空表单）
  async function resetEncryption() {
    if (!cfg) return
    const ok = await runMutation({
      action: async () => {
        await api(cfg, '/tls/configure', { method: 'POST', body: TLS_DEFAULTS })
        form.reset(await mutate())
      },
      okKey: 'advanced.resetEncryptionDone',
    })
    if (ok) {
      setCertSource('path')
      setKeySource('path')
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
              {/* key_type 中的空格用不换行空格,避免 "RSA 2048" 断成两行 */}
              {t('advanced.chainState', { chain: data.valid_chain ? t('advanced.valid') : t('advanced.invalid'), key: data.valid_key ? t('advanced.valid') : t('advanced.invalid') })}{data.key_type ? ` · ${data.key_type.replace(' ', '\u00A0')}` : ''}
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
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[12.5px] text-t2">{t('advanced.certSource')}</span>
            <Segmented
              fit
              size="sm"
              value={certSource}
              onChange={setCertSource}
              options={[
                { value: 'path' as const, label: t('advanced.srcPath') },
                { value: 'content' as const, label: t('advanced.srcContent') },
              ]}
            />
          </div>
          <span className="mb-2 block text-[11.5px] leading-relaxed text-t3">{t('advanced.sourceClearHint')}</span>
          {certSource === 'path' ? (
            <>
              <input className="field num !py-2.5 !text-[13px]" value={d.certificate_path ?? ''} onChange={(e) => set('certificate_path', e.target.value)} placeholder="/opt/adguardhome/conf/ssl/cert.pem" autoCapitalize="off" spellCheck={false} />
              <span className="mt-1.5 block text-[11.5px] leading-relaxed text-t3">{t('advanced.certPathHint', { chain: data.valid_chain ? t('advanced.valid') : t('advanced.invalid'), cert: data.valid_cert ? t('advanced.valid') : t('advanced.invalid') })}</span>
            </>
          ) : (
            <textarea className="field" style={{ minHeight: 128 }} value={d.certificate_chain ?? ''} onChange={(e) => set('certificate_chain', e.target.value)} spellCheck={false} placeholder={t('advanced.certContentPlaceholder')} />
          )}
        </div>
      </Card>

          <GroupTitle>{t('advanced.keyGroup')}</GroupTitle>
          <Card className="p-4 flex flex-col gap-3">
        <div className="block">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[12.5px] text-t2">{t('advanced.keySource')}</span>
            <Segmented
              fit
              size="sm"
              value={keySource}
              onChange={setKeySource}
              options={[
                { value: 'path' as const, label: t('advanced.srcPath') },
                { value: 'content' as const, label: t('advanced.srcContent') },
              ]}
            />
          </div>
          <span className="mb-2 block text-[11.5px] leading-relaxed text-t3">{t('advanced.sourceClearHint')}</span>
          {keySource === 'path' ? (
            <>
              <input className="field num !py-2.5 !text-[13px]" value={d.private_key_path ?? ''} onChange={(e) => set('private_key_path', e.target.value)} placeholder="/opt/adguardhome/conf/ssl/key.pem" autoCapitalize="off" spellCheck={false} />
              <span className="mt-1.5 block text-[11.5px] leading-relaxed text-t3">
                {t('advanced.keyPathHint', {
                  keyType: data.key_type ? t('advanced.keyTypeNamed', { type: data.key_type }) : t('advanced.privateKey'),
                  state: data.valid_key ? t('advanced.valid') : t('advanced.invalid'),
                  saved: data.private_key_saved ? t('advanced.keySaved') : '',
                })}
              </span>
            </>
          ) : (
            <>
              {data.private_key_saved && (
                <div className="mb-2.5 flex items-center gap-3 rounded-2xl px-3.5 py-2.5" style={{ background: 'var(--glass)' }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-t1">{t('advanced.useSavedKey')}</p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-t2">{t('advanced.useSavedKeySub')}</p>
                  </div>
                  {/* 原生 use_saved_key：勾选即清空 private_key,由服务端沿用已存私钥 */}
                  <Switch on={!!d.private_key_saved} onChange={(v) => { set('private_key_saved', v); if (v) set('private_key', '') }} />
                </div>
              )}
              {/* 禁用态是状态说明而非输入提示,避免"留空则…"教用户做做不到的事 */}
              <textarea
                className="field"
                style={{ minHeight: 128 }}
                value={d.private_key ?? ''}
                onChange={(e) => set('private_key', e.target.value)}
                spellCheck={false}
                placeholder={d.private_key_saved ? t('advanced.savedKeyPlaceholder') : t('advanced.keyContentPlaceholder')}
                disabled={!!d.private_key_saved}
              />
            </>
          )}
        </div>
        <p className="text-[11.5px] leading-relaxed text-t3">{t('advanced.encryptionNote')}</p>
      </Card>
        </div>
      </div>

      {dirty && (
        <div className="mt-4 flex gap-2.5">
          <Button variant="glass" className="flex-1" onClick={() => form.reset(data)}>{t('advanced.discard')}</Button>
          <Button className="flex-1" loading={saving} onClick={save}>{t('advanced.validateAndSave')}</Button>
        </div>
      )}

      {/* 全宽收束页底(与 DHCP 危险行同款);与 dirty 双按钮拉开间距,避免危险操作像挂在保存动作下 */}
      <Card className="mt-6">
        <Row
          title={t('advanced.resetEncryption')}
          subtitle={t('advanced.resetEncryptionSub')}
          danger
          onClick={() => confirm({
            title: t('advanced.resetEncryptionTitle'),
            message: dirty ? t('advanced.resetEncryptionMsgDirty') : t('advanced.resetEncryptionMsg'),
            destructive: true,
            confirmText: t('advanced.resetAction'),
            onConfirm: resetEncryption,
          })}
          last
        />
      </Card>
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

