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
 *  - REPLACE(登录跳转/redirect)与桌面端(≥lg)瞬时切换。
 *
 * 滚动仲裁:history.scrollRestoration = 'manual',自行按历史条目 idx 记忆/
 * 恢复滚动,并在首帧绘制前(useLayoutEffect)同步完成,杜绝浏览器异步恢复
 * 造成的页面上下跳动。快照层以 top:-y 对齐旧页滚动位置。
 */
import {
  createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode,
} from 'react'
import { useLocation, useNavigationType, useOutlet } from 'react-router-dom'
import { consumeBackTap } from './backNav'
import { TOP_LEVEL_ROUTES } from './routes'
import { useIsDesktop } from './useIsDesktop'

export type TransitionDir = 'push' | 'pop'

interface TransitionInfo {
  /** 本次转场方向;null = 非转场渲染(tab 切换/瞬时切换/静止) */
  dir: TransitionDir | null
  exiting: boolean
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
      clone.style.top = `${y}px`
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

  useLayoutEffect(() => {
    const cap = captureRef.current
    captureRef.current = null

    // 滚动仲裁必须发生在首帧绘制前:PUSH 回顶,POP 恢复目标条目记忆位置
    if (navType === 'POP') window.scrollTo(0, scrollMem.get(historyIdx()) ?? 0)
    else window.scrollTo(0, 0)

    let dir: TransitionDir | null = null
    if (navType === 'PUSH' && !TOP_LEVEL_ROUTES.includes(location.pathname)) dir = 'push'
    else if (navType === 'POP' && consumeBackTap()) dir = 'pop'

    if (!dir || isDesktop || !cap || !cap.html) {
      setExit(null)
      setEnterAnim(null)
      return
    }

    setExit({
      key: cap.key,
      html: cap.html,
      barHtml: cap.barHtml,
      y: cap.y,
      anim: dir === 'push' ? 'rt-push-out' : 'rt-pop-out',
      z: dir === 'push' ? 0 : 10,
    })
    setEnterAnim(dir === 'push' ? 'rt-push-in' : 'rt-pop-in')
    const t = setTimeout(() => {
      setExit(null)
      setEnterAnim(null)
    }, DURATION_MS + 50)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, navType, isDesktop])

  const dir: TransitionDir | null = (exit?.anim ?? enterAnim)?.startsWith('rt-push')
    ? 'push'
    : (exit || enterAnim)
      ? 'pop'
      : null

  return (
    <TransitionCtx.Provider value={{ dir, exiting: !!exit }}>
      <div className="relative">
        <div
          ref={pageRef}
          className={enterAnim ?? undefined}
          style={{ position: 'relative', zIndex: enterAnim?.startsWith('rt-push') ? 10 : 0 }}
        >
          {outlet}
        </div>
        {exit && (
          <div
            aria-hidden
            className={exit.anim}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: -exit.y,
              zIndex: exit.z,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: exit.html }} />
            {exit.barHtml && <div dangerouslySetInnerHTML={{ __html: exit.barHtml }} />}
          </div>
        )}
      </div>
    </TransitionCtx.Provider>
  )
}
