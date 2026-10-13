/**
 * Instance connectivity and latency probe engine.
 * Measures round-trip time (RTT), performs fast-fail status probes,
 * handles exponential backoff for offline nodes, and reports outcomes.
 */
import { api, type Status, type SvrConfig } from '../api'
import { activeEndpoint, type Instance } from './instances'

/** Base cadence between status probes (matches legacy 15s interval) */
export const PROBE_INTERVAL_MS = 15_000

/** Timeout before a failing probe gives up, so pull-to-refresh and
 *  switchInstance never stall on a dead host */
export const PROBE_TIMEOUT_MS = 3_000

export interface ProbeOutcome {
  status: Status | null
  ok: boolean
  /** Active instance failed → succeeded: the caller revalidates its SWR keys */
  recovered: boolean
  /** Round-trip time in milliseconds (recorded on successful probe) */
  latencyMs?: number
}

export interface ProbeEngine {
  /** Probe one instance; resolves undefined when a probe is already in flight
   *  or the instance was dropped meanwhile (result discarded) */
  probe(inst: Instance, ep: SvrConfig): Promise<ProbeOutcome | undefined>
  /** Cadence pass: skips in-flight and backed-off non-active instances */
  probeAll(instances: Instance[], force?: boolean): Promise<void>
  /** Removed instance: drop its cadence state (in-flight results discarded) */
  drop(id: string): void
  /** Fresh cadence state, for an instance verified externally (connect) */
  reset(id: string): void
  /** Drop all cadence state (logout) */
  clear(): void
}

export interface ProbeWiring {
  /** /status fetch with a fast-fail timeout; null = failure */
  fetchStatus: (ep: SvrConfig) => Promise<Status | null>
  /** Instance's previous verdict from the session layer (false when unknown) */
  wasProbeOk: (id: string) => boolean
  /** Is the UI currently showing this instance? */
  isActive: (id: string) => boolean
  /** Clock, injectable for tests */
  now?: () => number
  /** Callback fired whenever a probe finishes with an outcome */
  onOutcome?: (inst: Instance, ep: SvrConfig, outcome: ProbeOutcome) => void
}

/** Non-active failing instances back off their periodic probe (success
 *  resets); the active instance never backs off — the 15s self-heal cadence
 *  is what recovers the offline mask */
export function backoffMs(failures: number): number {
  return PROBE_INTERVAL_MS * Math.min(1 << Math.min(failures - 1, 2), 4)
}

interface ProbeState {
  inFlight: boolean
  failures: number
  /** Epoch ms before which the periodic cadence skips this instance */
  nextAt: number
}

/** Fast-fail /status fetch: offline, the proxy layer takes 25s to time out
 *  and the probe doesn't wait — pull-to-refresh, the offline mask and the 15s
 *  self-heal all need a prompt verdict. A timeout resolves null as failure;
 *  the background request is left to finish on its own */
export function createStatusFetcher(timeoutMs = PROBE_TIMEOUT_MS) {
  return async (c: SvrConfig): Promise<Status | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        api<Status>(c, '/status'),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs)
        }),
      ])
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

export function createProbeEngine(wiring: ProbeWiring): ProbeEngine {
  const now = wiring.now ?? Date.now
  const states = new Map<string, ProbeState>()

  const stateOf = (id: string): ProbeState => {
    let st = states.get(id)
    if (!st) {
      st = { inFlight: false, failures: 0, nextAt: 0 }
      states.set(id, st)
    }
    return st
  }

  async function probe(inst: Instance, ep: SvrConfig): Promise<ProbeOutcome | undefined> {
    const st = stateOf(inst.id)
    if (st.inFlight) return undefined
    st.inFlight = true
    const t0 = now()
    try {
      const s = await wiring.fetchStatus(ep)
      // Dropped while probing (instance removed): discard the result
      if (!states.has(inst.id)) return undefined
      const ok = s !== null
      const latencyMs = ok ? Math.max(1, Math.round(now() - t0)) : undefined
      st.failures = ok ? 0 : st.failures + 1
      st.nextAt = ok || wiring.isActive(inst.id) ? 0 : now() + backoffMs(st.failures)
      // Recovery is read at completion time, like the session state it compares
      const recovered = ok && !wiring.wasProbeOk(inst.id) && wiring.isActive(inst.id)
      const outcome: ProbeOutcome = { status: s, ok, recovered, latencyMs }
      wiring.onOutcome?.(inst, ep, outcome)
      return outcome
    } finally {
      const cur = states.get(inst.id)
      if (cur) cur.inFlight = false
    }
  }

  return {
    probe,
    async probeAll(instances, force = false) {
      const t = now()
      const list: Promise<unknown>[] = []
      for (const inst of instances) {
        const ep = activeEndpoint(inst)
        if (!ep) continue
        const p = states.get(inst.id)
        if (!force && !wiring.isActive(inst.id) && p && (p.inFlight || t < p.nextAt)) continue
        list.push(probe(inst, ep))
      }
      await Promise.all(list)
    },
    drop(id) {
      states.delete(id)
    },
    reset(id) {
      states.set(id, { inFlight: false, failures: 0, nextAt: 0 })
    },
    clear() {
      states.clear()
    },
  }
}
