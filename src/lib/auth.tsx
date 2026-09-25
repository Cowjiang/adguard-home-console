/**
 * Global session and theme: server config, login state, theme switching
 */
import { applyNativeAppearance } from './nativeAppearance'
import { i18n } from './i18n'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { mutate } from 'swr'
import { api, type Status } from './api'

export interface SvrConfig {
  url: string
  username: string
  password: string
}

const CONFIG_KEY = 'agh.console.cfg.v1'
const THEME_KEY = 'agh.console.theme.v1'
/** /status probe deadline: offline, the proxy layer takes 25s to report
 *  timeout, so the probe must conclude within 5s */
const PROBE_TIMEOUT_MS = 5000

export type ThemeSetting = 'auto' | 'dark' | 'light'

interface AuthCtx {
  cfg: SvrConfig | null
  status: Status | null
  /** Latest /status probe failed and has not succeeded since: the service
   *  is offline; single source of truth for TopBar/mask */
  offline: boolean
  connecting: boolean
  error: string | null
  theme: ThemeSetting
  setTheme: (t: ThemeSetting) => void
  connect: (cfg: SvrConfig) => Promise<boolean>
  logout: () => void
  refreshStatus: () => Promise<Status | null>
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)

function loadCfg(): SvrConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const c = JSON.parse(raw)
    if (c?.url && c?.username) return c
  } catch {
    /* ignore */
  }
  return null
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
  const [cfg, setCfg] = useState<SvrConfig | null>(loadCfg)
  const [status, setStatus] = useState<Status | null>(null)
  const [offline, setOffline] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [theme, setThemeState] = useState<ThemeSetting>(loadTheme)

  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener('change', () => applyTheme(theme))
    return () => mq?.removeEventListener('change', () => applyTheme(theme))
  }, [theme])

  // Fast-fail /status probe: offline, the proxy layer takes 25s to time out
  // and the probe doesn't wait — pull-to-refresh, the offline mask and the 15s
  // self-heal all need a prompt verdict. A timeout resolves null as failure;
  // the background request is left to finish on its own
  const fetchStatus = useCallback(async (c: SvrConfig): Promise<Status | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        api<Status>(c, '/status'),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), PROBE_TIMEOUT_MS)
        }),
      ])
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }, [])

  // Startup probe and offline self-heal re-probe are one: online/visibility
  // events can be lost in WKWebView/PWA (root cause of frozen polling, see
  // proposals/feature/2026-09-25-refresh-triggers), so besides immediate
  // event probes keep a low-frequency 15s re-probe; the probe result maintains
  // offline (source of truth for the offline mask and status pill), and on
  // recovery from failure a single global mutate rescues keys frozen by the
  // SWR online flag and restores the status pill/protection card to reality.
  // When healthy the cost is one /status per 15s (vs stats polling every 5s).
  const lastProbeOk = useRef(false)
  const probingRef = useRef(false)
  const probeStatus = useCallback(async () => {
    if (!cfg || probingRef.current) return
    probingRef.current = true
    try {
      const s = await fetchStatus(cfg)
      const ok = s !== null
      const recovered = ok && !lastProbeOk.current
      lastProbeOk.current = ok
      setOffline(!ok)
      if (s) setStatus(s)
      if (recovered) void mutate(() => true)
    } finally {
      probingRef.current = false
    }
  }, [cfg, fetchStatus])

  useEffect(() => {
    if (!cfg) {
      lastProbeOk.current = false
      setOffline(false)
      return
    }
    void probeStatus()
    const id = setInterval(() => void probeStatus(), 15000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void probeStatus()
    }
    const onOnline = () => void probeStatus()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [probeStatus])

  const connect = useCallback(
    async (next: SvrConfig): Promise<boolean> => {
      setConnecting(true)
      setError(null)
      const clean: SvrConfig = {
        ...next,
        url: next.url.replace(/\/+$/, ''),
      }
      try {
        const s = await api<Status>(clean, '/status')
        if (!s || !s.version) throw new Error(i18n.t('login.notAgh'))
        localStorage.setItem(CONFIG_KEY, JSON.stringify(clean))
        setCfg(clean)
        setStatus(s)
        setOffline(false)
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
    []
  )

  const logout = useCallback(() => {
    localStorage.removeItem(CONFIG_KEY)
    setCfg(null)
    setStatus(null)
    setOffline(false)
    setError(null)
  }, [])

  const refreshStatus = useCallback((): Promise<Status | null> => {
    if (!cfg) return Promise.resolve(null)
    return fetchStatus(cfg).then((s) => {
      setOffline(s === null)
      setStatus(s)
      return s
    })
  }, [cfg, fetchStatus])

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
    () => ({ cfg, status, offline, connecting, error, theme, setTheme, connect, logout, refreshStatus }),
    [cfg, status, offline, connecting, error, theme, setTheme, connect, logout, refreshStatus]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  return useContext(Ctx)
}
