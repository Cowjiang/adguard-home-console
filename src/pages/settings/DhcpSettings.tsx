/** DHCP settings: leases, static leases, per-interface config */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { Plus, Trash2, Wifi, Pencil, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../lib/session/auth'
import { api, swrFetcher, type DhcpStatus } from '../../lib/api'
import { PageHeader, Screen, Card, Group, GroupTitle, Rows, Row, Switch, Button } from '../../components/ui/primitives'
import { useConfirm, useSheet } from '../../components/ui/sheet'
import { toast } from '../../components/ui/toast'
import { EmptyState, Loading } from '../../components/ui/atoms'
import { usePick } from '../../components/ui/menu'
import { fmtDate } from '../../lib/format'
import { runMutation } from '../../lib/mutation'
import { useDraftForm } from '../../lib/useDraftForm'
/* ================= DHCP ================= */

/** Config-only draft: lease lists change through their own endpoints and must
 *  not dirty the form (and thus the Save button) */
type DhcpConfigDraft = Pick<DhcpStatus, 'enabled' | 'interface_name' | 'v4' | 'v6'>
const toConfigDraft = (d: DhcpStatus): DhcpConfigDraft => ({
  enabled: d.enabled,
  interface_name: d.interface_name,
  v4: d.v4,
  v6: d.v6,
})

export function DhcpSettings() {
  const { cfg, status } = useAuth()
  const { t } = useTranslation()
  const confirm = useConfirm()
  const sheet = useSheet()
  const pick = usePick()
  const { data, mutate, isLoading } = useSWR<DhcpStatus>(cfg ? ['dhcp', cfg, '/dhcp/status'] : null, swrFetcher)
  const { data: interfaces } = useSWR<any>(cfg ? ['dhcpIf', cfg, '/dhcp/interfaces'] : null, swrFetcher, { refreshInterval: 0 })
  const [saving, setSaving] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [detectResult, setDetectResult] = useState<string[] | null>(null)
  const form = useDraftForm<DhcpStatus, DhcpConfigDraft>(data, toConfigDraft)
  const cur = form.draft

  if (!status?.dhcp_available) {
    return (
      <Screen>
        <PageHeader back title={t('advanced.titleDhcp')} />
        <EmptyState icon={<Wifi size={30} className="text-t3" />} title={t('advanced.dhcpUnavailable')} subtitle={t('advanced.dhcpUnavailableSub')} />
      </Screen>
    )
  }

  if (isLoading || !data || !cur) return <Screen><PageHeader back title={t('advanced.titleDhcp')} /><Loading /></Screen>

  const d = data

  // 所选接口的 v6 地址(决定 IPv6 表单的可用提示);接口数据是
  // /dhcp/interfaces 的裸键值对象,v4/v6 地址分别在 ipv4_addresses/ipv6_addresses
  const ifInfo = cur.interface_name ? interfaces?.[cur.interface_name] : null
  const ifHasV6 = (ifInfo?.ipv6_addresses ?? []).length > 0
  const ifAllAddrs = [...(ifInfo?.ipv4_addresses ?? []), ...(ifInfo?.ipv6_addresses ?? [])]

  // v4/v6 任一字段填过即视为该组启用,启用组必须填全才允许开启/保存
  const v4Fields = [cur.v4.gateway_ip, cur.v4.subnet_mask, cur.v4.range_start, cur.v4.range_end] as (string | undefined)[]
  const v4Filled = v4Fields.some(Boolean)
  const v4Complete = v4Fields.every(Boolean) && (cur.v4.lease_duration ?? 0) > 0
  const v6Filled = Boolean(cur.v6.range_start)
  const v6Complete = v6Filled && (cur.v6.lease_duration ?? 0) > 0
  const configValid = Boolean(cur.interface_name) && (!v4Filled || v4Complete) && (!v6Filled || v6Complete)

  async function saveConfig(next: DhcpConfigDraft) {
    if (!cfg) return
    if (next.enabled) {
      if (!next.interface_name) return toast(t('advanced.needInterface'), 'err')
      const f4 = [next.v4.gateway_ip, next.v4.subnet_mask, next.v4.range_start, next.v4.range_end].some(Boolean)
      if (f4 && !(next.v4.gateway_ip && next.v4.subnet_mask && next.v4.range_start && next.v4.range_end && next.v4.lease_duration > 0)) {
        return toast(t('advanced.incompleteV4'), 'err')
      }
      if (next.v6.range_start && !(next.v6.lease_duration > 0)) return toast(t('advanced.incompleteV6'), 'err')
    }
    await runMutation({
      action: async () => {
        await api(cfg, '/dhcp/set_config', {
          method: 'POST',
          body: {
            enabled: next.enabled,
            interface_name: next.interface_name,
            v4: next.v4,
            v6: next.v6,
          },
        })
        // Refetch before refilling: the server copy becomes the dirty baseline
        form.reset(await mutate())
      },
      okKey: 'advanced.savedDhcp',
      setBusy: setSaving,
    })
  }

  // v0.107.79 契约:结果在 v4/v6 的 other_server.found(yes/no/error)与
  // v4.static_ip(static + ip);检测到其他服务器时 server_ip 仅为旧字段,可能缺省
  function detectLines(r: any): string[] {
    const lines: string[] = []
    const pushServer = (proto: 'IPv4' | 'IPv6', os: any, key: 'advanced.detectV4Found' | 'advanced.detectV6Found') => {
      if (os?.found === 'yes') lines.push(t(key, { server: os.server_ip ? ` (${os.server_ip})` : '' }))
      else if (os?.found === 'error') lines.push(t('advanced.detectError', { proto, msg: os.error || '—' }))
      else lines.push(t(key === 'advanced.detectV4Found' ? 'advanced.detectV4None' : 'advanced.detectV6None'))
    }
    if (r?.v4) {
      pushServer('IPv4', r.v4.other_server, 'advanced.detectV4Found')
      if (r.v4.static_ip?.static === 'no' && r.v4.static_ip?.ip) {
        lines.push(t('advanced.detectDynIp', { ip: r.v4.static_ip.ip }))
      }
    }
    if (r?.v6) pushServer('IPv6', r.v6.other_server, 'advanced.detectV6Found')
    return lines
  }

  async function findActive() {
    if (!cfg || !cur) return
    setDetecting(true)
    setDetectResult(null)
    try {
      const r = await api<any>(cfg, '/dhcp/find_active_dhcp', { method: 'POST', body: { interface: cur.interface_name || '' } })
      setDetectResult(detectLines(r))
    } catch (e: any) {
      setDetectResult([t('advanced.detectError', { proto: 'IPv4', msg: e.message })])
    } finally {
      setDetecting(false)
    }
  }

  async function removeLease(mac: string) {
    if (!cfg) return
    await runMutation({
      action: () => api(cfg, '/dhcp/remove_static_lease', { method: 'POST', body: { mac } }),
      invalidate: mutate,
      okKey: 'advanced.leaseDeleted',
      failKey: 'common.deleteFailed',
    })
  }

  function openAddLease(init?: { mac?: string; ip?: string; hostname?: string }) {
    let mac = init?.mac ?? ''
    let ip = init?.ip ?? ''
    let hostname = init?.hostname ?? ''
    sheet.open(
      <div>
        <p className="mb-4 text-center text-[17px] font-bold text-t1">{t('advanced.addLeaseTitle')}</p>
        <div className="flex flex-col gap-3">
          <input className="field" placeholder={t('advanced.macPlaceholder')} defaultValue={mac} autoCapitalize="characters" onChange={(e) => (mac = e.target.value)} />
          <input className="field" placeholder={t('advanced.ipPlaceholder')} defaultValue={ip} onChange={(e) => (ip = e.target.value)} />
          <input className="field" placeholder={t('advanced.hostnamePlaceholder')} defaultValue={hostname} onChange={(e) => (hostname = e.target.value)} />
          <Button size="lg" className="mt-1" onClick={async () => {
            if (!mac.trim() || !ip.trim()) return toast(t('advanced.macIpRequired'), 'err')
            const ok = await runMutation({
              action: () => api(cfg!, '/dhcp/add_static_lease', { method: 'POST', body: { mac: mac.trim(), ip: ip.trim(), hostname: hostname.trim() } }),
              invalidate: mutate,
              okKey: 'advanced.leaseAdded',
              failKey: 'common.addFailed',
            })
            if (ok) sheet.close()
          }}>
            {t('common.add')}
          </Button>
        </div>
      </div>
    )
  }

  // /dhcp/update_static_lease 以 MAC 定位,"IP 版本须与原先一致",所以 MAC 只读
  function openEditLease(l: { mac: string; ip: string; hostname: string }) {
    let ip = l.ip
    let hostname = l.hostname
    sheet.open(
      <div>
        <p className="mb-4 text-center text-[17px] font-bold text-t1">{t('advanced.editLeaseTitle')}</p>
        <div className="flex flex-col gap-3">
          <input className="field opacity-50 cursor-not-allowed" value={l.mac} disabled />
          <input className="field" placeholder={t('advanced.ipPlaceholder')} defaultValue={l.ip} onChange={(e) => (ip = e.target.value)} />
          <input className="field" placeholder={t('advanced.hostnamePlaceholder')} defaultValue={l.hostname} onChange={(e) => (hostname = e.target.value)} />
          <Button size="lg" className="mt-1" onClick={async () => {
            if (!ip.trim()) return toast(t('advanced.macIpRequired'), 'err')
            const ok = await runMutation({
              action: () => api(cfg!, '/dhcp/update_static_lease', { method: 'POST', body: { mac: l.mac, ip: ip.trim(), hostname: hostname.trim() } }),
              invalidate: mutate,
              okKey: 'advanced.leaseUpdated',
            })
            if (ok) sheet.close()
          }}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    )
  }

  async function resetLeases() {
    if (!cfg) return
    await runMutation({
      action: () => api(cfg, '/dhcp/reset_leases', { method: 'POST', body: {} }),
      invalidate: mutate,
      okKey: 'advanced.resetLeasesDone',
    })
  }

  async function resetDhcp() {
    if (!cfg) return
    await runMutation({
      action: async () => {
        await api(cfg, '/dhcp/reset', { method: 'POST', body: {} })
        form.reset(await mutate())
      },
      okKey: 'advanced.resetDhcpDone',
    })
  }

  return (
    <Screen>
      <PageHeader back title={t('advanced.titleDhcp')} right={form.dirty ? <Button size="header" loading={saving} onClick={() => saveConfig(cur)} native={{ label: t('common.save'), foreground: 'accent' }}>{t('common.save')}</Button> : undefined} />
      {/* 官方说明与启用警告:不用卡片包裹,mt-5/mb-1.5 对齐其他设置页的间距节奏;警告句仅在停用态有意义 */}
      <div className="mt-5 mb-1.5 px-2 text-[12.5px] leading-relaxed">
        <p className="text-t2">{t('advanced.dhcpDesc')}</p>
        {!cur.enabled && (
          <p className="mt-1.5 flex items-start gap-1.5" style={{ color: 'var(--warn)' }}>
            <AlertTriangle size={14} className="mt-0.5 flex-none" />
            <span>{t('advanced.dhcpWarn')}</span>
          </p>
        )}
      </div>

      <Group>
        <Rows>
          <Row
            title={t('advanced.enableDhcp')}
            subtitle={t('advanced.enableDhcpSub')}
            right={<Switch on={cur.enabled} onChange={(v) => {
              // 与原生一致:启用前要求接口已选且已填的配置组完整
              if (v) {
                if (!cur.interface_name) return toast(t('advanced.needInterface'), 'err')
                if (v4Filled && !v4Complete) return toast(t('advanced.incompleteV4'), 'err')
                if (v6Filled && !v6Complete) return toast(t('advanced.incompleteV6'), 'err')
                setDetectResult(null)
              }
              form.patch('enabled', v)
            }} />}
          />
          <Row
            title={t('advanced.interface')}
            value={cur.interface_name || t('advanced.choose')}
            onClick={(e) => {
              // /dhcp/interfaces 是以接口名为键的裸对象，地址在
              // ipv4_addresses/ipv6_addresses（无 interfaces 包裹，v6 可为 null）
              const ifs = interfaces ?? {}
              pick({
                title: t('advanced.chooseInterface'),
                anchor: e.currentTarget,
                align: 'right',
                value: cur.interface_name,
                options: Object.keys(ifs).map((n) => {
                  const addrs = [...(ifs[n].ipv4_addresses ?? []), ...(ifs[n].ipv6_addresses ?? [])]
                  return { label: addrs.length ? `${n}(${addrs.join(', ')})` : n, value: n }
                }),
                onPick: (v) => form.patch('interface_name', v),
              })
            }}
          />
          <Row
            title={t('advanced.detectOther')}
            subtitle={cur.enabled ? t('advanced.detectDisabled') : t('advanced.detectOtherSub')}
            onClick={() => {
              if (cur.enabled || detecting) return toast(t('advanced.detectDisabled'), 'err')
              findActive()
            }}
            last
          />
        </Rows>
      </Group>

      {cur.interface_name && ifInfo && (
        <div className="mt-2.5">
          <GroupTitle>{t('advanced.ifDetails')}</GroupTitle>
          <Group>
            <Rows>
              <Row title={t('advanced.ifGateway')} value={ifInfo.gateway_ip || '—'} />
              <Row title={t('advanced.ifHwAddr')} value={ifInfo.hardware_address || '—'} />
              <Row title={t('advanced.ifAddrs')} value={ifAllAddrs.length ? ifAllAddrs.join(', ') : '—'} last />
            </Rows>
          </Group>
        </div>
      )}
      {detectResult && detectResult.length > 0 && (
        <div className="mt-2 px-2">
          {detectResult.map((line, i) => (
            <p key={i} className="text-[12.5px] leading-relaxed text-t2">{line}</p>
          ))}
        </div>
      )}

      {cur.enabled && (
        <div>
            <GroupTitle>{t('advanced.v4Group')}</GroupTitle>
            <Group>
            <Rows>
              <Row title={t('advanced.gateway')} right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={cur.v4.gateway_ip} onChange={(e) => form.patch('v4', { ...cur.v4, gateway_ip: e.target.value })} /></div>} />
              <Row title={t('advanced.subnetMask')} right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={cur.v4.subnet_mask} onChange={(e) => form.patch('v4', { ...cur.v4, subnet_mask: e.target.value })} /></div>} />
              <Row title={t('advanced.rangeStart')} right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={cur.v4.range_start} onChange={(e) => form.patch('v4', { ...cur.v4, range_start: e.target.value })} /></div>} />
              <Row title={t('advanced.rangeEnd')} right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={cur.v4.range_end} onChange={(e) => form.patch('v4', { ...cur.v4, range_end: e.target.value })} /></div>} />
              <Row title={t('advanced.leaseDuration')} right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={cur.v4.lease_duration} onChange={(e) => form.patch('v4', { ...cur.v4, lease_duration: Number(e.target.value) })} /></div>} last />
            </Rows>
            </Group>

            <GroupTitle>{t('advanced.v6Group')}</GroupTitle>
            <Group>
            <Rows>
              <Row title={t('advanced.rangeStart')} right={<div className="w-40 flex-none"><input className="field num !py-1.5 text-right" value={cur.v6.range_start} onChange={(e) => form.patch('v6', { ...cur.v6, range_start: e.target.value })} /></div>} />
              <Row title={t('advanced.leaseDuration')} right={<div className="w-24 flex-none"><input className="field num !py-1.5 text-right" type="number" value={cur.v6.lease_duration} onChange={(e) => form.patch('v6', { ...cur.v6, lease_duration: Number(e.target.value) })} /></div>} last />
            </Rows>
            </Group>
            {cur.interface_name && !ifHasV6 && (
              <p className="mt-2 px-2 text-[12px] leading-relaxed text-t3">{t('advanced.v6NoIface')}</p>
            )}
        </div>
      )}

      {cur.enabled && d.leases.length > 0 && (
        <div className="mt-4">
          <GroupTitle>{t('advanced.leases', { n: d.leases.length })}</GroupTitle>
          {d.leases.length > 0 ? (
            <Group>
              <Rows>
                {d.leases.map((l, i) => (
                  <Row
                    key={`${l.mac}-${l.ip}`}
                    title={l.hostname || l.ip}
                    subtitle={`${l.mac} · ${l.ip} · ${t('advanced.expiresAt', { time: fmtDate(l.expires) })}`}
                    right={
                      <button onClick={() => openAddLease({ mac: l.mac, ip: l.ip, hostname: l.hostname })} className="press text-accent" title={t('advanced.makeStatic')}>
                        <Plus size={15} />
                      </button>
                    }
                    last={i === d.leases.length - 1}
                  />
                ))}
              </Rows>
            </Group>
          ) : (
            <p className="px-2 text-[12.5px] text-t3">{t('advanced.noLeases')}</p>
          )}
          <Card className="mt-2.5">
            <Row
              title={t('advanced.resetLeases')}
              subtitle={t('advanced.resetLeasesSub')}
              danger
              onClick={() => confirm({ title: t('advanced.resetLeasesTitle'), destructive: true, confirmText: t('common.confirm'), onConfirm: resetLeases })}
              last
            />
          </Card>
        </div>
      )}

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
                  <div className="flex flex-none items-center gap-3 text-t3">
                    <button onClick={() => openEditLease(l)} className="press" title={t('advanced.editLeaseTitle')}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => confirm({ title: t('advanced.leaseDeleteTitle', { name: l.hostname || l.ip }), destructive: true, confirmText: t('common.delete'), onConfirm: () => removeLease(l.mac) })} className="press">
                      <Trash2 size={15} />
                    </button>
                  </div>
                }
                last={i === d.static_leases.length - 1}
              />
            ))}
          </Rows>
        </Group>
      )}
      <Card className="mt-2.5">
        <Row icon={<Plus size={17} className="text-accent" />} title={t('advanced.addLeaseTitle')} onClick={() => openAddLease()} last />
      </Card>

      <Card className="mt-2.5">
        <Row
          title={t('advanced.resetDhcp')}
          subtitle={t('advanced.resetDhcpSub')}
          danger
          onClick={() => confirm({ title: t('advanced.resetDhcpTitle'), message: t('advanced.resetDhcpMsg'), destructive: true, confirmText: t('common.confirm'), onConfirm: resetDhcp })}
          last
        />
      </Card>
    </Screen>
  )
}
