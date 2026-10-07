/** Client detail subpage (mobile): entered from /clients, location.state carries the
 *  client data */
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { Laptop } from 'lucide-react'
import { api, swrFetcher, type ClientsData } from '../lib/api'
import { useAuth } from '../lib/session/auth'
import { navBack } from '../lib/nav/backNav'
import { ClientDetail, type ClientDetailData } from '../components/clients/ClientDetail'
import { PageHeader, EmptyState, useConfirm, toast } from '../components/ui'

export default function ClientDetailPage() {
  const { t } = useTranslation()
  const { cfg } = useAuth()
  const nav = useNavigate()
  const confirm = useConfirm()
  const { state, pathname } = useLocation() as { state?: { data?: ClientDetailData }; pathname: string }
  const data = state?.data

  // Same SWR key as the list page, so the list refreshes automatically after
  // add/delete/update
  const { mutate } = useSWR<ClientsData>(cfg ? ['clients', cfg, '/clients'] : null, swrFetcher, {
    revalidateOnMount: false,
  })

  if (!data) {
    return (
      <div className="page-in mx-auto w-full page-shell px-4">
        <PageHeader title={t('clients.detailTitle')} back />
        <EmptyState icon={<Laptop size={30} className="text-t3" />} title={t('clients.notFoundTitle')} subtitle={t('clients.notFoundSub')} />
      </div>
    )
  }

  const c = data.persistent

  async function remove() {
    if (!cfg || !c) return
    try {
      await api(cfg, '/clients/delete', { method: 'POST', body: { name: c.name } })
      mutate()
      toast(t('clients.deleted'))
      navBack(nav, pathname)
    } catch (e: any) {
      toast(t('common.deleteFailed', { msg: e.message }), 'err')
    }
  }

  return (
    <div className="page-in mx-auto w-full page-shell px-4">
      <PageHeader title={t('clients.detailTitle')} back />
      <div className="mt-2">
        <ClientDetail
          data={data}
          onOpenLog={(k) => nav('/logs?q=' + encodeURIComponent(k))}
          onDelete={c ? () => confirm({ title: t('clients.deleteConfirmTitle', { name: c.name }), destructive: true, confirmText: t('common.delete'), onConfirm: remove }) : undefined}
          onAdd={c ? undefined : () => nav('/clients/form', { state: { isNew: true, prefillIp: data.ip } })}
        />
      </div>
    </div>
  )
}
