/** About: app info, compatibility, and version updates */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Info, Network, RotateCw, ChevronRight, GitBranch } from 'lucide-react'
import { IconBubble, Badge, Spinner } from '../../components/ui/atoms'
import { PageHeader, Screen, Group, GroupTitle, Rows, Row } from '../../components/ui/primitives'
import { usePick, PickSelect } from '../../components/ui/menu'
import { useSheet } from '../../components/ui/sheet'
import { toast } from '../../components/ui/toast'
import { isAppleMobile, isTauriShell } from '../../lib/native/shell'
import { useIsDesktop } from '../../lib/useIsDesktop'
import { APP_NAME, APP_VERSION } from '../../lib/constants'
import {
  fetchSystemVersion,
  getStoredUpdateChannel,
  setStoredUpdateChannel,
  setTargetChannel,
  type UpdateChannel,
  type SystemVersionResponse,
} from '../../lib/version'
import { AppUpdateSheet } from '../../components/settings/AppUpdateSheet'

/* ================= About ================= */

export function AboutSettings() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const sheet = useSheet()
  const pick = usePick()
  const apple = isAppleMobile()
  const isDesktop = useIsDesktop()
  const [checking, setChecking] = useState(false)
  const [versionData, setVersionData] = useState<SystemVersionResponse | null>(null)
  const [channel, setChannel] = useState<UpdateChannel>(getStoredUpdateChannel)

  const channelOptions: { label: string; value: UpdateChannel }[] = [
    { value: 'stable', label: t('settings.channelStable') },
    { value: 'nightly', label: t('settings.channelNightly') },
  ]

  function openUpdateSheet(data: SystemVersionResponse) {
    if (!data.latest) return
    if (isDesktop) {
      sheet.open(
        <AppUpdateSheet
          manifest={data.latest}
          runtime={data.runtime}
          currentVersion={data.currentVersion}
          canSelfUpgrade={data.canSelfUpgrade}
          channel={data.targetChannel ?? (data.channel === 'nightly' ? 'nightly' : 'stable')}
          onClose={sheet.close}
        />,
        { title: t('settings.updateDetails') }
      )
    } else {
      // Release notes & instructions are browsing content: a sub-page on mobile
      nav('/settings/about/update', { state: { data } })
    }
  }

  function applyResolvedChannel(res: SystemVersionResponse) {
    const resolved = res.targetChannel
    if (resolved === 'stable' || resolved === 'nightly') {
      setChannel(resolved)
      setStoredUpdateChannel(resolved)
    }
  }

  async function handleCheckUpdate(force = false, targetChannel?: UpdateChannel) {
    if (checking) return
    setChecking(true)
    try {
      // Web defers to the server-persisted target unless a channel is explicit;
      // deployments without self-upgrade keep the original per-browser choice.
      const localOnly =
        isTauriShell() ||
        (versionData !== null && (versionData.canSelfUpgrade !== true || !versionData.targetChannel))
      const requested = targetChannel ?? (localOnly ? channel : undefined)
      const res = await fetchSystemVersion(requested ? { force, channel: requested } : { force })
      setVersionData(res)
      applyResolvedChannel(res)
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

  async function handleChannelChange(newChannel: UpdateChannel) {
    if (newChannel === channel) return
    setStoredUpdateChannel(newChannel)
    setChannel(newChannel)
    const label = newChannel === 'nightly' ? t('settings.channelNightly') : t('settings.channelStable')
    toast(t('settings.channelChanged', { channel: label }), 'ok')

    if (isTauriShell() || (versionData !== null && versionData.canSelfUpgrade !== true)) {
      handleCheckUpdate(true, newChannel)
      return
    }

    const saved = await setTargetChannel(newChannel)
    if (saved.ok) {
      handleCheckUpdate(true)
      return
    }

    // Self-upgrade disabled or server offline: the browser choice still drives
    // the check, but the timer and one-click upgrade keep the old target.
    toast(t('settings.channelPersistFailed', { msg: saved.error || t('common.unknown', 'Error') }), 'err')
    handleCheckUpdate(true, newChannel)
  }

  useEffect(() => {
    let active = true
    fetchSystemVersion()
      .then((res) => {
        if (!active) return
        setVersionData(res)
        applyResolvedChannel(res)
        if (!isTauriShell() && !res.targetChannel) {
          const stored = getStoredUpdateChannel()
          setChannel(stored)
          fetchSystemVersion({ channel: stored })
            .then((localRes) => {
              if (active) setVersionData(localRes)
            })
            .catch(() => {})
        }
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

          {/* Update Channel selection row */}
          <Row
            icon={
              <IconBubble
                color="var(--warn)"
                bg="color-mix(in srgb, var(--warn) 15%, transparent)"
              >
                <GitBranch size={17} />
              </IconBubble>
            }
            title={t('settings.updateChannel')}
            subtitle={channel === 'nightly' ? t('settings.channelNightlyDesc') : t('settings.channelStableDesc')}
            value={apple ? undefined : (channelOptions.find((o) => o.value === channel)?.label || channel)}
            right={
              apple ? (
                <div className="w-36 flex-none">
                  <PickSelect
                    className="field num !py-1.5 !pr-8 text-right"
                    ariaLabel={t('settings.updateChannel')}
                    value={channel}
                    options={channelOptions}
                    onPick={handleChannelChange}
                  />
                </div>
              ) : undefined
            }
            onClick={
              apple
                ? undefined
                : (e) => {
                    pick({
                      title: t('settings.updateChannel'),
                      anchor: e.currentTarget,
                      align: 'right',
                      value: channel,
                      options: channelOptions,
                      onPick: handleChannelChange,
                    })
                  }
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
