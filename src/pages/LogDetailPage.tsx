/** 日志详情子页(移动端):从 /log 点入,location.state 携带该条记录 */
import { useLocation, useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import { Globe } from 'lucide-react'
import { api, swrFetcher, type QueryLogItem, type FilteringStatus } from '../lib/api'
import { useAuth } from '../lib/auth'
import { usePageInClass, PageHeader, EmptyState, toast } from '../components/ui'
import { LogDetail } from '../components/LogDetail'

export default function LogDetailPage() {
  const pageIn = usePageInClass()
  const { cfg } = useAuth()
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
        <PageHeader title="请求详情" back />
        <EmptyState icon={<Globe size={30} className="text-t3" />} title="记录不存在" subtitle="请从查询日志列表重新进入" />
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
      toast(block ? `已拦截 ${current.question.name}` : '已加入白名单规则')
      nav(-1)
    } catch (e: any) {
      toast('保存规则失败:' + e.message, 'err')
    }
  }

  return (
    <div className={`${pageIn} mx-auto w-full page-shell px-4`}>
      <PageHeader title="请求详情" back />
      <div className="mt-2">
        <LogDetail item={current} filtering={filtering} onSaveRule={saveRule} />
      </div>
    </div>
  )
}
