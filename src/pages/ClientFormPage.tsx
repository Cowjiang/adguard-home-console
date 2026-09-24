/** 添加/编辑客户端独立子页(移动端;桌面端仍用居中弹窗,见 Clients.openForm) */
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSWRConfig } from 'swr'
import type { AghClient } from '../lib/api'
import { useAuth } from '../lib/auth'
import { navBack } from '../lib/backNav'
import { PageHeader, Screen } from '../components/ui'
import { ClientForm, emptyClient } from './Clients'

export default function ClientFormPage() {
  const nav = useNavigate()
  const { t } = useTranslation()
  const { cfg } = useAuth()
  const { mutate } = useSWRConfig()
  const { state, pathname } = useLocation() as {
    state?: { initial?: Partial<AghClient>; isNew?: boolean; prefillIp?: string }
    pathname: string
  }
  const isNew = state?.isNew ?? true
  const initial: Partial<AghClient> = state?.initial
    ?? { ...emptyClient(), ids: state?.prefillIp ? [state.prefillIp] : [] }

  return (
    <Screen>
      <PageHeader back title={isNew ? t('clients.formAddTitle') : t('clients.formEditTitle')} />
      <div className="mt-3">
        <ClientForm
          initial={initial}
          isNew={isNew}
          showTitle={false}
          onClose={() => navBack(nav, pathname)}
          onSaved={() => {
            if (cfg) mutate(['clients', cfg, '/clients'])
            navBack(nav, pathname)
          }}
        />
      </div>
    </Screen>
  )
}
