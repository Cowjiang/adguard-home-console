/**
 * iOS 风格 push/pop 路由转场(Layout 内包裹 Outlet)。
 *
 * 原理:路由提交时把旧页面 DOM 克隆为静态快照作"退场层"(零重挂载、内容与
 * 滚动位置绝对真实),新页面作为"进场层"同时渲染:push = 新页自右滑入、
 * 旧页向左让位;pop = 旧页滑出右侧、新页自左浅层归位。动画结束摘除快照。
 * 固定导航条(PageHeader portal)经 useRouteTransition 拿到方向做同步平移。
 *
 * 方向判定:
 *  - PUSH 且目标不是 tab 根(tab 切换是 NavLink push)→ push;
 *  - POP 且带 backNav 标记(点了返回按钮)→ pop;侧滑手势触发的 POP 不做
 *    CSS 动画,交由 WKWebView 原生快照动画接管(见 feat/ios-swipe-back);
 *  - REPLACE + navMeta 标记(跨 tab 跳转)→ 按 push 做动画但不进历史栈;
 *  - 其余 REPLACE(登录跳转/redirect)与桌面端(≥lg)瞬时切换。
 *
 * 转场方向语义(dir)与 CSS 动画解耦:侧滑返回虽然没有 CSS 动画,页面组件
 * (page-in 闩)仍需知道方向 —— 否则返回落地页重播入场动画(fill-mode both
 * 首帧 opacity:0;iOS 手势转场期间动画还可能被挂起不启动 → 整页空白)。
 *
 * 滚动仲裁:history.scrollRestoration = 'manual',自行按历史条目 idx 记忆/
 * 恢复滚动,并在首帧绘制前(useLayoutEffect)同步完成,杜绝浏览器异步恢复
 * 造成的页面上下跳动。快照层以 top:-y 对齐旧页滚动位置。
 */
import {
  createContext, useContext, useEffect, useLayoutEffect, useRef, useState,
  useSyncExternalStore, type ReactNode,
} from 'react'
import { useLocation, useNavigationType, useOutlet } from 'react-router-dom'
import { consumeBackTap } from './backNav'
import { consumeNavAnim } from './navMeta'
import { TOP_LEVEL_ROUTES } from './routes'
import { useIsDesktop } from './useIsDesktop'

export type TransitionDir = 'push' | 'pop'

interface TransitionInfo {
  /** 滑动转场语义方向(CSS 动画或侧滑原生快照);null = 非滑动转场渲染 */
  dir: TransitionDir | null
  /** CSS 快照转场进行中(退场层存在);原生手势转场为 false */
  exiting: boolean
}

/* ---------- 转场忙闲(模块级 store) ----------
 * 原生玻璃返回按钮悬浮在 WebView 之上,无法参与 CSS 平移;创建须等 CSS 转场
 * 结束(useTransitionBusy),否则前进转场中途瞬现穿帮。 */
const busySubs = new Set<() => void>()
let busy = false

function setBusy(v: boolean) {
  if (v === busy) return
  busy = v
  busySubs.forEach((f) => f())
}

/** 当前是否有 CSS 快照转场在进行 */
export function useTransitionBusy(): boolean {
  return useSyncExternalStore(
    (cb) => {
      busySubs.add(cb)
      return () => busySubs.delete(cb)
    },
    () => busy
  )
}

const TransitionCtx = createContext<TransitionInfo>({ dir: null, exiting: false })

/** 页面内部组件(如 PageHeader、Screen)读取当前转场态 */
export const useRouteTransition = () => useContext(TransitionCtx)

const DURATION_MS = 340

/** 各历史条目(idx)的滚动位置记忆;scrollRestoration=manual 后由我们恢复 */
const scrollMem = new Map<number, number>()

function historyIdx(): number {
  return (window.history.state as { idx?: number } | null)?.idx ?? -1
}

/** 退场快照:旧页内容 + 固定导航条克隆 */
interface ExitLayer {
  key: string
  html: string
  barHtml: string | null
  /** 旧页滚动位置,快照层 top:-y 对齐 */
  y: number
  anim: string
  z: number
}

