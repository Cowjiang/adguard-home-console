/**
 * Global session and theme: multi-instance store, per-instance /status probe
 * wiring (the cadence state machine itself is ./probe), theme switching.
 * Consumers keep seeing the single active instance through cfg/status/offline —
 * the multi-instance detail lives here.
 */
import { applyNativeAppearance } from '../native/nativeAppearance'
import { i18n } from '../i18n'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { mutate } from 'swr'
import { api, type Status } from '../api'
import {
  activeConfig,
  activeEndpoint,
  clearStore,
  loadStore,
  newId,
  saveStore,
  labelFromUrl,
  type Instance,
  type InstanceStoreData,
  type SvrConfig,
} from './instances'
import { createProbeEngine, createStatusFetcher, PROBE_INTERVAL_MS, type ProbeOutcome } from './probe'

export type { SvrConfig }

const THEME_KEY = 'agh.console.theme.v1'

export type ThemeSetting = 'auto' | 'dark' | 'light'

/** Per-instance /status session: the offline mask and status pill of the
 *  active instance derive from its entry */
interface InstanceSession {
  status: Status | null
  offline: boolean
  lastProbeOk: boolean
  latencyMs?: number
}

/** What the instance UIs (switcher, list) need per instance */
export interface InstanceView {
  id: string
  label: string
  url: string
  online: 'ok' | 'down' | 'unknown'
  latencyMs?: number
  version?: string
  protectionEnabled?: boolean
}

interface AuthCtx {
  // Active-instance view — same contract as the single-instance era
  cfg: SvrConfig | null
  status: Status | null
  /** Active instance's latest probe failed and has not succeeded since */
  offline: boolean
  connecting: boolean
  error: string | null
  theme: ThemeSetting
  setTheme: (t: ThemeSetting) => void

  // Multi-instance
  instances: InstanceView[]
  activeId: string | null
  /** Full store; the edit page reads endpoint credentials from here */
  store: InstanceStoreData | null
  switchInstance: (id: string) => void
  /** Verify via /status, then: with `id` update that instance in place
   *  (keeping the active pointer), otherwise add a new instance or update the
   *  endpoint of the instance matching url+username; activates unless told
   *  otherwise */
  connect: (cfg: SvrConfig, opts?: { activate?: boolean; id?: string; label?: string }) => Promise<boolean>
  /** Remove one instance; the active one falls back to the first remaining */
  removeInstance: (id: string) => void
  /** Legacy logout: forget every instance (and the migrated v1 copy) */
  logout: () => void
  /** Probe every instance now (force bypasses backoff) */
  probeAll: (force?: boolean) => Promise<void>
  /** Revalidate only the active instance's SWR keys — the refresh scope is
   *  narrowed so pull-to-refresh does not fetch N instances' data */
  refreshActiveData: () => Promise<unknown>
  refreshStatus: () => Promise<Status | null>
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)

/** SWR keys embed the cfg by content; revalidate only this instance's keys */
export function mutateInstanceData(ep: SvrConfig): Promise<unknown> {
  return mutate((key) => {
    if (!Array.isArray(key) || key.length < 2) return false
    const c = key[1] as Partial<SvrConfig> | undefined
    return !!c && typeof c === 'object' && c.url === ep.url && c.username === ep.username
  })
}

function loadTheme(): ThemeSetting {
  try {
    return (localStorage.getItem(THEME_KEY) as ThemeSetting) || 'auto'
  } catch {
    return 'auto'
  }
}

