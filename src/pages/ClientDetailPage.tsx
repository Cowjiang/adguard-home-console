/** 客户端详情子页(移动端):从 /clients 点入,location.state 携带该客户端信息 */
import { useLocation, useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import { Laptop } from 'lucide-react'
import { api, swrFetcher, type ClientsData } from '../lib/api'
import { useAuth } from '../lib/auth'
import { navBack } from '../lib/backNav'
import { ClientDetail, type ClientDetailData } from '../components/ClientDetail'
import { PageHeader, EmptyState, useConfirm, toast } from '../components/ui'

export default function ClientDetailPage() {
  const { cfg } = useAuth()
  const nav = useNavigate()
  const confirm = useConfirm()
  const { state, pathname } = useLocation() as { state?: { data?: ClientDetailData }; pathname: string }
  const data = state?.data

  // 与列表页同 key,增删改后列表自动刷新
  const { mutate } = useSWR<ClientsData>(cfg ? ['clients', cfg, '/clients'] : null, swrFetcher, {
    revalidateOnMount: false,
  })

  if (!data) {
    return (
      <div className="page-in mx-auto w-full page-shell px-4">
        <PageHeader title="客户端详情" back />
        <EmptyState icon={<Laptop size={30} className="text-t3" />} title="客户端不存在" subtitle="请从客户端列表重新进入" />
      </div>
    )
  }

  const c = data.persistent

  async function remove() {
    if (!cfg || !c) return
    try {
      await api(cfg, '/clients/delete', { method: 'POST', body: { name: c.name } })
      mutate()
      toast('客户端已删除')
      navBack(nav, pathname)
    } catch (e: any) {
      toast('删除失败:' + e.message, 'err')
    }
  }

  return (
    <div className="page-in mx-auto w-full page-shell px-4">
      <PageHeader title="客户端详情" back />
      <div className="mt-2">
        <ClientDetail
          data={data}
          onOpenLog={(k) => nav('/log?q=' + encodeURIComponent(k))}
          onDelete={c ? () => confirm({ title: `删除客户端「${c.name}」?`, destructive: true, confirmText: '删除', onConfirm: remove }) : undefined}
          onAdd={c ? undefined : () => nav('/clients/form', { state: { isNew: true, prefillIp: data.ip } })}
        />
      </div>
    </div>
  )
}
