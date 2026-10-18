/** Desktop sidebar root routes; only sub-pages have back semantics, used by
 *  PageHeader (desktop hides the back capsule) */
export const TOP_LEVEL_ROUTES = ['/', '/protection', '/logs', '/clients', '/settings']

/**
 * Mobile tab root routes (the 4 tabs of the iOS native TabBar / Web floating
 * tab bar). "Is a tab root" decides three things on mobile: no back button,
 * no top status pill, no transition on push landing; `/clients` is a
 * desktop-only root — on mobile it follows sub-page semantics.
 */
export const TAB_ROOT_ROUTES = ['/', '/protection', '/logs', '/settings']

/**
 * Settings sub-pages that keep back semantics even in the desktop split
 * layout (secondary-sidebar navigation still applies, but they are pushed
 * detail views rather than nav destinations).
 */
const DESKTOP_SETTINGS_BACK_SUBPAGES = [
  '/settings/server/edit',
  '/settings/snapshots/diff',
  '/settings/dns/benchmark',
  '/settings/about/update',
]

/**
 * In desktop split layout, settings sub-pages (except the pushed detail
 * sub-pages above) have top-level semantics where the secondary sidebar
 * handles navigation.
 */
export function isDesktopSettingsTopLevel(pathname: string, isDesktop: boolean): boolean {
  return (
    isDesktop &&
    pathname.startsWith('/settings/') &&
    !DESKTOP_SETTINGS_BACK_SUBPAGES.includes(pathname)
  )
}

/**
 * Determines whether a settings nav item should be considered active: a route
 * matches itself and its pushed sub-routes (e.g. `/settings/server/edit`,
 * `/settings/dns/benchmark`).
 */
export function isSettingsNavActive(to: string, pathname: string): boolean {
  return pathname === to || pathname.startsWith(to + '/')
}
