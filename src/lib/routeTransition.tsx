/**
 * iOS-style push/pop route transitions (wraps the Outlet inside Layout).
 *
 * How it works: on route commit the old page's DOM is cloned into a static
 * snapshot serving as the "exit layer" (zero remounts; content and scroll
 * position are absolutely true), while the new page renders at the same time
 * as the "enter layer": push = new page slides in from the right, old page
 * yields leftward; pop = old page slides out to the right, new page settles
 * back from a shallow left offset. The snapshot is removed when the animation
 * ends. The fixed nav bar (PageHeader portal) reads the direction via
 * useRouteTransition and translates in sync.
 *
 * Direction rules:
 *  - PUSH whose target is not a tab root (tab switches are NavLink pushes) -> push;
 *  - POP carrying a backNav mark (back button tapped) -> pop; POPs triggered
 *    by the swipe gesture get no CSS animation and are handed over to the
 *    WKWebView native snapshot animation (see feat/ios-swipe-back);
 *  - REPLACE + navMeta mark (cross-tab jump) -> animated as push but not
 *    pushed onto the history stack;
 *  - Remaining REPLACEs (login/redirect) and desktop (>=lg) switch instantly.
 *
 * Transition direction semantics (dir) are decoupled from the CSS animation:
 * even a swipe-back with no CSS animation must still reach page components
 * (the page-in latch) with a direction -- otherwise the landing page replays
 * its enter animation (fill-mode both makes the first frame opacity:0; during
 * an iOS gesture transition the animation can also be suspended and never
 * start -> a fully blank page).
 *
 * Scroll arbitration: history.scrollRestoration = 'manual'; scroll is
 * remembered/restored per history entry idx by us, synchronously before the
 * first paint (useLayoutEffect), so the browser's async restore can never make
 * the page jump up or down. The snapshot layer aligns to the old page's scroll
 * position via top:-y.
 */
import {
  createContext, useContext, useEffect, useLayoutEffect, useRef, useState,
  useSyncExternalStore, type ReactNode,
} from 'react'
import { useLocation, useNavigate, useNavigationType, useOutlet } from 'react-router-dom'
import { consumeBackTap, markBackTap, peekBackTap } from './nav/backNav'
import { consumeNavAnim } from './nav/navMeta'
import { isTauriIOS } from './native/shell'
import { TAB_ROOT_ROUTES } from './nav/routes'
import { useIsDesktop } from './useIsDesktop'

export type TransitionDir = 'push' | 'pop'

interface TransitionInfo {
  /** Slide-transition semantic direction (CSS animation or native swipe
   *  snapshot); null = rendering without a slide transition */
  dir: TransitionDir | null
  /** CSS snapshot transition in progress (exit layer exists); false for
   *  native gesture transitions */
  exiting: boolean
}

/* ---------- Transition busy state (module-level store) ----------
 * The native glass back button floats above the WebView and cannot take part
 * in CSS translation; it must be created only after the CSS transition ends
 * (useTransitionBusy), otherwise it flashes mid-push and looks broken. */
const busySubs = new Set<() => void>()
let busy = false

function setBusy(v: boolean) {
  if (v === busy) return
  busy = v
  busySubs.forEach((f) => f())
}

/** Whether a CSS snapshot transition is currently running */
export function useTransitionBusy(): boolean {
  return useSyncExternalStore(
    (cb) => {
      busySubs.add(cb)
      return () => busySubs.delete(cb)
    },
    () => busy
  )
}

/* ---------- First half of a transition (module-level store) ----------
 * Native controls float above the WebView and take no part in CSS translation;
 * they act only once the transition is **past halfway** so they stay visually
 * in sync with the page: fade in when entering past halfway, fade out when
 * exiting past halfway. */
const HALF_MS = 170
const halfSubs = new Set<() => void>()
let halfBusy = false

