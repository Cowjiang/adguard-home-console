/** Global layout: ambient background + mobile floating glass tab bar /
 *  desktop fixed sidebar (≥lg) */
import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { mutate } from 'swr'
import { BarChart3, Home, ListFilter, ScrollText, Settings2, ShieldCheck, Users, WifiOff } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { usePullToRefresh } from '../lib/pullToRefresh'
import { scrollToTop } from '../lib/scrollToTop'
import { useNativeTabBar } from '../lib/nativeTabbar'
import { useNativeBackButton } from '../lib/nativeBackButton'
import { TransitionArea, useArrivalPopAnim } from '../lib/routeTransition'
import { useIsDesktop } from '../lib/useIsDesktop'
import { APP_NAME } from '../lib/constants'
import { TOP_LEVEL_ROUTES, TAB_ROOT_ROUTES, NavScrim, Spinner, EmptyState, Button } from './ui'

type NavItem = { to: string; labelKey: 'nav.overview' | 'nav.protection' | 'nav.log' | 'nav.settings' | 'nav.stats' | 'nav.clients'; icon: typeof Home; match?: string[] }

const TABS: NavItem[] = [
  { to: '/', labelKey: 'nav.overview', icon: Home },
  { to: '/protection', labelKey: 'nav.protection', icon: ListFilter },
  { to: '/logs', labelKey: 'nav.log', icon: ScrollText },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings2 },
]

const DESK_NAV: NavItem[] = [
  ...TABS.slice(0, 1),
  { to: '/stats', labelKey: 'nav.stats', icon: BarChart3 },
  ...TABS.slice(1, 3),
  { to: '/clients', labelKey: 'nav.clients', icon: Users, match: ['/clients', '/rewrites'] },
  TABS[3],
]

function navActive(pathname: string, to: string, match?: string[]) {
  if (match) return match.some((m) => pathname.startsWith(m))
  return to === '/' ? pathname === '/' : pathname.startsWith(to)
}

export function Ambient() {
  return <div className="ambient" />
}

/** Floating status pill (mobile tab root pages only: secondary pages are headed by the fixed
 *  nav bar, see docs/web-interaction.md). Fades out during pull-to-refresh: the refresh
 *  whitespace band is where the indicator sits, the pill would overlap the circle */
function TopBar({ dimmed }: { dimmed?: boolean }) {
  const { status, offline } = useAuth()
  const { t } = useTranslation()
  const { pathname } = useLocation()
  // CSS snapshot transition pop back onto a tab root: fade in synced with the page's
  // rt-pop-in — the pill is covered by the z-50 exit snapshot and gradually revealed as
  // it slides away, so a pure fade has no hard cut; on swipe-commit / no-anim back the
  // page lands instantly and the pill must too, so no fade. data-status-pill lets the
  // transition snapshot capture it
  const popIn = useArrivalPopAnim(pathname)
  const protected_ = status?.protection_enabled
  const offlinePill = offline || !status?.running
  if (!TAB_ROOT_ROUTES.includes(pathname)) return null
  return (
    <header
      data-status-pill
      className={`pointer-events-none fixed left-0 right-0 top-0 z-40 flex justify-center px-4 lg:hidden ${popIn ? 'rt-pill-in' : ''}`}
      style={{
        paddingTop: 'calc(var(--safe-top) + 6px)',
        opacity: dimmed ? 0 : 1,
        transition: 'opacity 200ms ease',
      }}
    >
      <NavScrim />
      <div className="glass-nav relative flex items-center gap-2 rounded-full px-3.5 py-1.5">
        <span
          className={`h-2 w-2 rounded-full ${protected_ && !offlinePill ? 'pulse-dot' : ''}`}
          style={{ background: !offlinePill && protected_ ? 'var(--ok)' : 'var(--danger)' }}
        />
        <span className="text-[12px] font-semibold text-t1">
          {offlinePill ? t('nav.statusOffline') : protected_ ? t('nav.statusOn') : t('nav.statusOff')}
        </span>
        <span className="h-3 w-px" style={{ background: 'var(--glass-border-strong)' }} />
        <span className="text-[12px] text-t3">{APP_NAME}</span>
      </div>
    </header>
  )
}