export function TransitionArea() {
  const location = useLocation()
  const navType = useNavigationType()
  const outlet = useOutlet()
  const isDesktop = useIsDesktop()
  const [exit, setExit] = useState<ExitLayer | null>(null)
  const [enterAnim, setEnterAnim] = useState<string | null>(null)
  // 滑动转场语义方向(含无 CSS 动画的侧滑返回),供 page-in 闩等消费
  const [navDir, setNavDir] = useState<TransitionDir | null>(null)
  const prevKeyRef = useRef(location.key)
  const pageRef = useRef<HTMLDivElement | null>(null)
  // 渲染期捕获(先于 commit):此刻容器里还是旧页面的 DOM
  const captureRef = useRef<{ key: string; html: string; barHtml: string | null; y: number } | null>(null)

  if (location.key !== prevKeyRef.current) {
    const y = Math.max(0, Math.round(window.scrollY))
    // 克隆固定导航条并校正 top:克隆在 transform 祖先内退化为相对转场层定位,
    // top=y 使其仍贴视口顶层,随层同步平移
    const bar = document.body.querySelector('[data-floating-nav]')
    let barHtml: string | null = null
    if (bar instanceof HTMLElement) {
      const clone = bar.cloneNode(true) as HTMLElement
      // 克隆条随快照层视口定位(top 由层坐标系给出),补回被原生按钮隐藏的返回胶囊
      const backBtn = clone.querySelector('[data-back-btn]') as HTMLElement | null
      if (backBtn) backBtn.style.visibility = 'visible'
      barHtml = clone.outerHTML
    }
    captureRef.current = {
      key: prevKeyRef.current,
      html: pageRef.current?.innerHTML ?? '',
      barHtml,
      y,
    }
    prevKeyRef.current = location.key
  }

  // 滚动位置持续记忆(提交转场前旧条目的 Y 已由监听记下)
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const i = historyIdx()
        if (i >= 0) scrollMem.set(i, window.scrollY)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // POP 恢复重试:二级页(如日志列表)条目在本地 state,重挂载首帧文档不可滚动,
  // 首帧 scrollTo 是空操作;内容到达后在短窗口内补滚到位(期间不干预用户滚动)
  const pendingRestore = useRef<{ y: number; until: number } | null>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const p = pendingRestore.current
      if (p) {
        if (Date.now() > p.until) pendingRestore.current = null
        else if (window.scrollY !== p.y && document.documentElement.scrollHeight > p.y + 1) {
          window.scrollTo(0, p.y)
          if (window.scrollY === p.y) pendingRestore.current = null
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useLayoutEffect(() => {
    const cap = captureRef.current
    captureRef.current = null

    // 滚动仲裁必须发生在首帧绘制前:PUSH 回顶,POP 恢复目标条目记忆位置
    if (navType === 'POP') {
      const ry = scrollMem.get(historyIdx()) ?? 0
      window.scrollTo(0, ry)
      pendingRestore.current = window.scrollY === ry ? null : { y: ry, until: Date.now() + 600 }
    } else {
      pendingRestore.current = null
      window.scrollTo(0, 0)
    }

    // 方向仲裁:dir = CSS 快照转场方向;跨 tab 跳转(replace + navMeta 标记)
    // 视觉按 push 处理,栈上平级不进历史
    const marked = consumeNavAnim()
    let dir: TransitionDir | null = null
    if (navType === 'PUSH' && !TOP_LEVEL_ROUTES.includes(location.pathname)) dir = 'push'
    else if (navType === 'POP' && consumeBackTap()) dir = 'pop'
    else if (navType !== 'POP' && marked === 'push') dir = 'push'

    // 滑动转场语义方向:侧滑/前滑手势的 POP(无 backTap 标记)同样算 ——
    // 原生快照接管动画,page-in 闩据此跳过入场动画
    const slideDir: TransitionDir | null = dir ?? (navType === 'POP' ? 'pop' : null)
    setNavDir(slideDir)

    if (!dir || isDesktop || !cap || !cap.html) {
      setExit(null)
      setEnterAnim(null)
      setBusy(false)
      const t = setTimeout(() => setNavDir(null), DURATION_MS + 50)
      return () => clearTimeout(t)
    }

    setBusy(true)
    setExit({
      key: cap.key,
      html: cap.html,
      barHtml: cap.barHtml,
      y: cap.y,
      anim: dir === 'push' ? 'rt-push-out' : 'rt-pop-out',
      // pop 退场层必须盖过固定导航条(z-40):旧页连同其导航条从新页(及其
      // 导航条)之上滑走,iOS 式揭示;z 值须低于 Sheet(50)/Toast(60)
      z: dir === 'push' ? 0 : 50,
    })
    setEnterAnim(dir === 'push' ? 'rt-push-in' : 'rt-pop-in')
    const t = setTimeout(() => {
      setExit(null)
      setEnterAnim(null)
      setNavDir(null)
      setBusy(false)
    }, DURATION_MS + 50)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, navType, isDesktop])

  return (
    <TransitionCtx.Provider value={{ dir: navDir, exiting: !!exit }}>
      <div className="relative">
        <div
          ref={pageRef}
          className={enterAnim ? `${enterAnim} rt-page-bg` : undefined}
          style={{
            position: 'relative',
            // 转场层不透明化后必须盖满视口:矮内容页(如规则编辑)容器高度不足,
            // 下半屏会透出退场快照
            minHeight: enterAnim ? '100dvh' : undefined,
            zIndex: enterAnim?.startsWith('rt-push') ? 10 : 0,
          }}
        >
          {outlet}
        </div>
        {exit && (
          <div
            aria-hidden
            className={`${exit.anim} rt-page-bg`}
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              top: 0,
              height: '100dvh',
              zIndex: exit.z,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            {/* 视口锁定 + 内层 -y 对齐旧页滚动:POP 时新页会恢复记忆滚动位,
                若随文档定位快照会整体错位 y_mem 像素(穿帮) */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: -exit.y }} dangerouslySetInnerHTML={{ __html: exit.html }} />
            {exit.barHtml && <div dangerouslySetInnerHTML={{ __html: exit.barHtml }} />}
          </div>
        )}
      </div>
    </TransitionCtx.Provider>
  )
}
