import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import {
  canonicalJson,
  captureInstanceSnapshot,
  computePayloadChecksum,
  generateSnapshotId,
  sanitizeSnapshotPayload,
} from './snapshotCapture'
import { computeSnapshotDiff } from './snapshotDiff'
import { restoreSnapshot, validateSnapshot } from './snapshotRestore'
import {
  deleteSnapshot,
  exportClusterBundleJson,
  exportSnapshotJson,
  getSnapshot,
  listSnapshots,
  parseSnapshotImport,
  pruneAutoSnapshots,
  saveSnapshot,
} from './snapshotStorage'
import type { AghConfigSnapshot, SnapshotPayload, SnapshotSourceInstance } from './types'

vi.mock('../api', () => ({
  api: vi.fn(),
}))

describe('Snapshot Core & Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates unique snapshot IDs', () => {
    const id1 = generateSnapshotId()
    const id2 = generateSnapshotId()
    expect(id1).toBeTruthy()
    expect(id2).toBeTruthy()
    expect(id1).not.toBe(id2)
  })

  it('computes deterministic checksum and detects nested changes', async () => {
    const p1: SnapshotPayload = {
      dns: {
        upstream_dns: ['1.1.1.1', '8.8.8.8'],
        cache_size: 4096,
      } as any,
      user_rules: ['||example.com^'],
    }

    const p2: SnapshotPayload = {
      user_rules: ['||example.com^'],
      dns: {
        cache_size: 4096,
        upstream_dns: ['1.1.1.1', '8.8.8.8'],
      } as any,
    }

    const p3: SnapshotPayload = {
      user_rules: ['||example.com^'],
      dns: {
        cache_size: 4096,
        upstream_dns: ['9.9.9.9'], // Changed nested property!
      } as any,
    }

    const c1 = await computePayloadChecksum(p1)
    const c2 = await computePayloadChecksum(p2)
    const c3 = await computePayloadChecksum(p3)

    expect(c1).toBe(c2)
    expect(c1).not.toBe(c3) // Verifies canonicalJson does not strip nested properties
    expect(c1.length).toBeGreaterThan(10)
  })

  it('sanitizes payload and excludes mutations', () => {
    const raw: SnapshotPayload = {
      user_rules: ['||ad.com^', '||tracker.com^'],
      rewrites: [{ domain: 'test.local', answer: '192.168.1.10' }],
      clients: [
        {
          name: 'Device A',
          ids: ['192.168.1.50'],
          tags: ['lan'],
          blocked_services: ['tiktok'],
        } as any,
      ],
    }

    const sanitized = sanitizeSnapshotPayload(raw)
    expect(sanitized.user_rules).toEqual(raw.user_rules)
    expect(sanitized.user_rules).not.toBe(raw.user_rules) // Cloned
    expect(sanitized.rewrites?.[0].enabled).toBe(true)
  })
})

