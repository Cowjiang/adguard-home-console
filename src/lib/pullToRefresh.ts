/**
 * Mobile pull-to-refresh (in-house): shares the gesture framework of
 * routeTransition's edge swipe — window touch listeners + intent detection +
 * non-passive preventDefault + transform following the finger, committed only
 * on release. body's overscroll-behavior-y:none already suppresses the
 * browser's native pull-to-refresh (full page reload) and rubber-banding, so
 * once this takes over there is no double triggering.
 *
 * Yield rules vs the edge swipe (both listen on window touch):
 *  - a touch inside the left edge strip yields to the swipe (at touchstart);
 *  - horizontal intent yields, only vertical intent takes over; disabled
 *    during transitions (busy) / swipe gestures / refreshing;
 *  - takes over only when the page is scrolled to the top (window.scrollY <= 0).
 *
 * Snapshot safety: content translation is applied to Layout's wrapper and the
 * indicator renders at Layout level, both outside capturePage's clone; disabled
 * during transitions and swipes, so transforms are always idle when a snapshot
 * is captured. The under-swipe snapshot already tolerates content drift (data
 * polling keeps changing) and the refresh does not change layout.
 */
import { useEffect, useRef, useState } from 'react'
import { useGestureActive, useTransitionBusy } from './routeTransition'

/** Left edge strip: yields to the edge swipe (aligned with routeTransition's EDGE_PX) */
const EDGE_YIELD_PX = 24
/** Vertical intent: take over only when pull exceeds this distance and
 *  vertical dominates */
const ENGAGE_PX = 12
/** Pull distance that triggers refresh on release */
const THRESHOLD_PX = 64
/** Cap for the finger-following offset; excess is damped */
const MAX_PX = 96

export function usePullToRefresh(onRefresh: () => Promise<unknown>, enabled: boolean) {
  const busy = useTransitionBusy()
  const gesturing = useGestureActive()
  const [refreshing, setRefreshing] = useState(false)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const indicatorRef = useRef<HTMLDivElement | null>(null)
  const refreshRef = useRef(onRefresh)
  refreshRef.current = onRefresh
  const refreshingRef = useRef(false)
  // Gesture callbacks mounted once; busy/gesturing/enabled read latest via ref
  const gateRef = useRef({ busy, gesturing, enabled })
  gateRef.current = { busy, gesturing, enabled }

  useEffect(() => {
    if (!enabled) return
    const st = { armed: false, on: false, x0: 0, y0: 0, pull: 0 }

    const apply = (pull: number) => {
      const content = contentRef.current
      if (content) content.style.transform = pull > 0 ? `translate3d(0, ${Math.round(pull)}px, 0)` : ''
      const indicator = indicatorRef.current
      if (indicator) {
        const p = Math.min(1, pull / THRESHOLD_PX)
        indicator.style.opacity = pull > 4 ? String(Math.min(1, p * 1.5)) : '0'
        // Indicator follows the finger 1:1 (LAYOUT anchored at safe+16, card
        // top at safe+64), always 12px above the card top
        indicator.style.transform = `translate3d(0, ${Math.round(pull)}px, 0) scale(${(0.55 + 0.45 * p).toFixed(3)})`
      }
    }
    // Release settle/bounce is left to CSS transition; imperative
    // finger-following during the drag
    const withAnim = (on: boolean) => {
      for (const el of [contentRef.current, indicatorRef.current]) el?.classList.toggle('ptr-anim', on)
    }

    const onStart = (e: TouchEvent) => {
      const gate = gateRef.current
      if (gate.busy || gate.gesturing || refreshingRef.current) return
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      if (t.clientX <= EDGE_YIELD_PX) return
      if (window.scrollY > 0) return
      st.armed = true
      st.on = false
      st.x0 = t.clientX
      st.y0 = t.clientY
      st.pull = 0
    }

    const onMove = (e: TouchEvent) => {
      if (!st.armed || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - st.x0
      const dy = t.clientY - st.y0
      if (!st.on) {
        // Horizontal intent yields to the swipe/lateral gesture; insufficient
        // pull means not engaged yet, don't disturb native scrolling
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          st.armed = false
          return
        }
        if (dy <= ENGAGE_PX) return
        st.on = true
      }
      if (e.cancelable) e.preventDefault()
      const raw = Math.max(0, dy - ENGAGE_PX)
      st.pull = raw <= MAX_PX ? raw : MAX_PX + (raw - MAX_PX) * 0.2
      withAnim(false)
      apply(st.pull)
    }

    const onEnd = () => {
      if (!st.armed) return
      st.armed = false
      if (!st.on) return
      st.on = false
      withAnim(true)
      if (st.pull < THRESHOLD_PX) {
        st.pull = 0
        apply(0)
        return
      }
      // Refreshing: content and spinner bounce back to base together (iOS
      // native feel); the spinner rests in the whitespace band below the pill
      // (safe+16, card top safe+64, 12px gap) and keeps spinning until
      // refreshAll settles; Layout has faded the pill out to make room;
      // further pulls are blocked meanwhile
      refreshingRef.current = true
      setRefreshing(true)
      st.pull = 0
      apply(0)
      const indicator = indicatorRef.current
      if (indicator) {
        indicator.style.opacity = '1'
        indicator.style.transform = 'translate3d(0, 0px, 0) scale(1)'
      }
      Promise.resolve(refreshRef.current())
        .catch(() => {})
        .then(() => {
          refreshingRef.current = false
          setRefreshing(false)
          withAnim(true)
          apply(0)
        })
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

  return { contentRef, indicatorRef, refreshing }
}
