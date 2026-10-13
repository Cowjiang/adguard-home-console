/**
 * Probe engine tests: fast-fail fetch, backoff curve, in-flight dedupe,
 * recovery signalling and dropped-instance handling (the AuthProvider keeps
 * only the React wiring, see lib/session/auth.tsx).
 */
import { describe, expect, it, vi } from 'vitest'
import { backoffMs, createProbeEngine, createStatusFetcher, PROBE_INTERVAL_MS, type ProbeOutcome } from './probe'
import type { Instance, SvrConfig } from './instances'
import type { Status } from '../api'
import { api } from '../api'

// The probe engine is React- and DOM-free; api() pulls in i18n/document at
// module load, so the transport is mocked for the whole file
vi.mock('../api', () => ({ api: vi.fn() }))
const apiMock = vi.mocked(api)

const OK = { version: 'v0.107.79' } as Status
const cfg: SvrConfig = { url: 'http://agh.test', username: 'u', password: 'p' }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const mkInst = (id: string): Instance => ({
  id,
  label: id,
  endpoints: [{ url: `http://${id}.test`, username: 'u', password: 'p' }],
})

/** Engine with a mutable clock, verdict script and session verdict stub */
function harness() {
  let t = 0
  let ok = true
  const calls: string[] = []
  const session: Record<string, boolean> = {}
  let activeId: string | null = null
  const outcomes: { inst: Instance; outcome: ProbeOutcome }[] = []
  const engine = createProbeEngine({
    fetchStatus: async (ep) => {
      calls.push(ep.url)
      return ok ? OK : null
    },
    wasProbeOk: (id) => session[id] ?? false,
    isActive: (id) => activeId === id,
    now: () => t,
    onOutcome: (inst, ep, outcome) => {
      outcomes.push({ inst, outcome })
    },
  })
  return {
    engine,
    calls,
    session,
    outcomes,
    setOk: (v: boolean) => {
      ok = v
    },
    setActive: (id: string | null) => {
      activeId = id
    },
    advance: (ms: number) => {
      t += ms
    },
  }
}

describe('backoffMs', () => {
  it('backs off a failing non-active instance by 15s/30s/60s, capped at 60s', () => {
    expect([1, 2, 3, 4, 5, 9].map(backoffMs)).toEqual([
      PROBE_INTERVAL_MS,
      30_000,
      60_000,
      60_000,
      60_000,
      60_000,
    ])
  })
})

describe('probeAll cadence', () => {
  it('skips a failing non-active instance until its backoff expires, force bypasses it', async () => {
    const h = harness()
    const a = mkInst('a')
    h.setOk(false)

    h.engine.probeAll([a])
    await flush()
    expect(h.calls).toHaveLength(1)
    h.engine.probeAll([a])
    await flush()
    expect(h.calls).toHaveLength(1)

    h.advance(PROBE_INTERVAL_MS - 1)
    h.engine.probeAll([a])
    await flush()
    expect(h.calls).toHaveLength(1)

    // 1st failure → 15s, 2nd → 30s
    h.advance(1)
    h.engine.probeAll([a])
    await flush()
    expect(h.calls).toHaveLength(2)
    h.advance(30_000 - 1)
    h.engine.probeAll([a])
    await flush()
    expect(h.calls).toHaveLength(2)

    // 3rd failure → 60s, 4th stays capped at 60s
    h.advance(1)
    h.engine.probeAll([a])
    await flush()
    expect(h.calls).toHaveLength(3)
    h.advance(60_000)
    h.engine.probeAll([a])
    await flush()
    expect(h.calls).toHaveLength(4)
    h.advance(60_000)
    h.engine.probeAll([a])
    await flush()
    expect(h.calls).toHaveLength(5)

    h.engine.probeAll([a], true)
    await flush()
    expect(h.calls).toHaveLength(6)
  })

  it('never backs off the active instance', async () => {
    const h = harness()
    const a = mkInst('a')
    h.setOk(false)
    h.setActive('a')

    h.engine.probeAll([a])
    await flush()
    h.engine.probeAll([a])
    await flush()
    expect(h.calls).toHaveLength(2)
  })

  it('resets the cadence after a successful probe', async () => {
    const h = harness()
    const a = mkInst('a')

    h.setOk(false)
    h.engine.probeAll([a])
    await flush()
    h.setOk(true)
    h.advance(PROBE_INTERVAL_MS)
    h.engine.probeAll([a])
    await flush()
    expect(h.calls).toHaveLength(2)

    // Success cleared nextAt: an immediate pass probes again
    h.engine.probeAll([a])
    await flush()
    expect(h.calls).toHaveLength(3)
  })

  it('ignores instances without an endpoint', async () => {
    const h = harness()
    h.engine.probeAll([{ id: 'a', label: 'a', endpoints: [] }])
    await flush()
    expect(h.calls).toHaveLength(0)
  })
})

