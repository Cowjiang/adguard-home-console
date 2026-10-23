/** Manual update content shared by the desktop sheet (with cancel) and the
 *  mobile update details page (no cancel, page header owns the title). */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check } from 'lucide-react'
import { copyText } from '../../lib/clipboard'
import { toast } from '../ui/toast'
import { Button } from '../ui/primitives'
import { APP_RELEASES_URL } from '../../lib/constants'
import type { AppRuntime, UpdateChannel, VersionManifest } from '../../lib/version'
import { UpdateVersionInfo } from './UpdateVersionInfo'

export interface AppUpdateContentProps {
  manifest: VersionManifest
  runtime: AppRuntime
  currentVersion: string
  /** Target channel; drives the npm dist-tag and the release fallback URL. */
  channel?: UpdateChannel
  /** Only the desktop sheet passes this; the mobile page uses its back header. */
  onClose?: () => void
  showTitle?: boolean
}

function CodeWell({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-xl p-2.5 font-mono text-[12px] text-t1"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)' }}
    >
      <span className="min-w-0 flex-1 select-all break-all">{children}</span>
      {action}
    </div>
  )
}

function CopyChip({
  label,
  title,
  copied,
  onCopy,
}: {
  label: string
  title?: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      title={title}
      className="press ml-2 flex min-h-9 flex-none items-center gap-1 rounded-full px-3 py-2 text-[11.5px] font-semibold text-accent transition-colors"
      style={{ background: 'var(--accent-soft)' }}
    >
      {copied ? (
        <>
          <Check size={13} style={{ color: 'var(--ok)' }} />
          <span style={{ color: 'var(--ok)' }}>{label}</span>
        </>
      ) : (
        <>
          <Copy size={13} />
          <span>{label}</span>
        </>
      )}
    </button>
  )
}

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="press flex h-11 min-h-11 w-full items-center justify-center rounded-full px-2 text-[12px] font-semibold text-white min-[360px]:px-3.5 min-[360px]:text-[13px]"
      style={{
        background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--accent-2)))',
      }}
    >
      {children}
    </a>
  )
}

export function AppUpdateContent({
  manifest,
  runtime,
  currentVersion,
  channel,
  onClose,
  showTitle = true,
}: AppUpdateContentProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const activeChannel = channel ?? (manifest.channel === 'nightly' ? 'nightly' : 'stable')
  const npmDistTag = activeChannel === 'nightly' ? 'nightly' : 'latest'
  const command =
    runtime === 'npm'
      ? `npm i -g agh-console@${npmDistTag}`
      : runtime === 'docker' && manifest.downloads?.docker
        ? `docker pull ${manifest.downloads.docker}`
        : null
  // manifest.htmlUrl comes from the checked channel; the fallback keeps the
  // manual download on that same channel when the manifest omits it
  const releaseUrl =
    manifest.htmlUrl ||
    (activeChannel === 'nightly'
      ? `${APP_RELEASES_URL}/tag/nightly`
      : `${APP_RELEASES_URL}/latest`)

  async function handleCopy() {
    if (!command) return
    const ok = await copyText(command)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast(t('common.copyFailed'), 'err')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <UpdateVersionInfo manifest={manifest} currentVersion={currentVersion} showTitle={showTitle} />
      <p className="text-center text-[12.5px] leading-relaxed text-t2">
        {t('settings.manualUpgradeHint')}
      </p>

      {command && (
        <CodeWell
          action={
            <CopyChip
              label={t('settings.copy')}
              title={t('settings.copyCommand')}
              copied={copied}
              onCopy={handleCopy}
            />
          }
        >
          {command}
        </CodeWell>
      )}

      {onClose ? (
        <div className="grid grid-cols-2 gap-2.5">
          <Button
            size="sm"
            variant="glass"
            className="min-h-11 w-full !px-2 !text-[12px] min-[360px]:!px-3.5 min-[360px]:!text-[13px]"
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>
          <PrimaryLink href={releaseUrl}>{t('settings.manualDownload')}</PrimaryLink>
        </div>
      ) : (
        <PrimaryLink href={releaseUrl}>{t('settings.manualDownload')}</PrimaryLink>
      )}
    </div>
  )
}
