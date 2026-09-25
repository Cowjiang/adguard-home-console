/** Desktop sidebar root routes; only sub-pages have back semantics, used by
 *  PageHeader (desktop hides the back capsule) */
export const TOP_LEVEL_ROUTES = ['/', '/stats', '/protection', '/logs', '/clients', '/settings']

/**
 * Mobile tab root routes (the 4 tabs of the iOS native TabBar / Web floating
 * tab bar). "Is a tab root" decides three things on mobile: no back button,
 * no top status pill, no transition on push landing; `/clients` and `/stats`
 * are desktop-only roots — on mobile they follow sub-page semantics.
 */
export const TAB_ROOT_ROUTES = ['/', '/protection', '/logs', '/settings']
