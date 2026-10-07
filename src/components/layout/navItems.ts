/** Shared navigation item tables for the CSS tab bar and the desktop sidebar */
import { Home, ListFilter, ScrollText, Settings2, Users } from 'lucide-react'

export type NavItem = { to: string; labelKey: 'nav.overview' | 'nav.protection' | 'nav.log' | 'nav.settings' | 'nav.clients'; icon: typeof Home; match?: string[] }

export const TABS: NavItem[] = [
  { to: '/', labelKey: 'nav.overview', icon: Home },
  { to: '/protection', labelKey: 'nav.protection', icon: ListFilter },
  { to: '/logs', labelKey: 'nav.log', icon: ScrollText },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings2 },
]

export const DESK_NAV: NavItem[] = [
  ...TABS.slice(0, 3),
  { to: '/clients', labelKey: 'nav.clients', icon: Users, match: ['/clients', '/rewrites'] },
  TABS[3],
]

export function navActive(pathname: string, to: string, match?: string[]) {
  if (match) return match.some((m) => pathname.startsWith(m))
  return to === '/' ? pathname === '/' : pathname.startsWith(to)
}
