import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncUserRulesToInstances, syncRewritesToInstances } from './rulesSync'
import type { Instance } from './instances'
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
            { domain: 'shared.lan', answer: '10.0.0.1' }, // unchanged
            { domain: 'old.lan', answer: '1.1.1.1' },     // should be deleted
          ]
        }
        return {}
      })

      const sourceRewrites = [
        { domain: 'shared.lan', answer: '10.0.0.1' },  // unchanged
        { domain: 'nas.lan', answer: '192.168.1.20' }, // to add
      ]
      const res = await syncRewritesToInstances(targetInstances, sourceRewrites)

      expect(res.total).toBe(2)
      expect(res.succeeded).toBe(2)
      // Per target: 1 get list, 1 add 'nas.lan', 1 delete 'old.lan' = 3 calls * 2 targets = 6
      expect(apiModule.api).toHaveBeenCalledTimes(6)
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
})
