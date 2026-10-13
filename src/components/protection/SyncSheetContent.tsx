import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Server, Check, AlertTriangle } from 'lucide-react'
import { useAuth, mutateInstanceData } from '../../lib/session/auth'
import { activeEndpoint, type Instance } from '../../lib/session/instances'
import { Button } from '../ui/primitives'
import { toast } from '../ui/toast'
import type { SyncExecutionSummary } from '../../lib/session/rulesSync'

interface SyncSheetContentProps {
  itemCount: number
  itemTypeLabel: string
  onSync: (targets: Instance[]) => Promise<SyncExecutionSummary>
  onClose: () => void
}

export function SyncSheetContent({
  itemCount,
  itemTypeLabel,
  onSync,
  onClose,
}: SyncSheetContentProps) {
  const { store, activeId, instances } = useAuth()
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

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
          }),
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
      <div>
        <p className="text-[17px] font-bold text-t1">{t('filters.syncModalTitle')}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-t2">
          {t('filters.syncModalDesc')}
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-xl bg-card p-3 text-[12px] text-t2 border border-border">
        <AlertTriangle size={15} className="text-warn flex-none" />
        <span>
          {t('filters.syncSourceDesc', { count: itemCount, type: itemTypeLabel })}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[12px] font-semibold text-t3 uppercase tracking-wider">
          {t('filters.syncTargetSelect')}
        </p>
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border overflow-hidden bg-card">
          {otherInstances.map((inst) => {
            const isChecked = selectedIds.has(inst.id)
            const view = instances.find((x) => x.id === inst.id)
            const isOffline = view?.online === 'down'

            return (
              <div
                key={inst.id}
                onClick={() => toggle(inst.id)}
                className="flex cursor-pointer items-center justify-between p-3 transition-colors hover:bg-muted/40 select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                      isChecked
                        ? 'border-accent bg-accent text-white'
                        : 'border-border bg-transparent'
                    }`}
                  >
                    {isChecked && <Check size={11} strokeWidth={3} />}
                  </div>
                  <Server size={15} className="text-t3 flex-none" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-t1 truncate">{inst.label}</p>
                    {isOffline && (
                      <span className="text-[10.5px] text-danger">
                        （{t('filters.syncOfflineBadge')}）
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
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
