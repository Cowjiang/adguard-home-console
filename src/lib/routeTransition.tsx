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
import { useLocation, useNavigate, useNavigationType, useOutlet } from 'react-router-dom'
import { consumeBackTap, markBackTap, peekBackTap } from './backNav'
import { consumeNavAnim } from './navMeta'
import { isAppleMobile } from './nativePickers'
import { TAB_ROOT_ROUTES } from './routes'
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

/* ---------- 转场前半程(模块级 store) ----------
 * 原生控件悬浮在 WebView 之上、不参与 CSS 平移,等转场**过半**再动作,观感上
 * 与页面同步:进场过半时淡入、退场过半时淡出。 */
const HALF_MS = 170
const halfSubs = new Set<() => void>()
let halfBusy = false

function setHalfBusy(v: boolean) {
  if (v === halfBusy) return
  halfBusy = v
  halfSubs.forEach((f) => f())
}

/** 是否处于转场前半程(转场开始 ~170ms 内);非转场期间恒为 false */
export function useTransitionHalfBusy(): boolean {
  return useSyncExternalStore(
    (cb) => {
      halfSubs.add(cb)
      return () => halfSubs.delete(cb)
    },
    () => halfBusy
  )
}

/** 转场过半的时间点(毫秒),原生控件据此延后出场/退场 */
export const TRANSITION_HALF_MS = HALF_MS

const TransitionCtx = createContext<TransitionInfo>({ dir: null, exiting: false })

/** 页面内部组件(如 PageHeader、Screen)读取当前转场态 */
export const useRouteTransition = () => useContext(TransitionCtx)

/* ---------- 边缘侧滑(自研) ----------
 * WKWebView 的同文档侧滑下层是空的:手势进行中 WebKit 只渲染空白底(实测
 * 逐帧取证,见 .agents/logs/tauri-ios.md),commit 之后才轮到我们的页面渲染,
 * 观感就是"原页空白 → 内容忽然出现"。这条路径不受我们控制,故关掉
 * allowsBackForwardNavigationGestures,改由自身手势驱动:
 *   1. 每次 push 时把"来路页面"的克隆存进 underlays(按历史条目 idx),
 *      拖拽开始时把该克隆挂成底层,滑出的上层永远是真实内容;
 *   2. 拖拽只改 transform(命令式,不经 React),松手才决定是否真地 nav(-1)
 *      —— 取消时零成本,不重挂载、不回退历史;
 *   3. 提交时一次性切到真实路由(instant),底层克隆与真实页面像素一致,
 *      切换不可见。
 * 只对 iOS 壳生效(浏览器/桌面端有各自的原生历史手势)。 */

interface Underlay {
  node: HTMLElement
  barNode: HTMLElement | null
  pillNode: HTMLElement | null
  y: number
}

/** 页面快照:cloneNode 直挂真实 DOM 节点。不能走 innerHTML 序列化再解析 ——
 *  HTML 解析器不允许 button 嵌套 button(可点行内含开关按钮),解析后里层
 *  按钮会被拆成兄弟节点,整行布局塌掉(开关"换行"到行下左侧)。 */
function capturePage(pageRef: { current: HTMLElement | null }): Underlay | null {
  const live = pageRef.current
  if (!live) return null
  const node = live.cloneNode(true) as HTMLElement
  node.querySelectorAll('.page-in,.content-in,.tab-in,.rise-in,.log-flash').forEach((el) => {
    el.classList.remove('page-in', 'content-in', 'tab-in', 'rise-in', 'log-flash')
  })
  // 只在 body 直接子元素里找实时导航条:转场快照克隆的导航条在 #root 内,且下面会
  // 摘掉它的 data-floating-nav —— 否则手势的 querySelector 会命中快照而不是实时元素
  const bar = document.body.querySelector(':scope > [data-floating-nav]')
  let barNode: HTMLElement | null = null
  if (bar instanceof HTMLElement) {
    barNode = bar.cloneNode(true) as HTMLElement
    barNode.removeAttribute('data-floating-nav')
    // 快照里不补显任何自定义按钮:凡能被原生控件接管的按钮一律不出现自定义版本,
    // 侧滑揭示时由原生返回胶囊在原位补上(见 nativeBackButton 的手势策略)
  }
  // 顶部状态 pill(Layout 的 TopBar,挂在页面容器之外):push 离开 tab 根页时随
  // 退场层/侧滑下层保留,否则转场首帧顶部就是「pill 已消失」的空洞。它是 fixed
  // 元素,渲染时挂视口容器直接子级(不进 -y 滚动对齐层),与旧页滚动位置无关;
  // 克隆摘掉标记与入场动画,避免后续捕获命中快照或重播淡入
  const pill = document.querySelector('[data-status-pill]')
  let pillNode: HTMLElement | null = null
  if (pill instanceof HTMLElement) {
    pillNode = pill.cloneNode(true) as HTMLElement
    pillNode.removeAttribute('data-status-pill')
    pillNode.classList.remove('rt-pill-in')
    pillNode.style.animation = ''
  }
  return { node, barNode, pillNode, y: Math.max(0, Math.round(window.scrollY)) }
}

