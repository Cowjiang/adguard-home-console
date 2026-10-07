/** Global layout: ambient background + mobile floating glass tab bar /
 *  desktop fixed sidebar (≥lg) */
import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/session/auth'
import { usePullToRefresh } from '../../lib/pullToRefresh'
import { useNativeTabBar } from '../../lib/native/nativeTabbar'
import { useNativeBackButton } from '../../lib/native/nativeBackButton'
import { TransitionArea } from '../../lib/routeTransition'
import { useIsDesktop } from '../../lib/useIsDesktop'
import { TAB_ROOT_ROUTES } from '../../lib/nav/routes'
import { Spinner } from '../ui/atoms'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { TabBar } from './TabBar'
import { OfflineNotice } from './OfflineNotice'

export function Ambient() {
  return <div className="ambient" />
}

/** Refresh server status once when landing on a tab root: SWR data revalidates on remount,
 *  but status is not SWR-managed (updated only at startup and by the self-heal probe),
 *  so add the navigation trigger here */
function useTabLandStatusRefresh() {
  const { pathname } = useLocation()
  const { refreshStatus } = useAuth()
  useEffect(() => {
    if (TAB_ROOT_ROUTES.includes(pathname)) refreshStatus()
  }, [pathname, refreshStatus])
}

/** Offline, the proxy layer only reports a timeout after 25s; the refresh indicator does
 *  not wait: it closes at the deadline, and the failed request's result lands afterwards
 *  (the /status probe already concludes offline within 5s) */
const REFRESH_DEADLINE_MS = 8000

export default function Layout() {
  // iOS Tauri shell: the native liquid-glass UITabBar takes over navigation, the CSS
  // tab bar steps aside
  const nativeBar = useNativeTabBar()
  // Mobile layout with a native TabBar available: the top-left back button goes to the
  // native glass capsule (createComponent glass)
  const isDesktop = useIsDesktop()
  useNativeBackButton(nativeBar && !isDesktop)
  useTabLandStatusRefresh()
  // Pull-to-refresh: active /status re-probe + all instances' badges + only the
  // active instance's SWR keys (multi-instance: no N× data refetch); only on
  // mobile layout, coarse-pointer (touch) devices, and tab root pages
  // (secondary pages opt out). mutate uses the global binding (default cache),
  // not the SWRConfig context
  const { refreshStatus, refreshActiveData, probeAll, offline } = useAuth()
  const { pathname } = useLocation()
  const [coarse] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false)
  const isTabRoot = TAB_ROOT_ROUTES.includes(pathname)
  const refreshAll = useCallback((): Promise<unknown> => {
    const work = Promise.allSettled([refreshStatus(), Promise.resolve(probeAll()), refreshActiveData()])
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), REFRESH_DEADLINE_MS)
    })
    return Promise.race([work, deadline]).finally(() => clearTimeout(timer))
  }, [refreshStatus])
  const { contentRef, indicatorRef, refreshing } = usePullToRefresh(
    refreshAll,
    !isDesktop && coarse && isTabRoot
  )
  return (
    <div className="min-h-dvh lg:pl-60">
      <Ambient />
      <Sidebar />
      <TopBar dimmed={refreshing} />
      <main>
        <div ref={contentRef}>
          <TransitionArea />
        </div>
      </main>
      {/* Settings root page is exempt from the overlay: it hosts "server connection" and
          app settings; offline, the user may need to change the server address, so the
          Settings page hides the server-dependent entry groups instead */}
      {offline && isTabRoot && pathname !== '/settings' && (
        <OfflineNotice onRetry={refreshAll} />
      )}
      {/* Pull-to-refresh indicator: anchored at safe+16 (the whitespace band right below
          the pill), 12px above the card top (safe+64); tracks the finger 1:1; when
          refreshing, content bounces back and the ring spins at its base position; kept
          out of the transition snapshot pipeline — transform is reserved for finger
          tracking, centered with a negative margin */}
      <div
        ref={indicatorRef}
        aria-hidden
        className="glass pointer-events-none fixed left-1/2 z-30 grid h-9 w-9 place-items-center rounded-full opacity-0"
        style={{ top: 'calc(var(--safe-top) + 16px)', marginLeft: '-18px' }}
      >
        <Spinner size={18} />
      </div>
      {!nativeBar && <TabBar />}
    </div>
  )
}
