/** Self-upgrade confirmation in the project's confirm-dialog style: no icon,
 *  no sheet title bar. Title + two version lines + cancel/upgrade. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/primitives'
import { Spinner } from '../ui/atoms'
import { toast } from '../ui/toast'
import { UpdateVersionInfo } from './UpdateVersionInfo'
import {
  getUpgradeStatus,
  triggerSelfUpgrade,
  type UpdateChannel,
  type VersionManifest,
} from '../../lib/version'

export function SelfUpgradePrompt({
  manifest,
  currentVersion,
  channel,
  onClose,
}: {
  manifest: VersionManifest
  currentVersion: string
  channel?: UpdateChannel
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [upgrading, setUpgrading] = useState(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [])

  async function startUpgrade() {
    if (upgrading) return
    setUpgrading(true)
    toast(t('settings.selfUpgradeStarting'))
    const res = await triggerSelfUpgrade({ channel })
    if (!res.ok) {
      setUpgrading(false)
      toast(t('settings.selfUpgradeFailed', { msg: res.error || t('common.unknown', 'Error') }), 'err')
      return
    }

    let hasDropped = false
    let pollCount = 0
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)

    pollIntervalRef.current = setInterval(async () => {
      pollCount++
      // Timeout guard: 3 minutes max (90 * 2s)
      if (pollCount > 90) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        setUpgrading(false)
        toast(t('settings.selfUpgradeFailed', { msg: t('settings.selfUpgradeTimeout') }), 'err')
        return
      }

      // Before the connection drops, check if the upgrade script already failed
      if (!hasDropped) {
        const statusRes = await getUpgradeStatus()
        if (statusRes.ok && statusRes.status === 'failed') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          setUpgrading(false)
          toast(t('settings.selfUpgradeFailed', { msg: statusRes.error || t('common.unknown', 'Error') }), 'err')
          return
        }
      }

      try {
        const healthRes = await fetch('/api/health', { cache: 'no-store' })
        if (healthRes.ok) {
          if (hasDropped) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            toast(t('settings.selfUpgradeSuccess'), 'ok')
            setTimeout(() => {
              window.location.reload()
            }, 1000)
          }
        } else {
          hasDropped = true
        }
      } catch {
        hasDropped = true
      }
    }, 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      {upgrading ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Spinner size={28} />
          <p className="text-[15px] font-semibold text-t1">
            {t('settings.selfUpgradeInProgress')}
          </p>
        </div>
      ) : (
        <>
          <UpdateVersionInfo manifest={manifest} currentVersion={currentVersion} />
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              size="sm"
              variant="glass"
              className="min-h-11 w-full !px-2 !text-[12px] min-[360px]:!px-3.5 min-[360px]:!text-[13px]"
              onClick={onClose}
            >
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="min-h-11 w-full !px-2 !text-[12px] min-[360px]:!px-3.5 min-[360px]:!text-[13px]"
              onClick={startUpgrade}
            >
              {t('settings.selfUpgrade')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