function setHalfBusy(v: boolean) {
  if (v === halfBusy) return
  halfBusy = v
  halfSubs.forEach((f) => f())
}

/** Whether we are in a transition's first half (~170ms from its start);
 *  always false outside transitions */
export function useTransitionHalfBusy(): boolean {
  return useSyncExternalStore(
    (cb) => {
      halfSubs.add(cb)
      return () => halfSubs.delete(cb)
    },
    () => halfBusy
  )
}

/** Transition halfway point (ms); native controls delay enter/exit by it */
export const TRANSITION_HALF_MS = HALF_MS

const TransitionCtx = createContext<TransitionInfo>({ dir: null, exiting: false })

/** For page-internal components (PageHeader, Screen, ...) to read the transition state */
export const useRouteTransition = () => useContext(TransitionCtx)

/* ---------- Edge swipe (home-grown) ----------
 * The underlay of WKWebView's same-document swipe is empty: while the gesture
 * runs, WebKit renders only a blank backdrop (verified frame by frame, see
 * .agents/logs/tauri-ios.md); our page only gets to render after commit, so it
 * looks like "old page goes blank -> content suddenly appears". That path is
 * outside our control, so allowsBackForwardNavigationGestures is disabled and
 * a gesture of our own drives it instead:
 *   1. On every push, store a clone of the "previous page" in underlays (keyed
 *      by history entry idx); at drag start attach that clone as the underlay
 *      so the sliding top layer is always real content;
 *   2. Dragging only mutates transform (imperative, not via React); whether to
 *      actually nav(-1) is decided on release only -- cancelling costs
 *      nothing: no remounts, no history rewind;
 *   3. On commit, switch to the real route in one instant step; the underlay
 *      clone is pixel-identical to the real page, so the switch is invisible.
 * Only active in the iOS shell (browsers/desktop have their own native history
 * gestures). */

interface Underlay {
  node: HTMLElement
  barNode: HTMLElement | null
  pillNode: HTMLElement | null
  y: number
}

/** One-shot entrance animations are never replayed inside a snapshot: a clone
 *  re-inserted into the DOM restarts its CSS animations, and these all start
 *  off-screen or transparent (rt-push-in from translate(100%), rt-pop-in from
 *  -28%, page-in from opacity 0), so the revealed old page would be blank or
 *  shifted for the whole animation.
 *
 *  The **root** matters as much as the descendants: while a transition runs,
 *  the page container itself carries the rt-* class (inline style cannot
 *  outrank a running animation either), so a capture taken in that window --
 *  navigating again within DURATION_MS, e.g. a quick drill-down -- inherits it
 *  and the underlay/exit layer replays the enter animation. Stripping only the
 *  descendants (the old behavior) left exactly that hole. */
const SNAPSHOT_STRIP_CLASSES = [
  'page-in',
  'content-in',
  'tab-in',
  'rise-in',
  'log-flash',
  'rt-push-in',
  'rt-push-out',
  'rt-pop-in',
  'rt-pop-out',
  'rt-pill-in',
]
const SNAPSHOT_STRIP_SELECTOR = SNAPSHOT_STRIP_CLASSES.map((c) => `.${c}`).join(',')

/** Static snapshot hygiene: drop the transition classes from the node and its
 *  descendants, and clear the node's own inline transform/animation/transition
 *  (a capture taken mid-drag would otherwise bake the drag's transform into the
 *  snapshot) */
function sanitizeSnapshot(node: HTMLElement) {
  node.classList.remove(...SNAPSHOT_STRIP_CLASSES)
  node.style.transform = ''
  node.style.animation = ''
  node.style.transition = ''
  node.querySelectorAll(SNAPSHOT_STRIP_SELECTOR).forEach((el) => el.classList.remove(...SNAPSHOT_STRIP_CLASSES))
}

