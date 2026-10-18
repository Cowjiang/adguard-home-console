/** Instance add/edit/delete form */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Server, Trash, Globe } from 'lucide-react'
import { useAuth } from '../../lib/session/auth'
import { PageHeader, Screen, Card, GroupTitle, Button } from '../../components/ui/primitives'
import { useConfirm } from '../../components/ui/sheet'
import { ErrorBox } from '../../components/ui/atoms'
import { toast } from '../../components/ui/toast'
import { activeEndpoint, labelFromUrl, newId } from '../../lib/session/instances'
import {
  base64ToUint8Array,
  deriveMasterKey,
  generateSalt,
  uint8ArrayToBase64,
} from '../../lib/crypto/e2ee'
import { setSessionKey, removeSessionKey } from '../../lib/crypto/keyVault'
import { migrateLocalSnapshotsToManaged } from '../../lib/snapshot/outboxSync'

export function InstanceEdit() {
  const { store, connect, removeInstance, connecting, error } = useAuth()
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

  // Managed mode settings
  const [isManaged, setIsManaged] = useState(Boolean(target?.managed))
  const [serverUrl, setServerUrl] = useState(
    target?.managed?.serverUrl ||
      (typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost:3000')
  )
  const [managedError, setManagedError] = useState<string | null>(null)

  // Deep link to an instance that no longer exists: back to the list
  useEffect(() => {
    if (editId && !target) nav('/settings/server', { replace: true })
  }, [editId, target, nav])

  async function save() {
    setManagedError(null)
    const cleanUrl = url.trim().replace(/\/+$/, '')
    const cleanUsername = username.trim()
    const cleanLabel = label.trim() || labelFromUrl(cleanUrl)
    const targetId = editId || newId()

    let managedMeta: { serverUrl: string; salt: string } | undefined
    if (isManaged) {
      const cleanServer = serverUrl.trim().replace(/\/+$/, '')
      const salt = target?.managed?.salt || uint8ArrayToBase64(generateSalt())
      try {
        // Register metadata with Console server (STRICT REDLINE: NO password!)
        const res = await fetch(`${cleanServer}/api/managed/instances`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: targetId,
            label: cleanLabel,
            url: cleanUrl,
            username: cleanUsername,
            salt,
          }),
        })
        if (!res.ok) {
          const errText = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`)
        }
        managedMeta = { serverUrl: cleanServer, salt }

        // Derive and cache master key in memory
        const saltBytes = base64ToUint8Array(salt)
        const key = await deriveMasterKey(password, saltBytes)
        setSessionKey(targetId, key)

        // Attempt background migration of any unmanaged local snapshots
        void migrateLocalSnapshotsToManaged(targetId, password, managedMeta).catch(() => {})
      } catch (err: any) {
        setManagedError(t('settings.managedEnrollError', { msg: err?.message || String(err) }))
        return
      }
    } else {
      removeSessionKey(targetId)
    }

    const ok = await connect(
      { url: cleanUrl, username: cleanUsername, password },
      { id: targetId, label: cleanLabel, activate: isNew, managed: managedMeta }
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
        removeSessionKey(editId)
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
          
          {/* Managed Mode Toggle */}
          <div className="mt-1 rounded-2xl border border-white/10 bg-white/5 p-3 flex flex-col gap-2.5">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-2 text-[13.5px] font-medium text-t1">
                <Globe size={15} className="text-accent" />
                {t('settings.managedModeToggle')}
              </span>
              <input
                type="checkbox"
                checked={isManaged}
                onChange={(e) => setIsManaged(e.target.checked)}
                className="h-4 w-4 rounded accent-[var(--accent)]"
              />
            </label>
            <p className="text-[12px] leading-relaxed text-t3">
              {t('settings.managedModeDesc')}
            </p>
            {isManaged && (
              <div className="mt-1">
                <span className="mb-1 block text-[12px] font-medium text-t2">
                  {t('settings.managedServerUrl')}
                </span>
                <input
                  className="field"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder={t('settings.managedServerUrlPlaceholder')}
                  autoCapitalize="off"
                  inputMode="url"
                />
              </div>
            )}
          </div>

          {(error || managedError) && (
            <ErrorBox>{managedError || error}</ErrorBox>
          )}

          <div className="flex gap-2.5 mt-1">
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
