/** Floating status pill (mobile tab root pages only: secondary pages are headed by the fixed
 *  nav bar, see docs/web-interaction.md). Fades out during pull-to-refresh: the refresh
 *  whitespace band is where the indicator sits, the pill would overlap the circle.
 *  Tapping it opens the instance switcher sheet */
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../lib/session/auth'
import { useArrivalPopAnim } from '../../lib/routeTransition'
import { APP_NAME } from '../../lib/constants'
import { TAB_ROOT_ROUTES } from '../../lib/nav/routes'
import { NavScrim } from '../ui/primitives'
import { useSheet } from '../ui/sheet'
import { InstanceSwitchList } from './InstanceSwitchList'

export function TopBar({ dimmed }: { dimmed?: boolean }) {
  const { status, offline, instances, activeId } = useAuth()
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const nav = useNavigate()
  const sheet = useSheet()
  // CSS snapshot transition pop back onto a tab root: fade in synced with the page's
  // rt-pop-in — the pill is covered by the z-50 exit snapshot and gradually revealed as
  // it slides away, so a pure fade has no hard cut; on swipe-commit / no-anim back the
  // page lands instantly and the pill must too, so no fade. data-status-pill lets the
  // transition snapshot capture it
  const popIn = useArrivalPopAnim(pathname)
  const protected_ = status?.protection_enabled
  const offlinePill = offline || !status?.running
  const activeLabel = instances.find((x) => x.id === activeId)?.label
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
      <button
        className={`glass-nav relative flex items-center gap-2 rounded-full px-3.5 py-1.5 ${dimmed ? '' : 'pointer-events-auto'}`}
        onClick={() =>
          sheet.open(<InstanceSwitchList onClose={sheet.close} onManage={() => nav('/settings/server')} />, {
            title: t('settings.instancesSwitch'),
          })
        }
      >
        <span
          className={`h-2 w-2 rounded-full ${protected_ && !offlinePill ? 'pulse-dot' : ''}`}
          style={{ background: !offlinePill && protected_ ? 'var(--ok)' : 'var(--danger)' }}
        />
        <span className="text-[12px] font-semibold text-t1">
          {offlinePill ? t('nav.statusOffline') : protected_ ? t('nav.statusOn') : t('nav.statusOff')}
        </span>
        <span className="h-3 w-px" style={{ background: 'var(--glass-border-strong)' }} />
        <span className="text-[12px] text-t3">{instances.length > 1 ? activeLabel : APP_NAME}</span>
      </button>
    </header>
  )
}