/** 把快照节点挂进 React 渲染的空壳层(ref 每次提交都会跑,replaceChildren 幂等) */
function attachNode(node: Node) {
  return (el: HTMLDivElement | null) => {
    if (el) el.replaceChildren(node)
  }
}

const underlays = new Map<number, Underlay>()
const UNDERLAY_MAX = 6

const gestureSubs = new Set<() => void>()
let gestureOn = false

function setGestureOn(v: boolean) {
  if (v === gestureOn) return
  gestureOn = v
  gestureSubs.forEach((f) => f())
}

/** 侧滑手势进行中(原生返回按钮据此让位给随页滑动的 CSS 胶囊) */
export function useGestureActive(): boolean {
  return useSyncExternalStore(
    (cb) => {
      gestureSubs.add(cb)
      return () => gestureSubs.delete(cb)
    },
    () => gestureOn
  )
}

/* 侧滑提交(松手判定返回)后,本次导航不做 CSS 关键帧转场:页面在拖拽结束时
   已经就位,只需要把真实路由换上来。用自增序号让多个消费者各读一次。 */
let commitSeq = 0
/** 提交后尚未被 TransitionArea 消费的窗口:peekAnimatedPop 据此把侧滑提交排除在
 *  「动画返回」之外(它没有 CSS 转场,pill 必须瞬现) */
let gestureCommitPending = false

function noteGestureCommit() {
  commitSeq++
  gestureCommitPending = true
}

/** 本次路由提交是否来自侧滑提交(每个消费者对一次提交只返回一次 true) */
export function consumeGestureCommit(seen: { current: number }): boolean {
  if (seen.current === commitSeq) return false
  seen.current = commitSeq
  gestureCommitPending = false
  return true
}

/** 渲染期窥探:本次提交是否为会播 CSS 动画的返回(back 标记且非侧滑提交)。
 *  一次性标记仍由 TransitionArea 布局效应正常消费,这里只读不改 */
function peekAnimatedPop(): boolean {
  return peekBackTap() && !gestureCommitPending
}

/** 本次提交是否经由「会播 CSS 动画的返回」落地 tab 根页。顶部状态 pill(TopBar)
 *  常驻 Layout(二级页只是 return null,不卸载),不能靠挂载初始化判定;按
 *  pathname 在布局效应里窥探 back 标记 —— TopBar 的效应先于 TransitionArea
 *  消费一次性标记,且 setState 在首帧绘制前完成,不会闪一帧无动画的 pill。
 *  动画 fill both 会持续压住内联 opacity(下拉刷新的 dimmed 淡出失效),窗口
 *  结束必须摘除 */
export function useArrivalPopAnim(pathname: string): boolean {
  const [on, setOn] = useState(false)
  useLayoutEffect(() => {
    if (!peekAnimatedPop()) {
      setOn(false)
      return
    }
    setOn(true)
    const t = setTimeout(() => setOn(false), DURATION_MS + 50)
    return () => clearTimeout(t)
  }, [pathname])
  return on
}

const EDGE_PX = 24
const ENGAGE_PX = 10
const COMMIT_RATIO = 0.5
const FLICK_V = 0.5
/** 下层快照视差。取 0:拖拽是"按住可审视"的中间态,下层必须与返回落地后的
 *  页面逐像素一致(行内的开关等右缘控件才不会先被盖住、又整体偏移地出现)。
 *  这也与 UIKit 交互式返回一致 —— 揭示页停在终位,只有上层滑走。 */
