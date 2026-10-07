/** Desktop sidebar (≥lg): solid panel continuing the dark design system; hosts the
 *  protection status at the bottom (tap to open the instance switcher) */
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronUp, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../lib/session/auth'
import { APP_NAME } from '../../lib/constants'
import { useSheet } from '../ui/sheet'
import { InstanceSwitchList } from './InstanceSwitchList'
import { DESK_NAV, navActive } from './navItems'

export function Sidebar() {
  const { pathname } = useLocation()
  const { status, offline, instances, activeId } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()
  const sheet = useSheet()
  const protected_ = status?.protection_enabled
  const offlinePill = offline || !status?.running
  const activeLabel = instances.find((x) => x.id === activeId)?.label
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
      <button
        className="glass flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-3 text-left active:bg-white/5"
        onClick={() =>
          sheet.open(<InstanceSwitchList onClose={sheet.close} onManage={() => nav('/settings/server')} />, {
            title: t('settings.instancesSwitch'),
          })
        }
      >
        <span
          className={`h-2 w-2 flex-none rounded-full ${!offlinePill && protected_ ? 'pulse-dot' : ''}`}
          style={{ background: offlinePill ? 'var(--t3)' : protected_ ? 'var(--ok)' : 'var(--danger)' }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-t1">
            {offlinePill ? t('nav.statusOffline') : protected_ ? t('nav.statusOn') : t('nav.statusOff')}
          </span>
          <span className="num block truncate text-[11px] text-t3">
            {instances.length > 1 ? activeLabel : APP_NAME}
          </span>
        </span>
        {instances.length > 1 && <ChevronUp size={14} className="flex-none text-t3" />}
      </button>
    </aside>
  )
}
