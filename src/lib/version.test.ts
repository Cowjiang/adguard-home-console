import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseSemver,
  compareVersions,
  isNewerVersion,
  fetchSystemVersion,
  triggerSelfUpgrade,
  getUpgradeStatus,
  DEFAULT_UPDATE_MANIFEST_URL,
  type VersionManifest,
  type SystemVersionResponse,
} from './version'
import * as shell from './native/shell'

describe('version library', () => {
  describe('semver parsing and comparison', () => {
    it('parses standard semver versions', () => {
      expect(parseSemver('0.2.1')).toEqual({
        major: 0,
        minor: 2,
        patch: 1,
        prerelease: null,
      })
      expect(parseSemver('v1.10.5')).toEqual({
        major: 1,
        minor: 10,
        patch: 5,
        prerelease: null,
      })
      expect(parseSemver('0.2.2-nightly.1')).toEqual({
        major: 0,
        minor: 2,
        patch: 2,
        prerelease: ['nightly', '1'],
      })
      expect(parseSemver('invalid')).toBeNull()
    })

    it('compares semver versions correctly', () => {
      expect(compareVersions('0.2.2', '0.2.1')).toBeGreaterThan(0)
      expect(compareVersions('0.2.1', '0.2.2')).toBeLessThan(0)
      expect(compareVersions('0.2.1', '0.2.1')).toBe(0)

      expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0)
      expect(compareVersions('0.3.0', '0.2.9')).toBeGreaterThan(0)

      // Prerelease is lower than release
      expect(compareVersions('0.2.2', '0.2.2-nightly.1')).toBeGreaterThan(0)
      expect(compareVersions('0.2.2-nightly.1', '0.2.2')).toBeLessThan(0)

      // Prerelease vs prerelease
      expect(compareVersions('0.2.2-nightly.2', '0.2.2-nightly.1')).toBeGreaterThan(0)
    })

    it('evaluates isNewerVersion correctly', () => {
      expect(isNewerVersion('0.2.1', '0.2.2')).toBe(true)
      expect(isNewerVersion('0.2.1', '0.3.0')).toBe(true)
      expect(isNewerVersion('0.2.1', '1.0.0')).toBe(true)
      expect(isNewerVersion('0.2.2', '0.2.1')).toBe(false)
      expect(isNewerVersion('0.2.1', '0.2.1')).toBe(false)
    })
  })

  describe('fetchSystemVersion on Web / Standalone', () => {
    beforeEach(() => {
      vi.spyOn(shell, 'isTauriShell').mockReturnValue(false)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('fetches version from server proxy /api/system/version', async () => {
      const mockManifest: VersionManifest = {
        schemaVersion: '1.0',
        appName: 'agh-console',
        channel: 'stable',
        version: '0.3.0',
        releaseTag: 'v0.3.0',
        publishedAt: '2026-10-15T16:00:00Z',
        releaseNotes: 'New features',
        htmlUrl: 'https://github.com/Cowjiang/adguard-home-console/releases/tag/v0.3.0',
        downloads: {
          docker: 'ghcr.io/cowjiang/agh-console:0.3.0',
        },
      }

      const mockResponse: SystemVersionResponse = {
        ok: true,
        currentVersion: '0.2.1',
        channel: 'stable',
        runtime: 'docker',
        canSelfUpgrade: true,
        hasUpdate: true,
        latest: mockManifest,
      }

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await fetchSystemVersion({ fetch: mockFetch as any })

      expect(mockFetch).toHaveBeenCalledWith('/api/system/version', expect.any(Object))
      expect(result).toEqual(mockResponse)
    })

    it('appends ?force=1 when force option is true', async () => {
      const mockResponse: SystemVersionResponse = {
        ok: true,
        currentVersion: '0.2.1',
        channel: 'stable',
        runtime: 'npm',
        hasUpdate: false,
      }

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await fetchSystemVersion({ force: true, fetch: mockFetch as any })

      expect(mockFetch).toHaveBeenCalledWith('/api/system/version?force=1', expect.any(Object))
      expect(result.runtime).toBe('npm')
    })

    it('gracefully degrades when server request fails with HTTP error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })

      const result = await fetchSystemVersion({ fetch: mockFetch as any })

      expect(result.ok).toBe(true)
      expect(result.checkFailed).toBe(true)
      expect(result.hasUpdate).toBe(false)
      expect(result.runtime).toBe('standalone')
      expect(result.error).toContain('HTTP 500')
    })

    it('gracefully degrades when server request throws network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

      const result = await fetchSystemVersion({ fetch: mockFetch as any })

      expect(result.ok).toBe(true)
      expect(result.checkFailed).toBe(true)
      expect(result.hasUpdate).toBe(false)
      expect(result.error).toBe('Connection refused')
    })
  })

  describe('fetchSystemVersion on Tauri iOS', () => {
    beforeEach(() => {
      vi.spyOn(shell, 'isTauriShell').mockReturnValue(true)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('directly fetches remote manifest and identifies as ios runtime', async () => {
      const mockManifest: VersionManifest = {
        schemaVersion: '1.0',
        appName: 'agh-console',
        channel: 'stable',
        version: '99.0.0',
        releaseTag: 'v99.0.0',
        publishedAt: '2026-10-15T16:00:00Z',
        releaseNotes: 'iOS update available',
        htmlUrl: 'https://github.com/Cowjiang/adguard-home-console/releases/tag/v99.0.0',
        downloads: {
          ipa: 'https://github.com/Cowjiang/adguard-home-console/releases/download/v99.0.0/agh-console.ipa',
        },
      }

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockManifest,
      })

      const result = await fetchSystemVersion({ fetch: mockFetch as any })

      expect(mockFetch).toHaveBeenCalledWith(DEFAULT_UPDATE_MANIFEST_URL, expect.any(Object))
      expect(result.ok).toBe(true)
      expect(result.runtime).toBe('ios')
      expect(result.hasUpdate).toBe(true)
      expect(result.latest?.version).toBe('99.0.0')
    })

    it('gracefully degrades on Tauri when remote fetch fails', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network timeout'))

      const result = await fetchSystemVersion({ fetch: mockFetch as any })

      expect(result.ok).toBe(true)
      expect(result.checkFailed).toBe(true)
      expect(result.runtime).toBe('ios')
      expect(result.hasUpdate).toBe(false)
      expect(result.error).toBe('Network timeout')
    })
  })

  describe('self-upgrade client functions', () => {
    it('triggerSelfUpgrade sends POST and parses successful response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, status: 'started', message: 'Upgrade process spawned' }),
      })

      const res = await triggerSelfUpgrade({ fetch: mockFetch as any })
      expect(mockFetch).toHaveBeenCalledWith('/api/system/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      expect(res.ok).toBe(true)
      expect(res.status).toBe('started')
    })

    it('triggerSelfUpgrade handles non-ok error status (e.g. 403 Forbidden)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ ok: false, error: 'Self-upgrade is disabled on this server' }),
      })

      const res = await triggerSelfUpgrade({ fetch: mockFetch as any })
      expect(res.ok).toBe(false)
      expect(res.error).toBe('Self-upgrade is disabled on this server')
    })

    it('triggerSelfUpgrade handles network failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection aborted'))

      const res = await triggerSelfUpgrade({ fetch: mockFetch as any })
      expect(res.ok).toBe(false)
      expect(res.error).toBe('Connection aborted')
    })

    it('getUpgradeStatus sends GET and parses successful status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          status: 'running',
          lastRun: '2026-10-16T00:00:00.000Z',
          logs: 'pulling...',
        }),
      })

      const res = await getUpgradeStatus({ fetch: mockFetch as any })
      expect(mockFetch).toHaveBeenCalledWith('/api/system/upgrade/status')
      expect(res.ok).toBe(true)
      expect(res.status).toBe('running')
      expect(res.logs).toBe('pulling...')
    })

    it('getUpgradeStatus handles server error or 403 response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ ok: false, error: 'Self-upgrade is disabled' }),
      })

      const res = await getUpgradeStatus({ fetch: mockFetch as any })
      expect(res.ok).toBe(false)
      expect(res.status).toBe('failed')
      expect(res.error).toBe('Self-upgrade is disabled')
    })

    it('getUpgradeStatus handles network throw', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Fetch failed'))

      const res = await getUpgradeStatus({ fetch: mockFetch as any })
      expect(res.ok).toBe(false)
      expect(res.status).toBe('failed')
      expect(res.error).toBe('Fetch failed')
    })
  })
})