const PARALLAX = 0

/** 自研侧滑只在 iOS 壳内接管:浏览器/桌面有各自的原生历史手势,不该被我们抢 */
let tauriIOS: boolean | null = null
export function isTauriIOS(): boolean {
  if (tauriIOS === null) {
    tauriIOS =
      typeof window !== 'undefined' &&
      '__TAURI_INTERNALS__' in window &&
      isAppleMobile()
  }
  return tauriIOS
}

function trimUnderlays(current: number) {
  for (const k of [...underlays.keys()]) if (k > current) underlays.delete(k)
  const keys = [...underlays.keys()].sort((a, b) => a - b)
  while (keys.length > UNDERLAY_MAX) {
    const k = keys.shift()
    if (k !== undefined) underlays.delete(k)
  }
}

function setTransform(el: Element | null, p: number, kind: 'page' | 'under') {
  if (!(el instanceof HTMLElement)) return
  const x = kind === 'page' ? p * 100 : (p - 1) * PARALLAX * 100
  el.style.transform = `translate3d(${x}%, 0, 0)`
}

/** iOS 页面转场曲线 cubic-bezier(0.32,0.72,0,1) */
function iosCurve(t: number): number {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const x = 3 * (1 - mid) * (1 - mid) * mid * 0.32 + 3 * (1 - mid) * mid * mid * 0 + mid * mid * mid
    if (x < t) lo = mid
    else hi = mid
  }
  const u = (lo + hi) / 2
  return 3 * (1 - u) * (1 - u) * u * 0.72 + 3 * (1 - u) * u * u * 1 + u * u * u
}

function useEdgeSwipe(pageRef: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  const nav = useNavigate()
  const [layer, setLayer] = useState<Underlay | null>(null)
  const navRef = useRef(nav)
  navRef.current = nav
  const applyRef = useRef<(p: number) => void>(() => {})
  const st = useRef({
    armed: false, on: false, x0: 0, y0: 0, p: 0, lastX: 0, lastT: 0, v: 0,
    under: null as Underlay | null,
    els: null as { page: HTMLElement | null; bar: HTMLElement | null; under: HTMLElement | null; underBar: HTMLElement | null } | null,
    raf: 0,
  })

  const apply = (p: number) => {
    const s = st.current
    if (!s.els || !(s.els.under instanceof HTMLElement)) {
      s.els = {
        page: pageRef.current,
        bar: document.body.querySelector(':scope > [data-floating-nav]'),
        under: document.querySelector('[data-rt-underlay]'),
        underBar: document.querySelector('[data-rt-underlay-bar]'),
      }
    }
    const e = s.els
    setTransform(e.page, p, 'page')
    setTransform(e.bar, p, 'page')
    setTransform(e.under, p, 'under')
    setTransform(e.underBar, p, 'under')
  }
  applyRef.current = apply

  /** 收尾:摘 transform、卸下层快照、结束手势态。取消路径直接调;提交路径
   *  必须等真实路由提交后的布局效应再调 —— 若在 nav(-1) 之前清 transform,
   *  React 提交前的几帧会把子页整屏弹回 translate 0,盖在下层快照上(闪帧) */
  const clear = () => {
    const s = st.current
    if (s.raf) cancelAnimationFrame(s.raf)
    s.raf = 0
    if (s.els) {
      for (const el of [s.els.page, s.els.bar]) if (el instanceof HTMLElement) el.style.transform = ''
    }
    s.els = null
    s.on = false
    s.armed = false
    s.under = null
    setGestureOn(false)
    setLayer(null)
  }

  const settle = (commit: boolean) => {
    const s = st.current
    const target = commit ? 1 : 0
    const remain = Math.abs(target - s.p)
    const dur = Math.max(110, 300 * remain)
    const from = s.p
    const t0 = performance.now()
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / dur)
      const p = from + (target - from) * iosCurve(t)
      s.p = p
      apply(p)
      if (t < 1) {
        s.raf = requestAnimationFrame(step)
        return
      }
      s.raf = 0
      s.p = target
      apply(target)
      if (commit) {
        // 页面已拖到就位:保持现状(子页在 100% 外、下层快照铺满),等真实
        // 路由提交后由转场层布局效应统一收尾;这里绝不能先摘 transform
        noteGestureCommit()
        markBackTap()
        navRef.current(-1)
      } else {
        clear()
      }
    }
    s.raf = requestAnimationFrame(step)
  }

  useEffect(() => {
    if (!enabled) return
    const onStart = (e: TouchEvent) => {
      const s = st.current
      if (s.on || s.armed || busy || e.touches.length !== 1) { return }
      const t = e.touches[0]
      if (t.clientX > EDGE_PX) { return }
      const u = underlays.get(historyIdx())
      if (!u) { return }
      s.armed = true
      s.x0 = t.clientX
      s.y0 = t.clientY
      s.lastX = t.clientX
      s.lastT = performance.now()
      s.v = 0
      s.p = 0
      s.under = u
      s.els = null
    }
    const onMove = (e: TouchEvent) => {
      const s = st.current
      if (!s.armed || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - s.x0
      const dy = t.clientY - s.y0
      if (!s.on) {
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
          s.armed = false
          return
        }
        if (dx < ENGAGE_PX) return
        s.on = true
        setGestureOn(true)
        setLayer(s.under)
      }
      if (e.cancelable) e.preventDefault()
      const now = performance.now()
      const dt = now - s.lastT
      if (dt > 0) s.v = (t.clientX - s.lastX) / dt
      s.lastX = t.clientX
      s.lastT = now
      s.p = Math.min(1, Math.max(0, dx / window.innerWidth))
      applyRef.current(s.p)
    }
    const onEnd = () => {
      const s = st.current
      if (!s.armed) return
      if (!s.on) {
        s.armed = false
        return
      }
      settle(s.p >= COMMIT_RATIO || s.v > FLICK_V)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled])

  return { layer, clear }
}



