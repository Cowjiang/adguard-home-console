/** 全局布局:环境背景 + 移动端浮动玻璃标签栏 / 桌面端固定侧边栏(≥lg) */
import { useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BarChart3, Home, ListFilter, ScrollText, Settings2, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { scrollToTop } from '../lib/scrollToTop'
import { useNativeTabBar } from '../lib/nativeTabbar'
import { useNativeBackButton } from '../lib/nativeBackButton'
import { TransitionArea } from '../lib/routeTransition'
import { useIsDesktop } from '../lib/useIsDesktop'
import { APP_NAME } from '../lib/constants'
import { TOP_LEVEL_ROUTES, TAB_ROOT_ROUTES, NavScrim } from './ui'

type NavItem = { to: string; label: string; icon: typeof Home; match?: string[] }

const TABS: NavItem[] = [
  { to: '/', label: '概览', icon: Home },
  { to: '/protection', label: '过滤器', icon: ListFilter },
  { to: '/log', label: '日志', icon: ScrollText },
  { to: '/settings', label: '设置', icon: Settings2 },
]

const DESK_NAV: NavItem[] = [
  ...TABS.slice(0, 1),
  { to: '/stats', label: '统计', icon: BarChart3 },
  ...TABS.slice(1, 3),
  { to: '/clients', label: '客户端', icon: Users, match: ['/clients', '/rewrites'] },
  TABS[3],
]

function navActive(pathname: string, to: string, match?: string[]) {
  if (match) return match.some((m) => pathname.startsWith(m))
  return to === '/' ? pathname === '/' : pathname.startsWith(to)
}

export function Ambient() {
  return <div className="ambient" />
}

/** 顶部悬浮状态条(仅移动端 tab 根页面:二级页顶部由固定导航栏接管,见 docs/WEB_INTERACTION.md) */
function TopBar() {
  const { status } = useAuth()
  const { pathname } = useLocation()
  const protected_ = status?.protection_enabled
  if (!TAB_ROOT_ROUTES.includes(pathname)) return null
  return (
    <header
      className="pointer-events-none fixed left-0 right-0 top-0 z-40 flex justify-center px-4 lg:hidden"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}
    >
      <NavScrim />
      <div className="glass-nav relative flex items-center gap-2 rounded-full px-3.5 py-1.5">
        <span
          className={`h-2 w-2 rounded-full ${protected_ ? 'pulse-dot' : ''}`}
          style={{ background: protected_ ? 'var(--ok)' : 'var(--danger)' }}
        />
        <span className="text-[12px] font-semibold text-t1">
          {status?.running ? (protected_ ? '防护运行中' : '防护已暂停') : '服务离线'}
        </span>
        <span className="h-3 w-px" style={{ background: 'var(--glass-border-strong)' }} />
        <span className="text-[12px] text-t3">{APP_NAME}</span>
      </div>
    </header>
  )
}

function TabBar() {
  const { pathname } = useLocation()
  const activeIdx = Math.max(
    0,
    TABS.findIndex((t) => (t.to === '/' ? pathname === '/' : pathname.startsWith(t.to)))
  )
  const barRef = useRef<HTMLDivElement>(null)
  const lensRef = useRef<HTMLDivElement>(null)

  // iOS 26/27 手感:点击时透镜沿移动轴拉伸变形,栏体做一次橡皮筋回弹
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
        {/* 滑动的玻璃透镜:选中项像一块浮起的独立玻璃片 */}
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
        {TABS.map(({ to, label, icon: Icon }) => {
          const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              replace
              onClick={() => {
                playBounce()
                // iOS 手感:再点当前 tab 滚回顶部(跨 tab 导航不干预)
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
                  <span className="text-[10.5px] font-semibold tracking-wide">{label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

/** 桌面端侧边栏(≥lg):实色面板,延续深色设计系统;底部承接防护状态 */
function Sidebar() {
  const { pathname } = useLocation()
  const { status } = useAuth()
  const protected_ = status?.protection_enabled
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
        {DESK_NAV.map(({ to, label, icon: Icon, match }) => {
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
              {label}
            </NavLink>
          )
        })}
      </nav>
      <div className="flex-1" />
      <div className="glass flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
        <span
          className={`h-2 w-2 flex-none rounded-full ${status?.running && protected_ ? 'pulse-dot' : ''}`}
          style={{ background: !status?.running ? 'var(--t3)' : protected_ ? 'var(--ok)' : 'var(--danger)' }}
        />
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-t1">
            {status?.running ? (protected_ ? '防护运行中' : '防护已暂停') : '服务离线'}
          </div>
          <div className="num text-[11px] text-t3">{APP_NAME}</div>
        </div>
      </div>
    </aside>
  )
}

export default function Layout() {
  // iOS Tauri 壳:原生液态玻璃 UITabBar 接管导航,CSS 标签栏让位
  const nativeBar = useNativeTabBar()
  // 移动布局且原生 TabBar 可用时:左上角返回按钮交给原生玻璃胶囊(createComponent glass)
  const isDesktop = useIsDesktop()
  useNativeBackButton(nativeBar && !isDesktop)
  return (
    <div className="min-h-dvh lg:pl-60">
      <Ambient />
      <Sidebar />
      <TopBar />
      <main>
        <TransitionArea />
      </main>
      {!nativeBar && <TabBar />}
    </div>
  )
}
