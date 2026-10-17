/** Configuration Snapshots & Rollback management page (P3-1).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Clock, Download, FileUp, Layers, Plus } from 'lucide-react'
import { Badge, IconBubble, Loading } from '../../components/ui/atoms'
import { Button, Card, HeaderAction, PageHeader, Screen, Segmented } from '../../components/ui/primitives'
import { PickSelect, usePick } from '../../components/ui/menu'
import { useSheet } from '../../components/ui/sheet'
import { toast } from '../../components/ui/toast'
import { useAuth } from '../../lib/session/auth'
import {
  exportClusterBundleJson,
  listSnapshots,
  parseSnapshotImport,
  saveSnapshot,
} from '../../lib/snapshot/snapshotStorage'
import type { AghConfigSnapshot, SnapshotTrigger } from '../../lib/snapshot/types'
import { SnapshotDiffSheet } from '../../components/snapshot/SnapshotDiffSheet'
import { SnapshotActions } from '../../components/snapshot/SnapshotActions'
import { SnapshotCreateForm } from '../../components/snapshot/SnapshotCreateForm'
import { isAppleMobile } from '../../lib/native/shell'
import { useIsDesktop } from '../../lib/useIsDesktop'

export function SnapshotSettings() {
  const { activeId, instances } = useAuth()
  const activeInstance = instances.find((i) => i.id === activeId) || instances[0]
  const { t } = useTranslation()
  const nav = useNavigate()
  const sheet = useSheet()
  const pick = usePick()
  const isDesktop = useIsDesktop()
  const apple = isAppleMobile()

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

  function openDiffSheet(snapshot: AghConfigSnapshot) {
    if (isDesktop) {
      sheet.open(
        <SnapshotDiffSheet
          snapshot={snapshot}
          onClose={sheet.close}
          onRestored={refreshSnapshots}
        />,
        {
          title: t('settings.snapshotDiffTitle'),
          // Snapshot actions live in the title bar (same place on mobile)
          right: (
            <SnapshotActions
              compact
              snapshot={snapshot}
              onDeleted={() => {
                refreshSnapshots()
                sheet.close()
              }}
            />
          ),
        }
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

  const filterOptions = [
    { value: 'all' as const, label: `${t('settings.snapshotFilterAll')} (${snapshots.length})` },
    { value: 'manual' as const, label: t('settings.snapshotFilterManual') },
    { value: 'auto' as const, label: t('settings.snapshotFilterAuto') },
  ]
  const filterLabel = filterOptions.find((o) => o.value === filterType)?.label ?? ''

  function pickFilter(e: React.MouseEvent<HTMLButtonElement>) {
    pick({
      title: t('settings.snapshotsTitle'),
      anchor: e.currentTarget,
      align: 'left',
      value: filterType,
      options: filterOptions,
      onPick: setFilterType,
    })
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

      {/* Filter by category: dropdown on mobile (same picker idiom as the
          other pages), segmented control on desktop */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {isDesktop ? (
          <Segmented
            size="sm"
            fit
            value={filterType}
            onChange={setFilterType}
            options={filterOptions}
          />
        ) : apple ? (
          <span className="press glass relative flex flex-none items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-medium text-t1">
            {filterLabel}
            <ChevronDown size={14} className="pointer-events-none text-t3" />
            <PickSelect
              ariaLabel={t('settings.snapshotsTitle')}
              className="absolute inset-0 h-full w-full cursor-pointer bg-transparent text-transparent"
              value={filterType}
              options={filterOptions}
              onPick={setFilterType}
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={pickFilter}
            className="press glass flex flex-none items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-medium text-t1"
          >
            {filterLabel}
            <ChevronDown size={14} className="text-t3" />
          </button>
        )}
        {snapshots.length > 0 && (
          <Button variant="glass" size="sm" onClick={handleExportClusterBundle}>
            <Download size={13} /> {t('settings.snapshotExportBundle')}
          </Button>
        )}
      </div>

      {/* Auto backups are triggered by sync/restore, not by a setting on this
          page: say so where the category is selected */}
      {filterType === 'auto' && (
        <p className="-mt-1 mb-3 px-1 text-[12px] leading-relaxed text-t3">
          {t('settings.snapshotAutoHint')}
        </p>
      )}

      {/* Snapshot list */}
      {loading ? (
        <Loading />
      ) : filteredSnapshots.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <IconBubble color="var(--accent)" bg="var(--accent-soft)">
            <Layers size={22} />
          </IconBubble>
          <p className="mt-3 text-[15px] font-bold text-t1">
            {filterType === 'auto' ? t('settings.snapshotEmptyAutoTitle') : t('settings.snapshotEmptyTitle')}
          </p>
          <p className="mt-1 max-w-[320px] text-[12.5px] text-t3">
            {filterType === 'auto' ? t('settings.snapshotEmptyAutoSub') : t('settings.snapshotEmptyDesc')}
          </p>
          {filterType !== 'auto' && (
            <Button variant="glass" size="sm" className="mt-4" onClick={openCreateSheet}>
              <Plus size={14} /> {t('settings.snapshotCreate')}
            </Button>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredSnapshots.map((item) => (
            <Card key={item.meta.id} className="p-0">
              <button
                type="button"
                onClick={() => openDiffSheet(item)}
                className="press flex w-full items-center justify-between gap-2 p-4 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-bold text-t1">{item.meta.label}</span>
                    {getTriggerBadge(item.meta.trigger)}
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-[12px] text-t3">
                    <span className="flex flex-none items-center gap-1 whitespace-nowrap">
                      <Clock size={12} />
                      {new Date(item.meta.createdAt).toLocaleString()}
                    </span>
                    <span className="flex-none">·</span>
                    <span className="truncate">{item.meta.sourceInstance.label}</span>
                  </div>
                  {item.meta.description && (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-t3">
                      {item.meta.description}
                    </p>
                  )}
                </div>
                <ChevronRight size={17} className="flex-none text-t3" />
              </button>
            </Card>
          ))}
        </div>
      )}
    </Screen>
  )
}