/** 本组件实例挂载时正处于滑动转场 → 跳过入场动画,闩一次性(与 usePageInClass
 *  同语义,供 page-in 之外的入场动画复用:tab-in / content-in 等)。
 *  背景:WKWebView 手势转场期间 CSS 动画可能被挂起,fill-mode both 的入场
 *  动画首帧 opacity:0 = 落地页整页空白,转场结束才忽然出现。 */
export function useEnterSkip(): boolean {
  const t = useRouteTransition()
  const skip = useRef(false)
  if (t.dir) skip.current = true
  return skip.current
}

const DURATION_MS = 340

/** 各历史条目(idx)的滚动位置记忆;scrollRestoration=manual 后由我们恢复 */
const scrollMem = new Map<number, number>()

function historyIdx(): number {
  return (window.history.state as { idx?: number } | null)?.idx ?? -1
}

/** 退场快照:旧页内容 + 固定导航条克隆 */
interface ExitLayer {
  key: string
  node: HTMLElement
  barNode: HTMLElement | null
  pillNode: HTMLElement | null
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
  const gestureCommitSeen = useRef(0)
  const gesture = useEdgeSwipe(pageRef, !isDesktop && isTauriIOS())
  const gestureLayer = gesture.layer
  // 渲染期捕获(先于 commit):此刻容器里还是旧页面的 DOM
  const captureRef = useRef<(Underlay & { key: string }) | null>(null)

