/** 防护总开关卡片(仪表盘/防护页共用) */
import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, ShieldOff, Clock3, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { Button, Switch, toast, usePick } from './ui'
import { fmtDuration, fmtTime } from '../lib/format'

export function ProtectionCard() {
  const { cfg, status, refreshStatus } = useAuth()
  const { t } = useTranslation()
  const pick = usePick()
  const [busy, setBusy] = useState(false)
  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null)

  const serverEnabled = status?.protection_enabled ?? false
  // 乐观更新：等待 API 期间立即显示目标状态，服务端确认后自动对齐
  const enabled = pendingEnabled ?? serverEnabled
  if (pendingEnabled !== null && pendingEnabled === serverEnabled) {
    // 用微任务清除，避免渲染期间 setState
    queueMicrotask(() => setPendingEnabled(null))
  }
  const disabledUntil = (status as any)?.protection_disabled_until as string | undefined
  // 服务器以毫秒报告暂停时长(protection_disabled_duration 与请求 duration 同单位)
  const disabledDurMs = status?.protection_disabled_duration ?? 0

  // 截止时间只在状态快照变化时计算一次(放到渲染期算会因 Date.now() 漂移,
  // 每 5 秒的统计轮询重渲染会不断重置到期定时器,导致永远不刷新)
  const resumeAtMs = useMemo(() => {
    if (disabledUntil) return new Date(disabledUntil).getTime()
    if (disabledDurMs > 0) return Date.now() + disabledDurMs
    return 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabledUntil, disabledDurMs])

  // 定时暂停到期后自动刷新状态,让界面及时恢复"防护已开启"
  useEffect(() => {
    if (enabled || !resumeAtMs) return
    const wait = Math.max(1000, resumeAtMs - Date.now() + 1000)
    const id = setTimeout(() => refreshStatus(), wait)
    return () => clearTimeout(id)
  }, [enabled, resumeAtMs, refreshStatus])

  // 暂停期间每秒跳动倒计时
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (enabled || !resumeAtMs) return
    setNowTick(Date.now())
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [enabled, resumeAtMs])

  const remainingMs = Math.max(0, resumeAtMs - nowTick)

  async function setProtection(next: boolean, duration?: number) {
    if (!cfg) return
    setPendingEnabled(next)
    setBusy(true)
    try {
      await api(cfg, '/protection', { method: 'POST', body: { enabled: next, duration: (duration ?? 0) * 1000 } })
      toast(next ? t('protection.on') : t('protection.off'))
      refreshStatus()
    } catch (e: any) {
      setPendingEnabled(null)
      toast(t('common.opFailed', { msg: e.message }), 'err')
    } finally {
      setBusy(false)
    }
  }

  function openPausePicker(e: React.MouseEvent<HTMLElement>) {
    // 时长档位标签复用 units 词典(en 侧自动取复数形式)
    const options = [
      { value: 0, label: t('protection.untilManual') },
      { value: 30, label: t('units.second', { count: 30 }) },
      { value: 300, label: t('units.minute', { count: 5 }) },
      { value: 1800, label: t('units.minute', { count: 30 }) },
      { value: 3600, label: t('units.hour', { count: 1 }) },
      { value: 10800, label: t('units.hour', { count: 3 }) },
    ]
    pick({
      title: t('protection.pauseTitle'),
      anchor: e.currentTarget,
      align: 'right',
      options: options.map((o) => ({ label: o.value === 0 ? o.label : t('protection.pauseFor', { label: o.label }), value: o.value })),
      onPick: (v) => setProtection(false, v),
    })
  }

  return (
    <div
      className="specular relative overflow-hidden rounded-[28px] p-5"
      style={{
        background: enabled
          ? 'linear-gradient(140deg, color-mix(in srgb, var(--accent) 20%, var(--glass-strong)), var(--glass-strong))'
          : 'linear-gradient(140deg, color-mix(in srgb, var(--danger) 16%, var(--glass-strong)), var(--glass-strong))',
        border: '1px solid var(--glass-border-strong)',
        boxShadow: 'var(--glass-inset), var(--shadow-card)',
      }}
    >
      <div className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 flex-none items-center justify-center rounded-[19px]"
          style={{
            background: enabled ? 'var(--accent-soft)' : 'var(--danger-soft)',
            color: enabled ? 'var(--accent)' : 'var(--danger)',
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${enabled ? 'var(--accent)' : 'var(--danger)'} 22%, transparent)`,
          }}
        >
          {enabled ? <ShieldCheck size={28} /> : <ShieldOff size={28} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-bold leading-snug text-t1">{enabled ? t('protection.on') : t('protection.off')}</p>
          <p className="text-[12.5px] text-t2 num">
            {!enabled && resumeAtMs
              ? t('protection.resumeAt', { time: fmtTime(new Date(resumeAtMs).toISOString()), left: fmtDuration(remainingMs / 1000) })
              : !enabled
                ? t('protection.pausedManual')
                : t('protection.tagline')}
          </p>
        </div>
        <Switch on={enabled} loading={busy} onChange={(v) => (v ? setProtection(true) : setProtection(false))} />
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="glass" size="sm" onClick={(e) => openPausePicker(e)}>
          <Clock3 size={14} /> {t('protection.pauseAction')}
        </Button>
        <Button variant="glass" size="sm" loading={busy} onClick={() => refreshStatus()}>
          <RefreshCw size={14} /> {t('protection.refresh')}
        </Button>
      </div>
    </div>
  )
}
