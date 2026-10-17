/** Query log analytics subpage (mobile): entered from /logs, location.state
 *  carries the aggregated log sample the analytics view was opened with */
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Activity } from 'lucide-react'
import { usePageInClass, PageHeader } from '../components/ui/primitives'
import { EmptyState } from '../components/ui/atoms'
import { QueryLogAnalytics } from '../components/log/QueryLogAnalytics'
import { markLogDrill } from '../lib/log/drillIntent'
import { navBack } from '../lib/nav/backNav'
import type { QueryLogItem } from '../lib/api'

export default function LogAnalyticsPage() {
  const pageIn = usePageInClass()
  const { t } = useTranslation()
  const nav = useNavigate()
  const { state, pathname } = useLocation() as {
    state?: { items?: QueryLogItem[] }
    pathname: string
  }
  const items = state?.items

  if (!items || items.length === 0) {
    return (
      <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
        <PageHeader title={t('querylog.analyticsTitle')} back />
        <EmptyState
          icon={<Activity size={30} className="text-t3" />}
          title={t('querylog.analyticsNoSample')}
          subtitle={t('querylog.analyticsNoSampleSub')}
        />
      </div>
    )
  }

  /** Drill: record the intent, pop back to the list; the list applies it to its
   *  search / filter and syncs the URL (same net effect as the desktop sheet) */
  const drill = (type: 'domain' | 'client' | 'filter', value: string) => {
    markLogDrill(type === 'filter' ? { filter: value } : { q: value })
    navBack(nav, pathname)
  }

  return (
    <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
      <PageHeader title={t('querylog.analyticsTitle')} subtitle={t('querylog.analyticsSub')} back />
      <div className="mt-2">
        <QueryLogAnalytics items={items} onDrillDown={drill} />
      </div>
    </div>
  )
}
