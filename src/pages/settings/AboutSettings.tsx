/** About: app info, compatibility */
import { useTranslation } from 'react-i18next'
import { Info, Network } from 'lucide-react'
import { IconBubble } from '../../components/ui/atoms'
import { PageHeader, Screen, Group, GroupTitle, Rows, Row } from '../../components/ui/primitives'
import { APP_NAME, APP_VERSION } from '../../lib/constants'

/* ================= About ================= */

export function AboutSettings() {
  const { t } = useTranslation()
  return (
    <Screen>
      <PageHeader back title={t('settings.aboutTitle')} />

      <GroupTitle>{t('settings.aboutGroup')}</GroupTitle>
      <Group>
        <Rows>
          {/* The version goes in the subtitle, as on the settings hub: a nightly
              string is long enough that a trailing value squeezes the app name
              out of the row on a phone width. */}
          <Row icon={<IconBubble color="var(--accent)" bg="var(--accent-soft)"><Info size={17} /></IconBubble>} title={APP_NAME} subtitle={'v' + APP_VERSION} />
          <Row
            icon={<IconBubble color="var(--violet)" bg="var(--violet-soft)"><Network size={17} /></IconBubble>}
            title={t('settings.compatibility')}
            subtitle={t('settings.compatibilitySub')}
            last
          />
        </Rows>
      </Group>
    </Screen>
  )
}
