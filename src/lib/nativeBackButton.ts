/**
 * iOS 原生液态玻璃返回按钮(tauri-plugin-system-components 的 createComponent,
 * glass capsule 悬浮在 WebView 之上,iOS 26 上真实折射网页内容,与原生 TabBar 同源)。
 *
 * 启用条件:原生 TabBar 可用(iOS/macOS 壳)且为移动布局(非桌面断点)。
 * 路由仲裁:顶级路由移除按钮,二级页面创建;点击复用 PageHeader 的 goBack 语义
 * (历史栈为空时 replace 回父级,避免压栈)。
 * CSS 浮动返回胶囊通过 useNativeBackShown 让位,避免双按钮。
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TOP_LEVEL_ROUTES } from './routes'
import { markBackTap } from './backNav'

const BTN_ID = 'nav-back'
const plugin = () => import('@sosweetham/tauri-plugin-system-components-api')

/* ---------- 共享可见性 store(PageHeader 据此隐藏 CSS 胶囊) ---------- */

let shown = false
const subs = new Set<() => void>()

function setShown(v: boolean) {
  if (v === shown) return
  shown = v
  subs.forEach((f) => f())
}

export function useNativeBackShown(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => shown
  )
}

/* ---------- 控制器 ---------- */

export function useNativeBackButton(enabled: boolean) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // 事件监听只挂一次,经 ref 取最新的 navigate/pathname
  const navRef = useRef(navigate)
  navRef.current = navigate
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  // 点击事件 → 返回导航
  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let un: (() => void) | undefined
    plugin()
      .then(async (p) => {
        const l = await p.onComponentEvent((e) => {
          if (e.id !== BTN_ID || e.event !== 'click') return
          const idx = (window.history.state as { idx?: number } | null)?.idx
          if (idx !== undefined && idx <= 0) {
            // 历史栈为空(AGH_ROUTE 直落二级页)回退父级;replace 语义避免把父级压进栈
            const seg = pathRef.current.split('/').filter(Boolean)
            navRef.current(seg.length > 1 ? `/${seg[0]}` : '/', { replace: true })
            return
          }
          markBackTap()
          navRef.current(-1)
        })
        if (disposed) {
          void l.unregister()
          return
        }
        un = () => void l.unregister()
      })
      .catch(() => {})
    return () => {
      disposed = true
      un?.()
      void plugin()
        .then((p) => p.removeComponent(BTN_ID))
        .catch(() => {})
      setShown(false)
    }
  }, [enabled])

  // 路由 → 显隐(顶级页移除,二级页创建)
  useEffect(() => {
    if (!enabled) return
    const want = !TOP_LEVEL_ROUTES.includes(pathname)
    let cancelled = false
    plugin()
      .then((p) => {
        if (cancelled) return
        if (!want) {
          setShown(false)
          return p.removeComponent(BTN_ID).catch(() => {})
        }
        return p
          .createComponent({
            id: BTN_ID,
            kind: 'button',
            // 不传 glass:true:glass 会外包一层胶囊(固定 14/10pt 内边距,按钮变大椭圆)。
            // iOS 26 上 UIButton.Configuration.glass() 本身就是原生液态玻璃圆形按钮,
            // width/height 约束生效(见插件 ComponentsOverlay.swift)。
            props: { sfSymbol: 'chevron.left', width: 34, height: 34 },
            // 锚点公式:safe-area + (inset ?? 16) + dx/dy;inset=0 后精确对齐 CSS 版位置
            anchor: 'topLeading',
            inset: 0,
            dx: 16,
            dy: 12,
          })
          .then(() => {
            if (!cancelled) setShown(true)
          })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pathname, enabled])
}
