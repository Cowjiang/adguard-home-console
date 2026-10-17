/** Create a manual configuration snapshot of the active instance: label +
 *  optional note, captured through the shared snapshot pipeline. Shared by the
 *  desktop centered sheet and the mobile /settings/snapshots/new sub-page
 *  (mobile shows no floating panels at all, see docs/web-interaction.md). */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera } from 'lucide-react'
import { useAuth } from '../../lib/session/auth'
import { Button } from '../ui/primitives'
import { toast } from '../ui/toast'
import { captureInstanceSnapshot } from '../../lib/snapshot/snapshotCapture'
import { saveSnapshot } from '../../lib/snapshot/snapshotStorage'

export function SnapshotCreateForm({
  onCreated,
  onClose,
}: {
  onCreated?: () => Promise<void> | void
  onClose: () => void
}) {
  const { cfg, activeId, status, instances } = useAuth()
  const activeInstance = instances.find((i) => i.id === activeId) || instances[0]
  const { t } = useTranslation()
  const [label, setLabel] = useState('')
  const [desc, setDesc] = useState('')
  const [creating, setCreating] = useState(false)

  async function create() {
    if (!cfg || !activeInstance) return
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
          label: label.trim() || t('settings.snapshotDefaultLabel', { time: new Date().toLocaleTimeString() }),
          description: desc.trim() || undefined,
          trigger: 'manual',
        }
      )
      await saveSnapshot(snap)
      toast(t('settings.snapshotCreateSuccess'))
      await onCreated?.()
      onClose()
    } catch (e: any) {
      toast(t('settings.snapshotCaptureFailed', { msg: e?.message || String(e) }), 'err')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        className="field"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={t('settings.snapshotLabelPlaceholder')}
      />
      <textarea
        className="field"
        style={{ minHeight: 60 }}
        rows={2}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder={t('settings.snapshotDescPlaceholder')}
      />
      <Button
        size="lg"
        className="mt-1"
        loading={creating}
        disabled={!cfg || !activeInstance}
        onClick={create}
      >
        <Camera size={16} /> {t('settings.snapshotCreate')}
      </Button>
    </div>
  )
}
