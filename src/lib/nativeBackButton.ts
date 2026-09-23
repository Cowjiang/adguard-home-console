/**
 * iOS 原生液态玻璃返回按钮(tauri-plugin-system-components 的 createComponent,
 * glass capsule 悬浮在 WebView 之上,iOS 26 上真实折射网页内容,与原生 TabBar 同源)。
 *
 * 启用条件:原生 TabBar 可用(iOS/macOS 壳)且为移动布局(非桌面断点)。
 * 路由仲裁:顶级路由移除按钮,二级页面创建;点击复用 PageHeader 的 goBack 语义
 * (历史栈为空时 replace 回父级,避免压栈)。
 *
 * 与页面转场的交接:原生控件悬浮在 WebView 之上、不参与 CSS 平移,故不跟随页面滑动
 * —— 页面就绪(转场结束)后原地淡入,离开(切页/进入转场)先淡出再移除。侧滑手势期间
 * 按钮整体让位,交给随页滑动的 CSS 胶囊(通过 useNativeBackShown 让位,避免双按钮)。
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TAB_ROOT_ROUTES } from './routes'
import { navBack } from './backNav'
import { consumeGestureCommit, useTransitionHalfBusy, TRANSITION_HALF_MS } from './routeTransition'
import { FADE_IN_S, FADE_OUT_S } from './nativeGlass'

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
  // 侧滑手势进行中:按钮让位给随页滑动的 CSS 胶囊(原生控件无法参与手势平移)
  const halfBusy = useTransitionHalfBusy()
  const commitSeen = useRef(0)
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
          // WKWebView 对程序化返回无原生动画(实测),返回转场由 CSS 快照层接管
          navBack(navRef.current, pathRef.current)
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

  // 路由 → 显隐(顶级页移除,二级页创建;页面就绪后原地淡入,不跟随页面滑动)
  useEffect(() => {
    if (!enabled) return
    const onSubpage = !TAB_ROOT_ROUTES.includes(pathname)
    // 侧滑期间**保持在场**:它正好落在被揭示页面的返回胶囊位置,替代原先让位给
    // CSS 胶囊的做法(自定义按钮一律不出现);仅在转场前半程内暂缓出场。
    const want = onSubpage && !halfBusy
    // CSS 胶囊的显隐只按"本页由原生接管"判定:手势/转场期间原生控件会临时撤下,
    // 但自定义按钮一律不显示(否则侧滑过程中会冒出 CSS 胶囊,和原生按钮同框穿帮)
    setShown(onSubpage)
    let cancelled = false
    plugin()
      .then((p) => {
        if (cancelled) return
        if (!want) {
          // 离开:退场过半再淡出(侧滑提交没有 CSS 退场动画,立即淡出)。
          // 每一步都检查本轮 effect 是否已被取消 —— 退场过半的同时会开始新一轮
          // effect 创建按钮,若拖到那时候再移除,会把刚建好的按钮删掉。
          const delay = consumeGestureCommit(commitSeen) ? 0 : TRANSITION_HALF_MS
          return new Promise((r) => setTimeout(r, delay))
            .then(() => {
              if (cancelled) throw new Error('cancelled')
              return p.updateComponent(BTN_ID, { alpha: 0, appearDuration: FADE_OUT_S })
            })
            .then(() => new Promise((r) => setTimeout(r, FADE_OUT_S * 1000 + 40)))
            .then(() => {
              if (cancelled) return
              return p.removeComponent(BTN_ID)
            })
            .catch(() => {})
        }
        return p
          .createComponent({
            id: BTN_ID,
            kind: 'button',
            // 不传 glass:true:glass 会外包一层胶囊(固定 14/10pt 内边距,按钮变大椭圆)。
            // iOS 26 上 UIButton.Configuration.glass() 本身就是原生液态玻璃圆形按钮,
            // width/height 约束生效(见插件 ComponentsOverlay.swift)。尺寸对齐 CSS 胶囊 h-11 w-11
            // (iOS 26 HIG 最小可点面积 44×44pt,系统圆形玻璃按钮即 44pt 视觉)
            props: {
              sfSymbol: 'chevron.left',
              width: 44,
              height: 44,
              appearAnimation: true,
              appearDuration: FADE_IN_S,
            },
            // 插件按 safeAreaLayoutGuide + (margin=16)+dx/dy 约束定位
            // (ComponentsOverlay.activateAnchorConstraints,margin 同付两轴):
            // left = 16+dx,top = safe-area-top + 16+dy。CSS 胶囊在
            // left 16 / top safe-area+8(浮动条 safe+6 起 h-12 内居中 h-11)→ dx=0, dy=-8
            anchor: 'topLeading',
            dx: 0,
            dy: -8,
          })
          .then(() => {
            if (!cancelled) setShown(true)
          })
          .catch(() => {
            // 原生创建失败:回退到 CSS 胶囊,别让按钮位空着
            if (!cancelled) setShown(false)
          })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pathname, enabled, halfBusy])
}
