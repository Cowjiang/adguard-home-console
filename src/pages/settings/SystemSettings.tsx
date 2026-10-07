/** System management: version check, update entry */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../lib/session/auth'
import { api, type VersionInfo } from '../../lib/api'
import { PageHeader, Screen, Card, Group, GroupTitle, Rows, Row, Button } from '../../components/ui/primitives'
import { useConfirm } from '../../components/ui/sheet'
import { toast } from '../../components/ui/toast'
import { Badge, IconBubble } from '../../components/ui/atoms'
import { Network, DownloadCloud, RotateCcw, Eraser, Trash } from 'lucide-react'
import { fmtDate } from '../../lib/format'

/* ================= System management ================= */

export function SystemPage() {
  const { cfg, status } = useAuth()
  const { t } = useTranslation()
  const confirm = useConfirm()
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)

  async function checkUpdate() {
    if (!cfg) return
    setChecking(true)
    try {
      const r = await api<VersionInfo>(cfg, '/version.json', { method: 'POST', body: { recheck_now: true } })
      setVersionInfo(r)
      if (r.disabled) toast(t('settings.updateDisabled'))
      else if (r.new_version && r.new_version !== status?.version) toast(t('settings.newVersionFound', { v: r.new_version }))
      else toast(t('settings.upToDate'))
    } catch (e: any) {
      toast(t('settings.checkFailed', { msg: e.message }), 'err')
    } finally {
      setChecking(false)
    }
  }

  async function autoUpdate() {
    if (!cfg) return
    setUpdating(true)
    try {
      await api(cfg, '/update', { method: 'POST', body: {} })
      toast(t('settings.autoUpdateStarted'))
    } catch (e: any) {
      toast(t('common.updateFailed', { msg: e.message }), 'err')
    } finally {
      setUpdating(false)
    }
  }

  // doneKey/failKey point to the settings-domain success/failure toasts
  async function maintenance(path: string, doneKey: 'settings.cacheDone' | 'settings.statsDone' | 'settings.logDone', failKey: 'settings.cacheFail' | 'settings.statsFail' | 'settings.logFail') {
    if (!cfg) return
    try {
      await api(cfg, path, { method: 'POST', body: {} })
      toast(t(doneKey))
    } catch (e: any) {
      toast(t(failKey, { msg: e.message }), 'err')
    }
  }

  const hasNew = versionInfo?.new_version && versionInfo.new_version !== status?.version

  return (
    <Screen>
      <PageHeader back title={t('settings.systemTitle')} />

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle>{t('settings.versionGroup')}</GroupTitle>
          <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[15px] font-semibold text-t1">AdGuard Home</p>
            <p className="text-[13px] text-t2 num">{t('settings.currentVersion', { v: status?.version ?? '—' })}</p>
          </div>
          <Button variant="glass" size="sm" loading={checking} onClick={checkUpdate}>
            <DownloadCloud size={14} /> {t('settings.checkUpdate')}
          </Button>
        </div>
        {versionInfo && !versionInfo.disabled && (
          <div className="mt-3 rounded-2xl px-4 py-3" style={{ background: 'var(--accent-soft)' }}>
            <div className="flex items-center gap-2">
              <Badge kind={hasNew ? 'ok' : 'info'}>{hasNew ? t('settings.newVersionBadge', { v: versionInfo.new_version }) : t('settings.upToDateBadge')}</Badge>
            </div>
            {versionInfo.announcement && <p className="mt-1.5 text-[12.5px] leading-relaxed text-t2">{versionInfo.announcement}</p>}
            {hasNew && versionInfo.can_autoupdate && (
              <Button size="sm" className="mt-2.5" loading={updating} onClick={() => confirm({
                title: t('settings.autoUpdateConfirmTitle'),
                message: t('settings.autoUpdateConfirmMsg'),
                confirmText: t('settings.startUpdate'),
                onConfirm: autoUpdate,
              })}>
                {t('settings.autoUpdateAction')}
              </Button>
            )}
          </div>
        )}
      </Card>
        </div>
        <div>
          <GroupTitle>{t('settings.maintenanceGroup')}</GroupTitle>
          <Group>
        <Rows>
          <Row
            icon={<IconBubble color="var(--accent-2)" bg="color-mix(in srgb, var(--accent-2) 14%, transparent)"><Eraser size={17} /></IconBubble>}
            title={t('settings.clearDnsCache')}
            subtitle={t('settings.clearDnsCacheSub')}
            onClick={() => maintenance('/cache_clear', 'settings.cacheDone', 'settings.cacheFail')}
          />
          <Row
            icon={<IconBubble color="var(--warn)" bg="var(--warn-soft)"><RotateCcw size={17} /></IconBubble>}
            title={t('settings.resetStats')}
            subtitle={t('settings.resetStatsSub')}
            onClick={() => confirm({
              title: t('settings.resetStatsConfirmTitle'),
              message: t('settings.resetStatsConfirmMsg'),
              destructive: true,
              confirmText: t('settings.resetConfirm'),
              onConfirm: () => maintenance('/stats_reset', 'settings.statsDone', 'settings.statsFail'),
            })}
          />
          <Row
            icon={<IconBubble color="var(--danger)" bg="var(--danger-soft)"><Trash size={17} /></IconBubble>}
            title={t('settings.clearQueryLog')}
            subtitle={t('settings.clearQueryLogSub')}
            onClick={() => confirm({
              title: t('settings.clearLogConfirmTitle'),
              message: t('settings.clearLogConfirmMsg'),
              destructive: true,
              confirmText: t('settings.clearConfirm'),
              onConfirm: () => maintenance('/querylog_clear', 'settings.logDone', 'settings.logFail'),
            })}
            last
          />
        </Rows>
      </Group>
        </div>
      </div>

      {status && (
        <p className="mt-4 px-2 text-center text-[11.5px] text-t3 num">
          {t('settings.startedAt', { time: fmtDate(new Date(status.start_time).toISOString()) })}
        </p>
      )}
    </Screen>
  )
}

