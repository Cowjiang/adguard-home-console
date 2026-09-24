/**
 * iOS 原生液态玻璃 TabBar(tauri-plugin-system-components)与 React 路由的双向桥接。
 * 仅在 Tauri 壳内生效;配置失败(非 iOS/macOS、插件缺失)时回退 Web 版 CSS 标签栏。
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { scrollToTop } from './scrollToTop'

type TabId = 'home' | 'protection' | 'log' | 'settings'

const TABS: { id: TabId; to: string; titleKey: 'nav.overview' | 'nav.protection' | 'nav.log' | 'nav.settings'; sfSymbol: string }[] = [
  { id: 'home', to: '/', titleKey: 'nav.overview', sfSymbol: 'house.fill' },
  { id: 'protection', to: '/protection', titleKey: 'nav.protection', sfSymbol: 'shield.lefthalf.filled' },
  { id: 'log', to: '/log', titleKey: 'nav.log', sfSymbol: 'doc.text.fill' },
  { id: 'settings', to: '/settings', titleKey: 'nav.settings', sfSymbol: 'gearshape.fill' },
]

type TFn = (key: 'nav.overview' | 'nav.protection' | 'nav.log' | 'nav.settings') => string

function tabItems(t: TFn) {
  return TABS.map(({ id, titleKey, sfSymbol }) => ({ id, title: t(titleKey), sfSymbol }))
}

function routeToId(pathname: string): TabId | null {
  if (pathname === '/') return 'home'
  return TABS.find((t) => t.to !== '/' && pathname.startsWith(t.to))?.id ?? null
}

export function isTauriShell(): boolean {
  return !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
}

/** 在 Layout(受保护路由)挂载期间配置原生 TabBar;返回是否成功(决定是否隐藏 CSS 版) */
export function useNativeTabBar(): boolean {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [active, setActive] = useState(false)
  // onTabSelected 监听仅注册一次,闭包里的 pathname 会陈旧;用 ref 供 handler 读最新路由
  const pathnameRef = useRef(pathname)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!isTauriShell()) return
    let disposed = false
    let unregister: (() => Promise<void>) | undefined

    void (async () => {
      try {
        const p = await import('@sosweetham/tauri-plugin-system-components-api')
        await p.configureTabBar({
          items: tabItems(t),
          selectedId: routeToId(pathname) ?? 'home',
          tint: '#34d399',
        })
        // 预留原生 bar 的底部空间(bar 高度 + 底部安全区,单位 CSS pt)
        const insets = await p.getTabBarInsets()
        document.documentElement.style.setProperty(
          '--tabbar-space',
          `${Math.ceil(insets.bottom + 24)}px`
        )
        const listener = await p.onTabSelected(({ id }) => {
          const tab = TABS.find((t) => t.id === id)
          if (!tab) return
          // 再点当前 tab:回父级路由(子页如 /protection/filters → /protection,对齐 iOS 回根)+ 平滑滚回顶部。
          // UIKit 对重复选中项同样回调 didSelect,这是原生 scroll-to-top 的标准钩子。
          if (routeToId(pathnameRef.current) === id) {
            if (pathnameRef.current !== tab.to) navigate(tab.to, { replace: true })
            scrollToTop()
            return
          }
          // tab 切换不进历史栈(replace),层级下钻才 push——侧滑返回只走业务层级,见 docs/web-interaction.md
          navigate(tab.to, { replace: true })
        })
        if (disposed) {
          void listener.unregister()
          return
        }
        unregister = () => listener.unregister()
        document.documentElement.dataset.nativeTabbar = '1'
        setActive(true)
      } catch (e) {
        console.warn('[nativeTabbar] 原生 TabBar 不可用,使用 CSS 标签栏:', e)
      }
    })()

    return () => {
      disposed = true
      void unregister?.()
      document.documentElement.style.removeProperty('--tabbar-space')
      delete document.documentElement.dataset.nativeTabbar
      // 布局卸载(登出/回登录页)时移除原生 bar
      import('@sosweetham/tauri-plugin-system-components-api')
        .then((p) => p.removeTabBar())
        .catch(() => {})
    }
    // 仅挂载时配置一次;初始选中项即当前路由,后续由路由同步 effect 维护
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 语言切换 → 重新下发原生 tab 标题(重复 configureTabBar 幂等)
  useEffect(() => {
    if (!active) return
    import('@sosweetham/tauri-plugin-system-components-api')
      .then((p) => p.configureTabBar({ items: tabItems(t), selectedId: routeToId(pathnameRef.current) ?? 'home', tint: '#34d399' }))
      .catch(() => {})
    // 仅随语言变化触发;pathname 由上方 effect 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t])

  // 路由变化 → 原生 bar 选中态同步(原生点击 → navigate → 此处 selectTab 为无害回环,不触发事件)
  useEffect(() => {
    if (!active) return
    const id = routeToId(pathname)
    if (!id) return
    import('@sosweetham/tauri-plugin-system-components-api')
      .then((p) => p.selectTab(id))
      .catch(() => {})
  }, [pathname, active])

  return active
}