/** Page snapshot: cloneNode, attached as real DOM nodes. Must not go through
 *  innerHTML serialization + reparsing -- the HTML parser forbids button
 *  nested inside button (tappable rows contain switch buttons), so after
 *  parsing the inner button becomes a sibling node and the whole row's layout
 *  collapses (the switch "wraps" to the left under the row). */
function capturePage(pageRef: { current: HTMLElement | null }): Underlay | null {
  const live = pageRef.current
  if (!live) return null
  const node = live.cloneNode(true) as HTMLElement
  sanitizeSnapshot(node)
  // Look for the live nav bar only among body's direct children: nav bars
  // cloned by transition snapshots live inside #root, and data-floating-nav is
  // stripped from them below -- otherwise the gesture's querySelector would
  // hit a snapshot instead of the live element
  const bar = document.body.querySelector(':scope > [data-floating-nav]')
  let barNode: HTMLElement | null = null
  if (bar instanceof HTMLElement) {
    barNode = bar.cloneNode(true) as HTMLElement
    barNode.removeAttribute('data-floating-nav')
    // The bar carries rt-push-in/rt-pop-in while a transition runs (barAnim);
    // a snapshot must not replay it
    sanitizeSnapshot(barNode)
    // Do not re-show custom buttons in the snapshot: any button a native
    // control can take over never gets a custom version; the native back pill
    // fills its spot in place as the swipe reveals it (see nativeBackButton's
    // gesture policy)
  }
  // Top status pill (Layout's TopBar, mounted outside the page container):
  // kept in the exit layer / swipe underlay when a push leaves a tab root,
  // otherwise the transition's first frame has a "pill vanished" hole at the
  // top. It is fixed, so at render it is attached as a direct child of the
  // viewport container (not into the -y scroll-aligned layer), independent of
  // the old page's scroll position; the clone drops the marker and the enter
  // animation so later captures don't hit the snapshot or replay the fade-in
  const pill = document.querySelector('[data-status-pill]')
  let pillNode: HTMLElement | null = null
  if (pill instanceof HTMLElement) {
    pillNode = pill.cloneNode(true) as HTMLElement
    pillNode.removeAttribute('data-status-pill')
    // Drops the rt-pill-in entrance (an arriving pop animates the live pill)
    sanitizeSnapshot(pillNode)
  }
  return { node, barNode, pillNode, y: Math.max(0, Math.round(window.scrollY)) }
}

/** Attaches the snapshot node into the React-rendered empty shell layer (the
 *  ref runs on every commit; replaceChildren is idempotent) */
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

/** Whether the swipe gesture is active (the native back button yields to the
 *  CSS pill that slides along with the page) */
export function useGestureActive(): boolean {
  return useSyncExternalStore(
    (cb) => {
      gestureSubs.add(cb)
      return () => gestureSubs.delete(cb)
    },
    () => gestureOn
  )
}

/* After a swipe commit (release decided it is a back), this navigation gets no
   CSS keyframe transition: the page is already in place when the drag ends,
   only the real route needs to be swapped in. A self-incrementing sequence
   lets multiple consumers each read it once. */
let commitSeq = 0
/** Window after commit not yet consumed by TransitionArea: peekAnimatedPop uses
 *  it to exclude swipe commits from "animated pops" (they have no CSS
 *  transition, so the pill must appear instantly) */
let gestureCommitPending = false

function noteGestureCommit() {
  commitSeq++
  gestureCommitPending = true
}

/** Whether this route commit came from a swipe commit (each consumer gets true
 *  only once per commit) */
export function consumeGestureCommit(seen: { current: number }): boolean {
  if (seen.current === commitSeq) return false
  seen.current = commitSeq
  gestureCommitPending = false
  return true
}

/** Render-time peek: is this commit an animated back (back mark present and
 *  not a swipe commit). The one-shot mark is still consumed normally by
 *  TransitionArea's layout effect; read-only here */
function peekAnimatedPop(): boolean {
  return peekBackTap() && !gestureCommitPending
}

