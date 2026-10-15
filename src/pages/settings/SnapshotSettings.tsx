/**
 * Configuration Snapshots & Rollback management page (P3-1).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Archive,
  ArrowDownToLine,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  FileUp,
  Layers,
  Plus,
  RotateCcw,
  Shield,
  Trash2,
} from 'lucide-react'
import { Badge, IconBubble, Loading } from '../../components/ui/atoms'
import { Button, Card, GroupTitle, PageHeader, Screen } from '../../components/ui/primitives'
import { useConfirm, useSheet } from '../../components/ui/sheet'
import { toast } from '../../components/ui/toast'
import { useAuth } from '../../lib/session/auth'
import { captureInstanceSnapshot } from '../../lib/snapshot/snapshotCapture'
import {
  deleteSnapshot,
  exportClusterBundleJson,
  exportSnapshotJson,
  listSnapshots,
  parseSnapshotImport,
  saveSnapshot,
} from '../../lib/snapshot/snapshotStorage'
import type { AghConfigSnapshot, SnapshotTrigger } from '../../lib/snapshot/types'
import { SnapshotDiffSheet } from '../../components/snapshot/SnapshotDiffSheet'

export function SnapshotSettings() {
  const { cfg, activeId, status, instances } = useAuth()
  const activeInstance = instances.find((i) => i.id === activeId) || instances[0]
  const { t } = useTranslation()
  const sheet = useSheet()
  const confirm = useConfirm()

  const [snapshots, setSnapshots] = useState<AghConfigSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<'all' | 'manual' | 'auto'>('all')
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function refreshSnapshots() {
    setLoading(true)
    try {
      const list = await listSnapshots(activeInstance?.id)
      setSnapshots(list)
    } catch (e: any) {
      toast(e?.message || 'Failed to load snapshots', 'err')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshSnapshots()
  }, [activeInstance?.id])

  const filteredSnapshots = useMemo(() => {
    if (filterType === 'manual') {
      return snapshots.filter((s) => s.meta.trigger === 'manual')
    }
    if (filterType === 'auto') {
      return snapshots.filter((s) => s.meta.trigger === 'pre_sync' || s.meta.trigger === 'pre_rollback')
    }
    return snapshots
  }, [snapshots, filterType])

  async function handleCreateManualSnapshot() {
    if (!cfg || !activeInstance) return
    const label = newLabel.trim() || `Manual Snapshot - ${new Date().toLocaleTimeString()}`
    setCreating(true)

    try {
      const snap = await captureInstanceSnapshot(
        cfg,
        {
          id: activeInstance.id,
          label: activeInstance.label,
          url: activeInstance.url,
          aghVersion: status?.version || 'unknown',
        },
        {
          label,
          description: newDesc.trim() || undefined,
          trigger: 'manual',
        }
      )
      await saveSnapshot(snap)
      toast(t('settings.snapshotCreateSuccess'))
      setNewLabel('')
      setNewDesc('')
      setShowCreateDialog(false)
      await refreshSnapshots()
    } catch (e: any) {
      toast(e?.message || 'Failed to capture snapshot', 'err')
    } finally {
      setCreating(false)
    }
  }

  function handleExportSingle(snapshot: AghConfigSnapshot) {
    const jsonStr = exportSnapshotJson(snapshot)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agh-snapshot-${snapshot.meta.sourceInstance.label}-${snapshot.meta.id.slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportClusterBundle() {
    if (snapshots.length === 0) return
    const jsonStr = exportClusterBundleJson(snapshots, activeInstance?.label || 'Cluster')
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agh-cluster-bundle-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = String(event.target?.result || '')
        const parsed = parseSnapshotImport(text)
        for (const snap of parsed.snapshots) {
          await saveSnapshot(snap)
        }
        toast(
          parsed.isBundle
            ? `Imported bundle with ${parsed.snapshots.length} snapshot(s)`
            : 'Snapshot imported successfully'
        )
        await refreshSnapshots()

        if (parsed.snapshots[0]) {
          openDiffSheet(parsed.snapshots[0])
        }
      } catch (err: any) {
        toast(err?.message || 'Failed to import snapshot JSON file', 'err')
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  function handleDelete(snapshot: AghConfigSnapshot) {
    confirm({
      title: t('settings.snapshotDeleteConfirmTitle'),
      message: t('settings.snapshotDeleteConfirmMsg'),
      confirmText: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteSnapshot(snapshot.meta.id)
          toast(t('settings.snapshotDeleted'))
          await refreshSnapshots()
        } catch (e: any) {
          toast(e?.message || 'Failed to delete snapshot', 'err')
        }
      },
    })
  }

  function openDiffSheet(snapshot: AghConfigSnapshot) {
    sheet.open(
      <SnapshotDiffSheet
        snapshot={snapshot}
        onClose={sheet.close}
        onRestored={refreshSnapshots}
      />,
      { title: t('settings.snapshotDiffTitle') }
    )
  }

  function getTriggerBadge(trigger: SnapshotTrigger) {
    switch (trigger) {
      case 'manual':
        return <Badge kind="info">{t('settings.snapshotTriggerManual')}</Badge>
      case 'pre_sync':
        return <Badge kind="warn">{t('settings.snapshotTriggerPreSync')}</Badge>
      case 'pre_rollback':
        return <Badge kind="warn">{t('settings.snapshotTriggerPreRollback')}</Badge>
      case 'scheduled':
        return <Badge kind="ok">{t('settings.snapshotTriggerScheduled')}</Badge>
    }
  }

  return (
    <Screen>
      <PageHeader
        back
        title={t('settings.snapshotsTitle')}
        right={
          <div className="flex items-center gap-1.5">
            <span title={t('settings.snapshotImport')}>
              <Button
                variant="glass"
                size="header"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp size={15} />
              </Button>
            </span>
            <Button
              variant="glass"
              size="header"
              onClick={() => setShowCreateDialog(true)}
              native={{ label: t('settings.snapshotCreate'), foreground: 'accent' }}
            >
              <Plus size={15} /> {t('settings.snapshotCreate')}
            </Button>
          </div>
        }
      />

      {/* Hidden file input for importing */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileImport}
        accept=".json"
        className="hidden"
      />

      {/* Manual Creation Dialog */}
      {showCreateDialog && (
        <Card className="mb-4 border border-accent/40 bg-card p-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <h3 className="text-[15px] font-bold text-t1 flex items-center gap-2">
              <Camera size={16} className="text-accent" />
              {t('settings.snapshotCreate')}
            </h3>
            <span className="text-[12px] text-t3">{activeInstance?.label}</span>
          </div>
          <div className="mt-3 flex flex-col gap-2.5">
            <input
              type="text"
              className="w-full rounded-xl border border-border bg-black/5 dark:bg-white/5 px-3 py-2 text-[13px] text-t1 focus:border-accent focus:outline-none"
              placeholder={t('settings.snapshotLabelPlaceholder')}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <textarea
              rows={2}
              className="w-full rounded-xl border border-border bg-black/5 dark:bg-white/5 px-3 py-2 text-[13px] text-t1 focus:border-accent focus:outline-none resize-none"
              placeholder={t('settings.snapshotDescPlaceholder')}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <div className="flex items-center justify-end gap-2 mt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateDialog(false)}
                disabled={creating}
              >
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                loading={creating}
                onClick={handleCreateManualSnapshot}
              >
                <CheckCircle2 size={14} />
                {t('common.save')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Header Controls & Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1 rounded-xl bg-black/5 dark:bg-white/5 p-1 text-[12px]">
          <button
            onClick={() => setFilterType('all')}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
              filterType === 'all'
                ? 'bg-card text-t1 shadow-sm'
                : 'text-t3 hover:text-t1'
            }`}
          >
            {t('settings.snapshotFilterAll')} ({snapshots.length})
          </button>
          <button
            onClick={() => setFilterType('manual')}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
              filterType === 'manual'
                ? 'bg-card text-t1 shadow-sm'
                : 'text-t3 hover:text-t1'
            }`}
          >
            {t('settings.snapshotFilterManual')}
          </button>
          <button
            onClick={() => setFilterType('auto')}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
              filterType === 'auto'
                ? 'bg-card text-t1 shadow-sm'
                : 'text-t3 hover:text-t1'
            }`}
          >
            {t('settings.snapshotFilterAuto')}
          </button>
        </div>

        {snapshots.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportClusterBundle}
            className="text-[12px] text-t3 hover:text-t1"
          >
            <Download size={13} /> {t('settings.snapshotExportBundle')}
          </Button>
        )}
      </div>

      {/* Snapshot Version List */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-2">
          <Loading />
          <span className="text-[12px] text-t3">Loading local snapshots vault...</span>
        </div>
      ) : filteredSnapshots.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <IconBubble color="var(--accent)" bg="color-mix(in srgb, var(--accent) 12%, transparent)">
            <Layers size={22} />
          </IconBubble>
          <p className="mt-3 text-[15px] font-bold text-t1">{t('settings.snapshotEmptyTitle')}</p>
          <p className="mt-1 text-[12.5px] text-t3 max-w-[320px]">
            {t('settings.snapshotEmptyDesc')}
          </p>
          <Button
            variant="glass"
            size="sm"
            className="mt-4"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus size={14} /> {t('settings.snapshotCreate')}
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredSnapshots.map((item) => (
            <Card
              key={item.meta.id}
              className="p-4 transition-all hover:border-accent/40 flex flex-col gap-2.5"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-bold text-t1">{item.meta.label}</span>
                    {getTriggerBadge(item.meta.trigger)}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[12px] text-t3">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(item.meta.createdAt).toLocaleString()}
                    </span>
                    <span>•</span>
                    <span>{item.meta.sourceInstance.label}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span title={t('settings.snapshotExportJson')}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1.5 text-t3 hover:text-accent"
                      onClick={() => handleExportSingle(item)}
                    >
                      <ArrowDownToLine size={15} />
                    </Button>
                  </span>
                  <span title={t('common.delete')}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1.5 text-t3 hover:text-danger"
                      onClick={() => handleDelete(item)}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </span>
                </div>
              </div>

              {/* Description */}
              {item.meta.description && (
                <p className="text-[12.5px] text-t2 leading-relaxed bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2">
                  {item.meta.description}
                </p>
              )}

              {/* Modules Tags */}
              <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {item.meta.modules.map((m) => (
                    <span
                      key={m}
                      className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 text-t2 uppercase"
                    >
                      {m}
                    </span>
                  ))}
                </div>
                <Button
                  variant="glass"
                  size="sm"
                  onClick={() => openDiffSheet(item)}
                  className="ml-auto"
                >
                  <RotateCcw size={14} />
                  {t('settings.snapshotCompareRestore')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Screen>
  )
}
