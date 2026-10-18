/** Sync-to-other-instances content: target selection + pre-sync backup toggle.
 *  Shared by the desktop centered sheet and the mobile /sync/:type sub-page
 *  (mobile shows no floating panels at all, see docs/web-interaction.md). */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Server, Check, AlertTriangle, Shield } from 'lucide-react'
import { useAuth, mutateInstanceData } from '../../lib/session/auth'
import { activeEndpoint, type Instance } from '../../lib/session/instances'
import { Button } from '../ui/primitives'
import { toast } from '../ui/toast'
import type { SyncExecutionSummary } from '../../lib/session/rulesSync'
import { captureInstanceSnapshot } from '../../lib/snapshot/snapshotCapture'
import { saveSnapshot } from '../../lib/snapshot/snapshotStorage'

interface SyncFormProps {
  itemCount: number
  itemTypeLabel: string
  onSync: (targets: Instance[]) => Promise<SyncExecutionSummary>
  onClose: () => void
}

/** Check square used by the target list and the backup toggle */
function CheckSquare({ checked }: { checked: boolean }) {
  return (
    <div
      className={`flex h-4 w-4 flex-none items-center justify-center rounded border transition-colors ${
        checked
          ? 'border-accent bg-accent text-white'
          : 'border-[var(--glass-border-strong)] text-transparent'
      }`}
    >
      {checked && <Check size={11} strokeWidth={3} />}
    </div>
  )
}

export function SyncForm({
  itemCount,
  itemTypeLabel,
  onSync,
  onClose,
}: SyncFormProps) {
  const { store, activeId, instances } = useAuth()
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [backupBeforeSync, setBackupBeforeSync] = useState(true)

  // Targets are other configured instances (not the currently active one)
  const otherInstances = (store?.instances ?? []).filter((i) => i.id !== activeId)

  // Default to selecting only online instances to prevent unnecessary timeout waits
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const onlineOthers = otherInstances.filter((inst) => {
      const view = instances.find((x) => x.id === inst.id)
      return view?.online !== 'down'
    })
    return new Set(onlineOthers.map((i) => i.id))
  })

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleStart() {
    const targets = otherInstances.filter((i) => selectedIds.has(i.id))
    if (targets.length === 0) {
      toast(t('filters.syncNoTargetSelected'), 'err')
      return
    }

    setBusy(true)
    try {
      // Automatic pre-sync safety backup if enabled
      if (backupBeforeSync) {
        for (const inst of targets) {
          const ep = activeEndpoint(inst)
          const view = instances.find((x) => x.id === inst.id)
          if (ep) {
            try {
              const guard = await captureInstanceSnapshot(
                { url: ep.url, username: ep.username, password: ep.password },
                {
                  id: inst.id,
                  label: inst.label,
                  url: ep.url,
                  aghVersion: view?.version || 'unknown',
                },
                {
                  label: t('settings.snapshotPreSyncLabel', { type: itemTypeLabel }),
                  description: t('settings.snapshotPreSyncDesc', { type: itemTypeLabel, count: itemCount }),
                  trigger: 'pre_sync',
                }
              )
              await saveSnapshot(guard)
            } catch {
              /* Non-fatal: do not block sync if snapshot capture fails */
            }
          }
        }
      }

      const summary = await onSync(targets)
      // Invalidate cache for targets that succeeded
      for (const inst of targets) {
        const ep = activeEndpoint(inst)
        if (ep) void mutateInstanceData(ep)
      }

      if (summary.failed > 0) {
        toast(
          t('filters.syncPartialToast', {
            success: summary.succeeded,
            failed: summary.failed,
          }) + (backupBeforeSync ? ` (${t('settings.snapshotRollbackHint')})` : ''),
          'err'
        )
      } else {
        toast(t('filters.syncSuccessToast', { count: summary.succeeded }))
      }
      onClose()
    } catch (e: any) {
      toast(t('common.opFailed', { msg: e?.message || String(e) }), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] leading-relaxed text-t2">
        {t('filters.syncModalDesc')}
      </p>

      <div className="glass flex items-center gap-2 rounded-2xl p-3 text-[12px] text-t2">
        <AlertTriangle size={15} className="text-warn flex-none" />
        <span>
          {t('filters.syncSourceDesc', { count: itemCount, type: itemTypeLabel })}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="px-2 text-[12px] font-semibold uppercase tracking-wider text-t3">
          {t('filters.syncTargetSelect')}
        </p>
        <div className="glass flex flex-col divide-y divide-[var(--glass-border)] overflow-hidden rounded-2xl">
          {otherInstances.map((inst) => {
            const isChecked = selectedIds.has(inst.id)
            const view = instances.find((x) => x.id === inst.id)
            const isOffline = view?.online === 'down'

            return (
              <div
                key={inst.id}
                onClick={() => toggle(inst.id)}
                className="flex cursor-pointer select-none items-center justify-between gap-2 p-3 transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <CheckSquare checked={isChecked} />
                  <Server size={15} className="flex-none text-t3" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-t1">{inst.label}</p>
                    {isOffline && (
                      <span className="text-[10.5px] text-danger">
                        {t('filters.syncOfflineBadge')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Auto Backup Toggle */}
      <div
        onClick={() => setBackupBeforeSync(!backupBeforeSync)}
        className="glass press flex cursor-pointer select-none items-center gap-2 rounded-2xl p-3 text-[12px] text-t2"
      >
        <CheckSquare checked={backupBeforeSync} />
        <Shield size={14} className="text-accent flex-none" />
        <span>{t('settings.snapshotBackupBeforeSync')}</span>
      </div>

      <div className="mt-2 flex gap-2">
        <Button
          variant="glass"
          className="flex-1"
          onClick={onClose}
          disabled={busy}
        >
          {t('common.cancel')}
        </Button>
        <Button
          className="flex-1"
          onClick={handleStart}
          loading={busy}
          disabled={selectedIds.size === 0}
        >
          {t('filters.syncButton')}
        </Button>
      </div>
    </div>
  )
}
