/**
 * App update details sub-page (mobile): release notes and upgrade
 * instructions are browsing content, so it opens as a page while desktop
 * keeps the centered sheet (see docs/web-interaction.md).
 */
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RotateCw } from 'lucide-react'
import { PageHeader, Screen } from '../../components/ui/primitives'
import { EmptyState, Loading } from '../../components/ui/atoms'
import { AppUpdateContent } from '../../components/settings/AppUpdateContent'
import { fetchSystemVersion, type SystemVersionResponse } from '../../lib/version'

export function UpdatePage() {
  const location = useLocation()
  const { t } = useTranslation()
  // The About page hands over the already-fetched payload; a direct open
  // (deep link / refresh) re-fetches through the cached server endpoint
  const handed = (location.state as { data?: SystemVersionResponse } | null)?.data ?? null
  const [data, setData] = useState<SystemVersionResponse | null>(handed)

  useEffect(() => {
    if (data) return
    let active = true
    fetchSystemVersion()
      .then((res) => {
        if (active) setData(res)
      })
      .catch(() => {})
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Screen>
      <PageHeader back title={t('settings.updateDetails')} />
      {!data ? (
        <Loading />
      ) : data.hasUpdate && data.latest ? (
        <AppUpdateContent
          manifest={data.latest}
          runtime={data.runtime}
          currentVersion={data.currentVersion}
          canSelfUpgrade={data.canSelfUpgrade}
          channel={data.targetChannel ?? (data.channel === 'nightly' ? 'nightly' : 'stable')}
        />
      ) : (
        <EmptyState
          icon={<RotateCw size={30} className="text-t3" />}
          title={data.checkFailed ? t('settings.appCheckFailed') : t('settings.appUpToDate')}
        />
      )}
    </Screen>
  )
}
