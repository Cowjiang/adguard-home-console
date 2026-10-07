/** Instance list: multi-instance management entries */
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Server, Plus } from 'lucide-react'
import { IconBubble } from '../../components/ui/atoms'
import { useAuth } from '../../lib/session/auth'
import { PageHeader, Screen, Group, GroupTitle, Rows, Row, Button } from '../../components/ui/primitives'

/* ================= Instances ================= */

/** Instance list: online badge per instance (from /status probes), tap to edit */
export function ServerSettings() {
  const { instances, activeId } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()

  return (
    <Screen>
      <PageHeader back title={t('settings.serverTitle')} />

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
              title={it.label}
              subtitle={it.url}
              value={it.id === activeId ? t('settings.instancesActive') : undefined}
              onClick={() => nav(`/settings/server/edit?id=${it.id}`)}
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
