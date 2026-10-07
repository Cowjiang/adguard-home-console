/** Offline overlay: covers the content area only on tab root pages so stale data is no
 *  longer visible; secondary pages are not covered (protects form input; offline is
 *  sensed via the status pill and operation errors). z-20 sits below the pull indicator
 *  (z-30) and the TabBar / status pill (z-40), so pull-to-refresh remains a usable retry
 *  while offline */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react'
import { Button } from '../ui/primitives'
import { EmptyState } from '../ui/atoms'

export function OfflineNotice({ onRetry }: { onRetry: () => unknown }) {
  const { t } = useTranslation()
  const [retrying, setRetrying] = useState(false)
  // Shares the refreshAll chain with pull-to-refresh (8s deadline): the button spins
  // until the chain settles
  const retry = () => {
    if (retrying) return
    setRetrying(true)
    void Promise.resolve(onRetry()).catch(() => {}).finally(() => setRetrying(false))
  }
  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center px-8 lg:left-60"
      style={{ background: 'var(--bg)' }}
    >
      <div className="flex flex-col items-center">
        <EmptyState
          icon={<WifiOff size={38} className="text-t3" />}
          title={t('nav.statusOffline')}
          subtitle={t('nav.offlineHint')}
        />
        <Button variant="glass" size="sm" className="mt-2" loading={retrying} onClick={retry}>
          {t('common.retryNow')}
        </Button>
      </div>
    </div>
  )
}
