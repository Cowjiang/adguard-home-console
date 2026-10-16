/** About: app info, compatibility, and version updates */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info, Network, RotateCw, ChevronRight } from 'lucide-react'
import { IconBubble, Badge, Spinner } from '../../components/ui/atoms'
import { PageHeader, Screen, Group, GroupTitle, Rows, Row } from '../../components/ui/primitives'
import { useSheet } from '../../components/ui/sheet'
import { toast } from '../../components/ui/toast'
import { APP_NAME, APP_VERSION } from '../../lib/constants'
import { fetchSystemVersion, type SystemVersionResponse } from '../../lib/version'
import { AppUpdateSheet } from '../../components/settings/AppUpdateSheet'

/* ================= About ================= */

export function AboutSettings() {
  const { t } = useTranslation()
  const sheet = useSheet()
  const [checking, setChecking] = useState(false)
  const [versionData, setVersionData] = useState<SystemVersionResponse | null>(null)

  function openUpdateSheet(data: SystemVersionResponse) {
    if (!data.latest) return
    sheet.open(
      <AppUpdateSheet
        manifest={data.latest}
        runtime={data.runtime}
        currentVersion={data.currentVersion}
        onClose={sheet.close}
      />,
      { title: t('settings.updateDetails') }
    )
  }

  async function handleCheckUpdate(force = false) {
    if (checking) return
    setChecking(true)
    try {
      const res = await fetchSystemVersion({ force })
      setVersionData(res)
      if (force) {
        if (res.checkFailed) {
          toast(t('settings.appUpdateFailed', { msg: res.error || t('common.unknown', 'Error') }), 'err')
        } else if (res.hasUpdate && res.latest) {
          toast(t('settings.appNewVersionAvailable', { v: res.latest.version }), 'ok')
          openUpdateSheet(res)
        } else {
          toast(t('settings.appUpToDate'), 'ok')
        }
      }
    } catch (err: unknown) {
      if (force) {
        const msg = err instanceof Error ? err.message : String(err)
        toast(t('settings.appUpdateFailed', { msg }), 'err')
      }
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    let active = true
    fetchSystemVersion()
      .then((res) => {
        if (active) setVersionData(res)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  function renderStatusBadge() {
    if (checking && !versionData) {
      return <Spinner size={15} />
    }
    if (!versionData) return null

    if (versionData.hasUpdate && versionData.latest) {
      return (
        <span className="flex items-center gap-1">
          <Badge kind="info">
            {t('settings.appNewVersionAvailable', { v: versionData.latest.version })}
          </Badge>
          <ChevronRight size={16} className="text-t3" />
        </span>
      )
    }
    if (versionData.checkFailed) {
      return <Badge kind="warn">{t('settings.appCheckFailed')}</Badge>
    }
    return <Badge kind="ok">{t('settings.appUpToDate')}</Badge>
  }

  return (
    <Screen>
      <PageHeader back title={t('settings.aboutTitle')} />

      <GroupTitle>{t('settings.aboutGroup')}</GroupTitle>
      <Group>
        <Rows>
          {/* Version row with status badge. When update available, tapping opens update sheet */}
          <Row
            icon={
              <IconBubble color="var(--accent)" bg="var(--accent-soft)">
                <Info size={17} />
              </IconBubble>
            }
            title={APP_NAME}
            subtitle={'v' + APP_VERSION}
            right={renderStatusBadge()}
            onClick={
              versionData?.hasUpdate && versionData.latest
                ? () => openUpdateSheet(versionData)
                : undefined
            }
          />
          {/* Check for updates action */}
          <Row
            icon={
              <IconBubble
                color="var(--accent-2)"
                bg="color-mix(in srgb, var(--accent-2) 15%, transparent)"
              >
                <RotateCw size={17} className={checking ? 'animate-spin' : ''} />
              </IconBubble>
            }
            title={t('settings.checkAppUpdate')}
            subtitle={checking ? t('settings.checkingAppUpdate') : undefined}
            right={checking ? <Spinner size={16} /> : undefined}
            onClick={() => handleCheckUpdate(true)}
          />
          <Row
            icon={
              <IconBubble color="var(--violet)" bg="var(--violet-soft)">
                <Network size={17} />
              </IconBubble>
            }
            title={t('settings.compatibility')}
            subtitle={t('settings.compatibilitySub')}
            last
          />
        </Rows>
      </Group>
    </Screen>
  )
}
