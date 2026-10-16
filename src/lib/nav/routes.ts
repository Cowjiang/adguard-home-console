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
 * In desktop split layout, settings sub-pages (except deep sub-pages like /settings/server/edit)
 * have top-level semantics where the secondary sidebar handles navigation.
 */
export function isDesktopSettingsTopLevel(pathname: string, isDesktop: boolean): boolean {
  return isDesktop && pathname.startsWith('/settings/') && pathname !== '/settings/server/edit'
}

/**
 * Determines whether a settings nav item should be considered active.
 * For `/settings/server`, matches `/settings/server` and its sub-routes (e.g. `/settings/server/edit`).
 * For other routes, exact match is required.
 */
export function isSettingsNavActive(to: string, pathname: string): boolean {
  return to === '/settings/server' ? pathname.startsWith('/settings/server') : pathname === to
}
