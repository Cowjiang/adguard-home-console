/** Export / delete actions for one snapshot. Mobile keeps them in the page
 *  header (glass circles); the desktop sheet renders compact squares in its
 *  title bar. */
import { useTranslation } from 'react-i18next'
import { ArrowDownToLine, Trash } from 'lucide-react'
import { Button, HeaderAction } from '../ui/primitives'
import { useConfirm } from '../ui/sheet'
import { toast } from '../ui/toast'
import { deleteSnapshot, exportSnapshotJson } from '../../lib/snapshot/snapshotStorage'
import type { AghConfigSnapshot } from '../../lib/snapshot/types'

export function SnapshotActions({
  snapshot,
  onDeleted,
  compact = false,
}: {
  snapshot: AghConfigSnapshot
  onDeleted?: () => void
  compact?: boolean
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()

  function exportJson() {
    const blob = new Blob([exportSnapshotJson(snapshot)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agh-snapshot-${snapshot.meta.sourceInstance.label}-${snapshot.meta.id.slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function remove() {
    confirm({
      title: t('settings.snapshotDeleteConfirmTitle'),
      message: t('settings.snapshotDeleteConfirmMsg'),
      confirmText: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteSnapshot(snapshot.meta.id)
          toast(t('settings.snapshotDeleted'))
          onDeleted?.()
        } catch (e: any) {
          toast(t('settings.snapshotDeleteFailed', { msg: e?.message || String(e) }), 'err')
        }
      },
    })
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <Button
          variant="glass"
          size="sm"
          label={t('settings.snapshotExportJson')}
          className="!h-8 !w-8 !rounded-full !px-0"
          onClick={exportJson}
        >
          <ArrowDownToLine size={15} />
        </Button>
        <Button
          variant="glass"
          size="sm"
          label={t('common.delete')}
          className="!h-8 !w-8 !rounded-full !px-0 !text-danger"
          onClick={remove}
        >
          <Trash size={15} />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <HeaderAction onClick={exportJson} label={t('settings.snapshotExportJson')} className="w-11">
        <ArrowDownToLine size={17} />
      </HeaderAction>
      <HeaderAction onClick={remove} label={t('common.delete')} className="w-11 text-danger">
        <Trash size={17} />
      </HeaderAction>
    </div>
  )
}