/** Whether this commit landed on a tab root via an "animated back". The top
 *  status pill (TopBar) lives in Layout permanently (secondary pages just
 *  return null, it never unmounts), so mount-time initialization cannot be
 *  used; peek the back mark keyed by pathname in a layout effect -- TopBar's
 *  effect runs before TransitionArea consumes the one-shot mark, and setState
 *  completes before first paint, so no unanimated pill flashes for a frame.
 *  fill both keeps overriding inline opacity (breaks pull-to-refresh's dimmed
 *  fade-out), so the class must be removed when the window ends */
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
/** Underlay snapshot parallax. Deliberately 0: the drag is a "held for
 *  inspection" intermediate state, and the underlay must be pixel-identical to
 *  the page after the back lands (so right-edge controls like inline switches
 *  don't first get covered and then reappear offset as a whole). This also
 *  matches UIKit interactive pop -- the revealed page sits at its final
 *  position, only the top layer slides away. */
const PARALLAX = 0


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

/** iOS page transition curve cubic-bezier(0.32,0.72,0,1) */
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

  /** Teardown: remove transform, unmount the underlay snapshot, end gesture
   *  state. The cancel path calls it directly; the commit path must wait for
   *  the layout effect after the real route commit -- clearing transform
   *  before nav(-1) would snap the child page back to translate 0 for the
   *  frames before React commits, covering the underlay snapshot (a flash) */
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
        // The page is already dragged into place: keep the state (child page
        // parked at 100%, underlay snapshot filling the screen) and let the
        // transition layer's layout effect finish up after the real route
        // commit; removing the transform here first is strictly forbidden
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



/** If this component instance mounts mid slide-transition, skip the enter
 *  animation; the latch is one-shot (same semantics as usePageInClass, reused
 *  by enter animations other than page-in: tab-in / content-in etc.).
 *  Background: during a WKWebView gesture transition the CSS animation can be
 *  suspended, and a fill-mode both enter animation has first frame opacity:0 =
 *  the landing page is fully blank, appearing only when the transition ends. */
export function useEnterSkip(): boolean {
  const t = useRouteTransition()
  const skip = useRef(false)
  if (t.dir) skip.current = true
  return skip.current
}

const DURATION_MS = 340

/** Scroll position memory per history entry (idx); restored by us once
 *  scrollRestoration=manual */
const scrollMem = new Map<number, number>()

function historyIdx(): number {
  return (window.history.state as { idx?: number } | null)?.idx ?? -1
}

/** Exit snapshot: old page content + fixed nav bar clone */
interface ExitLayer {
  key: string
  node: HTMLElement
  barNode: HTMLElement | null
  pillNode: HTMLElement | null
  /** Old page's scroll position; the snapshot layer aligns via top:-y */
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
  // Slide-transition semantic direction (incl. swipe-back with no CSS
  // animation), consumed by the page-in latch and friends
  const [navDir, setNavDir] = useState<TransitionDir | null>(null)
  const prevKeyRef = useRef(location.key)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const gestureCommitSeen = useRef(0)
  const gesture = useEdgeSwipe(pageRef, !isDesktop && isTauriIOS())
  const gestureLayer = gesture.layer
  // Capture during render (before commit): the container still holds the old
  // page's DOM at this point
  const captureRef = useRef<(Underlay & { key: string }) | null>(null)

  if (location.key !== prevKeyRef.current) {
    const cap = capturePage(pageRef)
    if (cap) captureRef.current = { ...cap, key: prevKeyRef.current }
    prevKeyRef.current = location.key
  }

  // Continuous scroll memory (the previous entry's Y was already recorded by
  // the listener before the transition commits)
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

  // POP restore retry: secondary pages (e.g. log lists) keep entries in local
  // state, so on remount the document cannot scroll in the first frame and the
  // first scrollTo is a no-op; once content arrives, finish scrolling within a
  // short window (without interfering with user scrolling meanwhile)
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

