import { describe, expect, it, vi } from 'vitest'
import {
  benchmarkMultiInstance,
  benchmarkUpstreams,
  calculateMedian,
  classifyStatus,
  summarizeSamples,
  type BenchmarkSample,
  type BenchmarkTarget,
} from './benchmark'
import type { SvrConfig } from '../api'

vi.mock('../api', () => ({
  api: vi.fn(),
}))

describe('calculateMedian', () => {
  it('handles empty arrays', () => {
    expect(calculateMedian([])).toBeUndefined()
  })

  it('calculates median for odd-length arrays', () => {
    expect(calculateMedian([10, 50, 30])).toBe(30)
  })

  it('calculates median for even-length arrays', () => {
    expect(calculateMedian([10, 20, 30, 40])).toBe(25)
  })
})

describe('classifyStatus', () => {
  it('classifies error when successRate is 0 or median is undefined', () => {
    expect(classifyStatus(undefined, 0)).toBe('error')
    expect(classifyStatus(20, 0)).toBe('error')
  })

  it('classifies poor when successRate < 1 or median >= 300', () => {
    expect(classifyStatus(40, 0.67)).toBe('poor')
    expect(classifyStatus(350, 1)).toBe('poor')
  })

  it('classifies fast, good, and slow based on latency', () => {
    expect(classifyStatus(25, 1)).toBe('fast')
    expect(classifyStatus(80, 1)).toBe('good')
    expect(classifyStatus(200, 1)).toBe('slow')
  })
})

describe('summarizeSamples', () => {
  it('summarizes completely failed samples', () => {
    const samples: BenchmarkSample[] = [
      { round: 1, ok: false, error: 'connection refused' },
      { round: 2, ok: false, error: 'timeout' },
    ]
    const summary = summarizeSamples('8.8.8.8', samples)
    expect(summary.status).toBe('error')
    expect(summary.successRate).toBe(0)
    expect(summary.errorMessage).toBe('connection refused')
    expect(summary.medianLatencyMs).toBeUndefined()
  })

  it('summarizes successful samples with jitter and median', () => {
    const samples: BenchmarkSample[] = [
      { round: 1, ok: true, latencyMs: 20 },
      { round: 2, ok: true, latencyMs: 30 },
      { round: 3, ok: true, latencyMs: 40 },
    ]
    const summary = summarizeSamples('https://dns.alidns.com/dns-query', samples)
    expect(summary.status).toBe('fast')
    expect(summary.successRate).toBe(1)
    expect(summary.medianLatencyMs).toBe(30)
    expect(summary.avgLatencyMs).toBe(30)
    expect(summary.minLatencyMs).toBe(20)
    expect(summary.maxLatencyMs).toBe(40)
    expect(summary.jitterMs).toBe(20)
  })

  it('summarizes mixed samples as poor', () => {
    const samples: BenchmarkSample[] = [
      { round: 1, ok: true, latencyMs: 25 },
      { round: 2, ok: false, error: 'timeout' },
      { round: 3, ok: true, latencyMs: 35 },
    ]
    const summary = summarizeSamples('tls://dot.pub', samples)
    expect(summary.status).toBe('poor')
    expect(summary.successRate).toBe(0.67)
    expect(summary.medianLatencyMs).toBe(30)
    expect(summary.errorMessage).toBe('timeout')
  })
})

describe('benchmarkUpstreams', () => {
  const cfg: SvrConfig = { url: 'http://127.0.0.1:3000', username: 'admin', password: '123' }

  it('returns empty array when no upstreams provided', async () => {
    const res = await benchmarkUpstreams(cfg, [])
    expect(res).toEqual([])
  })

  it('runs multiple rounds and sorts results by latency', async () => {
    const runner = vi.fn().mockImplementation(async (_cfg, upstream: string) => {
      if (upstream === 'fast.dns') return { latencyMs: 15, ok: true }
      if (upstream === 'slow.dns') return { latencyMs: 120, ok: true }
      return { ok: false, error: 'unreachable' }
    })

    const onProgress = vi.fn()
    const results = await benchmarkUpstreams(cfg, ['slow.dns', 'broken.dns', 'fast.dns'], {
      rounds: 2,
      runner,
      onProgress,
    })

    expect(results).toHaveLength(3)
    // Fast should be first
    expect(results[0].upstream).toBe('fast.dns')
    expect(results[0].status).toBe('fast')
    expect(results[0].medianLatencyMs).toBe(15)

    // Slow should be second
    expect(results[1].upstream).toBe('slow.dns')
    expect(results[1].status).toBe('good')
    expect(results[1].medianLatencyMs).toBe(120)

    // Broken should be last
    expect(results[2].upstream).toBe('broken.dns')
    expect(results[2].status).toBe('error')

    expect(onProgress).toHaveBeenCalled()
  })
})

describe('benchmarkMultiInstance', () => {
  const mockTargets: BenchmarkTarget[] = [
    {
      id: 'inst-1',
      label: 'Main Router',
      cfg: { url: 'http://192.168.1.1:3000', username: 'admin', password: '123' },
    },
    {
      id: 'inst-2',
      label: 'Backup VPS',
      cfg: { url: 'http://1.2.3.4:3000', username: 'admin', password: '123' },
    },
  ]

  it('runs benchmarks across instances and surfaces fastest upstream', async () => {
    const runner = vi.fn().mockImplementation(async (cfg: SvrConfig, upstream: string) => {
      // Main router has lower latency to 223.5.5.5, VPS has lower latency to 1.1.1.1
      if (cfg.url.includes('192.168.1.1')) {
        return upstream === '223.5.5.5' ? { latencyMs: 12, ok: true } : { latencyMs: 80, ok: true }
      }
      return upstream === '1.1.1.1' ? { latencyMs: 15, ok: true } : { latencyMs: 90, ok: true }
    })

    const results = await benchmarkMultiInstance(mockTargets, ['223.5.5.5', '1.1.1.1'], {
      rounds: 1,
      runner,
    })

    expect(results).toHaveLength(2)
    expect(results[0].instanceId).toBe('inst-1')
    expect(results[0].fastestUpstream).toBe('223.5.5.5')

    expect(results[1].instanceId).toBe('inst-2')
    expect(results[1].fastestUpstream).toBe('1.1.1.1')
  })
})
