/** Client edit form (desktop centered modal / mobile standalone subpage) + the
 *  empty-client factory shared by both entry points */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Baby, Globe, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../lib/session/auth'
import { api, type AghClient } from '../../lib/api'
import { Switch, Button } from '../ui/primitives'
import { toast } from '../ui/toast'
import { runMutation } from '../../lib/mutation'

export const emptyClient = (): Partial<AghClient> => ({
  name: '',
  ids: [],
  use_global_settings: true,
  filtering_enabled: true,
  safebrowsing_enabled: false,
  parental_enabled: false,
  use_global_blocked_services: true,
  blocked_services: [],
  tags: [],
  ignore_querylog: false,
  ignore_statistics: false,
})

export function ClientForm({
  initial, isNew, onClose, onSaved, showTitle = true,
}: {
  initial: Partial<AghClient>
  isNew: boolean
  onClose: () => void
  onSaved: () => void
  /** Page form: the title comes from PageHeader; disable the form's built-in title to
   *  avoid duplication */
  showTitle?: boolean
}) {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const [c, setC] = useState<Partial<AghClient>>({ ...initial })
  const [idsText, setIdsText] = useState((initial.ids ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof AghClient>(k: K, v: AghClient[K]) => setC((s) => ({ ...s, [k]: v }))

  async function save() {
    if (!cfg) return
    if (!c.name?.trim()) return toast(t('clients.nameRequired'), 'err')
    const ids = idsText.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean)
    if (!ids.length) return toast(t('clients.idsRequired'), 'err')
    const payload: AghClient = {
      name: c.name.trim(),
      ids,
      use_global_settings: !!c.use_global_settings,
      filtering_enabled: c.filtering_enabled ?? true,
      safebrowsing_enabled: !!c.safebrowsing_enabled,
      parental_enabled: !!c.parental_enabled,
      use_global_blocked_services: c.use_global_blocked_services ?? true,
      blocked_services: c.blocked_services ?? [],
      tags: c.tags ?? [],
      ignore_querylog: !!c.ignore_querylog,
      ignore_statistics: !!c.ignore_statistics,
      upstreams_cache_enabled: false,
      upstreams_cache_size: 64 * 1024,
    }
    await runMutation({
      action: () => isNew
        ? api(cfg, '/clients/add', { method: 'POST', body: payload })
        : api(cfg, '/clients/update', { method: 'POST', body: { name: initial.name, data: payload } }),
      // The caller's onSaved closes the sheet/subpage and revalidates the list
      invalidate: onSaved,
      okKey: isNew ? 'clients.added' : 'common.saved',
      setBusy: setSaving,
    })
  }

  return (
    <div style={{ maxHeight: '72vh', overflowY: 'auto' }}>
      {showTitle && <p className="mb-4 text-center text-[17px] font-bold text-t1">{isNew ? t('clients.formAddTitle') : t('clients.formEditTitle')}</p>}

      <div className="flex flex-col gap-3">
        <input className="field" placeholder={t('clients.namePlaceholder')} value={c.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        <input className="field" placeholder={t('clients.idsPlaceholder')} value={idsText} onChange={(e) => setIdsText(e.target.value)} autoCapitalize="off" />

        <div className="glass flex items-center justify-between rounded-2xl px-4 py-3">
          <div>
            <p className="text-[14.5px] font-medium text-t1">{t('clients.useGlobal')}</p>
            <p className="text-[11.5px] text-t2">{t('clients.useGlobalSub')}</p>
          </div>
          <Switch on={!!c.use_global_settings} onChange={(v) => set('use_global_settings', v)} />
        </div>

        {c.use_global_settings === false && (
          <div className="glass rounded-2xl px-4">
            {[
              { k: 'filtering_enabled' as const, label: t('clients.filterLabel'), icon: <Globe size={15} /> },
              { k: 'safebrowsing_enabled' as const, label: t('clients.safeBrowsingLabel'), icon: <ShieldAlert size={15} /> },
              { k: 'parental_enabled' as const, label: t('clients.parentalLabel'), icon: <Baby size={15} /> },
            ].map(({ k, label, icon }, i) => (
              <div key={k}>
                {i > 0 && <div className="h-px" style={{ background: 'var(--glass-border)' }} />}
                <div className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-2 text-[14.5px] text-t1">{icon} {label}</span>
                  <Switch on={!!c[k]} onChange={(v) => set(k, v as never)} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="glass flex items-center justify-between rounded-2xl px-4 py-3">
          <div>
            <p className="text-[14.5px] font-medium text-t1">{t('clients.useGlobalServices')}</p>
            <p className="text-[11.5px] text-t2">{t('clients.useGlobalServicesSub')}</p>
          </div>
          <Switch on={c.use_global_blocked_services !== false} onChange={(v) => set('use_global_blocked_services', v)} />
        </div>

        <div className="flex gap-2.5 pt-1">
          <Button variant="glass" size="lg" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="lg" className="flex-1" loading={saving} onClick={save}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
