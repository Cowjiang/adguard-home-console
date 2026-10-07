/** Instance add/edit/delete form */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Server, Trash } from 'lucide-react'
import { useAuth } from '../../lib/session/auth'
import { PageHeader, Screen, Card, GroupTitle, Button } from '../../components/ui/primitives'
import { useConfirm } from '../../components/ui/sheet'
import { ErrorBox } from '../../components/ui/atoms'
import { toast } from '../../components/ui/toast'
import { activeEndpoint, labelFromUrl } from '../../lib/session/instances'

export function InstanceEdit() {
  const { store, activeId, connect, removeInstance, connecting, error } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()
  const confirm = useConfirm()
  const [params] = useSearchParams()
  const editId = params.get('id') ?? undefined
  const target = editId ? store?.instances.find((x) => x.id === editId) : undefined
  const ep = target ? activeEndpoint(target) : undefined
  const isNew = !editId

  const [url, setUrl] = useState(ep?.url ?? '')
  const [username, setUsername] = useState(ep?.username ?? '')
  const [password, setPassword] = useState(ep?.password ?? '')
  // Empty name = derived from the address on save
  const [label, setLabel] = useState(
    target && ep && target.label !== labelFromUrl(ep.url) ? target.label : ''
  )

  // Deep link to an instance that no longer exists: back to the list
  useEffect(() => {
    if (editId && !target) nav('/settings/server', { replace: true })
  }, [editId, target, nav])

  async function save() {
    const ok = await connect(
      { url: url.trim().replace(/\/+$/, ''), username: username.trim(), password },
      { id: editId, label: label.trim() || undefined, activate: isNew }
    )
    if (ok) {
      toast(t('settings.serverSaved'))
      nav('/settings/server', { replace: true })
    }
  }

  function del() {
    if (!editId || !target) return
    const isLast = (store?.instances.length ?? 0) === 1
    confirm({
      title: t('settings.instancesDeleteTitle'),
      message: isLast ? t('settings.instancesDeleteLastMsg') : t('settings.instancesDeleteMsg', { name: target.label }),
      destructive: true,
      confirmText: t('settings.instancesDelete'),
      onConfirm: () => {
        removeInstance(editId)
        nav('/settings/server', { replace: true })
      },
    })
  }

  return (
    <Screen>
      <PageHeader back title={isNew ? t('settings.instancesAddTitle') : t('settings.instancesEditTitle')} />

      <GroupTitle>{t('settings.connectionGroup')}</GroupTitle>
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.1.2:3000" inputMode="url" autoCapitalize="off" />
          <div className="grid grid-cols-2 gap-3">
            <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('settings.usernamePlaceholder')} autoCapitalize="off" />
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('settings.passwordPlaceholder')} />
          </div>
          <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('settings.instancesNamePlaceholder')} autoCapitalize="off" />
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="flex gap-2.5">
            <Button className="flex-1" loading={connecting} disabled={!url.trim() || !username.trim()} onClick={save}>
              <Server size={15} /> {t('common.save')}
            </Button>
            {!isNew && (
              <Button variant="glass" className="flex-1" onClick={del}>
                <Trash size={15} /> {t('settings.instancesDelete')}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <p className="mt-4 px-2 text-[12px] leading-relaxed text-t3">{t('settings.serverNote')}</p>
    </Screen>
  )
}

