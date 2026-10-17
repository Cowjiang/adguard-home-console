/**
 * App update details content: version comparison, release notes and
 * runtime-tailored upgrade instructions (Docker / npm / systemd / iOS) with
 * one-click self-upgrade when supported. Shared by the desktop centered sheet
 * and the mobile /settings/about/update sub-page (browsing content stays out
 * of mobile overlays, see docs/web-interaction.md).
 */
import { useState, useRef, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Sparkles,
  Copy,
  Check,
  Download,
  ExternalLink,
  Smartphone,
  Terminal,
  Calendar,
  RotateCw,
} from 'lucide-react'
import { fmtDate } from '../../lib/format'
import { copyText } from '../../lib/clipboard'
import {
  triggerSelfUpgrade,
  getUpgradeStatus,
  type AppRuntime,
  type VersionManifest,
} from '../../lib/version'
import { Badge, IconBubble, Spinner } from '../ui/atoms'
import { Button } from '../ui/primitives'
import { useConfirm } from '../ui/sheet'
import { toast } from '../ui/toast'

export interface AppUpdateContentProps {
  manifest: VersionManifest
  runtime: AppRuntime
  currentVersion: string
  canSelfUpgrade?: boolean
}

/** Command / source well: solid elevated surface with an optional action slot */
function CodeWell({ children, action, small = false }: { children: ReactNode; action?: ReactNode; small?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-2 font-mono text-t1 ${small ? 'rounded-lg p-2 text-[11px]' : 'rounded-xl p-2.5 text-[12px]'}`}
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)' }}
    >
      <span className="no-scrollbar min-w-0 select-all overflow-x-auto whitespace-nowrap">{children}</span>
      {action}
    </div>
  )
}

/** Accent copy chip that flips to a check mark while `copied` */
function CopyChip({
  label,
  title,
  copied,
  onCopy,
  small = false,
}: {
  label: string
  title?: string
  copied: boolean
  onCopy: () => void
  small?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      title={title}
      className={`press ml-2 flex flex-none items-center gap-1 rounded-full font-semibold text-accent transition-colors ${small ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-[11.5px]'}`}
      style={{ background: 'var(--accent-soft)' }}
    >
      {copied ? (
        <>
          <Check size={small ? 12 : 13} style={{ color: 'var(--ok)' }} />
          <span style={{ color: 'var(--ok)' }}>{label}</span>
        </>
      ) : (
        <>
          <Copy size={small ? 12 : 13} />
          <span>{label}</span>
        </>
      )}
    </button>
  )
}

/** Full-width primary-style link (matches Button variant="primary" while staying an <a>) */
function PrimaryLink({ href, target, children }: { href: string; target?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target={target}
      rel={target ? 'noreferrer' : undefined}
      className="press flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-[14.5px] font-semibold text-white"
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
  canSelfUpgrade,
}: AppUpdateContentProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  async function handleCopy(key: string, text: string) {
    const ok = await copyText(text)
    if (ok) {
      setCopiedKey(key)
      toast(t('settings.copied'), 'ok')
      setTimeout(() => setCopiedKey(null), 2000)
    } else {
      toast(t('common.copyFailed'), 'err')
    }
  }

  function handleSelfUpgrade() {
    confirm({
      title: t('settings.selfUpgradeConfirmTitle'),
      message: t('settings.selfUpgradeConfirmMsg'),
      confirmText: t('settings.selfUpgrade'),
      onConfirm: async () => {
        setUpgrading(true)
        toast(t('settings.selfUpgradeStarting'))
        const res = await triggerSelfUpgrade()
        if (!res.ok) {
          setUpgrading(false)
          toast(t('settings.selfUpgradeFailed', { msg: res.error || t('common.unknown', 'Error') }), 'err')
          return
        }

        let hasDropped = false
        let pollCount = 0

        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
        }

        pollIntervalRef.current = setInterval(async () => {
          pollCount++
          // Timeout guard: 3 minutes max (90 * 2s)
          if (pollCount > 90) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            setUpgrading(false)
            toast(t('settings.selfUpgradeFailed', { msg: t('settings.selfUpgradeTimeout') }), 'err')
            return
          }

          // Before connection drops, check if the upgrade script already exited with error
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
      },
    })
  }

  const dockerComposeCmd = 'docker compose pull && docker compose up -d'
  const npmCmd = manifest.downloads?.npm
    ? `npm i -g ${manifest.downloads.npm}`
    : 'npm i -g agh-console@latest'
  const altStoreUrl = manifest.downloads?.ipa
    ? `altstore://install?url=${encodeURIComponent(manifest.downloads.ipa)}`
    : undefined
  const sourceUrl =
    manifest.downloads?.altstoreSource ||
    'https://raw.githubusercontent.com/Cowjiang/adguard-home-console/main/community-source.json'
  const altStoreSourceScheme = `altstore://source?url=${encodeURIComponent(sourceUrl)}`
  const sideStoreSourceScheme = `sidestore://source?url=${encodeURIComponent(sourceUrl)}`

  return (
    <div className="flex flex-col gap-4 text-left">
      {/* Header Info */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--glass-border)] pb-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <IconBubble color="var(--accent)" bg="var(--accent-soft)">
            <Sparkles size={20} />
          </IconBubble>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-bold text-t1">v{manifest.version}</span>
              <Badge kind="info">{manifest.channel || 'stable'}</Badge>
            </div>
            <div className="mt-0.5 text-[12.5px] text-t3">
              v{currentVersion} → v{manifest.version}
            </div>
          </div>
        </div>

        {manifest.publishedAt && (
          <div className="flex flex-none items-center gap-1 text-[11.5px] text-t3">
            <Calendar size={13} className="flex-none" />
            <span>{fmtDate(manifest.publishedAt)}</span>
          </div>
        )}
      </div>

      {upgrading ? (
        <div className="flex flex-col items-center justify-center gap-3.5 py-10 text-center">
          <Spinner size={32} />
          <div className="text-[15px] font-semibold text-t1">
            {t('settings.selfUpgradeInProgress')}
          </div>
          <p className="max-w-xs text-[12.5px] leading-relaxed text-t3">
            {t('settings.selfUpgradeConfirmMsg')}
          </p>
        </div>
      ) : (
        <>
          {/* Release Notes */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-t1">
              {t('settings.releaseNotes')}
            </span>
            <div
              className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-2xl p-3.5 text-[13px] leading-relaxed text-t2"
              style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)' }}
            >
              {manifest.releaseNotes || t('settings.noReleaseNotes')}
            </div>
          </div>

          {/* One-Click Update if canSelfUpgrade is true */}
          {canSelfUpgrade && (
            <div
              className="flex flex-col gap-2 rounded-2xl p-3.5"
              style={{
                background: 'var(--accent-soft)',
                border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              }}
            >
              <div className="text-[12px] font-medium text-accent">
                {t('settings.selfUpgrade')}
              </div>
              <Button onClick={handleSelfUpgrade} className="w-full justify-center">
                <RotateCw size={15} />
                <span>{t('settings.selfUpgrade')}</span>
              </Button>
            </div>
          )}

          {/* Tailored Upgrade Instructions */}
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-semibold text-t1">
              {t('settings.upgradeGuide')}
            </span>

            {runtime === 'docker' && (
              <div className="glass flex flex-col gap-2 rounded-2xl p-3">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-t2">
                  <Terminal size={14} />
                  <span>Docker Compose</span>
                </div>
                <CodeWell
                  action={
                    <CopyChip
                      label={t('settings.copyCommand')}
                      title={t('settings.copyCommand')}
                      copied={copiedKey === 'docker-compose'}
                      onCopy={() => handleCopy('docker-compose', dockerComposeCmd)}
                    />
                  }
                >
                  {dockerComposeCmd}
                </CodeWell>
                {manifest.downloads?.docker && (
                  <CodeWell
                    action={
                      <CopyChip
                        label={t('settings.copyCommand')}
                        title={t('settings.copyCommand')}
                        copied={copiedKey === 'docker-pull'}
                        onCopy={() => handleCopy('docker-pull', `docker pull ${manifest.downloads.docker}`)}
                      />
                    }
                  >
                    docker pull {manifest.downloads.docker}
                  </CodeWell>
                )}
              </div>
            )}

            {runtime === 'npm' && (
              <div className="glass flex flex-col gap-2 rounded-2xl p-3">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-t2">
                  <Terminal size={14} />
                  <span>npm</span>
                </div>
                <CodeWell
                  action={
                    <CopyChip
                      label={t('settings.copyCommand')}
                      title={t('settings.copyCommand')}
                      copied={copiedKey === 'npm'}
                      onCopy={() => handleCopy('npm', npmCmd)}
                    />
                  }
                >
                  {npmCmd}
                </CodeWell>
              </div>
            )}

            {(runtime === 'systemd' || runtime === 'standalone') && (
              <div className="glass flex flex-col gap-2.5 rounded-2xl p-3">
                <div className="text-[12px] font-medium text-t2">
                  {runtime === 'systemd' ? t('settings.upgradeSystemd') : t('settings.upgradeStandalone')}
                </div>
                {manifest.downloads?.tarball ? (
                  <PrimaryLink href={manifest.downloads.tarball} target="_blank">
                    <Download size={15} />
                    <span>{t('settings.downloadTarball')}</span>
                  </PrimaryLink>
                ) : (
                  <span className="text-[12px] text-t3">{t('settings.tarballNotListed')}</span>
                )}
              </div>
            )}

            {runtime === 'ios' && (
              <div className="glass flex flex-col gap-3 rounded-2xl p-3">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-t2">
                  <Smartphone size={14} />
                  <span>{t('settings.upgradeIos')}</span>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  {altStoreUrl && (
                    <PrimaryLink href={altStoreUrl}>
                      <Smartphone size={15} />
                      <span>{t('settings.openInAltStore')}</span>
                    </PrimaryLink>
                  )}
                  {manifest.downloads?.ipa && (
                    <a
                      href={manifest.downloads.ipa}
                      target="_blank"
                      rel="noreferrer"
                      className="press glass flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-[14.5px] font-semibold text-t1"
                    >
                      <Download size={15} />
                      <span>{t('settings.downloadIpa')}</span>
                    </a>
                  )}
                </div>

                <div
                  className="flex flex-col gap-2 rounded-2xl p-2.5"
                  style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)' }}
                >
                  <div className="text-[11.5px] font-semibold text-t1">
                    {t('settings.altStoreGroup')}
                  </div>
                  <p className="text-[11px] leading-relaxed text-t3">
                    {t('settings.altStoreSourceDesc')}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    <a
                      href={altStoreSourceScheme}
                      className="press flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold text-accent transition-colors"
                      style={{ background: 'var(--accent-soft)' }}
                    >
                      <Smartphone size={13} />
                      <span>{t('settings.addAltStoreSource')}</span>
                    </a>
                    <a
                      href={sideStoreSourceScheme}
                      className="press flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold text-accent transition-colors"
                      style={{ background: 'var(--accent-soft)' }}
                    >
                      <Smartphone size={13} />
                      <span>{t('settings.addSideStoreSource')}</span>
                    </a>
                  </div>
                  <CodeWell
                    small
                    action={
                      <CopyChip
                        small
                        label={t('settings.copyAltStoreSource')}
                        title={t('settings.copyAltStoreSource')}
                        copied={copiedKey === 'altstore-source'}
                        onCopy={() => handleCopy('altstore-source', sourceUrl)}
                      />
                    }
                  >
                    {sourceUrl}
                  </CodeWell>
                </div>
              </div>
            )}

            {manifest.htmlUrl && (
              <a
                href={manifest.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="press mt-1 flex items-center justify-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline"
              >
                <span>{t('settings.viewOnGitHub')}</span>
                <ExternalLink size={13} />
              </a>
            )}
          </div>
        </>
      )}
    </div>
  )
}
