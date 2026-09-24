/** 全局布局:环境背景 + 移动端浮动玻璃标签栏 / 桌面端固定侧边栏(≥lg) */
import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { mutate } from 'swr'
import { BarChart3, Home, ListFilter, ScrollText, Settings2, ShieldCheck, Users, WifiOff } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { usePullToRefresh } from '../lib/pullToRefresh'
import { scrollToTop } from '../lib/scrollToTop'
import { useNativeTabBar } from '../lib/nativeTabbar'
import { useNativeBackButton } from '../lib/nativeBackButton'
import { TransitionArea, useArrivalPopAnim } from '../lib/routeTransition'
import { useIsDesktop } from '../lib/useIsDesktop'
import { APP_NAME } from '../lib/constants'
import { TOP_LEVEL_ROUTES, TAB_ROOT_ROUTES, NavScrim, Spinner, EmptyState, Button } from './ui'

type NavItem = { to: string; labelKey: 'nav.overview' | 'nav.protection' | 'nav.log' | 'nav.settings' | 'nav.stats' | 'nav.clients'; icon: typeof Home; match?: string[] }

const TABS: NavItem[] = [
  { to: '/', labelKey: 'nav.overview', icon: Home },
  { to: '/protection', labelKey: 'nav.protection', icon: ListFilter },
  { to: '/logs', labelKey: 'nav.log', icon: ScrollText },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings2 },
]

const DESK_NAV: NavItem[] = [
  ...TABS.slice(0, 1),
  { to: '/stats', labelKey: 'nav.stats', icon: BarChart3 },
  ...TABS.slice(1, 3),
  { to: '/clients', labelKey: 'nav.clients', icon: Users, match: ['/clients', '/rewrites'] },
  TABS[3],
]

function navActive(pathname: string, to: string, match?: string[]) {
  if (match) return match.some((m) => pathname.startsWith(m))
  return to === '/' ? pathname === '/' : pathname.startsWith(to)
}

export function Ambient() {
  return <div className="ambient" />
}

/** 顶部悬浮状态条(仅移动端 tab 根页面:二级页顶部由固定导航栏接管,见 docs/web-interaction.md)。
 *  下拉刷新期间淡出:刷新留白带是指示器的位置,pill 留着会与圆圈重叠 */
function TopBar({ dimmed }: { dimmed?: boolean }) {
  const { status, offline } = useAuth()
  const { t } = useTranslation()
  const { pathname } = useLocation()
  // CSS 快照转场返回(pop)落地 tab 根页:与页面 rt-pop-in 同步淡入 —— pill 被
  // z-50 退场快照盖着、随其滑走逐渐露出,纯淡入即无硬切;侧滑提交/无动画返回时
  // 页面瞬时就位,pill 瞬现才不穿帮,故不淡入。data-status-pill 供转场快照捕获
  const popIn = useArrivalPopAnim(pathname)
  const protected_ = status?.protection_enabled
  const offlinePill = offline || !status?.running
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
      <div className="glass-nav relative flex items-center gap-2 rounded-full px-3.5 py-1.5">
        <span
          className={`h-2 w-2 rounded-full ${protected_ && !offlinePill ? 'pulse-dot' : ''}`}
          style={{ background: !offlinePill && protected_ ? 'var(--ok)' : 'var(--danger)' }}
        />
        <span className="text-[12px] font-semibold text-t1">
          {offlinePill ? t('nav.statusOffline') : protected_ ? t('nav.statusOn') : t('nav.statusOff')}
        </span>
        <span className="h-3 w-px" style={{ background: 'var(--glass-border-strong)' }} />
        <span className="text-[12px] text-t3">{APP_NAME}</span>
      </div>
    </header>
  )
}

function TabBar() {
  const { t } = useTranslation()
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

/** 桌面端侧边栏(≥lg):实色面板,延续深色设计系统;底部承接防护状态 */
function Sidebar() {
  const { pathname } = useLocation()
  const { status, offline } = useAuth()
  const { t } = useTranslation()
  const protected_ = status?.protection_enabled
  const offlinePill = offline || !status?.running
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
      <div className="glass flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
        <span
          className={`h-2 w-2 flex-none rounded-full ${!offlinePill && protected_ ? 'pulse-dot' : ''}`}
          style={{ background: offlinePill ? 'var(--t3)' : protected_ ? 'var(--ok)' : 'var(--danger)' }}
        />
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-t1">
            {offlinePill ? t('nav.statusOffline') : protected_ ? t('nav.statusOn') : t('nav.statusOff')}
          </div>
          <div className="num text-[11px] text-t3">{APP_NAME}</div>
        </div>
      </div>
    </aside>
  )
}