  if (location.key !== prevKeyRef.current) {
    const cap = capturePage(pageRef)
    if (cap) captureRef.current = { ...cap, key: prevKeyRef.current }
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

    // 来路快照:push 落地后,当前历史条目的"上一层页面"就是本次捕获的旧页,
    // 自研侧滑靠它渲染下层(WebKit 同文档手势的下层是空的)
    if (cap) {
      const idx = historyIdx()
      if (navType === 'PUSH') underlays.set(idx, { node: cap.node, barNode: cap.barNode, pillNode: cap.pillNode, y: cap.y })
      else if (navType === 'POP') trimUnderlays(idx)
      else trimUnderlays(idx - 1)
    }

    // 滚动仲裁必须发生在首帧绘制前:PUSH 回顶,POP 恢复目标条目记忆位置
    if (navType === 'POP') {
      const ry = scrollMem.get(historyIdx()) ?? 0
      window.scrollTo(0, ry)
      pendingRestore.current = window.scrollY === ry ? null : { y: ry, until: Date.now() + 600 }
    } else {
      pendingRestore.current = null
      window.scrollTo(0, 0)
    }

    // 侧滑提交:页面在拖拽里已经就位(子页在 100% 外、下层快照铺满),这里只把
    // 真实路由换上来,不能再播一遍关键帧转场;transform 与下层快照在本布局效应
    // 里统一摘除(绘制前),下层快照若不摘会留在页面下方从后续透明区透出
    if (consumeGestureCommit(gestureCommitSeen)) {
      gesture.clear()
      setExit(null)
      setEnterAnim(null)
      setBusy(false)
      setNavDir('pop')
      const t = setTimeout(() => setNavDir(null), 80)
      return () => clearTimeout(t)
    }

    // 方向仲裁:dir = CSS 快照转场方向;跨 tab 跳转(replace + navMeta 标记)
    // 视觉按 push 处理,栈上平级不进历史
    const marked = consumeNavAnim()
    let dir: TransitionDir | null = null
    if (navType === 'PUSH' && !TAB_ROOT_ROUTES.includes(location.pathname)) dir = 'push'
    else if (navType === 'POP' && consumeBackTap()) dir = 'pop'
    else if (navType !== 'POP' && marked === 'push') dir = 'push'

    // 滑动转场语义方向:无 CSS 动画的 POP(原生手势;自研侧滑提交)同样算,
    // page-in 闩据此跳过入场动画
    const slideDir: TransitionDir | null = dir ?? (navType === 'POP' ? 'pop' : null)
    setNavDir(slideDir)

    if (!dir || isDesktop || !cap) {
      setExit(null)
      setEnterAnim(null)
      setBusy(false)
      setHalfBusy(false)
      const t = setTimeout(() => setNavDir(null), DURATION_MS + 50)
      return () => clearTimeout(t)
    }

    setBusy(true)
    setHalfBusy(true)
    const halfTimer = setTimeout(() => setHalfBusy(false), HALF_MS)
    setExit({
      key: cap.key,
      node: cap.node,
      barNode: cap.barNode,
      pillNode: cap.pillNode,
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
    return () => {
      clearTimeout(halfTimer)
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, navType, isDesktop])

  return (
    <TransitionCtx.Provider value={{ dir: navDir, exiting: !!exit }}>
      <div className="relative">
        {gestureLayer && (
          <div
            data-rt-underlay
            aria-hidden
            className="rt-page-bg"
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              top: 0,
              height: '100dvh',
              zIndex: 0,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            <div style={{ position: 'absolute', left: 0, right: 0, top: -gestureLayer.y }} ref={attachNode(gestureLayer.node)} />
            {gestureLayer.barNode && <div data-rt-underlay-bar ref={attachNode(gestureLayer.barNode)} />}
            {/* pill 是 fixed 悬浮件:挂视口容器直接子级、不进 -y 滚动对齐层,旧页滚到多深都在顶位 */}
            {gestureLayer.pillNode && <div ref={attachNode(gestureLayer.pillNode)} />}
          </div>
        )}
        <div
          ref={pageRef}
          className={enterAnim ? `${enterAnim} rt-page-bg` : gestureLayer ? 'rt-page-bg' : undefined}
          style={{
            position: 'relative',
            // 转场层不透明化后必须盖满视口:矮内容页(如规则编辑)容器高度不足,
            // 下半屏会透出退场快照/侧滑下层
            minHeight: enterAnim || gestureLayer ? '100dvh' : undefined,
            zIndex: enterAnim?.startsWith('rt-push') ? 10 : gestureLayer ? 1 : 0,
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
            <div style={{ position: 'absolute', left: 0, right: 0, top: -exit.y }} ref={attachNode(exit.node)} />
            {/* pill 是 fixed 悬浮件:挂视口容器直接子级、不进 -y 滚动对齐层,旧页滚到多深都在顶位 */}
            {exit.pillNode && <div ref={attachNode(exit.pillNode)} />}
            {exit.barNode && <div ref={attachNode(exit.barNode)} />}
          </div>
        )}
      </div>
    </TransitionCtx.Provider>
  )
}
