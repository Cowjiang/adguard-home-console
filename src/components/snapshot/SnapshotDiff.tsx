/**
 * Snapshot diff comparison and selective rollback content, shared by the
 * desktop centered sheet and the mobile /settings/snapshots/diff sub-page
 * (browsing content stays out of mobile overlays, see docs/web-interaction.md).
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
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

/** Diff kind → badge tone + localized label */
function diffKindMeta(type: DiffItem['type']): {
  kind: 'ok' | 'blocked' | 'warn'
  labelKey:
    | 'settings.snapshotDiffTypeAdded'
    | 'settings.snapshotDiffTypeDeleted'
    | 'settings.snapshotDiffTypeModified'
} {
  switch (type) {
    case 'added':
      return { kind: 'ok', labelKey: 'settings.snapshotDiffTypeAdded' }
    case 'deleted':
      return { kind: 'blocked', labelKey: 'settings.snapshotDiffTypeDeleted' }
    default:
      return { kind: 'warn', labelKey: 'settings.snapshotDiffTypeModified' }
  }
}

export function SnapshotDiff({
  snapshot,
  onDone,
  onClose,
}: {
  snapshot: AghConfigSnapshot
  /** Successful restore landing: sheet closes / mobile page returns to the list */
  onDone?: () => void
  onClose: () => void
}) {
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
        toast(t('settings.snapshotDiffCaptureFailed', { msg: err?.message || String(err) }), 'err')
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
            guardLabel: t('settings.snapshotPreRollbackLabel', { time: new Date().toLocaleTimeString() }),
            guardDescription: t('settings.snapshotPreRollbackDesc', { id: snapshot.meta.id.slice(0, 8) }),
          })

          void mutateInstanceData(cfg)

          if (res.success) {
            toast(t('settings.snapshotRestoreSuccess', { count: res.succeededModules }))
            onDone?.()
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
          toast(t('settings.snapshotRestoreFailed', { msg: e?.message || String(e) }), 'err')
        } finally {
          setRestoring(false)
        }
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header Info */}
      <div className="border-b border-[var(--glass-border)] pb-3">
        <div className="flex items-center gap-2">
          <Layers size={18} style={{ color: 'var(--accent)' }} className="flex-none" />
          <h2 className="text-[17px] font-bold text-t1">{snapshot.meta.label}</h2>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-t3">
          <span className="flex items-center gap-1">
            <Clock size={13} />
            {new Date(snapshot.meta.createdAt).toLocaleString()}
          </span>
          <span>·</span>
          <span>{snapshot.meta.sourceInstance.label}</span>
          <span>·</span>
          <Badge kind="info">{snapshot.meta.sourceInstance.aghVersion}</Badge>
        </div>
        {snapshot.meta.description && (
          <p
            className="mt-2 rounded-xl p-2.5 text-[12.5px] leading-relaxed text-t2"
            style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)' }}
          >
            {snapshot.meta.description}
          </p>
        )}
      </div>

      {/* Tampering Warning */}
      {checksumWarning && (
        <div
          className="flex items-start gap-2.5 rounded-xl p-3 text-[12.5px]"
          style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
        >
          <ShieldAlert size={16} className="mt-0.5 flex-none" />
          <span>{t('settings.snapshotDiffChecksumWarning')}</span>
        </div>
      )}

      {/* Loading state */}
      {loadingCurrent ? (
        <Loading text={t('settings.snapshotDiffComparing')} />
      ) : (
        <>
          {/* Changes summary */}
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span className="font-semibold text-t1">
              {totalDifferences === 0
                ? t('settings.snapshotDiffNoChanges')
                : t('settings.snapshotDiffChangesDetected', { count: totalDifferences })}
            </span>
            <span className="flex-none text-[11.5px] text-t3">
              {t('settings.snapshotDiffSelectedModules', {
                selected: selectedModules.size,
                total: snapshot.meta.modules.length,
              })}
            </span>
          </div>

          {/* Module selection & differences */}
          <div className="flex flex-col gap-3">
            {diffSummaries.map((summary) => {
              const isSelected = selectedModules.has(summary.module)
              return (
                <div
                  key={summary.module}
                  className="rounded-2xl p-3.5 transition-colors"
                  style={{
                    background: isSelected ? 'var(--accent-soft)' : 'var(--glass)',
                    border: `1px solid ${
                      isSelected
                        ? 'color-mix(in srgb, var(--accent) 40%, transparent)'
                        : 'var(--glass-border)'
                    }`,
                  }}
                >
                  <div
                    className="flex cursor-pointer items-center justify-between gap-2"
                    onClick={() => toggleModule(summary.module)}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-5 w-5 flex-none items-center justify-center rounded-md border transition-colors ${
                          isSelected
                            ? 'border-accent bg-accent text-white'
                            : 'border-[var(--glass-border-strong)] text-transparent'
                        }`}
                      >
                        <Check size={13} strokeWidth={3} />
                      </div>
                      <span className="text-[14px] font-semibold uppercase tracking-wide text-t1">
                        {summary.module}
                      </span>
                    </div>
                    {summary.hasChanges ? (
                      <Badge kind="warn">
                        {t('settings.snapshotDiffCount', { count: summary.diffs.length })}
                      </Badge>
                    ) : (
                      <span className="flex items-center gap-1 text-[12px]" style={{ color: 'var(--ok)' }}>
                        <CheckCircle2 size={13} /> {t('settings.snapshotDiffIdentical')}
                      </span>
                    )}
                  </div>

                  {/* Expanded Diff List for this module */}
                  {summary.hasChanges && isSelected && (
                    <div className="mt-3 flex flex-col gap-1.5 border-t border-[var(--glass-border)] pt-2.5">
                      {summary.diffs.map((diff, idx) => {
                        const meta = diffKindMeta(diff.type)
                        return (
                          <div
                            key={idx}
                            className="flex flex-col gap-0.5 rounded-lg p-2 text-[12px]"
                            style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)' }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-t1">{diff.label}</span>
                              <Badge kind={meta.kind}>{t(meta.labelKey)}</Badge>
                            </div>
                            <div className="flex items-center gap-1 break-all font-mono text-[11px] text-t3">
                              {diff.type === 'modified' ? (
                                <>
                                  <span className="text-danger line-through">
                                    {String(diff.oldValue)}
                                  </span>
                                  <ArrowRight size={10} className="flex-none text-t3" />
                                  <span style={{ color: 'var(--ok)' }}>{String(diff.newValue)}</span>
                                </>
                              ) : diff.type === 'added' ? (
                                <span style={{ color: 'var(--ok)' }}>+ {String(diff.newValue)}</span>
                              ) : (
                                <span className="text-danger">- {String(diff.oldValue)}</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Action buttons */}
          <div className="mt-2 flex items-center justify-end gap-2 border-t border-[var(--glass-border)] pt-3">
            <Button variant="glass" onClick={onClose} disabled={restoring}>
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