function TabBar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const activeIdx = Math.max(
    0,
    TABS.findIndex((t) => (t.to === '/' ? pathname === '/' : pathname.startsWith(t.to)))
  )
  const barRef = useRef<HTMLDivElement>(null)
  const lensRef = useRef<HTMLDivElement>(null)

  // iOS 26/27 feel: on tap the lens stretches along the move axis, the bar does a
  // rubber-band bounce
  const playBounce = () => {
    const ease = 'cubic-bezier(0.3, 1.1, 0.4, 1)'
    barRef.current?.animate(
      [
        { transform: 'scale(1, 1)' },
        { transform: 'scale(1.014, 0.99)', offset: 0.35 },
        { transform: 'scale(1, 1)' },
      ],
      { duration: 380, easing: ease }
    )
    lensRef.current?.animate(
      [
        { transform: 'scale(1, 1)' },
        { transform: 'scale(1.07, 0.97)', offset: 0.35 },
        { transform: 'scale(1, 1)' },
      ],
      { duration: 440, easing: ease }
    )
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex justify-center px-4 lg:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}
    >
      <div
        ref={barRef}
        className="glass-nav relative flex w-full max-w-[500px] items-stretch rounded-full px-1.5 py-1.5"
        style={{ transformOrigin: '50% 88%' }}
      >
        {/* Sliding glass lens: the selected item reads as a raised piece of glass */}
        <div
          className="tab-lens-track absolute inset-y-1.5 left-1.5"
          aria-hidden
          style={{
            width: `calc((100% - 12px) / ${TABS.length})`,
            transform: `translateX(${activeIdx * 100}%)`,
          }}
        >
          <div ref={lensRef} className="tab-lens h-full w-full" style={{ transformOrigin: '50% 55%' }} />
        </div>
        {TABS.map(({ to, labelKey, icon: Icon }) => {
          const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              replace
              onClick={() => {
                playBounce()
                // iOS feel: tapping the active tab again scrolls to top (cross-tab nav
                // is left alone)
                if (isActive) scrollToTop()
              }}
              className={({ isActive }) =>
                `relative z-10 flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 transition-colors duration-300 ${
                  isActive ? 'text-accent' : 'text-t1'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={21} strokeWidth={isActive ? 2.3 : 1.9} />
                  <span className="text-[10.5px] font-semibold tracking-wide">{t(labelKey)}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

/** Desktop sidebar (≥lg): solid panel continuing the dark design system; hosts the
 *  protection status at the bottom */
function Sidebar() {
  const { pathname } = useLocation()
  const { status, offline } = useAuth()
  const { t } = useTranslation()
  const protected_ = status?.protection_enabled
  const offlinePill = offline || !status?.running
  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col px-3 py-5 lg:flex"
      style={{ background: 'var(--bg-elevated)', borderRight: '1px solid var(--glass-border)' }}
    >
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <ShieldCheck size={20} strokeWidth={2.1} />
        </div>
        <div className="min-w-0">
          <div className="text-[14.5px] font-bold leading-tight text-t1">AdGuard Home</div>
          <div className="text-[11.5px] text-t3">Console</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        {DESK_NAV.map(({ to, labelKey, icon: Icon, match }) => {
          const active = navActive(pathname, to, match)
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={`press flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors ${
                active ? 'text-accent' : 'text-t2 hover:bg-white/[0.04] hover:text-t1'
              }`}
              style={active ? { background: 'var(--accent-soft)' } : undefined}
            >
              <Icon size={19} strokeWidth={active ? 2.3 : 1.9} />
              {t(labelKey)}
            </NavLink>
          )
        })}
      </nav>
      <div className="flex-1" />
      <div className="glass flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
        <span
          className={`h-2 w-2 flex-none rounded-full ${!offlinePill && protected_ ? 'pulse-dot' : ''}`}
          style={{ background: offlinePill ? 'var(--t3)' : protected_ ? 'var(--ok)' : 'var(--danger)' }}
        />
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-t1">
            {offlinePill ? t('nav.statusOffline') : protected_ ? t('nav.statusOn') : t('nav.statusOff')}
          </div>
          <div className="num text-[11px] text-t3">{APP_NAME}</div>
        </div>
      </div>
    </aside>
  )
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

/** Offline overlay: covers the content area only on tab root pages so stale data is no
 *  longer visible; secondary pages are not covered (protects form input; offline is
 *  sensed via the status pill and operation errors). z-20 sits below the pull indicator
 *  (z-30) and the TabBar / status pill (z-40), so pull-to-refresh remains a usable retry
 *  while offline */
function OfflineNotice({ onRetry }: { onRetry: () => unknown }) {
  const { t } = useTranslation()
  const [retrying, setRetrying] = useState(false)
  // Shares the refreshAll chain with pull-to-refresh (8s deadline): the button spins
  // until the chain settles
  const retry = () => {
    if (retrying) return
    setRetrying(true)
    void Promise.resolve(onRetry()).catch(() => {}).finally(() => setRetrying(false))
  }
  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center px-8 lg:left-60"
      style={{ background: 'var(--bg)' }}
    >
      <div className="flex flex-col items-center">
        <EmptyState
          icon={<WifiOff size={38} className="text-t3" />}
          title={t('nav.statusOffline')}
          subtitle={t('nav.offlineHint')}
        />
        <Button variant="glass" size="sm" className="mt-2" loading={retrying} onClick={retry}>
          {t('common.retryNow')}
        </Button>
      </div>
    </div>
  )
}

export default function Layout() {
  // iOS Tauri shell: the native liquid-glass UITabBar takes over navigation, the CSS
  // tab bar steps aside
  const nativeBar = useNativeTabBar()
  // Mobile layout with a native TabBar available: the top-left back button goes to the
  // native glass capsule (createComponent glass)
  const isDesktop = useIsDesktop()
  useNativeBackButton(nativeBar && !isDesktop)
  useTabLandStatusRefresh()
  // Pull-to-refresh: status re-probe + full SWR revalidation; only on mobile layout,
  // coarse-pointer (touch) devices, and tab root pages (secondary pages opt out).
  // mutate uses the global binding (default cache), not the SWRConfig context
  const { refreshStatus, offline } = useAuth()
  const { pathname } = useLocation()
  const [coarse] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false)
  const isTabRoot = TAB_ROOT_ROUTES.includes(pathname)
  const refreshAll = useCallback((): Promise<unknown> => {
    const work = Promise.allSettled([refreshStatus(), mutate(() => true)])
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
