/**
 * Upstream DNS latency benchmarking & multi-instance comparison engine.
 */
import { api, type SvrConfig } from '../api'
import { activeEndpoint, type Instance } from '../session/instances'

export type UpstreamStatus = 'fast' | 'good' | 'slow' | 'poor' | 'error'

export interface BenchmarkSample {
  round: number
  latencyMs?: number
  ok: boolean
  error?: string
}

export interface UpstreamBenchmarkResult {
  upstream: string
  samples: BenchmarkSample[]
  medianLatencyMs?: number
  avgLatencyMs?: number
  minLatencyMs?: number
  maxLatencyMs?: number
  jitterMs?: number
  successRate: number
  status: UpstreamStatus
  errorMessage?: string
}

export interface InstanceBenchmarkResult {
  instanceId: string
  instanceLabel: string
  results: UpstreamBenchmarkResult[]
  fastestUpstream?: string
  timestamp: number
}

export interface BenchmarkTarget {
  id: string
  label: string
  cfg: SvrConfig
}

export interface BenchmarkOptions {
  rounds?: number
  timeoutMs?: number
  concurrency?: number
  onProgress?: (completed: number, total: number, current?: string) => void
  runner?: (cfg: SvrConfig, upstream: string, timeoutMs: number) => Promise<{ latencyMs?: number; ok: boolean; error?: string }>
}

export function calculateMedian(values: number[]): number | undefined {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

export function classifyStatus(medianLatencyMs: number | undefined, successRate: number): UpstreamStatus {
  if (successRate === 0 || medianLatencyMs === undefined) return 'error'
  if (successRate < 1 || medianLatencyMs >= 300) return 'poor'
  if (medianLatencyMs < 50) return 'fast'
  if (medianLatencyMs < 150) return 'good'
  return 'slow'
}

export function summarizeSamples(upstream: string, samples: BenchmarkSample[]): UpstreamBenchmarkResult {
  const okSamples = samples.filter((s) => s.ok && typeof s.latencyMs === 'number')
  const latencies = okSamples.map((s) => s.latencyMs as number)
  const successRate = samples.length > 0 ? Number((okSamples.length / samples.length).toFixed(2)) : 0

  if (!latencies.length) {
    const firstErr = samples.find((s) => s.error)?.error || 'Test failed'
    return {
      upstream,
      samples,
      successRate: 0,
      status: 'error',
      errorMessage: firstErr,
    }
  }

  const medianLatencyMs = calculateMedian(latencies)
  const avgLatencyMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
  const minLatencyMs = Math.min(...latencies)
  const maxLatencyMs = Math.max(...latencies)
  const jitterMs = maxLatencyMs - minLatencyMs
  const status = classifyStatus(medianLatencyMs, successRate)

  const firstErr = samples.find((s) => s.error)?.error

  return {
    upstream,
    samples,
    medianLatencyMs,
    avgLatencyMs,
    minLatencyMs,
    maxLatencyMs,
    jitterMs,
    successRate,
    status,
    errorMessage: firstErr,
  }
}

export async function defaultTestUpstream(
  cfg: SvrConfig,
  upstream: string,
  timeoutMs = 5000,
): Promise<{ latencyMs?: number; ok: boolean; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const t0 = performance.now()
  try {
    const res = await api<Record<string, string> | null>(cfg, '/test_upstream_dns', {
      method: 'POST',
      body: { upstream_dns: [upstream] },
      signal: controller.signal,
    })
    const t1 = performance.now()
    clearTimeout(timer)
    const rawVal = res ? (res[upstream] ?? Object.values(res)[0]) : undefined
    const isOk = typeof rawVal === 'string' && rawVal.trim().toLowerCase() === 'ok'
    if (isOk) {
      return { latencyMs: Math.max(1, Math.round(t1 - t0)), ok: true }
    }
    return { ok: false, error: typeof rawVal === 'string' ? rawVal : 'Invalid response' }
  } catch (err: any) {
    clearTimeout(timer)
    return { ok: false, error: err?.message || 'Request failed' }
  }
}

export async function benchmarkUpstreams(
  cfg: SvrConfig,
  upstreams: string[],
  options: BenchmarkOptions = {},
): Promise<UpstreamBenchmarkResult[]> {
  const cleanList = upstreams.map((s) => s.trim()).filter(Boolean)
  if (!cleanList.length) return []

  const rounds = Math.max(1, options.rounds ?? 3)
  const timeoutMs = options.timeoutMs ?? 5000
  const runner = options.runner ?? defaultTestUpstream
  const concurrency = Math.max(1, options.concurrency ?? 3)

  const totalSteps = cleanList.length * rounds
  let completedSteps = 0

  const samplesMap = new Map<string, BenchmarkSample[]>()
  for (const up of cleanList) {
    samplesMap.set(up, [])
  }

  for (let r = 1; r <= rounds; r++) {
    for (let i = 0; i < cleanList.length; i += concurrency) {
      const batch = cleanList.slice(i, i + concurrency)
      await Promise.all(
        batch.map(async (up) => {
          options.onProgress?.(completedSteps, totalSteps, up)
          const outcome = await runner(cfg, up, timeoutMs)
          samplesMap.get(up)!.push({
            round: r,
            latencyMs: outcome.latencyMs,
            ok: outcome.ok,
            error: outcome.error,
          })
          completedSteps++
          options.onProgress?.(completedSteps, totalSteps, up)
        }),
      )
    }
  }

  const results: UpstreamBenchmarkResult[] = cleanList.map((up) => {
    return summarizeSamples(up, samplesMap.get(up) || [])
  })

  // Sort by median latency ascending (fastest first), error items last
  return results.sort((a, b) => {
    if (a.status === 'error' && b.status !== 'error') return 1
    if (a.status !== 'error' && b.status === 'error') return -1
    return (a.medianLatencyMs ?? 999999) - (b.medianLatencyMs ?? 999999)
  })
}

export function toSvrConfig(inst: Instance): SvrConfig | null {
  const ep = activeEndpoint(inst)
  if (!ep) return null
  return {
    url: ep.url,
    username: ep.username,
    password: ep.password,
  }
}

export function toBenchmarkTarget(inst: Instance): BenchmarkTarget | null {
  const cfg = toSvrConfig(inst)
  if (!cfg) return null
  return {
    id: inst.id,
    label: inst.label || inst.id,
    cfg,
  }
}

export async function benchmarkMultiInstance(
  targets: BenchmarkTarget[],
  upstreams: string[],
  options: BenchmarkOptions = {},
): Promise<InstanceBenchmarkResult[]> {
  const instanceResults = await Promise.all(
    targets.map(async (tgt) => {
      const results = await benchmarkUpstreams(tgt.cfg, upstreams, options)
      const fastest = results.find((r) => r.status !== 'error')?.upstream
      return {
        instanceId: tgt.id,
        instanceLabel: tgt.label,
        results,
        fastestUpstream: fastest,
        timestamp: Date.now(),
      }
    }),
  )

  return instanceResults
}
