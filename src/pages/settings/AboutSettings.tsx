/** About: app info, compatibility, and version updates */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Calendar,
  Download,
  ExternalLink,
  FolderGit2,
  GitBranch,
  Network,
  ShieldCheck,
  Tag,
} from 'lucide-react'
import { IconBubble, Badge } from '../../components/ui/atoms'
import { Button, PageHeader, Screen, Group, Rows, Row } from '../../components/ui/primitives'
import { usePick, PickSelect } from '../../components/ui/menu'
import { useSheet } from '../../components/ui/sheet'
import { toast } from '../../components/ui/toast'
import { isAppleMobile, isTauriShell } from '../../lib/native/shell'
import { useIsDesktop } from '../../lib/useIsDesktop'
import { fmtDate, fmtDateShort } from '../../lib/format'
import {
  APP_BUILD_TIME,
  APP_NAME,
  APP_RELEASES_URL,
  APP_REPO_URL,
  APP_VERSION,
} from '../../lib/constants'
import {
  fetchSystemVersion,
  getStoredUpdateChannel,
  setStoredUpdateChannel,
  setTargetChannel,
  supportsSelfUpgrade,
  type UpdateChannel,
  type SystemVersionResponse,
} from '../../lib/version'
import { AppUpdateContent } from '../../components/settings/AppUpdateContent'
import { SelfUpgradePrompt } from '../../components/settings/SelfUpgradePrompt'

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
  // The row and the native iOS select have less room than the pick menu;
  // keep the "(Stable)/(Nightly)" suffix for the menu only
  const channelShortOptions: { label: string; value: UpdateChannel }[] = [
    { value: 'stable', label: t('settings.channelStableShort') },
    { value: 'nightly', label: t('settings.channelNightlyShort') },
  ]

  const hasUpdate = Boolean(versionData?.hasUpdate && versionData.latest)
  const currentVersion = versionData?.currentVersion || APP_VERSION
  const channelLabel =
    channelShortOptions.find((o) => o.value === channel)?.label || channel
  const busy = checking || !versionData

  function openUpdateSheet(data: SystemVersionResponse) {
    if (!data.latest) return
    const targetChannel =
      data.targetChannel ?? (data.channel === 'nightly' ? 'nightly' : 'stable')

    const ariaLabel = t('settings.newVersionAvailableTitle')
    if (supportsSelfUpgrade(data)) {
      sheet.open(
        <SelfUpgradePrompt
          manifest={data.latest}
          currentVersion={data.currentVersion}
          channel={targetChannel}
          onClose={sheet.close}
        />,
        { ariaLabel }
      )
      return
    }

    // Desktop keeps the compact sheet; mobile opens the update details page
    if (isDesktop) {
      sheet.open(
        <AppUpdateContent
          manifest={data.latest}
          runtime={data.runtime}
          currentVersion={data.currentVersion}
          channel={targetChannel}
          onClose={sheet.close}
        />,
        { ariaLabel }
      )
    } else {
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
          // The hero button turns green; opening the details is the next tap
          toast(t('settings.appNewVersionAvailable', { v: res.latest.version }), 'ok')
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

  function handleHeroAction() {
    if (hasUpdate && versionData) {
      openUpdateSheet(versionData)
    } else {
      void handleCheckUpdate(true)
    }
  }

  return (
    <Screen>
      <PageHeader back title={t('settings.aboutTitle')} />

      {/* Identity card: logo, app/version info, update action at the far right */}
      <div className="glass relative overflow-hidden rounded-[24px] p-3 sm:p-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full opacity-70"
          style={{ background: 'radial-gradient(circle, var(--accent-soft), transparent 70%)' }}
        />
        <div className="relative flex items-center gap-3 sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <div
            className="flex h-16 w-16 flex-none items-center justify-center rounded-[18px] sm:h-24 sm:w-24 sm:rounded-[24px]"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <ShieldCheck className="h-8 w-8 sm:h-12 sm:w-12" strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-tight text-t1 min-[360px]:text-[16px] sm:text-[22px]">
              {APP_NAME}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-[13px] leading-snug break-all text-t2 sm:text-[14px]">
                v{currentVersion}
              </span>
              <Badge kind="info">{channelLabel}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-t3 sm:mt-1.5 sm:text-[12px]">
              <span className="inline-flex items-center gap-1">
                <Calendar size={12} className="flex-none" />
                <span className="sm:hidden">{fmtDateShort(APP_BUILD_TIME)}</span>
                <span className="hidden sm:inline">
                  {t('settings.buildTime')} {fmtDate(APP_BUILD_TIME)}
                </span>
              </span>
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant={hasUpdate ? 'primary' : 'glass'}
          loading={busy}
          onClick={handleHeroAction}
          label={
            checking
              ? t('settings.checkingAppUpdate')
              : hasUpdate
                ? t('settings.updateAvailableButton')
                : t('settings.checkUpdateShort')
          }
          className="min-h-9 flex-none"
        >
          {!busy && hasUpdate && <Download size={15} />}
          {checking ? (
            <>
              <span className="sm:hidden">{t('settings.checkingShort')}</span>
              <span className="hidden sm:inline">{t('settings.checkingAppUpdate')}</span>
            </>
          ) : hasUpdate ? (
            <>
              <span className="sm:hidden">{t('settings.updateShort')}</span>
              <span className="hidden sm:inline">{t('settings.updateAvailableButton')}</span>
            </>
          ) : (
            <span>{t('settings.checkUpdateShort')}</span>
          )}
        </Button>
        </div>
      </div>

      <Group className="mt-5">
        <Rows>
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
            subtitle={
              channel === 'nightly'
                ? t('settings.channelNightlyDesc')
                : t('settings.channelStableDesc')
            }
            value={
              apple
                ? undefined
                : channelShortOptions.find((o) => o.value === channel)?.label || channel
            }
            right={
              apple ? (
                <div className="w-32 flex-none">
                  <PickSelect
                    className="field num !py-1.5 !pr-8 text-right"
                    ariaLabel={t('settings.updateChannel')}
                    value={channel}
                    options={channelShortOptions}
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

          <Row
            icon={
              <IconBubble color="var(--violet)" bg="var(--violet-soft)">
                <FolderGit2 size={17} />
              </IconBubble>
            }
            title={t('settings.githubRepo')}
            subtitle={t('settings.githubRepoSub')}
            right={<ExternalLink size={16} className="flex-none text-t3" />}
            onClick={() => window.open(APP_REPO_URL, '_blank', 'noopener,noreferrer')}
          />

          <Row
            icon={
              <IconBubble color="var(--accent)" bg="var(--accent-soft)">
                <Tag size={17} />
              </IconBubble>
            }
            title={t('settings.githubReleases')}
            subtitle={t('settings.githubReleasesSub')}
            right={<ExternalLink size={16} className="flex-none text-t3" />}
            onClick={() => window.open(APP_RELEASES_URL, '_blank', 'noopener,noreferrer')}
          />

          <Row
            icon={
              <IconBubble color="var(--accent-2)" bg="color-mix(in srgb, var(--accent-2) 15%, transparent)">
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
