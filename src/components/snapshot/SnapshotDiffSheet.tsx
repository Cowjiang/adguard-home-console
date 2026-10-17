/** Snapshot diff sheet (desktop): the diff & rollback content is browsing
 *  material, so on mobile it opens as the /settings/snapshots/diff sub-page
 *  instead (see docs/web-interaction.md) */
import { SnapshotDiff } from './SnapshotDiff'
import type { AghConfigSnapshot } from '../../lib/snapshot/types'

interface SnapshotDiffSheetProps {
  snapshot: AghConfigSnapshot
  onClose: () => void
  onRestored?: () => void
}

export function SnapshotDiffSheet({ snapshot, onClose, onRestored }: SnapshotDiffSheetProps) {
  return (
    <div className="max-h-[80vh] overflow-y-auto pr-1">
      <SnapshotDiff
        snapshot={snapshot}
        onClose={onClose}
        onDone={() => {
          // Desktop: refresh the list behind and close the sheet
          onRestored?.()
          onClose()
        }}
      />
    </div>
  )
}
