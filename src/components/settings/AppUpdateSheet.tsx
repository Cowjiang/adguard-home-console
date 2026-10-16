/**
 * App Update Sheet
 *
 * Displays new release details, version comparison, release notes,
 * runtime-tailored upgrade instructions (Docker / npm / systemd / iOS),
 * and one-click self-upgrade when supported.
 */
import { useState, useRef, useEffect } from 'react'
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
import { Badge, Spinner } from '../ui/atoms'
import { Button } from '../ui/primitives'
import { useConfirm } from '../ui/sheet'
import { toast } from '../ui/toast'

export interface AppUpdateSheetProps {
  manifest: VersionManifest
  runtime: AppRuntime
  currentVersion: string
  canSelfUpgrade?: boolean
  onClose: () => void
}

export function AppUpdateSheet({
  manifest,
  runtime,
  currentVersion,
  canSelfUpgrade,
  onClose,
}: AppUpdateSheetProps) {
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
            toast(t('settings.selfUpgradeFailed', { msg: 'Timeout waiting for service restart' }), 'err')
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

  return (
    <div className="flex flex-col gap-4 text-left">
      {/* Header Info */}
      <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <Sparkles size={22} />
          </div>
          <div>
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
          <div className="flex items-center gap-1 text-[11.5px] text-t3">
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
            <div className="max-h-48 overflow-y-auto rounded-2xl border border-border/40 bg-black/5 p-3.5 text-[13px] leading-relaxed text-t2 whitespace-pre-wrap dark:bg-white/5">
              {manifest.releaseNotes || 'No release notes provided.'}
            </div>
          </div>

          {/* One-Click Update if canSelfUpgrade is true */}
          {canSelfUpgrade && (
            <div className="flex flex-col gap-2 rounded-2xl border border-accent/30 bg-accent/10 p-3.5">
              <div className="text-[12px] font-medium text-accent">
                {t('settings.selfUpgrade')}
              </div>
              <Button
                variant="primary"
                onClick={handleSelfUpgrade}
                className="w-full justify-center gap-2 py-2.5 text-[13px] font-semibold"
              >
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
              <div className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-black/5 p-3 dark:bg-white/5">
                <div className="flex items-center justify-between text-[12px] font-medium text-t2">
                  <span className="flex items-center gap-1.5">
                    <Terminal size={14} />
                    <span>Docker Compose</span>
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card p-2.5 font-mono text-[12px] text-t1">
                  <span className="select-all break-all">{dockerComposeCmd}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('docker-compose', dockerComposeCmd)}
                    className="press ml-2 flex flex-none items-center gap-1 rounded-lg bg-accent/15 px-2.5 py-1 text-[11.5px] font-semibold text-accent transition-colors hover:bg-accent/25"
                    title={t('settings.copyCommand')}
                  >
                    {copiedKey === 'docker-compose' ? (
                      <>
                        <Check size={13} className="text-ok" />
                        <span className="text-ok">{t('settings.copied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span>{t('settings.copyCommand')}</span>
                      </>
                    )}
                  </button>
                </div>
                {manifest.downloads?.docker && (
                  <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card p-2.5 font-mono text-[12px] text-t1">
                    <span className="select-all break-all">docker pull {manifest.downloads.docker}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('docker-pull', `docker pull ${manifest.downloads.docker}`)}
                      className="press ml-2 flex flex-none items-center gap-1 rounded-lg bg-accent/15 px-2.5 py-1 text-[11.5px] font-semibold text-accent transition-colors hover:bg-accent/25"
                      title={t('settings.copyCommand')}
                    >
                      {copiedKey === 'docker-pull' ? (
                        <>
                          <Check size={13} className="text-ok" />
                          <span className="text-ok">{t('settings.copied')}</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span>{t('settings.copyCommand')}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {runtime === 'npm' && (
              <div className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-black/5 p-3 dark:bg-white/5">
                <div className="flex items-center justify-between text-[12px] font-medium text-t2">
                  <span className="flex items-center gap-1.5">
                    <Terminal size={14} />
                    <span>npm Global CLI</span>
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card p-2.5 font-mono text-[12px] text-t1">
                  <span className="select-all break-all">{npmCmd}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('npm', npmCmd)}
                    className="press ml-2 flex flex-none items-center gap-1 rounded-lg bg-accent/15 px-2.5 py-1 text-[11.5px] font-semibold text-accent transition-colors hover:bg-accent/25"
                    title={t('settings.copyCommand')}
                  >
                    {copiedKey === 'npm' ? (
                      <>
                        <Check size={13} className="text-ok" />
                        <span className="text-ok">{t('settings.copied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span>{t('settings.copyCommand')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {(runtime === 'systemd' || runtime === 'standalone') && (
              <div className="flex flex-col gap-2.5 rounded-2xl border border-border/50 bg-black/5 p-3 dark:bg-white/5">
                <div className="text-[12px] font-medium text-t2">
                  {runtime === 'systemd' ? 'Linux systemd Service' : 'Standalone Node.js'}
                </div>
                {manifest.downloads?.tarball ? (
                  <a
                    href={manifest.downloads.tarball}
                    target="_blank"
                    rel="noreferrer"
                    className="press flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <Download size={15} />
                    <span>{t('settings.downloadTarball')}</span>
                  </a>
                ) : (
                  <span className="text-[12px] text-t3">
                    Tarball asset not directly listed in manifest.
                  </span>
                )}
              </div>
            )}

            {runtime === 'ios' && (
              <div className="flex flex-col gap-2.5 rounded-2xl border border-border/50 bg-black/5 p-3 dark:bg-white/5">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-t2">
                  <Smartphone size={14} />
                  <span>iOS Sideload</span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {altStoreUrl && (
                    <a
                      href={altStoreUrl}
                      className="press flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      <Smartphone size={15} />
                      <span>{t('settings.openInAltStore')}</span>
                    </a>
                  )}
                  {manifest.downloads?.ipa && (
                    <a
                      href={manifest.downloads.ipa}
                      target="_blank"
                      rel="noreferrer"
                      className="press flex flex-1 items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-[13px] font-semibold text-t1 transition-opacity hover:opacity-90"
                    >
                      <Download size={15} />
                      <span>{t('settings.downloadIpa')}</span>
                    </a>
                  )}
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

          {/* Footer Close */}
          <div className="mt-1 flex items-center justify-end border-t border-border/40 pt-3">
            <Button variant="glass" onClick={onClose} className="w-full sm:w-auto">
              {t('common.cancel')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