    // Origin snapshot: after a push lands, the "previous page" of the current
    // history entry is exactly the old page captured here; the home-grown
    // swipe relies on it to render the underlay (WebKit's same-document
    // gesture has an empty underlay)
    if (cap) {
      const idx = historyIdx()
      if (navType === 'PUSH') underlays.set(idx, { node: cap.node, barNode: cap.barNode, pillNode: cap.pillNode, y: cap.y })
      else if (navType === 'POP') trimUnderlays(idx)
      else trimUnderlays(idx - 1)
    }

    // Scroll arbitration must happen before first paint: PUSH returns to top,
    // POP restores the target entry's remembered position
    if (navType === 'POP') {
      const ry = scrollMem.get(historyIdx()) ?? 0
      window.scrollTo(0, ry)
      pendingRestore.current = window.scrollY === ry ? null : { y: ry, until: Date.now() + 600 }
    } else {
      pendingRestore.current = null
      window.scrollTo(0, 0)
    }

    // Swipe commit: the page is already in place from the drag (child page
    // parked at 100%, underlay snapshot filling the screen), so only swap in
    // the real route; do not replay a keyframe transition. transform and the
    // underlay snapshot are removed together in this layout effect (before
    // paint) -- if the underlay stayed, it would linger under the page and
    // show through later transparent areas
    if (consumeGestureCommit(gestureCommitSeen)) {
      gesture.clear()
      setExit(null)
      setEnterAnim(null)
      setBusy(false)
      setNavDir('pop')
      const t = setTimeout(() => setNavDir(null), 80)
      return () => clearTimeout(t)
    }

    // Direction arbitration: dir = CSS snapshot transition direction;
    // cross-tab jumps (replace + navMeta mark) look like a push visually while
    // staying same-level on the stack, not entering history
    const marked = consumeNavAnim()
    let dir: TransitionDir | null = null
    if (navType === 'PUSH' && !TAB_ROOT_ROUTES.includes(location.pathname)) dir = 'push'
    else if (navType === 'POP' && consumeBackTap()) dir = 'pop'
    else if (navType !== 'POP' && marked === 'push') dir = 'push'

    // Slide-transition semantic direction: POPs without a CSS animation (native
    // gesture; home-grown swipe commit) count too, so the page-in latch skips
    // the enter animation
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
      // The pop exit layer must cover the fixed nav bar (z-40): the old page
      // slides away above the new page (and its nav bar), iOS-style reveal;
      // z must stay below Sheet (50) / Toast (60)
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
            {/* The pill is a fixed floater: attached as a direct child of the
                viewport container, not into the -y scroll-aligned layer, so it
                stays at the top however deep the old page was scrolled */}
            {gestureLayer.pillNode && <div ref={attachNode(gestureLayer.pillNode)} />}
          </div>
        )}
        <div
          ref={pageRef}
          className={enterAnim ? `${enterAnim} rt-page-bg` : gestureLayer ? 'rt-page-bg' : undefined}
          style={{
            position: 'relative',
            // Once the transition layer is made opaque it must fill the
            // viewport: short-content pages (e.g. rule editing) leave the
            // container short of full height, and the lower half of the screen
            // would show the exit snapshot / swipe underlay through
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
            {/* Viewport lock + inner -y aligns to the old page's scroll: on
                POP the new page restores its remembered scroll position, so a
                snapshot positioned with the document would be offset as a
                whole by y_mem pixels (a visible glitch) */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: -exit.y }} ref={attachNode(exit.node)} />
            {/* The pill is a fixed floater: attached as a direct child of the
                viewport container, not into the -y scroll-aligned layer, so it
                stays at the top however deep the old page was scrolled */}
            {exit.pillNode && <div ref={attachNode(exit.pillNode)} />}
            {exit.barNode && <div ref={attachNode(exit.barNode)} />}
          </div>
        )}
      </div>
    </TransitionCtx.Provider>
  )
}
