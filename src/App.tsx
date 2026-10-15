/** Routing and global guards */
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { SWRConfig, type SWRConfiguration } from 'swr'
import { AuthProvider, useAuth } from './lib/session/auth'
import { getTauriInvoke } from './lib/native/shell'
import { SheetProvider } from './components/ui/sheet'
import { Spinner } from './components/ui/atoms'
import { ToastHost } from './components/ui/toast'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TopListPage from './pages/TopListPage'
import QueryLog from './pages/QueryLog'
import LogDetailPage from './pages/LogDetailPage'
import ClientDetailPage from './pages/ClientDetailPage'
import ClientFormPage from './pages/ClientFormPage'
import Protection from './pages/Protection'
import Clients from './pages/Clients'
import Settings from './pages/Settings'
import { GeneralSettings } from './pages/settings/GeneralSettings'
import { SystemPage } from './pages/settings/SystemSettings'
import { AppearanceSettings } from './pages/settings/AppearanceSettings'
import { ServerSettings } from './pages/settings/InstanceList'
import { InstanceEdit } from './pages/settings/InstanceEdit'
import { AboutSettings } from './pages/settings/AboutSettings'
import { SnapshotSettings } from './pages/settings/SnapshotSettings'
import { FiltersPage, RulesPage, ServicesPage, RewritesPage, CheckHostPage } from './pages/FiltersPages'
import { DnsSettings } from './pages/settings/DnsSettings'
import { AccessSettings } from './pages/settings/AccessSettings'
import { EncryptionSettings } from './pages/settings/EncryptionSettings'
import { DhcpSettings } from './pages/settings/DhcpSettings'

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

/** Debug auto-login (Tauri debug shell): an always-mounted component; after a
 *  successful connect it jumps to the route given by AGH_ROUTE. Kept at the
 *  App layer so Login unmounting cannot invalidate navigate; the command
 *  returns null in the release shell / browser */
function DebugAutoLogin() {
  const { cfg, connect } = useAuth()
  const nav = useNavigate()
  useEffect(() => {
    if (cfg) return
    const invoke = getTauriInvoke()
    if (!invoke) return
    invoke('get_debug_login')
      .then((d) => {
        const c = d as {
          url?: string
          username?: string
          password?: string
          autoconnect?: boolean
          route?: string | null
          second?: { url?: string; username?: string; password?: string } | null
        } | null
        if (!c?.autoconnect || !c.url || !c.username) return
        void (async () => {
          if (!(await connect({ url: c.url!, username: c.username!, password: c.password || '' }))) return
          // Optional second instance for multi-instance acceptance runs; the
          // primary stays active
          if (c.second?.url && c.second.username) {
            await connect(
              { url: c.second.url, username: c.second.username, password: c.second.password || '' },
              { activate: false }
            )
          }
          nav(c.route || '/', { replace: true })
        })()
      })
      .catch(() => {})
  }, [cfg, connect, nav])
  return null
}

/** SWR global config: refreshWhenOffline keeps polling from being stalled by
 *  the internal online flag. SWR doesn't read navigator.onLine, only the
 *  offline/online window events; in iOS WKWebView/PWA those events can be
 *  lost, and once the flag sticks at false, polling/focus/reconnect/error
 *  retries are all gated off by that same flag (see
 *  .agents/pipelines/proposals/feature/2026-09-25-refresh-triggers.md) */
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
                {/* Former /stats analysis page merged into the desktop overview;
                    keep stale deep links working */}
                <Route path="/stats" element={<Navigate to="/" replace />} />
                <Route path="/top/:kind" element={<TopListPage />} />
                <Route path="/logs" element={<QueryLog />} />
                <Route path="/logs/detail" element={<LogDetailPage />} />
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
                <Route path="/settings/snapshots" element={<SnapshotSettings />} />
                <Route path="/settings/appearance" element={<AppearanceSettings />} />
                <Route path="/settings/server" element={<ServerSettings />} />
                <Route path="/settings/server/edit" element={<InstanceEdit />} />
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
