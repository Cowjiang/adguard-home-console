/**
 * Mobile manual update details page: self-upgrade uses the confirmation sheet,
 * and desktop keeps the compact manual sheet; this page holds the
 * channel-accurate steps and the manual download without a cancel action.
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

  const hasUpdate = Boolean(data?.hasUpdate && data.latest)

  return (
    <Screen>
      <PageHeader
        back
        title={hasUpdate ? t('settings.newVersionAvailableTitle') : t('settings.updateDetails')}
      />
      {!data ? (
        <Loading />
      ) : data.hasUpdate && data.latest ? (
        <AppUpdateContent
          manifest={data.latest}
          runtime={data.runtime}
          currentVersion={data.currentVersion}
          channel={data.targetChannel ?? (data.channel === 'nightly' ? 'nightly' : 'stable')}
          showTitle={false}
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
