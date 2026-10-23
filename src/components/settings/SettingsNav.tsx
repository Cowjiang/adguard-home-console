/**
 * Desktop secondary navigation bar for settings.
 * Renders categorized navigation links with active states and update indicators.
 */
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router-dom'
import useSWR from 'swr'
import {
  ScrollText,
  Network,
  Wrench,
  Lock,
  Wifi,
  Layers,
  ShieldQuestion,
  SunMoon,
  Server,
  Info,
} from 'lucide-react'
import { useAuth } from '../../lib/session/auth'
import { fetchSystemVersion, getStoredUpdateChannel, type SystemVersionResponse } from '../../lib/version'
import { isSettingsNavActive } from '../../lib/nav/routes'
import { Badge } from '../ui/atoms'

export function SettingsNav() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { offline } = useAuth()

  // SWR key accounts for the update channel so channel switches isolate/refresh version info
  const { data: versionData } = useSWR<SystemVersionResponse>(
    ['system-version', getStoredUpdateChannel()],
    () => fetchSystemVersion(),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  )
  const hasUpdate = Boolean(versionData?.hasUpdate)

  const serverItems = [
    { icon: <ScrollText size={17} />, color: 'var(--accent-2)', title: t('settings.itemQueryStats'), to: '/settings/general' },
    { icon: <Network size={17} />, color: 'var(--accent)', title: t('settings.itemDns'), to: '/settings/dns' },
    { icon: <Wrench size={17} />, color: 'var(--violet)', title: t('settings.itemAccess'), to: '/settings/access' },
    { icon: <Lock size={17} />, color: 'var(--warn)', title: t('settings.itemEncryption'), to: '/settings/encryption' },
    { icon: <Wifi size={17} />, color: 'var(--ok)', title: t('settings.itemDhcp'), to: '/settings/dhcp' },
    { icon: <Layers size={17} />, color: 'var(--accent)', title: t('settings.itemSnapshots'), to: '/settings/snapshots' },
    { icon: <ShieldQuestion size={17} />, color: 'var(--danger)', title: t('settings.itemSystem'), to: '/settings/system' },
  ]

  const appItems = [
    { icon: <SunMoon size={17} />, color: 'var(--accent-2)', title: t('settings.appearance'), to: '/settings/appearance' },
    { icon: <Server size={17} />, color: 'var(--accent)', title: t('settings.itemServer'), to: '/settings/server' },
    { icon: <Info size={17} />, color: 'var(--violet)', title: t('settings.itemAbout'), to: '/settings/about' },
  ]

  const groups = [
    ...(!offline ? [{ title: t('settings.groupServer'), items: serverItems }] : []),
    { title: t('settings.groupApp'), items: appItems },
  ]

  return (
    <nav aria-label={t('settings.title')} className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-t3">
            {group.title}
          </div>
          <div className="flex flex-col gap-0.5">
            {group.items.map((it) => {
              const active = isSettingsNavActive(it.to, pathname)
              return (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.to !== '/settings/server'}
                  className={`press flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] transition-colors ${
                    active
                      ? 'font-semibold text-accent'
                      : 'text-t2 hover:bg-white/[0.04] hover:text-t1'
                  }`}
                  style={active ? { background: 'var(--accent-soft)' } : undefined}
                >
                  <span
                    className="flex flex-none items-center justify-center"
                    style={{ color: it.color }}
                  >
                    {it.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{it.title}</span>
                  {it.to === '/settings/about' && hasUpdate && (
                    <span className="ml-auto flex-none">
                      <Badge kind="ok">{t('settings.updateAvailableButton')}</Badge>
                    </span>
                  )}
                </NavLink>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

export default SettingsNav
