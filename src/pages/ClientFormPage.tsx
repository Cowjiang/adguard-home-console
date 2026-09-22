/** 添加/编辑客户端独立子页(移动端;桌面端仍用居中弹窗,见 Clients.openForm) */
import { useLocation, useNavigate } from 'react-router-dom'
import { useSWRConfig } from 'swr'
import type { AghClient } from '../lib/api'
import { useAuth } from '../lib/auth'
import { PageHeader, Screen } from '../components/ui'
import { ClientForm, emptyClient } from './Clients'

export default function ClientFormPage() {
  const nav = useNavigate()
  const { cfg } = useAuth()
  const { mutate } = useSWRConfig()
  const { state } = useLocation() as {
    state?: { initial?: Partial<AghClient>; isNew?: boolean; prefillIp?: string }
  }
  const isNew = state?.isNew ?? true
  const initial: Partial<AghClient> = state?.initial
    ?? { ...emptyClient(), ids: state?.prefillIp ? [state.prefillIp] : [] }

  return (
    <Screen>
      <PageHeader back title={isNew ? '添加客户端' : '编辑客户端'} />
      <div className="mt-3">
        <ClientForm
          initial={initial}
          isNew={isNew}
          showTitle={false}
          onClose={() => nav(-1)}
          onSaved={() => {
            if (cfg) mutate(['clients', cfg, '/clients'])
            nav('/clients', { replace: true })
          }}
        />
      </div>
    </Screen>
  )
}
