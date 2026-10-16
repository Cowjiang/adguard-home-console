/**
 * AdGuard Home Console — System version and remote update client
 *
 * Implements:
 * - Version manifest types matching Schema 1.0
 * - SystemVersionResponse contract
 * - Self-upgrade trigger and status API
 * - Direct remote manifest fetch on Tauri (runtime='ios')
 * - Server proxy fetch on Web/PWA (/api/system/version)
 * - Semver comparison
 * - Graceful error resilience without crashing the UI
 */
import { APP_VERSION } from './constants'
import { isTauriShell } from './native/shell'

export interface VersionManifestDownloads {
  tarball?: string
  ipa?: string
  docker?: string
  npm?: string
}

export interface VersionManifest {
  schemaVersion: string
  appName: string
  channel: string
  version: string
  releaseTag: string
  publishedAt: string
  releaseNotes: string
  htmlUrl: string
  downloads: VersionManifestDownloads
}

export type AppRuntime = 'docker' | 'systemd' | 'npm' | 'standalone' | 'ios'

export interface SystemVersionResponse {
  ok: boolean
  currentVersion: string
  channel: string
  runtime: AppRuntime
  canSelfUpgrade?: boolean
  hasUpdate: boolean
  latest?: VersionManifest
  checkFailed?: boolean
  error?: string
}

export interface UpgradeStatusResponse {
  ok: boolean
  status: 'idle' | 'running' | 'failed' | 'completed'
  lastRun?: string | null
  exitCode?: number | null
  logs?: string
  error?: string | null
}

export const DEFAULT_UPDATE_MANIFEST_URL =
  'https://raw.githubusercontent.com/Cowjiang/adguard-home-console/refs/heads/main/version.json'
export const DEFAULT_TIMEOUT_MS = 5000

export interface SemverParts {
  major: number
  minor: number
  patch: number
  prerelease: string[] | null
}

export function parseSemver(v: string): SemverParts | null {
  if (typeof v !== 'string') return null
  const match = v.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : null,
  }
}

export function compareVersions(v1: string, v2: string): number {
  const p1 = parseSemver(v1)
  const p2 = parseSemver(v2)
  if (!p1 || !p2) {
    return String(v1).localeCompare(String(v2))
  }
  if (p1.major !== p2.major) return p1.major - p2.major
  if (p1.minor !== p2.minor) return p1.minor - p2.minor
  if (p1.patch !== p2.patch) return p1.patch - p2.patch

  // Prerelease comparison:
  // A version with prerelease has lower precedence than a version without prerelease.
  if (!p1.prerelease || !p2.prerelease) {
    if (!p1.prerelease && p2.prerelease) return 1
    if (p1.prerelease && !p2.prerelease) return -1
    return 0
  }

  // Both have prereleases: compare segments
  const pre1 = p1.prerelease
  const pre2 = p2.prerelease
  const len = Math.max(pre1.length, pre2.length)
  for (let i = 0; i < len; i++) {
    const s1 = pre1[i]
    const s2 = pre2[i]
    if (s1 === undefined) return -1
    if (s2 === undefined) return 1
    if (s1 === s2) continue

    const num1 = /^\d+$/.test(s1) ? Number(s1) : null
    const num2 = /^\d+$/.test(s2) ? Number(s2) : null

    if (num1 !== null && num2 !== null) {
      return num1 - num2
    }
    if (num1 !== null && num2 === null) {
      return -1
    }
    if (num1 === null && num2 !== null) {
      return 1
    }
    return s1.localeCompare(s2)
  }
  return 0
}

export function isNewerVersion(currentVersion: string, latestVersion: string): boolean {
  return compareVersions(latestVersion, currentVersion) > 0
}

export interface FetchSystemVersionOptions {
  force?: boolean
  fetch?: typeof fetch
  updateUrl?: string
  timeoutMs?: number
}

/**
 * Checks system version and remote update availability.
 * On Tauri iOS: directly fetches the remote manifest JSON and compares semver.
 * On Web/PWA: proxies through /api/system/version with server-side caching.
 */
export async function fetchSystemVersion(
  opts?: FetchSystemVersionOptions
): Promise<SystemVersionResponse> {
  const isTauri = isTauriShell()
  const currentVersion = APP_VERSION
  const channel = currentVersion.includes('nightly') ? 'nightly' : 'stable'
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchFn = opts?.fetch ?? globalThis.fetch

  if (isTauri) {
    try {
      const updateUrl = opts?.updateUrl ?? DEFAULT_UPDATE_MANIFEST_URL
      const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined
      const response = await fetchFn(updateUrl, { signal })
      if (!response.ok) {
        throw new Error(`Upstream returned HTTP ${response.status}`)
      }
      const manifest: VersionManifest = await response.json()
      if (!manifest || typeof manifest !== 'object' || !manifest.version) {
        throw new Error('Invalid manifest received from upstream')
      }
      const hasUpdate = isNewerVersion(currentVersion, manifest.version)
      return {
        ok: true,
        currentVersion,
        channel,
        runtime: 'ios',
        canSelfUpgrade: false,
        hasUpdate,
        latest: manifest,
      }
    } catch (err) {
      return {
        ok: true,
        currentVersion,
        channel,
        runtime: 'ios',
        canSelfUpgrade: false,
        checkFailed: true,
        error: err instanceof Error ? err.message : String(err),
        hasUpdate: false,
      }
    }
  }

  // Web / PWA / Standalone Node
  try {
    const url = `/api/system/version${opts?.force ? '?force=1' : ''}`
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined
    const response = await fetchFn(url, { signal })
    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`)
    }
    const data: SystemVersionResponse = await response.json()
    return data
  } catch (err) {
    return {
      ok: true,
      currentVersion,
      channel,
      runtime: 'standalone',
      canSelfUpgrade: false,
      checkFailed: true,
      error: err instanceof Error ? err.message : String(err),
      hasUpdate: false,
    }
  }
}

/**
 * Triggers server self-upgrade via POST /api/system/upgrade
 */
export async function triggerSelfUpgrade(opts?: { fetch?: typeof fetch }): Promise<{
  ok: boolean
  status?: string
  message?: string
  error?: string
}> {
  const fetchFn = opts?.fetch ?? globalThis.fetch
  try {
    const response = await fetchFn('/api/system/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await response.json()
    if (!response.ok) {
      return { ok: false, error: data?.error || `HTTP ${response.status}` }
    }
    return data
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Queries current upgrade progress via GET /api/system/upgrade/status
 */
export async function getUpgradeStatus(opts?: { fetch?: typeof fetch }): Promise<UpgradeStatusResponse> {
  const fetchFn = opts?.fetch ?? globalThis.fetch
  try {
    const response = await fetchFn('/api/system/upgrade/status')
    const data = await response.json()
    if (!response.ok) {
      return { ok: false, status: 'failed', error: data?.error || `HTTP ${response.status}` }
    }
    return data
  } catch (err) {
    return { ok: false, status: 'failed', error: err instanceof Error ? err.message : String(err) }
  }
}
