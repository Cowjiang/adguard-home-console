/** 路由与全局守卫 */
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigationType } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { SheetProvider, Spinner } from './components/ui'
import { ToastHost } from './components/ui'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import StatsPage from './pages/StatsPage'
import TopListPage from './pages/TopListPage'
import QueryLog from './pages/QueryLog'
import Protection from './pages/Protection'
import Clients from './pages/Clients'
import Settings, { GeneralSettings, SystemPage, AppSettings } from './pages/Settings'
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

/** 前进/跳转导航时回到页面顶部;浏览器返回(POP)保留原滚动位置 */
function ScrollToTop() {
  const { pathname } = useLocation()
  const navType = useNavigationType()
  useEffect(() => {
    if (navType !== 'POP') window.scrollTo(0, 0)
  }, [pathname, navType])
  return null
}

export default function App() {
  return (
    <AuthProvider>
      <SheetProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route element={<Protected><Layout /></Protected>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/top/:kind" element={<TopListPage />} />
              <Route path="/log" element={<QueryLog />} />
              <Route path="/protection" element={<Protection />} />
              <Route path="/protection/filters" element={<FiltersPage whitelist={false} />} />
              <Route path="/protection/allowlist" element={<FiltersPage whitelist />} />
              <Route path="/protection/rules" element={<RulesPage />} />
              <Route path="/protection/services" element={<ServicesPage />} />
              <Route path="/protection/check" element={<CheckHostPage />} />
              <Route path="/rewrites" element={<RewritesPage />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/general" element={<GeneralSettings />} />
              <Route path="/settings/dns" element={<DnsSettings />} />
              <Route path="/settings/access" element={<AccessSettings />} />
              <Route path="/settings/encryption" element={<EncryptionSettings />} />
              <Route path="/settings/dhcp" element={<DhcpSettings />} />
              <Route path="/settings/system" element={<SystemPage />} />
              <Route path="/settings/app" element={<AppSettings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <ToastHost />
        </BrowserRouter>
      </SheetProvider>
    </AuthProvider>
  )
}

export { Spinner }
