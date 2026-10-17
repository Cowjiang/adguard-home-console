/** Configuration Snapshots & Rollback management page (P3-1).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownToLine,
  Clock,
  Download,
  FileUp,
  Layers,
  Plus,
  RotateCcw,
  Trash,
} from 'lucide-react'
import { Badge, IconBubble, Loading } from '../../components/ui/atoms'
import { Button, Card, HeaderAction, PageHeader, Screen, Segmented } from '../../components/ui/primitives'
import { useConfirm, useSheet } from '../../components/ui/sheet'
import { toast } from '../../components/ui/toast'
import { useAuth } from '../../lib/session/auth'
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
import { SnapshotCreateForm } from '../../components/snapshot/SnapshotCreateForm'
import { useIsDesktop } from '../../lib/useIsDesktop'

export function SnapshotSettings() {
  const { activeId, instances } = useAuth()
  const activeInstance = instances.find((i) => i.id === activeId) || instances[0]
  const { t } = useTranslation()
  const nav = useNavigate()
  const sheet = useSheet()
  const confirm = useConfirm()
  const isDesktop = useIsDesktop()

  const [snapshots, setSnapshots] = useState<AghConfigSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<'all' | 'manual' | 'auto'>('all')

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function refreshSnapshots() {
    setLoading(true)
    try {
      const list = await listSnapshots(activeInstance?.id)
      setSnapshots(list)
    } catch (e: any) {
      toast(t('settings.snapshotLoadFailed', { msg: e?.message || String(e) }), 'err')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshSnapshots()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function openCreateSheet() {
    sheet.open(
      <SnapshotCreateForm onCreated={refreshSnapshots} onClose={sheet.close} />,
      { title: t('settings.snapshotCreate') }
    )
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
            ? t('settings.snapshotImportBundleOk', { count: parsed.snapshots.length })
            : t('settings.snapshotImportOk')
        )
        await refreshSnapshots()

        if (parsed.snapshots[0]) {
          openDiffSheet(parsed.snapshots[0])
        }
      } catch (err: any) {
        toast(t('settings.snapshotImportFailed', { msg: err?.message || String(err) }), 'err')
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
          toast(t('settings.snapshotDeleteFailed', { msg: e?.message || String(e) }), 'err')
        }
      },
    })
  }

  function openDiffSheet(snapshot: AghConfigSnapshot) {
    if (isDesktop) {
      sheet.open(
        <SnapshotDiffSheet
          snapshot={snapshot}
          onClose={sheet.close}
          onRestored={refreshSnapshots}
        />,
        { title: t('settings.snapshotDiffTitle') }
      )
    } else {
      // Diff & rollback is browsing content: a sub-page on mobile
      nav(`/settings/snapshots/diff?id=${snapshot.meta.id}`)
    }
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
            <HeaderAction
              onClick={() => fileInputRef.current?.click()}
              label={t('settings.snapshotImport')}
              className="w-11 text-t2 hover:text-accent lg:w-10"
            >
              <FileUp size={17} />
            </HeaderAction>
            <HeaderAction
              onClick={openCreateSheet}
              label={t('settings.snapshotCreate')}
              className="w-11 font-semibold text-t1 lg:w-auto lg:px-4"
              native={{ label: t('settings.snapshotCreate'), foreground: 'accent' }}
            >
              <Plus size={17} />
              <span className="hidden lg:inline">{t('settings.snapshotCreate')}</span>
            </HeaderAction>
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

      {/* Filter tabs + cluster bundle export */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          size="sm"
          fit
          value={filterType}
          onChange={setFilterType}
          options={[
            { value: 'all', label: `${t('settings.snapshotFilterAll')} (${snapshots.length})` },
            { value: 'manual', label: t('settings.snapshotFilterManual') },
            { value: 'auto', label: t('settings.snapshotFilterAuto') },
          ]}
        />
        {snapshots.length > 0 && (
          <Button variant="glass" size="sm" onClick={handleExportClusterBundle}>
            <Download size={13} /> {t('settings.snapshotExportBundle')}
          </Button>
        )}
      </div>

      {/* Snapshot list */}
      {loading ? (
        <Loading />
      ) : filteredSnapshots.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <IconBubble color="var(--accent)" bg="var(--accent-soft)">
            <Layers size={22} />
          </IconBubble>
          <p className="mt-3 text-[15px] font-bold text-t1">{t('settings.snapshotEmptyTitle')}</p>
          <p className="mt-1 max-w-[320px] text-[12.5px] text-t3">
            {t('settings.snapshotEmptyDesc')}
          </p>
          <Button variant="glass" size="sm" className="mt-4" onClick={openCreateSheet}>
            <Plus size={14} /> {t('settings.snapshotCreate')}
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredSnapshots.map((item) => (
            <Card key={item.meta.id} className="flex flex-col gap-2.5 p-4">
              {/* Header: label + trigger badge, actions on the right */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-bold text-t1">{item.meta.label}</span>
                    {getTriggerBadge(item.meta.trigger)}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[12px] text-t3">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(item.meta.createdAt).toLocaleString()}
                    </span>
                    <span>·</span>
                    <span>{item.meta.sourceInstance.label}</span>
                  </div>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <Button
                    variant="glass"
                    size="sm"
                    label={t('settings.snapshotExportJson')}
                    className="!h-9 !w-9 !rounded-[10px] !px-0"
                    onClick={() => handleExportSingle(item)}
                  >
                    <ArrowDownToLine size={16} />
                  </Button>
                  <button
                    type="button"
                    aria-label={t('common.delete')}
                    onClick={() => handleDelete(item)}
                    className="press flex h-9 w-9 flex-none items-center justify-center rounded-[10px]"
                    style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>

              {/* Description note */}
              {item.meta.description && (
                <p
                  className="rounded-xl px-3 py-2 text-[12.5px] leading-relaxed text-t2"
                  style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)' }}
                >
                  {item.meta.description}
                </p>
              )}

              {/* Modules + compare/restore */}
              <div
                className="flex flex-wrap items-center justify-between gap-2 pt-2"
                style={{ borderTop: '1px solid var(--glass-border)' }}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.meta.modules.map((m) => (
                    <span
                      key={m}
                      className="rounded-full px-2 py-0.5 font-mono text-[10.5px] uppercase"
                      style={{
                        background: 'var(--glass)',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--t2)',
                      }}
                    >
                      {m}
                    </span>
                  ))}
                </div>
                <Button
                  variant="glass"
                  size="sm"
                  className="ml-auto"
                  onClick={() => openDiffSheet(item)}
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
