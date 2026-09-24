/** 路由与全局守卫 */
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { SWRConfig, type SWRConfiguration } from 'swr'
import { AuthProvider, useAuth } from './lib/auth'
import { SheetProvider, Spinner } from './components/ui'
import { ToastHost } from './components/ui'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import StatsPage from './pages/StatsPage'
import TopListPage from './pages/TopListPage'
import QueryLog from './pages/QueryLog'
import LogDetailPage from './pages/LogDetailPage'
import ClientDetailPage from './pages/ClientDetailPage'
import ClientFormPage from './pages/ClientFormPage'
import Protection from './pages/Protection'
import Clients from './pages/Clients'
import Settings, { GeneralSettings, SystemPage, AppearanceSettings, ServerSettings, AboutSettings } from './pages/Settings'
import { FiltersPage, RulesPage, ServicesPage, RewritesPage, CheckHostPage } from './pages/FiltersPages'
import { DnsSettings, AccessSettings, EncryptionSettings, DhcpSettings } from './pages/AdvancedSettings'

function Protected({ children }: { children: React.ReactNode }) {
  const { cfg } = useAuth()
  if (!cfg) return <Navigate to="/login" replace />
  return <>{children}</>
}

function LoginRoute() {
  const { cfg } = useAuth()
  if (cfg) return <Navigate to="/" replace />
  return <Login />
}

/** 调试自动登录(Tauri debug 壳):常驻组件,连接成功后跳 AGH_ROUTE 指定路由;
 *  放在 App 层避免 Login 卸载导致 navigate 失效;release 壳/浏览器该命令返回 null */
function DebugAutoLogin() {
  const { cfg, connect } = useAuth()
  const nav = useNavigate()
  useEffect(() => {
    if (cfg) return
    const invoke = (
      window as unknown as { __TAURI_INTERNALS__?: { invoke?: (cmd: string) => Promise<unknown> } }
    ).__TAURI_INTERNALS__?.invoke
    if (!invoke) return
    invoke('get_debug_login')
      .then((d) => {
        const c = d as {
          url?: string
          username?: string
          password?: string
          autoconnect?: boolean
          route?: string | null
        } | null
        if (!c?.autoconnect || !c.url || !c.username) return
        void connect({ url: c.url, username: c.username, password: c.password || '' }).then((ok) => {
          if (ok) nav(c.route || '/', { replace: true })
        })
      })
      .catch(() => {})
  }, [cfg, connect, nav])
  return null
}

/** SWR 全局配置:refreshWhenOffline 让轮询不被内部在线标志停摆。SWR 不读
 *  navigator.onLine,只认 offline/online 窗口事件,iOS WKWebView/PWA 里事件
 *  可能丢失,标志卡在 false 后轮询/focus/reconnect/错误重试会被同一标志全部
 *  门死(见 .agents/pipelines/proposals/feature/2026-09-25-refresh-triggers.md) */
const SWR_GLOBAL: SWRConfiguration = {
  revalidateOnReconnect: true,
  refreshWhenOffline: true,
}

export default function App() {
  return (
    <SWRConfig value={SWR_GLOBAL}>
      <AuthProvider>
      <SheetProvider>
        <BrowserRouter>
          <DebugAutoLogin />
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route element={<Protected><Layout /></Protected>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/top/:kind" element={<TopListPage />} />
              <Route path="/log" element={<QueryLog />} />
              <Route path="/log/detail" element={<LogDetailPage />} />
              <Route path="/protection" element={<Protection />} />
              <Route path="/protection/filters" element={<FiltersPage whitelist={false} />} />
              <Route path="/protection/allowlist" element={<FiltersPage whitelist />} />
              <Route path="/protection/rules" element={<RulesPage />} />
              <Route path="/protection/services" element={<ServicesPage />} />
              <Route path="/protection/check" element={<CheckHostPage />} />
              <Route path="/rewrites" element={<RewritesPage />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/clients/detail" element={<ClientDetailPage />} />
              <Route path="/clients/form" element={<ClientFormPage />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/general" element={<GeneralSettings />} />
              <Route path="/settings/dns" element={<DnsSettings />} />
              <Route path="/settings/access" element={<AccessSettings />} />
              <Route path="/settings/encryption" element={<EncryptionSettings />} />
              <Route path="/settings/dhcp" element={<DhcpSettings />} />
              <Route path="/settings/system" element={<SystemPage />} />
              <Route path="/settings/appearance" element={<AppearanceSettings />} />
              <Route path="/settings/server" element={<ServerSettings />} />
              <Route path="/settings/about" element={<AboutSettings />} />
              <Route path="/settings/app" element={<Navigate to="/settings" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <ToastHost />
        </BrowserRouter>
      </SheetProvider>
    </AuthProvider>
    </SWRConfig>
  )
}

export { Spinner }
