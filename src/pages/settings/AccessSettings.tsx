/** Access control: allowed/blocked clients and blocked hosts */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { useAuth } from '../../lib/session/auth'
import { api, swrFetcher } from '../../lib/api'
import { PageHeader, Screen, Card, GroupTitle, Button } from '../../components/ui/primitives'
import { toast } from '../../components/ui/toast'
import { Loading } from '../../components/ui/atoms'
import { Field } from './Field'
/* ================= Access control ================= */

export function AccessSettings() {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const { data, mutate, isLoading } = useSWR<any>(cfg ? ['acl', cfg, '/access/list'] : null, swrFetcher)
  const [draft, setDraft] = useState<null | { allowed: string; disallowed: string; hosts: string }>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data && draft === null)
      setDraft({
        allowed: (data.allowed_clients ?? []).join('\n'),
        disallowed: (data.disallowed_clients ?? []).join('\n'),
        hosts: (data.blocked_hosts ?? []).join('\n'),
      })
  }, [data, draft])

  const dirty = !!draft && !!data && (draft.allowed !== (data.allowed_clients ?? []).join('\n') || draft.disallowed !== (data.disallowed_clients ?? []).join('\n') || draft.hosts !== (data.blocked_hosts ?? []).join('\n'))

  async function save() {
    if (!cfg || !draft) return
    setSaving(true)
    try {
      const toArr = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
      await api(cfg, '/access/set', {
        method: 'POST',
        body: { allowed_clients: toArr(draft.allowed), disallowed_clients: toArr(draft.disallowed), blocked_hosts: toArr(draft.hosts) },
      })
      mutate()
      toast(t('advanced.savedAccess'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !draft) return <Screen><PageHeader back title={t('advanced.titleAccess')} /><Loading /></Screen>

  return (
    <Screen>
      <PageHeader back title={t('advanced.titleAccess')} right={dirty ? <Button size="header" loading={saving} onClick={save} native={{ label: t('common.save'), foreground: 'accent' }}>{t('common.save')}</Button> : undefined} />

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle>{t('advanced.groupClients')}</GroupTitle>
          <Card className="p-4 flex flex-col gap-3">
            <Field label={t('advanced.allowedLabel')} value={draft.allowed} onChange={(v) => setDraft({ ...draft, allowed: v })} placeholder="192.168.1.0/24" />
            <Field label={t('advanced.blockedLabel')} value={draft.disallowed} onChange={(v) => setDraft({ ...draft, disallowed: v })} placeholder="10.0.0.1" />
          </Card>
        </div>
        <div>
          <GroupTitle>{t('advanced.groupDomains')}</GroupTitle>
          <Card className="p-4">
            <Field label={t('advanced.blockedHostsLabel')} value={draft.hosts} onChange={(v) => setDraft({ ...draft, hosts: v })} placeholder={'version.bind\nid.server'} />
          </Card>
        </div>
      </div>

      <div className="mt-4 rounded-2xl px-4 py-3 text-[12px] leading-relaxed" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
        {t('advanced.accessWarning')}
      </div>

      {dirty && (
        <div className="mt-4 flex gap-2.5">
          <Button variant="glass" className="flex-1" onClick={() => setDraft(null)}>{t('advanced.discard')}</Button>
          <Button className="flex-1" loading={saving} onClick={save}>{t('advanced.saveChanges')}</Button>
        </div>
      )}
    </Screen>
  )
}

