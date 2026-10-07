/**
 * Per-instance /status probe state machine: fast-fail status fetch, periodic
 * cadence with backoff for failing non-active instances, recovery signalling.
 * React-free and clock-injectable, so the curve is unit-tested (probe.test.ts);
 * the AuthProvider only wires it to the session state.
 */
import { api, type Status } from '../api'
import { activeEndpoint, type Instance, type SvrConfig } from './instances'

/** /status probe deadline: offline, the proxy layer takes 25s to report
 *  timeout, so the probe must conclude within 5s */
const PROBE_TIMEOUT_MS = 5000
/** Probe cadence while the app is open (self-heal for the offline mask) */
export const PROBE_INTERVAL_MS = 15000

export interface ProbeOutcome {
  /** null = the probe failed (timeout/offline); callers keep the stale status */
  status: Status | null
  ok: boolean
  /** Active instance failed → succeeded: the caller revalidates its SWR keys */
  recovered: boolean
}

export interface ProbeEngine {
  /** Probe one instance; resolves undefined when a probe is already in flight
   *  or the instance was dropped meanwhile (result discarded) */
  probe(inst: Instance, ep: SvrConfig): Promise<ProbeOutcome | undefined>
  /** Cadence pass: skips in-flight and backed-off non-active instances */
  probeAll(instances: Instance[], force?: boolean): void
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
    try {
      const s = await wiring.fetchStatus(ep)
      // Dropped while probing (instance removed): discard the result
      if (!states.has(inst.id)) return undefined
      const ok = s !== null
      st.failures = ok ? 0 : st.failures + 1
      st.nextAt = ok || wiring.isActive(inst.id) ? 0 : now() + backoffMs(st.failures)
      // Recovery is read at completion time, like the session state it compares
      const recovered = ok && !wiring.wasProbeOk(inst.id) && wiring.isActive(inst.id)
      return { status: s, ok, recovered }
    } finally {
      const cur = states.get(inst.id)
      if (cur) cur.inFlight = false
    }
  }

  return {
    probe,
    probeAll(instances, force = false) {
      const t = now()
      for (const inst of instances) {
        const ep = activeEndpoint(inst)
        if (!ep) continue
        const p = states.get(inst.id)
        if (!force && !wiring.isActive(inst.id) && p && (p.inFlight || t < p.nextAt)) continue
        void probe(inst, ep)
      }
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
