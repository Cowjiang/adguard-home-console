import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setClusterProtection } from './cluster'
import type { Instance } from './instances'
import * as apiModule from '../api'

vi.mock('../api', () => ({
  api: vi.fn(),
}))

describe('setClusterProtection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockInstances: Instance[] = [
    {
      id: 'inst-1',
      label: 'Router AGH',
      endpoints: [{ url: 'http://192.168.1.1:3000', username: 'admin', password: '123' }],
    },
    {
      id: 'inst-2',
      label: 'NAS AGH',
      endpoints: [{ url: 'http://192.168.1.2:3000', username: 'admin', password: '123' }],
    },
    {
      id: 'inst-3',
      label: 'Cloud AGH',
      endpoints: [{ url: 'http://10.0.0.1:3000', username: 'root', password: '456' }],
    },
  ]

  it('dispatches to all valid instances concurrently', async () => {
    vi.mocked(apiModule.api).mockResolvedValue({})

    const res = await setClusterProtection(mockInstances, {
      enabled: false,
      durationMs: 600000,
    })

    expect(res.total).toBe(3)
    expect(res.succeeded).toBe(3)
    expect(res.failed).toBe(0)
    expect(res.skipped).toBe(0)
    expect(apiModule.api).toHaveBeenCalledTimes(3)
    expect(apiModule.api).toHaveBeenCalledWith(
      { url: 'http://192.168.1.1:3000', username: 'admin', password: '123' },
      '/protection',
      { method: 'POST', body: { enabled: false, duration: 600000 } }
    )
  })

  it('handles partial failures and skipped targets gracefully', async () => {
    vi.mocked(apiModule.api).mockImplementation(async (cfg) => {
      if (cfg.url.includes('192.168.1.2')) {
        throw new Error('Connection refused')
      }
      return {}
    })

    const res = await setClusterProtection(mockInstances, {
      enabled: true,
      isTarget: (inst) => inst.id !== 'inst-3', // skip inst-3
    })

    expect(res.total).toBe(3)
    expect(res.succeeded).toBe(1)
    expect(res.failed).toBe(1)
    expect(res.skipped).toBe(1)
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]).toEqual({
      instanceId: 'inst-2',
      label: 'NAS AGH',
      error: 'Connection refused',
    })
  })
})