describe('probe', () => {
  it('deduplicates an in-flight probe', async () => {
    let release: (s: Status | null) => void = () => {}
    const engine = createProbeEngine({
      fetchStatus: () => new Promise<Status | null>((resolve) => { release = resolve }),
      wasProbeOk: () => false,
      isActive: () => true,
    })
    const inst = mkInst('a')
    const first = engine.probe(inst, cfg)
    const second = engine.probe(inst, cfg)
    await expect(second).resolves.toBeUndefined()
    release(OK)
    await expect(first).resolves.toMatchObject({ ok: true })
  })

  it('reports recovery only for the active instance that was failing', async () => {
    const h = harness()
    const a = mkInst('a')

    h.setActive('a')
    await expect(h.engine.probe(a, cfg)).resolves.toMatchObject({ ok: true, recovered: true })

    // Same verdict once the session already knows about it: not a recovery
    h.session.a = true
    await expect(h.engine.probe(a, cfg)).resolves.toMatchObject({ recovered: false })

    // Failing active instance: no recovery signal either
    h.setOk(false)
    h.session.a = false
    await expect(h.engine.probe(a, cfg)).resolves.toMatchObject({ ok: false, recovered: false })

    // Recovered but not active: the caller must not revalidate it
    h.setOk(true)
    h.setActive(null)
    await expect(h.engine.probe(a, cfg)).resolves.toMatchObject({ ok: true, recovered: false })
  })

  it('discards the result of an instance dropped while probing', async () => {
    const resolvers: ((s: Status | null) => void)[] = []
    const engine = createProbeEngine({
      fetchStatus: () => new Promise<Status | null>((resolve) => resolvers.push(resolve)),
      wasProbeOk: () => true,
      isActive: () => true,
    })
    const inst = mkInst('a')
    const p = engine.probe(inst, cfg)
    engine.drop(inst.id)
    resolvers[0](OK)
    await expect(p).resolves.toBeUndefined()

    // A dropped instance starts from a clean cadence state
    const retry = engine.probe(inst, cfg)
    resolvers[1](OK)
    await expect(retry).resolves.toBeDefined()
  })

  it('measures and records round-trip latencyMs on success, undefined on failure', async () => {
    let t = 100
    const inst = mkInst('a')
    const engine = createProbeEngine({
      fetchStatus: async () => {
        t += 42
        return OK
      },
      wasProbeOk: () => false,
      isActive: () => true,
      now: () => t,
    })

    const outcome = await engine.probe(inst, cfg)
    expect(outcome?.ok).toBe(true)
    expect(outcome?.latencyMs).toBe(42)

    const failEngine = createProbeEngine({
      fetchStatus: async () => null,
      wasProbeOk: () => false,
      isActive: () => true,
      now: () => t,
    })
    const failOutcome = await failEngine.probe(inst, cfg)
    expect(failOutcome?.ok).toBe(false)
    expect(failOutcome?.latencyMs).toBeUndefined()
  })

  it('dispatches onOutcome callback for both probe and probeAll', async () => {
    const h = harness()
    const a = mkInst('a')
    const b = mkInst('b')

    await h.engine.probeAll([a, b], true)
    expect(h.outcomes).toHaveLength(2)
    expect(h.outcomes.map((o) => o.inst.id)).toEqual(['a', 'b'])
    expect(h.outcomes[0].outcome.ok).toBe(true)
  })

  it('reset clears a backed-off cadence (connect path)', async () => {
    const h = harness()
    const a = mkInst('a')
    h.setOk(false)

    h.engine.probeAll([a])
    await flush()
    h.engine.probeAll([a])
    await flush()
    expect(h.calls).toHaveLength(1)

    h.engine.reset('a')
    h.engine.probeAll([a])
    await flush()
    expect(h.calls).toHaveLength(2)
  })
})

describe('createStatusFetcher', () => {
  it('passes a status through, and resolves null on error', async () => {
    const fetchStatus = createStatusFetcher()
    apiMock.mockResolvedValueOnce(OK)
    await expect(fetchStatus(cfg)).resolves.toBe(OK)

    apiMock.mockRejectedValueOnce(new Error('offline'))
    await expect(fetchStatus(cfg)).resolves.toBeNull()
  })

  it('resolves null once the deadline passes, without waiting for the request', async () => {
    vi.useFakeTimers()
    try {
      apiMock.mockImplementationOnce(() => new Promise(() => {}))
      const p = createStatusFetcher(5000)(cfg)
      await vi.advanceTimersByTimeAsync(4999)
      let settled: Status | null | undefined
      void p.then((v) => { settled = v })
      await vi.advanceTimersByTimeAsync(0)
      expect(settled).toBeUndefined()
      await vi.advanceTimersByTimeAsync(1)
      await expect(p).resolves.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
