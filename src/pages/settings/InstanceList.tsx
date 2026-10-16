/** Instance list: multi-instance management entries */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Server, Plus, Check, Pencil, Trash } from 'lucide-react'
import { IconBubble } from '../../components/ui/atoms'
import { useAuth } from '../../lib/session/auth'
import { PageHeader, Screen, Group, GroupTitle, Rows, Row, Button } from '../../components/ui/primitives'
import { useConfirm } from '../../components/ui/sheet'

/* ================= Instances ================= */

/** Instance list: online badge per instance (from /status probes). Tapping a row
 *  switches the active instance; the header's manage toggle swaps the rows'
 *  tap action for per-row edit / delete (header button goes through the native
 *  glass path inside the iOS shell) */
export function ServerSettings() {
  const { instances, activeId, switchInstance, removeInstance } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()
  const confirm = useConfirm()
  const [manage, setManage] = useState(false)

  function remove(id: string) {
    const target = instances.find((x) => x.id === id)
    if (!target) return
    const isLast = instances.length === 1
    confirm({
      title: t('settings.instancesDeleteTitle'),
      message: isLast ? t('settings.instancesDeleteLastMsg') : t('settings.instancesDeleteMsg', { name: target.label }),
      destructive: true,
      confirmText: t('settings.instancesDelete'),
      onConfirm: () => removeInstance(id),
    })
  }

  return (
    <Screen>
      <PageHeader
        back
        title={t('settings.serverTitle')}
        right={
          instances.length > 0 ? (
            <Button
              size="header"
              onClick={() => setManage((v) => !v)}
              native={{ label: manage ? t('common.done') : t('common.manage'), foreground: 'accent' }}
            >
              {manage ? t('common.done') : t('common.manage')}
            </Button>
          ) : undefined
        }
      />

      <GroupTitle>{t('settings.instancesGroup')}</GroupTitle>
      <Group>
        <Rows>
          {instances.map((it, i) => (
            <Row
              key={it.id}
              icon={
                <IconBubble color={it.online === 'ok' ? 'var(--ok)' : it.online === 'down' ? 'var(--danger)' : 'var(--t3)'} bg="color-mix(in srgb, currentColor 12%, transparent)">
                  <Server size={17} />
                </IconBubble>
              }
              title={
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{it.label}</span>
                  {it.id === activeId && (
                    <Check size={15} className="flex-none" style={{ color: 'var(--accent)' }} />
                  )}
                </span>
              }
              subtitle={it.url}
              value={!manage && it.id === activeId ? t('settings.instancesActive') : undefined}
              right={
                manage ? (
                  <div className="flex flex-none items-center gap-1.5">
                    <Button variant="glass" size="sm" onClick={() => nav(`/settings/server/edit?id=${it.id}`)}>
                      <Pencil size={13} /> {t('common.edit')}
                    </Button>
                    <Button variant="glass" size="sm" onClick={() => remove(it.id)}>
                      <Trash size={13} /> {t('common.delete')}
                    </Button>
                  </div>
                ) : null
              }
              onClick={manage ? undefined : () => switchInstance(it.id)}
              last={i === instances.length - 1}
            />
          ))}
        </Rows>
      </Group>

      <Button variant="glass" className="mt-4 w-full" onClick={() => nav('/settings/server/edit')}>
        <Plus size={15} /> {t('settings.instancesAdd')}
      </Button>

      <p className="mt-4 px-2 text-[12px] leading-relaxed text-t3">{t('settings.instancesListNote')}</p>
    </Screen>
  )
}

/** Add / edit one instance: the form verifies connectivity via /status before
 *  saving (connect()), delete falls back to the first remaining instance */
