/**
 * Snapshot diff sub-page (mobile): the diff & rollback content is browsing
 * material, so it opens as a page while desktop keeps the centered sheet
 * (see docs/web-interaction.md).
 */
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Layers, Lock } from 'lucide-react'
import { PageHeader, Screen } from '../../components/ui/primitives'
import { EmptyState, Loading } from '../../components/ui/atoms'
import { SnapshotDiff } from '../../components/snapshot/SnapshotDiff'
import { SnapshotActions } from '../../components/snapshot/SnapshotActions'
import { getSnapshot } from '../../lib/snapshot/snapshotStorage'
import type { AghConfigSnapshot } from '../../lib/snapshot/types'
import { navBack } from '../../lib/nav/backNav'

export function SnapshotDiffPage() {
  const [params] = useSearchParams()
  const id = params.get('id')
  const { t } = useTranslation()
  const nav = useNavigate()
  const { pathname } = useLocation()
  // undefined = loading, null = missing
  const [snapshot, setSnapshot] = useState<AghConfigSnapshot | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    if (!id) {
      setSnapshot(null)
      return
    }
    getSnapshot(id)
      .then((s) => {
        if (active) setSnapshot(s)
      })
      .catch(() => {
        if (active) setSnapshot(null)
      })
    return () => {
      active = false
    }
  }, [id])

  return (
    <Screen>
      <PageHeader
        back
        title={t('settings.snapshotDiffPageTitle')}
        right={
          snapshot ? (
            <SnapshotActions snapshot={snapshot} onDeleted={() => navBack(nav, pathname)} />
          ) : undefined
        }
      />
      {snapshot === undefined ? (
        <Loading />
      ) : !snapshot ? (
        <EmptyState
          icon={<Layers size={30} className="text-t3" />}
          title={t('settings.snapshotMissing')}
        />
      ) : snapshot.isLocked ? (
        <EmptyState
          icon={<Lock size={30} className="text-warn" />}
          title={t('settings.snapshotLocked')}
          subtitle={t('settings.snapshotLockedDesc')}
        />
      ) : (
        <SnapshotDiff
          snapshot={snapshot}
          // Restore lands back on the snapshots list (the confirm is a small
          // sheet on top of this page; the list refreshes on mount)
          onDone={() => navBack(nav, pathname)}
        />
      )}
    </Screen>
  )
}