/** 落地 tab 根页时刷新一次服务器状态:SWR 数据随页面重挂本就会重验证,
 *  status 不归 SWR 管(只在启动与自愈探针时更新),这里补上导航时机 */
function useTabLandStatusRefresh() {
  const { pathname } = useLocation()
  const { refreshStatus } = useAuth()
  useEffect(() => {
    if (TAB_ROOT_ROUTES.includes(pathname)) refreshStatus()
  }, [pathname, refreshStatus])
}

/** 断网时代理层 25s 才报超时,刷新指示器不等它:到 deadline 先收,
 *  请求失败的结果随后自行落地(/status 探测 5s 内已先给出离线结论) */
const REFRESH_DEADLINE_MS = 8000

/** 服务离线遮罩:只在 tab 根页盖住内容区,旧数据不再可见;二级页不遮挡(保护
 *  表单输入,靠状态条与操作报错感知)。z-20 在下拉指示器(z-30)与 TabBar/
 *  状态条(z-40)之下,断网中下拉刷新仍是可用的重试手段 */
function OfflineNotice({ onRetry }: { onRetry: () => unknown }) {
  const { t } = useTranslation()
  const [retrying, setRetrying] = useState(false)
  // 与下拉刷新共用同一条 refreshAll 链(含 8s deadline):按钮转圈到链路收口为止
  const retry = () => {
    if (retrying) return
    setRetrying(true)
    void Promise.resolve(onRetry()).catch(() => {}).finally(() => setRetrying(false))
  }
  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center px-8 lg:left-60"
      style={{ background: 'var(--bg)' }}
    >
      <div className="flex flex-col items-center">
        <EmptyState
          icon={<WifiOff size={38} className="text-t3" />}
          title={t('nav.statusOffline')}
          subtitle={t('nav.offlineHint')}
        />
        <Button variant="glass" size="sm" className="mt-2" loading={retrying} onClick={retry}>
          {t('common.retryNow')}
        </Button>
      </div>
    </div>
  )
}

export default function Layout() {
  // iOS Tauri 壳:原生液态玻璃 UITabBar 接管导航,CSS 标签栏让位
  const nativeBar = useNativeTabBar()
  // 移动布局且原生 TabBar 可用时:左上角返回按钮交给原生玻璃胶囊(createComponent glass)
  const isDesktop = useIsDesktop()
  useNativeBackButton(nativeBar && !isDesktop)
  useTabLandStatusRefresh()
  // 下拉刷新:status 重探 + SWR 全量重验证;仅移动布局、粗指针(触摸)设备且
  // 在 tab 根页(二级页不启用)。mutate 用全局绑定(默认缓存),不依赖 SWRConfig
  // 上下文
  const { refreshStatus, offline } = useAuth()
  const { pathname } = useLocation()
  const [coarse] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false)
  const isTabRoot = TAB_ROOT_ROUTES.includes(pathname)
  const refreshAll = useCallback((): Promise<unknown> => {
    const work = Promise.allSettled([refreshStatus(), mutate(() => true)])
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), REFRESH_DEADLINE_MS)
    })
    return Promise.race([work, deadline]).finally(() => clearTimeout(timer))
  }, [refreshStatus])
  const { contentRef, indicatorRef, refreshing } = usePullToRefresh(
    refreshAll,
    !isDesktop && coarse && isTabRoot
  )
  return (
    <div className="min-h-dvh lg:pl-60">
      <Ambient />
      <Sidebar />
      <TopBar dimmed={refreshing} />
      <main>
        <div ref={contentRef}>
          <TransitionArea />
        </div>
      </main>
      {/* 设置根页豁免遮罩:它承载「服务器连接」与应用设置,离线时用户可能正需要
          改服务器地址,改由 Settings 页隐藏依赖服务器的入口组 */}
      {offline && isTabRoot && pathname !== '/settings' && (
        <OfflineNotice onRetry={refreshAll} />
      )}
      {/* 下拉刷新指示器:锚在 safe+16(pill 正下方的页面留白带)、卡片顶(safe+64)
          上方 12px,跟手 1:1 位移;刷新时内容回弹、圈停在基位旋转;不进转场快照
          管线,transform 留给跟手位移,水平居中用负 margin */}
      <div
        ref={indicatorRef}
        aria-hidden
        className="glass pointer-events-none fixed left-1/2 z-30 grid h-9 w-9 place-items-center rounded-full opacity-0"
        style={{ top: 'calc(var(--safe-top) + 16px)', marginLeft: '-18px' }}
      >
        <Spinner size={18} />
      </div>
      {!nativeBar && <TabBar />}
    </div>
  )
}
