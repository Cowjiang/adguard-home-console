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
