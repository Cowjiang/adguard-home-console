/**
 * Settings layout container.
 * In desktop split view (>= 1024px), renders a sticky secondary sidebar
 * (SettingsNav) on the left and child routes via Outlet on the right.
 * On mobile (< 1024px), renders Outlet directly, preserving the mobile
 * hub and slide-push/pop transitions.
 */
import { Outlet, Navigate } from 'react-router-dom'
import { useIsDesktop } from '../../lib/useIsDesktop'
import { useAuth } from '../../lib/session/auth'
import Settings from '../../pages/Settings'
import { SettingsNav } from './SettingsNav'

export function SettingsLayout() {
  const isDesktop = useIsDesktop()

  if (!isDesktop) {
    return <Outlet />
  }

  return (
    <div className="mx-auto flex max-w-[1160px] items-start gap-8 px-4 pb-[56px] pt-[44px]">
      <aside className="sticky top-[44px] w-56 shrink-0">
        <SettingsNav />
      </aside>
      <div className="min-w-0 flex-1 [&_.page-shell]:!max-w-none [&_.page-shell]:!p-0">
        <Outlet />
      </div>
    </div>
  )
}

/**
 * Index route resolver for /settings.
 * On desktop, automatically redirects to /settings/general, or
 * /settings/appearance when offline (so the user lands on an available
 * console settings page instead of an unreachable server settings page).
 * On mobile, renders the Settings hub page.
 */
export function SettingsIndexRoute() {
  const isDesktop = useIsDesktop()
  const { offline } = useAuth()
  if (isDesktop) {
    return <Navigate to={offline ? '/settings/appearance' : '/settings/general'} replace />
  }
  return <Settings />
}

export default SettingsLayout