describe('Snapshot Capture Engine', () => {
  const dummyCfg = { url: 'http://192.168.1.1', username: 'admin', password: 'password' }
  const dummyInstance: SnapshotSourceInstance = {
    id: 'inst-1',
    label: 'Primary AGH',
    url: 'http://192.168.1.1',
    aghVersion: 'v0.107.79',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('captures full snapshot across all endpoints', async () => {
    vi.mocked(api).mockImplementation(async (_cfg, path) => {
      switch (path) {
        case '/dns_info':
          return { upstream_dns: ['1.1.1.1'], cache_size: 4096 }
        case '/filtering/status':
          return {
            enabled: true,
            interval: 24,
            filters: [{ url: 'https://adaway.org', name: 'AdAway', id: 1, enabled: true }],
            whitelist_filters: [],
            user_rules: ['||bad.com^'],
          }
        case '/rewrite/list':
          return [{ domain: 'router.lan', answer: '192.168.1.1' }]
        case '/clients':
          return { clients: [{ name: 'NAS', ids: ['192.168.1.200'] }] }
        case '/access/list':
          return { allowed_clients: ['192.168.1.0/24'], disallowed_clients: [], blocked_hosts: [] }
        case '/querylog/config':
          return { enabled: true, interval: 90, ignored: [] }
        case '/stats/config':
          return { enabled: true, interval: 24, ignored: [] }
        case '/blocked_services/get':
          return { ids: ['steam', 'epic_games'] }
        case '/safesearch/status':
          return { enabled: true, google: true }
        default:
          return {}
      }
    })

    const snapshot = await captureInstanceSnapshot(dummyCfg, dummyInstance, {
      label: 'Manual Backup Test',
      trigger: 'manual',
    })

    expect(snapshot.meta.label).toBe('Manual Backup Test')
    expect(snapshot.meta.trigger).toBe('manual')
    expect(snapshot.meta.modules).toContain('dns')
    expect(snapshot.meta.modules).toContain('filters')
    expect(snapshot.meta.modules).toContain('user_rules')
    expect(snapshot.meta.modules).toContain('rewrites')
    expect(snapshot.meta.modules).toContain('clients')
    expect(snapshot.meta.checksum).toBeTruthy()

    expect(snapshot.data.dns?.upstream_dns).toEqual(['1.1.1.1'])
    expect(snapshot.data.user_rules).toEqual(['||bad.com^'])
    expect(snapshot.data.rewrites).toHaveLength(1)
    expect(snapshot.data.clients?.[0].name).toBe('NAS')
  })

  it('tolerates individual endpoint failures gracefully', async () => {
    vi.mocked(api).mockImplementation(async (_cfg, path) => {
      if (path === '/blocked_services/get') {
        throw new Error('Endpoint not supported in older version')
      }
      if (path === '/dns_info') return { upstream_dns: ['8.8.8.8'] }
      return {}
    })

    const snapshot = await captureInstanceSnapshot(dummyCfg, dummyInstance, {
      label: 'Partial Backup',
      trigger: 'pre_sync',
      modules: ['dns', 'blocked_services'],
    })

    expect(snapshot.meta.modules).toContain('dns')
    expect(snapshot.meta.modules).not.toContain('blocked_services')
    expect(snapshot.data.dns?.upstream_dns).toEqual(['8.8.8.8'])
    expect(snapshot.data.blocked_services).toBeUndefined()
  })

  it('throws an error if all requested endpoints fail, preventing empty safety snapshots', async () => {
    vi.mocked(api).mockRejectedValue(new Error('Network offline or 401 Unauthorized'))

    await expect(
      captureInstanceSnapshot(dummyCfg, dummyInstance, {
        label: 'Failed Backup',
        trigger: 'pre_rollback',
        modules: ['dns', 'filters'],
      })
    ).rejects.toThrow('Failed to capture any configuration modules')
  })
})

describe('Snapshot Storage Vault', () => {
  beforeEach(async () => {
    const all = await listSnapshots()
    for (const s of all) {
      await deleteSnapshot(s.meta.id)
    }
  })

  it('saves, retrieves, and deletes snapshots', async () => {
    const snap: AghConfigSnapshot = {
      meta: {
        id: 'snap-test-1',
        schemaVersion: '1.0',
        createdAt: new Date().toISOString(),
        label: 'Test Save',
        trigger: 'manual',
        sourceInstance: {
          id: 'inst-1',
          label: 'Primary',
          url: 'http://192.168.1.1',
          aghVersion: 'v0.107.79',
        },
        modules: ['dns'],
        checksum: 'abc12345',
      },
      data: {
        dns: { upstream_dns: ['1.1.1.1'] } as any,
      },
    }

    await saveSnapshot(snap)
    const fetched = await getSnapshot('snap-test-1')
    expect(fetched?.meta.label).toBe('Test Save')

    const list = await listSnapshots('inst-1')
    expect(list).toHaveLength(1)

    const deleted = await deleteSnapshot('snap-test-1')
    expect(deleted).toBe(true)

    const fetchedAfter = await getSnapshot('snap-test-1')
    expect(fetchedAfter).toBeNull()
  })

  it('prunes auto snapshots when exceeding quota while keeping manual snapshots', async () => {
    const instId = 'inst-quota'

    // Create 18 pre_sync snapshots (saveSnapshot auto-prunes to 15) and 2 manual snapshots
    for (let i = 0; i < 18; i++) {
      const snap: AghConfigSnapshot = {
        meta: {
          id: `auto-snap-${i}`,
          schemaVersion: '1.0',
          createdAt: new Date(Date.now() - (20 - i) * 1000).toISOString(),
          label: `Auto ${i}`,
          trigger: 'pre_sync',
          sourceInstance: { id: instId, label: 'Host', url: 'http://host', aghVersion: 'v1' },
          modules: ['dns'],
          checksum: `chk-${i}`,
        },
        data: {},
      }
      await saveSnapshot(snap)
    }

    for (let i = 0; i < 2; i++) {
      const snap: AghConfigSnapshot = {
        meta: {
          id: `manual-snap-${i}`,
          schemaVersion: '1.0',
          createdAt: new Date().toISOString(),
          label: `Manual ${i}`,
          trigger: 'manual',
          sourceInstance: { id: instId, label: 'Host', url: 'http://host', aghVersion: 'v1' },
          modules: ['dns'],
          checksum: `man-${i}`,
        },
        data: {},
      }
      await saveSnapshot(snap)
    }

    // 18 were inserted, saveSnapshot pruned down to 15.
    // Calling pruneAutoSnapshots(instId, 10) explicitly prunes 5 more down to 10.
    const pruned = await pruneAutoSnapshots(instId, 10)
    expect(pruned).toBe(5)

    const remaining = await listSnapshots(instId)
    const remainingAuto = remaining.filter((s) => s.meta.trigger === 'pre_sync')
    const remainingManual = remaining.filter((s) => s.meta.trigger === 'manual')

    expect(remainingAuto).toHaveLength(10)
    expect(remainingManual).toHaveLength(2)
  })

  it('exports and parses snapshot JSON files and bundle packages', () => {
    const snap: AghConfigSnapshot = {
      meta: {
        id: 'json-snap-1',
        schemaVersion: '1.0',
        createdAt: new Date().toISOString(),
        label: 'Export Target',
        trigger: 'manual',
        sourceInstance: { id: 'inst-1', label: 'Primary', url: 'http://localhost', aghVersion: 'v1' },
        modules: ['dns'],
        checksum: '123',
      },
      data: { dns: { upstream_dns: ['1.0.0.1'] } as any },
    }

    const singleJson = exportSnapshotJson(snap)
    const parsedSingle = parseSnapshotImport(singleJson)
    expect(parsedSingle.isBundle).toBe(false)
    expect(parsedSingle.snapshots[0].meta.id).toBe('json-snap-1')

    const bundleJson = exportClusterBundleJson([snap], 'Test Cluster')
    const parsedBundle = parseSnapshotImport(bundleJson)
    expect(parsedBundle.isBundle).toBe(true)
    expect(parsedBundle.snapshots).toHaveLength(1)
  })
})

describe('Snapshot Semantic Diff Engine', () => {
  it('identifies additions, modifications, and deletions in DNS and Rules', () => {
    const current: SnapshotPayload = {
      dns: {
        upstream_dns: ['1.1.1.1', '8.8.8.8'],
        cache_size: 4096,
        blocking_mode: 'default',
      } as any,
      user_rules: ['||ad1.com^', '||keep.com^'],
    }

    const target: SnapshotPayload = {
      dns: {
        upstream_dns: ['1.1.1.1', '9.9.9.9'], // 8.8.8.8 deleted, 9.9.9.9 added
        cache_size: 8192, // modified
        blocking_mode: 'default',
      } as any,
      user_rules: ['||keep.com^', '||newrule.org^'], // ad1 deleted, newrule added
    }

    const diffs = computeSnapshotDiff(current, target, ['dns', 'user_rules'])
    const dnsSummary = diffs.find((d) => d.module === 'dns')
    const rulesSummary = diffs.find((d) => d.module === 'user_rules')

    expect(dnsSummary?.hasChanges).toBe(true)
    expect(dnsSummary?.diffs.some((d) => d.newValue === '9.9.9.9' && d.type === 'added')).toBe(true)
    expect(dnsSummary?.diffs.some((d) => d.oldValue === '8.8.8.8' && d.type === 'deleted')).toBe(true)
    expect(dnsSummary?.diffs.some((d) => d.path === 'dns.cache_size' && d.type === 'modified')).toBe(true)

    expect(rulesSummary?.hasChanges).toBe(true)
    expect(rulesSummary?.diffs.some((d) => d.newValue === '||newrule.org^' && d.type === 'added')).toBe(true)
    expect(rulesSummary?.diffs.some((d) => d.oldValue === '||ad1.com^' && d.type === 'deleted')).toBe(true)
  })

  it('identifies rewrite, filter whitelist, and client differences with detailed field labels', () => {
    const current: SnapshotPayload = {
      filters: {
        enabled: true,
        interval: 24,
        filters: [],
        whitelist_filters: [{ url: 'https://white.com', name: 'Old White', id: 1, enabled: true, rules_count: 5 }],
      },
      rewrites: [{ domain: 'old.local', answer: '1.2.3.4' }],
      clients: [{ name: 'Laptop', ids: ['192.168.1.100'], tags: ['work'] } as any],
    }

    const target: SnapshotPayload = {
      filters: {
        enabled: true,
        interval: 24,
        filters: [],
        whitelist_filters: [{ url: 'https://white.com', name: 'New White', id: 1, enabled: false, rules_count: 5 }],
      },
      rewrites: [{ domain: 'new.local', answer: '1.2.3.5' }],
      clients: [{ name: 'Laptop', ids: ['192.168.1.100'], tags: ['work', 'guest'] } as any],
    }

    const diffs = computeSnapshotDiff(current, target, ['filters', 'rewrites', 'clients'])
    const filtersSummary = diffs.find((d) => d.module === 'filters')
    const rewritesSummary = diffs.find((d) => d.module === 'rewrites')
    const clientsSummary = diffs.find((d) => d.module === 'clients')

    expect(filtersSummary?.hasChanges).toBe(true)
    expect(filtersSummary?.diffs.some((d) => d.path.includes('whitelist_filters'))).toBe(true)

    expect(rewritesSummary?.hasChanges).toBe(true)
    expect(rewritesSummary?.diffs.some((d) => d.label.includes('new.local') && d.type === 'added')).toBe(true)
    expect(rewritesSummary?.diffs.some((d) => d.label.includes('old.local') && d.type === 'deleted')).toBe(true)

    expect(clientsSummary?.hasChanges).toBe(true)
    expect(clientsSummary?.diffs.some((d) => d.label.includes('Tags') && d.type === 'modified')).toBe(true)
  })
})

describe('Snapshot Restore Engine', () => {
  const dummyCfg = { url: 'http://192.168.1.1', username: 'admin', password: 'password' }
  const dummyInstance: SnapshotSourceInstance = {
    id: 'inst-1',
    label: 'Primary AGH',
    url: 'http://192.168.1.1',
    aghVersion: 'v0.107.79',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates snapshot schema correctly', async () => {
    const badSnapshot = {
      meta: { schemaVersion: '2.0' },
    } as any

    const validation = await validateSnapshot(badSnapshot)
    expect(validation.valid).toBe(false)
    expect(validation.errors.some((e) => e.includes('Unsupported schemaVersion'))).toBe(true)
  })

  it('performs restore sequentially, restores whitelists, prunes obsolete filters, and captures pre-rollback safety snapshot', async () => {
    vi.mocked(api).mockImplementation(async (_cfg, path) => {
      if (path === '/dns_info') return { upstream_dns: ['9.9.9.9'] }
      if (path === '/filtering/status') {
        return {
          filters: [{ url: 'https://obsolete.org', name: 'Obsolete Filter', id: 9, enabled: true }],
          whitelist_filters: [],
          user_rules: [],
        }
      }
      if (path === '/rewrite/list') return []
      if (path === '/clients') return { clients: [] }
      return {}
    })

    const targetSnapshot: AghConfigSnapshot = {
      meta: {
        id: 'restore-target-snap',
        schemaVersion: '1.0',
        createdAt: new Date().toISOString(),
        label: 'Rollback Source',
        trigger: 'manual',
        sourceInstance: dummyInstance,
        modules: ['dns', 'filters', 'user_rules'],
        checksum: '',
      },
      data: {
        dns: { upstream_dns: ['1.1.1.1'], cache_size: 4096 } as any,
        filters: {
          enabled: true,
          interval: 24,
          filters: [{ url: 'https://newblock.org', name: 'New Block', id: 1, enabled: true, rules_count: 10 }],
          whitelist_filters: [{ url: 'https://newallow.org', name: 'New Allow', id: 2, enabled: true, rules_count: 5 }],
        },
        user_rules: ['||blocked.com^'],
      },
    }
    targetSnapshot.meta.checksum = await computePayloadChecksum(targetSnapshot.data)

    const result = await restoreSnapshot(dummyCfg, targetSnapshot, {
      selectedModules: ['dns', 'filters', 'user_rules'],
      autoPreRollbackSnapshot: true,
      currentInstanceMeta: dummyInstance,
    })

    expect(result.success).toBe(true)
    expect(result.succeededModules).toBe(3)
    expect(result.failedModules).toBe(0)
    expect(result.preRollbackSnapshotId).toBeTruthy()

    // Verify /dns_config was called with targetSnapshot data
    expect(api).toHaveBeenCalledWith(
      dummyCfg,
      '/dns_config',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ upstream_dns: ['1.1.1.1'] }),
      })
    )

    // Verify blocklist added
    expect(api).toHaveBeenCalledWith(
      dummyCfg,
      '/filtering/add_url',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ url: 'https://newblock.org', whitelist: false }),
      })
    )

    // Verify allowlist added
    expect(api).toHaveBeenCalledWith(
      dummyCfg,
      '/filtering/add_url',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ url: 'https://newallow.org', whitelist: true }),
      })
    )

    // Verify obsolete filter removed
    expect(api).toHaveBeenCalledWith(
      dummyCfg,
      '/filtering/remove_url',
      expect.objectContaining({
        method: 'POST',
        body: { url: 'https://obsolete.org', whitelist: false },
      })
    )

    // Verify /filtering/set_rules was called with targetSnapshot user rules
    expect(api).toHaveBeenCalledWith(
      dummyCfg,
      '/filtering/set_rules',
      expect.objectContaining({
        method: 'POST',
        body: { rules: ['||blocked.com^'] },
      })
    )
  })
})
