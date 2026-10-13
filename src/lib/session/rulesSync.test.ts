import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  syncUserRulesToInstances,
  syncRewritesToInstances,
  syncFilterListsToInstances,
  syncClientsToInstances,
} from './rulesSync'
import type { Instance } from './instances'
import type { AghClient, ClientsData, Filter, FilteringStatus } from '../api'
import * as apiModule from '../api'

vi.mock('../api', () => ({
  api: vi.fn(),
}))

describe('rulesSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const targetInstances: Instance[] = [
    {
      id: 'target-1',
      label: 'Secondary DNS',
      endpoints: [{ url: 'http://192.168.1.2:3000', username: 'admin', password: '123' }],
    },
    {
      id: 'target-2',
      label: 'Backup DNS',
      endpoints: [{ url: 'http://192.168.1.3:3000', username: 'admin', password: '123' }],
    },
  ]

  describe('syncUserRulesToInstances', () => {
    it('pushes rules to all targets successfully', async () => {
      vi.mocked(apiModule.api).mockResolvedValue({})

      const rules = ['||ads.example.com^', '@@||clean.example.com^']
      const res = await syncUserRulesToInstances(targetInstances, rules)

      expect(res.total).toBe(2)
      expect(res.succeeded).toBe(2)
      expect(res.failed).toBe(0)
      expect(apiModule.api).toHaveBeenCalledWith(
        { url: 'http://192.168.1.2:3000', username: 'admin', password: '123' },
        '/filtering/set_rules',
        { method: 'POST', body: { rules } }
      )
    })

    it('captures failures per instance without blocking others', async () => {
      vi.mocked(apiModule.api).mockImplementation(async (cfg) => {
        if (cfg.url.includes('192.168.1.3')) {
          throw new Error('Timeout')
        }
        return {}
      })

      const res = await syncUserRulesToInstances(targetInstances, ['||test.com^'])
      expect(res.total).toBe(2)
      expect(res.succeeded).toBe(1)
      expect(res.failed).toBe(1)
      expect(res.results.find((r) => r.instanceId === 'target-2')?.error).toBe('Timeout')
    })
  })

  describe('syncRewritesToInstances', () => {
    it('diffs rewrites: adds missing first, deletes obsolete, skips identical', async () => {
      vi.mocked(apiModule.api).mockImplementation(async (_cfg, path) => {
        if (path === '/rewrite/list') {
          return [
            { domain: 'shared.lan', answer: '10.0.0.1' },
            { domain: 'old.lan', answer: '1.1.1.1' },
          ]
        }
        return {}
      })

      const sourceRewrites = [
        { domain: 'shared.lan', answer: '10.0.0.1' },
        { domain: 'nas.lan', answer: '192.168.1.20' },
      ]
      const res = await syncRewritesToInstances(targetInstances, sourceRewrites)

      expect(res.total).toBe(2)
      expect(res.succeeded).toBe(2)
      expect(apiModule.api).toHaveBeenCalledWith(
        expect.anything(),
        '/rewrite/add',
        { method: 'POST', body: { domain: 'nas.lan', answer: '192.168.1.20' } }
      )
      expect(apiModule.api).toHaveBeenCalledWith(
        expect.anything(),
        '/rewrite/delete',
        { method: 'POST', body: { domain: 'old.lan', answer: '1.1.1.1' } }
      )
    })
  })

  describe('syncFilterListsToInstances', () => {
    it('adds missing lists and updates changed lists on target', async () => {
      const sourceFilters: Filter[] = [
        { id: 1, name: 'AdGuard Base', url: 'https://filters.adtidy.org/base.txt', enabled: true, rules_count: 50000 },
        { id: 2, name: 'Anti-Tracker', url: 'https://filters.adtidy.org/spyware.txt', enabled: false, rules_count: 20000 },
      ]

      vi.mocked(apiModule.api).mockImplementation(async (_cfg, path) => {
        if (path === '/filtering/status') {
          const status: FilteringStatus = {
            enabled: true,
            interval: 24,
            filters: [
              { id: 10, name: 'Anti-Tracker', url: 'https://filters.adtidy.org/spyware.txt', enabled: true, rules_count: 10000 },
            ],
            whitelist_filters: [],
            user_rules: [],
          }
          return status
        }
        return {}
      })

      const res = await syncFilterListsToInstances(targetInstances.slice(0, 1), sourceFilters)
      expect(res.total).toBe(1)
      expect(res.succeeded).toBe(1)

      expect(apiModule.api).toHaveBeenCalledWith(
        expect.anything(),
        '/filtering/add_url',
        {
          method: 'POST',
          body: {
            name: 'AdGuard Base',
            url: 'https://filters.adtidy.org/base.txt',
            whitelist: false,
          },
        }
      )

      expect(apiModule.api).toHaveBeenCalledWith(
        expect.anything(),
        '/filtering/set_url',
        {
          method: 'POST',
          body: {
            url: 'https://filters.adtidy.org/spyware.txt',
            whitelist: false,
            data: {
              name: 'Anti-Tracker',
              url: 'https://filters.adtidy.org/spyware.txt',
              enabled: false,
            },
          },
        }
      )
    })

    it('explicitly disables newly added list if source list is disabled', async () => {
      const sourceFilters: Filter[] = [
        { id: 1, name: 'Disabled Base', url: 'https://filters.adtidy.org/disabled.txt', enabled: false, rules_count: 1000 },
      ]

      vi.mocked(apiModule.api).mockImplementation(async (_cfg, path) => {
        if (path === '/filtering/status') {
          return {
            enabled: true,
            interval: 24,
            filters: [],
            whitelist_filters: [],
            user_rules: [],
          }
        }
        return {}
      })

      const res = await syncFilterListsToInstances(targetInstances.slice(0, 1), sourceFilters)
      expect(res.total).toBe(1)
      expect(res.succeeded).toBe(1)

      expect(apiModule.api).toHaveBeenCalledWith(
        expect.anything(),
        '/filtering/add_url',
        {
          method: 'POST',
          body: {
            name: 'Disabled Base',
            url: 'https://filters.adtidy.org/disabled.txt',
            whitelist: false,
          },
        }
      )

      expect(apiModule.api).toHaveBeenCalledWith(
        expect.anything(),
        '/filtering/set_url',
        {
          method: 'POST',
          body: {
            url: 'https://filters.adtidy.org/disabled.txt',
            whitelist: false,
            data: {
              name: 'Disabled Base',
              url: 'https://filters.adtidy.org/disabled.txt',
              enabled: false,
            },
          },
        }
      )
    })

    it('skips lists that are already identical on target', async () => {
      const sourceFilters: Filter[] = [
        { id: 1, name: 'Identical List', url: 'https://example.com/same.txt', enabled: true, rules_count: 100 },
      ]

      vi.mocked(apiModule.api).mockImplementation(async (_cfg, path) => {
        if (path === '/filtering/status') {
          return {
            enabled: true,
            interval: 24,
            filters: [
              { id: 5, name: 'Identical List', url: 'https://example.com/same.txt', enabled: true, rules_count: 100 },
            ],
            whitelist_filters: [],
            user_rules: [],
          }
        }
        return {}
      })

      const res = await syncFilterListsToInstances(targetInstances.slice(0, 1), sourceFilters)
      expect(res.total).toBe(1)
      expect(res.succeeded).toBe(1)

      expect(apiModule.api).not.toHaveBeenCalledWith(expect.anything(), '/filtering/add_url', expect.anything())
      expect(apiModule.api).not.toHaveBeenCalledWith(expect.anything(), '/filtering/set_url', expect.anything())
    })

    it('synchronizes whitelist filters when present', async () => {
      const sourceWhitelists: Filter[] = [
        { id: 1, name: 'Allowlist', url: 'https://example.com/allow.txt', enabled: true, rules_count: 50 },
      ]

      vi.mocked(apiModule.api).mockImplementation(async (_cfg, path) => {
        if (path === '/filtering/status') {
          return {
            enabled: true,
            interval: 24,
            filters: [],
            whitelist_filters: [],
            user_rules: [],
          }
        }
        return {}
      })

      const res = await syncFilterListsToInstances(targetInstances.slice(0, 1), [], sourceWhitelists)
      expect(res.total).toBe(1)
      expect(res.succeeded).toBe(1)

      expect(apiModule.api).toHaveBeenCalledWith(
        expect.anything(),
        '/filtering/add_url',
        {
          method: 'POST',
          body: {
            name: 'Allowlist',
            url: 'https://example.com/allow.txt',
            whitelist: true,
          },
        }
      )
    })

    it('isolates failures per instance without affecting successful targets', async () => {
      const sourceFilters: Filter[] = [
        { id: 1, name: 'Filter List', url: 'https://example.com/list.txt', enabled: true, rules_count: 10 },
      ]

      vi.mocked(apiModule.api).mockImplementation(async (cfg, path) => {
        if (cfg.url.includes('192.168.1.3')) {
          throw new Error('Connection refused')
        }
        if (path === '/filtering/status') {
          return {
            enabled: true,
            interval: 24,
            filters: [],
            whitelist_filters: [],
            user_rules: [],
          }
        }
        return {}
      })

      const res = await syncFilterListsToInstances(targetInstances, sourceFilters)
      expect(res.total).toBe(2)
      expect(res.succeeded).toBe(1)
      expect(res.failed).toBe(1)
      expect(res.results.find((r) => r.instanceId === 'target-2')?.error).toBe('Connection refused')
      expect(res.results.find((r) => r.instanceId === 'target-1')?.success).toBe(true)
    })
  })

  describe('syncClientsToInstances', () => {
    const mockClient = (name: string, ids: string[], tags: string[] = []): AghClient => ({
      name,
      ids,
      use_global_settings: true,
      filtering_enabled: true,
      safebrowsing_enabled: false,
      parental_enabled: false,
      use_global_blocked_services: true,
      blocked_services: [],
      tags,
      ignore_querylog: false,
      ignore_statistics: false,
      upstreams_cache_enabled: true,
      upstreams_cache_size: 1000,
    })

    it('adds missing clients and updates clients with policy differences', async () => {
      const sourceClients: AghClient[] = [
        mockClient('Apple TV', ['192.168.1.50'], ['device_tv']),
        mockClient('MacBook Pro', ['192.168.1.60'], ['pc']),
      ]

      vi.mocked(apiModule.api).mockImplementation(async (_cfg, path) => {
        if (path === '/clients') {
          const data: ClientsData = {
            clients: [
              mockClient('MacBook Pro', ['192.168.1.60'], ['work_laptop']),
            ],
            auto_clients: [],
          }
          return data
        }
        return {}
      })

      const res = await syncClientsToInstances(targetInstances.slice(0, 1), sourceClients)
      expect(res.total).toBe(1)
      expect(res.succeeded).toBe(1)

      expect(apiModule.api).toHaveBeenCalledWith(
        expect.anything(),
        '/clients/add',
        {
          method: 'POST',
          body: sourceClients[0],
        }
      )

      expect(apiModule.api).toHaveBeenCalledWith(
        expect.anything(),
        '/clients/update',
        {
          method: 'POST',
          body: {
            name: 'MacBook Pro',
            data: sourceClients[1],
          },
        }
      )
    })

    it('skips clients that are completely identical', async () => {
      const sourceClients: AghClient[] = [
        mockClient('NAS', ['192.168.1.20']),
      ]

      vi.mocked(apiModule.api).mockImplementation(async (_cfg, path) => {
        if (path === '/clients') {
          return {
            clients: [
              mockClient('NAS', ['192.168.1.20']),
            ],
            auto_clients: [],
          }
        }
        return {}
      })

      const res = await syncClientsToInstances(targetInstances.slice(0, 1), sourceClients)
      expect(res.total).toBe(1)
      expect(res.succeeded).toBe(1)

      expect(apiModule.api).not.toHaveBeenCalledWith(expect.anything(), '/clients/add', expect.anything())
      expect(apiModule.api).not.toHaveBeenCalledWith(expect.anything(), '/clients/update', expect.anything())
    })

    it('handles null clients on target gracefully', async () => {
      const sourceClients: AghClient[] = [
        mockClient('Router', ['192.168.1.1']),
      ]

      vi.mocked(apiModule.api).mockImplementation(async (_cfg, path) => {
        if (path === '/clients') {
          return { clients: null, auto_clients: null }
        }
        return {}
      })

      const res = await syncClientsToInstances(targetInstances.slice(0, 1), sourceClients)
      expect(res.total).toBe(1)
      expect(res.succeeded).toBe(1)

      expect(apiModule.api).toHaveBeenCalledWith(
        expect.anything(),
        '/clients/add',
        {
          method: 'POST',
          body: sourceClients[0],
        }
      )
    })

    it('isolates failures per instance during client sync', async () => {
      const sourceClients: AghClient[] = [
        mockClient('Tablet', ['192.168.1.80']),
      ]

      vi.mocked(apiModule.api).mockImplementation(async (cfg, path) => {
        if (cfg.url.includes('192.168.1.3')) {
          throw new Error('Connection timeout')
        }
        if (path === '/clients') {
          return { clients: [], auto_clients: [] }
        }
        return {}
      })

      const res = await syncClientsToInstances(targetInstances, sourceClients)
      expect(res.total).toBe(2)
      expect(res.succeeded).toBe(1)
      expect(res.failed).toBe(1)
      expect(res.results.find((r) => r.instanceId === 'target-2')?.error).toBe('Connection timeout')
      expect(res.results.find((r) => r.instanceId === 'target-1')?.success).toBe(true)
    })
  })
})
