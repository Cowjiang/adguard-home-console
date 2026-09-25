/**
 * Two-way bridge between the iOS native liquid-glass TabBar
 * (tauri-plugin-system-components) and React routing. Active only inside the
 * Tauri shell; falls back to the Web CSS tab bar on configuration failure
 * (non-iOS/macOS, missing plugin).
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { scrollToTop } from './scrollToTop'

type TabId = 'home' | 'protection' | 'logs' | 'settings'

const TABS: { id: TabId; to: string; titleKey: 'nav.overview' | 'nav.protection' | 'nav.log' | 'nav.settings'; sfSymbol: string }[] = [
  { id: 'home', to: '/', titleKey: 'nav.overview', sfSymbol: 'house.fill' },
  { id: 'protection', to: '/protection', titleKey: 'nav.protection', sfSymbol: 'shield.lefthalf.filled' },
  { id: 'logs', to: '/logs', titleKey: 'nav.log', sfSymbol: 'doc.text.fill' },
  { id: 'settings', to: '/settings', titleKey: 'nav.settings', sfSymbol: 'gearshape.fill' },
]

type TFn = (key: 'nav.overview' | 'nav.protection' | 'nav.log' | 'nav.settings') => string

function tabItems(t: TFn) {
  return TABS.map(({ id, titleKey, sfSymbol }) => ({ id, title: t(titleKey), sfSymbol }))
}

function routeToId(pathname: string): TabId | null {
  if (pathname === '/') return 'home'
  return TABS.find((t) => t.to !== '/' && pathname.startsWith(t.to))?.id ?? null
}

export function isTauriShell(): boolean {
  return !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
}

/** Configure the native TabBar while Layout (protected routes) is mounted;
 *  returns success (decides whether to hide the CSS version) */
export function useNativeTabBar(): boolean {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [active, setActive] = useState(false)
  // onTabSelected listener registered once; pathname in the closure would go
  // stale, so the handler reads the latest route via ref
  const pathnameRef = useRef(pathname)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!isTauriShell()) return
    let disposed = false
    let unregister: (() => Promise<void>) | undefined

    void (async () => {
      try {
        const p = await import('@sosweetham/tauri-plugin-system-components-api')
        await p.configureTabBar({
          items: tabItems(t),
          selectedId: routeToId(pathname) ?? 'home',
          tint: '#34d399',
        })
        // Reserve bottom space for the native bar (bar height + bottom safe area, CSS pt)
        const insets = await p.getTabBarInsets()
        document.documentElement.style.setProperty(
          '--tabbar-space',
          `${Math.ceil(insets.bottom + 24)}px`
        )
        const listener = await p.onTabSelected(({ id }) => {
          const tab = TABS.find((t) => t.id === id)
          if (!tab) return
          // Tapping the current tab again: back to the parent route (sub-pages
          // like /protection/filters → /protection, matching iOS pop-to-root)
          // + smooth scroll to top. UIKit also calls didSelect for a repeated
          // selection — the standard native scroll-to-top hook.
          if (routeToId(pathnameRef.current) === id) {
            if (pathnameRef.current !== tab.to) navigate(tab.to, { replace: true })
            scrollToTop()
            return
          }
          // Tab switches don't enter the history stack (replace); only
          // drill-down pushes — the back swipe follows business hierarchy
          // only, see docs/web-interaction.md
          navigate(tab.to, { replace: true })
        })
        if (disposed) {
          void listener.unregister()
          return
        }
        unregister = () => listener.unregister()
        document.documentElement.dataset.nativeTabbar = '1'
        setActive(true)
      } catch (e) {
        console.warn('[nativeTabbar] 原生 TabBar 不可用,使用 CSS 标签栏:', e)
      }
    })()

    return () => {
      disposed = true
      void unregister?.()
      document.documentElement.style.removeProperty('--tabbar-space')
      delete document.documentElement.dataset.nativeTabbar
      // Remove the native bar when Layout unmounts (logout / back to login)
      import('@sosweetham/tauri-plugin-system-components-api')
        .then((p) => p.removeTabBar())
        .catch(() => {})
    }
    // Configure once on mount only; the initial selection is the current
    // route, kept in sync afterwards by the route-sync effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Language change → re-push native tab titles (repeated configureTabBar
  // is idempotent)
  useEffect(() => {
    if (!active) return
    import('@sosweetham/tauri-plugin-system-components-api')
      .then((p) => p.configureTabBar({ items: tabItems(t), selectedId: routeToId(pathnameRef.current) ?? 'home', tint: '#34d399' }))
      .catch(() => {})
    // Triggered only on language change; pathname handled by the effect above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t])

  // Route change → sync native bar selection (native tap → navigate →
  // selectTab here is a harmless loop, fires no event)
  useEffect(() => {
    if (!active) return
    const id = routeToId(pathname)
    if (!id) return
    import('@sosweetham/tauri-plugin-system-components-api')
      .then((p) => p.selectTab(id))
      .catch(() => {})
  }, [pathname, active])

  return active
}
