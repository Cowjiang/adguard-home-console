/** Shared update identity: title + new/current version lines */
import { useTranslation } from 'react-i18next'
import type { VersionManifest } from '../../lib/version'

export function UpdateVersionInfo({
  manifest,
  currentVersion,
  showTitle = true,
}: {
  manifest: VersionManifest
  currentVersion: string
  showTitle?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1 text-center">
      {showTitle && (
        <p className="text-[17px] font-bold text-t1">
          {t('settings.newVersionAvailableTitle')}
        </p>
      )}
      <div className="flex flex-col gap-0.5 text-[12.5px] leading-relaxed text-t3">
        <p className="break-all">{t('settings.newVersionLine', { v: manifest.version })}</p>
        <p className="break-all">{t('settings.currentVersionLine', { v: currentVersion })}</p>
      </div>
    </div>
  )
}
