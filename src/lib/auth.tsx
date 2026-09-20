/**
 * 全局会话与主题:服务器配置、登录状态、主题切换
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, type Status } from './api'

export interface SvrConfig {
  url: string
  username: string
  password: string
}

const CONFIG_KEY = 'agh.console.cfg.v1'
const THEME_KEY = 'agh.console.theme.v1'

export type ThemeSetting = 'auto' | 'dark' | 'light'

interface AuthCtx {
  cfg: SvrConfig | null
  status: Status | null
  connecting: boolean
  error: string | null
  theme: ThemeSetting
  setTheme: (t: ThemeSetting) => void
  connect: (cfg: SvrConfig) => Promise<boolean>
  logout: () => void
  refreshStatus: () => void
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
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<SvrConfig | null>(loadCfg)
  const [status, setStatus] = useState<Status | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [theme, setThemeState] = useState<ThemeSetting>(loadTheme)

  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener('change', () => applyTheme(theme))
    return () => mq?.removeEventListener('change', () => applyTheme(theme))
  }, [theme])

  const fetchStatus = useCallback(async (c: SvrConfig): Promise<Status | null> => {
    try {
      return await api<Status>(c, '/status')
    } catch {
      return null
    }
  }, [])

  // 启动时用已存配置探测连接
  useEffect(() => {
    if (!cfg) return
    fetchStatus(cfg).then((s) => setStatus(s))
  }, [cfg, fetchStatus])

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
        if (!s || !s.version) throw new Error('响应不是 AdGuard Home')
        localStorage.setItem(CONFIG_KEY, JSON.stringify(clean))
        setCfg(clean)
        setStatus(s)
        return true
      } catch (e: any) {
        const msg =
          e?.status === 403 || e?.status === 401
            ? '用户名或密码错误'
            : e?.message || '无法连接到服务器'
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
    setError(null)
  }, [])

  const refreshStatus = useCallback(() => {
    if (cfg) fetchStatus(cfg).then((s) => setStatus(s))
  }, [cfg, fetchStatus])

  const setTheme = useCallback((t: ThemeSetting) => {
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch {
      /* 存储不可用(隐私模式等):本次会话内仍然生效 */
    }
    applyTheme(t)
    setThemeState(t)
  }, [])

  const value = useMemo(
    () => ({ cfg, status, connecting, error, theme, setTheme, connect, logout, refreshStatus }),
    [cfg, status, connecting, error, theme, setTheme, connect, logout, refreshStatus]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  return useContext(Ctx)
}
