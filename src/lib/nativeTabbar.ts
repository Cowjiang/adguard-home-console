/**
 * iOS 原生液态玻璃 TabBar(tauri-plugin-system-components)与 React 路由的双向桥接。
 * 仅在 Tauri 壳内生效;配置失败(非 iOS/macOS、插件缺失)时回退 Web 版 CSS 标签栏。
 */
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

type TabId = 'home' | 'protection' | 'log' | 'settings'

const TABS: { id: TabId; to: string; title: string; sfSymbol: string }[] = [
  { id: 'home', to: '/', title: '概览', sfSymbol: 'house.fill' },
  { id: 'protection', to: '/protection', title: '过滤器', sfSymbol: 'shield.lefthalf.filled' },
  { id: 'log', to: '/log', title: '日志', sfSymbol: 'doc.text.fill' },
  { id: 'settings', to: '/settings', title: '设置', sfSymbol: 'gearshape.fill' },
]

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
  const { pathname } = useLocation()
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!isTauriShell()) return
    let disposed = false
    let unregister: (() => Promise<void>) | undefined

    void (async () => {
      try {
        const p = await import('@sosweetham/tauri-plugin-system-components-api')
        await p.configureTabBar({
          items: TABS.map(({ id, title, sfSymbol }) => ({ id, title, sfSymbol })),
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
          // tab 切换一律 replace,层级下钻才 push:侧滑返回只走业务层级,不跨 tab
          const tab = TABS.find((t) => t.id === id)
          if (tab) navigate(tab.to, { replace: true })
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
