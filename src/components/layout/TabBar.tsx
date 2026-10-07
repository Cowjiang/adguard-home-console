/** Mobile floating glass tab bar with the sliding lens and rubber-band bounce */
import { useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { scrollToTop } from '../../lib/nav/scrollToTop'
import { TABS } from './navItems'

export function TabBar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const activeIdx = Math.max(
    0,
    TABS.findIndex((t) => (t.to === '/' ? pathname === '/' : pathname.startsWith(t.to)))
  )
  const barRef = useRef<HTMLDivElement>(null)
  const lensRef = useRef<HTMLDivElement>(null)

  // iOS 26/27 feel: on tap the lens stretches along the move axis, the bar does a
  // rubber-band bounce
  const playBounce = () => {
    const ease = 'cubic-bezier(0.3, 1.1, 0.4, 1)'
    barRef.current?.animate(
      [
        { transform: 'scale(1, 1)' },
        { transform: 'scale(1.014, 0.99)', offset: 0.35 },
        { transform: 'scale(1, 1)' },
      ],
      { duration: 380, easing: ease }
    )
    lensRef.current?.animate(
      [
        { transform: 'scale(1, 1)' },
        { transform: 'scale(1.07, 0.97)', offset: 0.35 },
        { transform: 'scale(1, 1)' },
      ],
      { duration: 440, easing: ease }
    )
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex justify-center px-4 lg:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}
    >
      <div
        ref={barRef}
        className="glass-nav relative flex w-full max-w-[500px] items-stretch rounded-full px-1.5 py-1.5"
        style={{ transformOrigin: '50% 88%' }}
      >
        {/* Sliding glass lens: the selected item reads as a raised piece of glass */}
        <div
          className="tab-lens-track absolute inset-y-1.5 left-1.5"
          aria-hidden
          style={{
            width: `calc((100% - 12px) / ${TABS.length})`,
            transform: `translateX(${activeIdx * 100}%)`,
          }}
        >
          <div ref={lensRef} className="tab-lens h-full w-full" style={{ transformOrigin: '50% 55%' }} />
        </div>
        {TABS.map(({ to, labelKey, icon: Icon }) => {
          const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              replace
              onClick={() => {
                playBounce()
                // iOS feel: tapping the active tab again scrolls to top (cross-tab nav
                // is left alone)
                if (isActive) scrollToTop()
              }}
              className={({ isActive }) =>
                `relative z-10 flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 transition-colors duration-300 ${
                  isActive ? 'text-accent' : 'text-t1'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={21} strokeWidth={isActive ? 2.3 : 1.9} />
                  <span className="text-[10.5px] font-semibold tracking-wide">{t(labelKey)}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
