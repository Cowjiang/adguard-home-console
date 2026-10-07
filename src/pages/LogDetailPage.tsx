/** Log detail subpage (mobile): entered from /logs, location.state carries the record */
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { Globe } from 'lucide-react'
import { api, swrFetcher, type QueryLogItem, type FilteringStatus } from '../lib/api'
import { useAuth } from '../lib/session/auth'
import { usePageInClass, PageHeader, EmptyState, toast } from '../components/ui'
import { LogDetail } from '../components/log/LogDetail'

export default function LogDetailPage() {
  const pageIn = usePageInClass()
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()
  const { state } = useLocation() as { state?: { item?: QueryLogItem } }
  const item = state?.item

  const { data: filtering, mutate: mutateFiltering } = useSWR<FilteringStatus>(
    cfg && item ? ['filtering', cfg, '/filtering/status'] : null,
    swrFetcher
  )

  if (!item) {
    return (
      <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
        <PageHeader title={t('querylog.detailTitle')} back />
        <EmptyState icon={<Globe size={30} className="text-t3" />} title={t('querylog.recordNotFound')} subtitle={t('querylog.recordNotFoundSub')} />
      </div>
    )
  }

  const current = item

  async function saveRule(rule: string, block: boolean) {
    if (!cfg || !filtering) return
    const rules = [...(filtering.user_rules ?? []), rule]
    try {
      await api(cfg, '/filtering/set_rules', { method: 'POST', body: { rules } })
      mutateFiltering()
      toast(block ? t('querylog.blockedToast', { domain: current.question.name }) : t('querylog.whitelistedToast'))
      nav(-1)
    } catch (e: any) {
      toast(t('querylog.ruleSaveFailed', { msg: e.message }), 'err')
    }
  }

  return (
    <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
      <PageHeader title={t('querylog.detailTitle')} back />
      <div className="mt-2">
        <LogDetail item={current} filtering={filtering} onSaveRule={saveRule} />
      </div>
    </div>
  )
}
