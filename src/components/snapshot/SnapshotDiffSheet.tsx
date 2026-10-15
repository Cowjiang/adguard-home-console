/**
 * Snapshot difference comparison and selective rollback sheet.
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Layers,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import { useAuth, mutateInstanceData } from '../../lib/session/auth'
import { captureInstanceSnapshot } from '../../lib/snapshot/snapshotCapture'
import { computeSnapshotDiff } from '../../lib/snapshot/snapshotDiff'
import { restoreSnapshot, validateSnapshot } from '../../lib/snapshot/snapshotRestore'
import type {
  AghConfigSnapshot,
  DiffItem,
  ModuleDiffSummary,
  SnapshotModule,
  SnapshotPayload,
} from '../../lib/snapshot/types'
import { Badge, Loading } from '../ui/atoms'
import { Button } from '../ui/primitives'
import { useConfirm } from '../ui/sheet'
import { toast } from '../ui/toast'

interface SnapshotDiffSheetProps {
  snapshot: AghConfigSnapshot
  onClose: () => void
  onRestored?: () => void
}

export function SnapshotDiffSheet({ snapshot, onClose, onRestored }: SnapshotDiffSheetProps) {
  const { cfg, activeId, status, instances } = useAuth()
  const activeInstance = instances.find((i) => i.id === activeId) || instances[0]
  const { t } = useTranslation()
  const confirm = useConfirm()

  const [currentPayload, setCurrentPayload] = useState<SnapshotPayload | null>(null)
  const [loadingCurrent, setLoadingCurrent] = useState(true)
  const [checksumWarning, setChecksumWarning] = useState(false)
  const [restoring, setRestoring] = useState(false)

  // Fetch current state for comparison on mount
  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!cfg || !activeInstance) {
        setLoadingCurrent(false)
        return
      }

      // Checksum validation
      const validation = await validateSnapshot(snapshot)
      if (validation.warnings.some((w) => w.toLowerCase().includes('checksum'))) {
        setChecksumWarning(true)
      }

      try {
        const liveSnapshot = await captureInstanceSnapshot(
          cfg,
          {
            id: activeInstance.id,
            label: activeInstance.label,
            url: activeInstance.url,
            aghVersion: status?.version || 'unknown',
          },
          {
            label: 'Temporary Live Capture',
            trigger: 'manual',
            modules: snapshot.meta.modules,
          }
        )
        if (!cancelled) {
          setCurrentPayload(liveSnapshot.data)
        }
      } catch (err: any) {
        toast(err?.message || 'Failed to capture live configuration for comparison', 'err')
      } finally {
        if (!cancelled) {
          setLoadingCurrent(false)
        }
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [cfg, activeInstance, status, snapshot])

  // Compute diffs
  const diffSummaries: ModuleDiffSummary[] = useMemo(() => {
    if (!currentPayload) return []
    return computeSnapshotDiff(currentPayload, snapshot.data, snapshot.meta.modules)
  }, [currentPayload, snapshot])

  // Initially select modules that actually have differences
  const [selectedModules, setSelectedModules] = useState<Set<SnapshotModule>>(() => {
    return new Set(snapshot.meta.modules)
  })

  // Once diffs are calculated, auto-focus selection on changed modules
  useEffect(() => {
    if (diffSummaries.length > 0) {
      const changed = diffSummaries.filter((d) => d.hasChanges).map((d) => d.module)
      if (changed.length > 0) {
        setSelectedModules(new Set(changed))
      }
    }
  }, [diffSummaries])

  const totalDifferences = useMemo(() => {
    return diffSummaries.reduce((sum, item) => sum + item.diffs.length, 0)
  }, [diffSummaries])

  function toggleModule(mod: SnapshotModule) {
    setSelectedModules((prev) => {
      const next = new Set(prev)
      if (next.has(mod)) next.delete(mod)
      else next.add(mod)
      return next
    })
  }

  async function handleStartRestore() {
    if (!cfg || !activeInstance) return
    const modulesToRestore = Array.from(selectedModules)
    if (modulesToRestore.length === 0) {
      toast(t('settings.snapshotDiffSelectModules'), 'err')
      return
    }

    confirm({
      title: t('settings.snapshotRestoreConfirmTitle'),
      message: t('settings.snapshotRestoreConfirmMsg'),
      confirmText: t('settings.snapshotRestoreStart'),
      destructive: true,
      onConfirm: async () => {
        setRestoring(true)
        try {
          const res = await restoreSnapshot(cfg, snapshot, {
            selectedModules: modulesToRestore,
            autoPreRollbackSnapshot: true,
            currentInstanceMeta: {
              id: activeInstance.id,
              label: activeInstance.label,
              url: activeInstance.url,
              aghVersion: status?.version || 'unknown',
            },
          })

          void mutateInstanceData(cfg)

          if (res.success) {
            toast(t('settings.snapshotRestoreSuccess', { count: res.succeededModules }))
            onRestored?.()
            onClose()
          } else {
            toast(
              t('settings.snapshotRestorePartial', {
                succeeded: res.succeededModules,
                failed: res.failedModules,
              }),
              'err'
            )
          }
        } catch (e: any) {
          toast(e?.message || 'Restore failed', 'err')
        } finally {
          setRestoring(false)
        }
      },
    })
  }

  return (
    <div className="flex flex-col gap-4 max-h-[80vh] overflow-y-auto pr-1">
      {/* Header Info */}
      <div className="border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-accent flex-none" />
          <h2 className="text-[17px] font-bold text-t1">{snapshot.meta.label}</h2>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-t3">
          <span className="flex items-center gap-1">
            <Clock size={13} />
            {new Date(snapshot.meta.createdAt).toLocaleString()}
          </span>
          <span>•</span>
          <span>{snapshot.meta.sourceInstance.label}</span>
          <span>•</span>
          <Badge kind="info">{snapshot.meta.sourceInstance.aghVersion}</Badge>
        </div>
        {snapshot.meta.description && (
          <p className="mt-2 text-[12.5px] text-t2 leading-relaxed bg-black/5 dark:bg-white/5 rounded-xl p-2.5">
            {snapshot.meta.description}
          </p>
        )}
      </div>

      {/* Tampering Warning */}
      {checksumWarning && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn-soft p-3 text-[12.5px] text-warn">
          <ShieldAlert size={16} className="mt-0.5 flex-none" />
          <span>{t('settings.snapshotDiffChecksumWarning')}</span>
        </div>
      )}

      {/* Loading state */}
      {loadingCurrent ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2">
          <Loading />
          <span className="text-[12px] text-t3">Comparing live configuration...</span>
        </div>
      ) : (
        <>
          {/* Changes summary */}
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-semibold text-t1">
              {totalDifferences === 0
                ? t('settings.snapshotDiffNoChanges')
                : t('settings.snapshotDiffChangesDetected', { count: totalDifferences })}
            </span>
            <span className="text-[11.5px] text-t3">
              {selectedModules.size} / {snapshot.meta.modules.length} modules selected
            </span>
          </div>

          {/* Module selection & differences */}
          <div className="flex flex-col gap-3">
            {diffSummaries.map((summary) => {
              const isSelected = selectedModules.has(summary.module)
              return (
                <div
                  key={summary.module}
                  className={`rounded-2xl border transition-all p-3.5 ${
                    isSelected ? 'border-accent/40 bg-accent-soft/20' : 'border-border/50 bg-card'
                  }`}
                >
                  <div
                    className="flex cursor-pointer items-center justify-between"
                    onClick={() => toggleModule(summary.module)}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
                          isSelected
                            ? 'border-accent bg-accent text-white'
                            : 'border-border bg-card text-transparent'
                        }`}
                      >
                        <Check size={13} strokeWidth={3} />
                      </div>
                      <span className="text-[14px] font-semibold text-t1 uppercase tracking-wide">
                        {summary.module}
                      </span>
                    </div>
                    {summary.hasChanges ? (
                      <Badge kind="warn">{summary.diffs.length} diffs</Badge>
                    ) : (
                      <span className="flex items-center gap-1 text-[12px] text-ok">
                        <CheckCircle2 size={13} /> Identical
                      </span>
                    )}
                  </div>

                  {/* Expanded Diff List for this module */}
                  {summary.hasChanges && isSelected && (
                    <div className="mt-3 flex flex-col gap-1.5 border-t border-border/40 pt-2.5">
                      {summary.diffs.map((diff: DiffItem, idx: number) => (
                        <div
                          key={idx}
                          className="flex flex-col gap-0.5 rounded-lg bg-black/5 dark:bg-white/5 p-2 text-[12px]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-t1">{diff.label}</span>
                            <span
                              className={`text-[10.5px] px-1.5 py-0.5 rounded font-mono uppercase ${
                                diff.type === 'added'
                                  ? 'bg-ok-soft text-ok'
                                  : diff.type === 'deleted'
                                  ? 'bg-danger-soft text-danger'
                                  : 'bg-warn-soft text-warn'
                              }`}
                            >
                              {diff.type}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 font-mono text-[11px] text-t3 break-all">
                            {diff.type === 'modified' ? (
                              <>
                                <span className="line-through text-danger">
                                  {String(diff.oldValue)}
                                </span>
                                <ArrowRight size={10} className="flex-none text-t3" />
                                <span className="text-ok">{String(diff.newValue)}</span>
                              </>
                            ) : diff.type === 'added' ? (
                              <span className="text-ok">+ {String(diff.newValue)}</span>
                            ) : (
                              <span className="text-danger">- {String(diff.oldValue)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Action buttons */}
          <div className="mt-2 flex items-center justify-end gap-2 border-t border-border/40 pt-3">
            <Button variant="ghost" onClick={onClose} disabled={restoring}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={restoring}
              disabled={selectedModules.size === 0}
              onClick={handleStartRestore}
            >
              <RotateCcw size={15} />
              {t('settings.snapshotRestoreStart')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