function applyTheme(t: ThemeSetting) {
  const dark =
    t === 'dark' ||
    (t === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#07090f' : '#eef1f7')
  // Native layer (glass TabBar / back button / top bar action / native sheets)
  // ignores CSS; must be told light/dark explicitly
  applyNativeAppearance(dark)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<InstanceStoreData | null>(loadStore)
  const [sessions, setSessions] = useState<Record<string, InstanceSession>>({})
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [theme, setThemeState] = useState<ThemeSetting>(loadTheme)

  // Probes and setStore-free callbacks read the latest values through refs so
  // their identities (and the interval/events effects below) stay stable
  const storeRef = useRef(store)
  const sessionsRef = useRef(sessions)
  useEffect(() => {
    storeRef.current = store
    sessionsRef.current = sessions
  }, [store, sessions])

  const patchSession = useCallback((id: string, patch: Partial<InstanceSession>) => {
    setSessions((prev) => {
      const cur = prev[id] ?? { status: null, offline: false, lastProbeOk: false }
      return { ...prev, [id]: { ...cur, ...patch } }
    })
  }, [])

  const applyOutcome = useCallback(
    (inst: Instance, ep: SvrConfig, outcome: ProbeOutcome) => {
      patchSession(inst.id, {
        status: outcome.status ?? sessionsRef.current[inst.id]?.status ?? null,
        offline: !outcome.ok,
        lastProbeOk: outcome.ok,
        latencyMs: outcome.latencyMs,
      })
      if (outcome.recovered) void mutateInstanceData(ep)
    },
    [patchSession]
  )
  const applyOutcomeRef = useRef(applyOutcome)
  useEffect(() => {
    applyOutcomeRef.current = applyOutcome
  }, [applyOutcome])

  // Probe engine: cadence/backoff state lives in lib/session/probe (unit-tested
  // there); the refs above hand it the latest store/session verdicts
  const fetchStatus = useMemo(() => createStatusFetcher(), [])
  const engine = useMemo(
    () =>
      createProbeEngine({
        fetchStatus,
        wasProbeOk: (id) => sessionsRef.current[id]?.lastProbeOk ?? false,
        isActive: (id) => storeRef.current?.activeId === id,
        onOutcome: (inst, ep, outcome) => applyOutcomeRef.current(inst, ep, outcome),
      }),
    [fetchStatus]
  )

  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener('change', () => applyTheme(theme))
    return () => mq?.removeEventListener('change', () => applyTheme(theme))
  }, [theme])

  // Probe one instance: verdict lands in its session via engine.onOutcome;
  // recovery of the active instance revalidates only that instance's frozen SWR keys
  const probeOne = useCallback(
    async (inst: Instance, ep: SvrConfig) => {
      await engine.probe(inst, ep)
    },
    [engine]
  )

  const probeAll = useCallback(
    async (force = false) => {
      const st = storeRef.current
      if (!st) return
      await engine.probeAll(st.instances, force)
    },
    [engine]
  )

  // Stable probe cadence: initial probe, 15s tick, and visibility/online
  // events (lost events in WKWebView/PWA are the root cause of frozen
  // polling, see .agents/pipelines/proposals/feature/2026-09-25-refresh-triggers)
  useEffect(() => {
    const hasInstances = () => (storeRef.current?.instances.length ?? 0) > 0
    if (hasInstances()) void probeAll(true)
    const id = setInterval(() => {
      if (hasInstances()) void probeAll()
    }, PROBE_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && hasInstances()) void probeAll(true)
    }
    const onOnline = () => {
      if (hasInstances()) void probeAll(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [probeAll])

  // Instances added while running (connect) get their first probe right away
  useEffect(() => {
    const st = storeRef.current
    if (!st) return
    for (const inst of st.instances) {
      if (!sessionsRef.current[inst.id]) {
        const ep = activeEndpoint(inst)
        if (ep) void probeOne(inst, ep)
      }
    }
  }, [store, probeOne])

  const activeInst = store ? store.instances.find((x) => x.id === store.activeId) ?? store.instances[0] : null
  const activeEp = activeInst ? activeEndpoint(activeInst) : null
  const cfg: SvrConfig | null = activeEp
    ? { url: activeEp.url, username: activeEp.username, password: activeEp.password }
    : null
  const activeSession = activeInst ? sessions[activeInst.id] : undefined
  const status = activeSession?.status ?? null
  const offline = activeSession?.offline ?? false

  const instances: InstanceView[] = useMemo(
    () =>
      (store?.instances ?? []).map((i) => {
        const ep = activeEndpoint(i)
        const s = sessions[i.id]
        return {
          id: i.id,
          label: i.label,
          url: ep?.url ?? '',
          online: !s ? 'unknown' : s.lastProbeOk ? 'ok' : 'down',
          latencyMs: s?.latencyMs,
          version: s?.status?.version,
          protectionEnabled: s?.status?.protection_enabled,
        }
      }),
    [store, sessions]
  )

  const switchInstance = useCallback((id: string) => {
    const prev = storeRef.current
    if (!prev || !prev.instances.some((x) => x.id === id)) return
    const next: InstanceStoreData = { ...prev, activeId: id }
    saveStore(next)
    setStore(next)
  }, [])

  const connect = useCallback(
    async (next: SvrConfig, opts?: { activate?: boolean; id?: string; label?: string }): Promise<boolean> => {
      const activate = opts?.activate ?? true
      setConnecting(true)
      setError(null)
      const clean: SvrConfig = {
        ...next,
        url: next.url.replace(/\/+$/, ''),
      }
      try {
        const s = await api<Status>(clean, '/status')
        if (!s || !s.version) throw new Error(i18n.t('login.notAgh'))
        const prev = storeRef.current
        // With an explicit id: edit that instance in place. Otherwise add a
        // new one or update the instance already pointing at the same
        // url+username
        const editId =
          opts?.id && prev?.instances.some((x) => x.id === opts.id) ? opts.id : undefined
        const targetId =
          editId ??
          prev?.instances.find((i) => {
            const e = activeEndpoint(i)
            return e && e.url === clean.url && e.username === clean.username
          })?.id ??
          newId()
        const entry: Instance = {
          id: targetId,
          label: opts?.label?.trim() || labelFromUrl(clean.url),
          endpoints: [{ ...clean }],
        }
        const instances = prev ? [...prev.instances] : []
        const idx = instances.findIndex((x) => x.id === targetId)
        if (idx >= 0) instances[idx] = entry
        else instances.push(entry)
        const nextStore: InstanceStoreData = {
          instances,
          // Editing never moves the pointer; adding activates the new entry
          // unless asked not to (debug auto-login of a second instance)
          activeId: editId
            ? prev
              ? prev.activeId
              : targetId
            : activate || !prev
              ? targetId
              : prev.activeId,
        }
        saveStore(nextStore)
        setStore(nextStore)
        engine.reset(targetId)
        patchSession(targetId, { status: s, offline: false, lastProbeOk: true })
        return true
      } catch (e: any) {
        const msg =
          e?.status === 403 || e?.status === 401
            ? i18n.t('login.badCredentials')
            : e?.message || i18n.t('login.cannotConnect')
        setError(msg)
        return false
      } finally {
        setConnecting(false)
      }
    },
    [engine, patchSession]
  )

  const removeInstance = useCallback(
    (id: string) => {
      const prev = storeRef.current
      if (!prev) return
      const remaining = prev.instances.filter((x) => x.id !== id)
      if (remaining.length) {
        const next: InstanceStoreData = {
          instances: remaining,
          activeId: prev.activeId === id ? remaining[0].id : prev.activeId,
        }
        saveStore(next)
        setStore(next)
      } else {
        // Last instance gone: also drop the migrated v1 copy or a fresh load
        // would resurrect the deleted config
        clearStore()
        setStore(null)
        setSessions({})
        engine.clear()
        return
      }
      setSessions((s) => {
        const n = { ...s }
        delete n[id]
        return n
      })
      engine.drop(id)
    },
    [engine]
  )

  const logout = useCallback(() => {
    clearStore()
    setStore(null)
    setSessions({})
    engine.clear()
    setError(null)
  }, [engine])

  const refreshStatus = useCallback((): Promise<Status | null> => {
    if (!activeInst || !activeEp) return Promise.resolve(null)
    return fetchStatus(activeEp).then((s) => {
      patchSession(activeInst.id, {
        status: s ?? sessionsRef.current[activeInst.id]?.status ?? null,
        offline: s === null,
        lastProbeOk: s !== null,
      })
      return s
    })
  }, [activeInst, activeEp, fetchStatus, patchSession])

  const refreshActiveData = useCallback((): Promise<unknown> => {
    return activeEp ? mutateInstanceData(activeEp) : Promise.resolve()
  }, [activeEp])

  const setTheme = useCallback((t: ThemeSetting) => {
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch {
      /* Storage unavailable (private mode etc.): still applies for this session */
    }
    applyTheme(t)
    setThemeState(t)
  }, [])

  const value = useMemo(
    () => ({
      cfg, status, offline, connecting, error, theme, setTheme,
      instances, store, activeId: store?.activeId ?? null,
      switchInstance, connect, removeInstance, logout,
      probeAll: (force = true) => probeAll(force),
      refreshActiveData, refreshStatus,
    }),
    [cfg, status, offline, connecting, error, theme, setTheme, instances, store, switchInstance, connect, removeInstance, logout, probeAll, refreshActiveData, refreshStatus]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  return useContext(Ctx)
}
