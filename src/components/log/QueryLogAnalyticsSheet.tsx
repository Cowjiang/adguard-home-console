/** Query log analytics sheet (desktop): centered glass frame around the shared
 *  analytics view. Mobile uses the /logs/analytics sub-page instead — browsing
 *  content goes to a page there, overlays only carry confirm / form / pick
 *  (see docs/web-interaction.md) */
import { useTranslation } from 'react-i18next'
import { Activity, X } from 'lucide-react'
import { QueryLogAnalytics } from './QueryLogAnalytics'
import type { AggregatedQueryLogItem } from '../../lib/log/analytics'

interface QueryLogAnalyticsSheetProps {
  items: AggregatedQueryLogItem[]
  onDrillDown: (type: 'domain' | 'client' | 'filter', value: string) => void
  onClose: () => void
}

export function QueryLogAnalyticsSheet({
  items,
  onDrillDown,
  onClose,
}: QueryLogAnalyticsSheetProps) {
  const { t } = useTranslation()

  return (
    <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden text-left">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--glass-border)] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="text-[17px] font-bold text-t1">{t('querylog.analyticsTitle')}</h2>
          </div>
          <p className="mt-0.5 text-[12px] text-t3">{t('querylog.analyticsSub')}</p>
        </div>
        <button
          onClick={onClose}
          className="press glass flex h-7 w-7 items-center justify-center rounded-full text-t3 transition-colors hover:text-t1"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto py-3">
        <QueryLogAnalytics
          items={items}
          onDrillDown={(type, value) => {
            onDrillDown(type, value)
            onClose()
          }}
        />
      </div>
    </div>
  )
}
