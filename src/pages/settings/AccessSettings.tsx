/** Access control: allowed/blocked clients and blocked hosts */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { useAuth } from '../../lib/session/auth'
import { api, swrFetcher } from '../../lib/api'
import { PageHeader, Screen, Card, GroupTitle, Button } from '../../components/ui/primitives'
import { Loading } from '../../components/ui/atoms'
import { runMutation } from '../../lib/mutation'
import { useDraftForm } from '../../lib/useDraftForm'
import { Field } from './Field'
/* ================= Access control ================= */

/** Draft shape is one entry per line (the server keeps trimmed arrays) */
type AccessDraft = { allowed: string; disallowed: string; hosts: string }

const toDraft = (d: any): AccessDraft => ({
  allowed: (d.allowed_clients ?? []).join('\n'),
  disallowed: (d.disallowed_clients ?? []).join('\n'),
  hosts: (d.blocked_hosts ?? []).join('\n'),
})

export function AccessSettings() {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const { data, mutate, isLoading } = useSWR<any>(cfg ? ['acl', cfg, '/access/list'] : null, swrFetcher)
  const [saving, setSaving] = useState(false)
  const form = useDraftForm<any, AccessDraft>(data, toDraft)
  const draft = form.draft
  const dirty = form.dirty

  async function save() {
    if (!cfg || !draft) return
    const toArr = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
    await runMutation({
      action: async () => {
        await api(cfg, '/access/set', {
          method: 'POST',
          body: { allowed_clients: toArr(draft.allowed), disallowed_clients: toArr(draft.disallowed), blocked_hosts: toArr(draft.hosts) },
        })
        // Refetch before refilling: the server's normalized copy becomes the
        // dirty baseline (trimmed/blank-filtered input no longer sticks)
        form.reset(await mutate())
      },
      okKey: 'advanced.savedAccess',
      setBusy: setSaving,
    })
  }

  if (isLoading || !draft) return <Screen><PageHeader back title={t('advanced.titleAccess')} /><Loading /></Screen>

  return (
    <Screen>
      <PageHeader back title={t('advanced.titleAccess')} right={dirty ? <Button size="header" loading={saving} onClick={save} native={{ label: t('common.save'), foreground: 'accent' }}>{t('common.save')}</Button> : undefined} />

      <GroupTitle>{t('advanced.groupClients')}</GroupTitle>
      <Card className="p-4 flex flex-col gap-3">
        <Field label={t('advanced.allowedLabel')} value={draft.allowed} onChange={(v) => form.patch('allowed', v)} placeholder="192.168.1.0/24" />
        <Field label={t('advanced.blockedLabel')} value={draft.disallowed} onChange={(v) => form.patch('disallowed', v)} placeholder="10.0.0.1" />
      </Card>

      <GroupTitle>{t('advanced.groupDomains')}</GroupTitle>
      <Card className="p-4">
        <Field label={t('advanced.blockedHostsLabel')} value={draft.hosts} onChange={(v) => form.patch('hosts', v)} placeholder={'version.bind\nid.server'} />
      </Card>

      <div className="mt-4 rounded-2xl px-4 py-3 text-[12px] leading-relaxed" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
        {t('advanced.accessWarning')}
      </div>

      {dirty && (
        <div className="mt-4 flex gap-2.5">
          <Button variant="glass" className="flex-1" onClick={() => form.reset(data)}>{t('advanced.discard')}</Button>
          <Button className="flex-1" loading={saving} onClick={save}>{t('advanced.saveChanges')}</Button>
        </div>
      )}
    </Screen>
  )
}
