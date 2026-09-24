/**
 * 移动端下拉刷新(自研):与 routeTransition 的边缘侧滑同一手势框架 ——
 * window 触摸监听 + 意图判定 + 非 passive preventDefault + transform 跟手,
 * 松手才提交。body 的 overscroll-behavior-y:none 已压掉浏览器原生下拉刷新
 * (整页 reload)与橡皮筋,接管后无双重触发。
 *
 * 与边缘侧滑的让位规则(两者并列监听 window touch):
 *  - 触点落在左缘条内让给侧滑(start 即让位);
 *  - 水平意图让路,垂直意图才接管;转场中(busy)/侧滑手势中/刷新中不启用;
 *  - 只在页面已滚到顶部(window.scrollY <= 0)时接管。
 *
 * 快照安全:内容位移挂在 Layout 的包裹层、指示器在 Layout 层渲染,都不在
 * capturePage 的克隆范围内;转场与侧滑期间禁用,快照捕获时 transform 必为
 * 空闲。侧滑下层快照本就容忍内容漂移(数据轮询一直在变),刷新不改布局。
 */
import { useEffect, useRef, useState } from 'react'
import { useGestureActive, useTransitionBusy } from './routeTransition'

/** 左缘条:让给边缘侧滑(与 routeTransition 的 EDGE_PX 对齐) */
const EDGE_YIELD_PX = 24
/** 垂直意图判定:下拉超过该距离且纵向占优才接管 */
const ENGAGE_PX = 12
/** 松手触发刷新的拖距 */
const THRESHOLD_PX = 64
/** 跟手位移上限,超出部分做阻尼 */
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
  // 手势回调只挂一次,busy/gesturing/enabled 走 ref 读最新值
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
        // 指示器 1:1 跟手(LAYOUT 锚在 safe+16、卡片顶在 safe+64),与卡片顶恒差 12px
        indicator.style.transform = `translate3d(0, ${Math.round(pull)}px, 0) scale(${(0.55 + 0.45 * p).toFixed(3)})`
      }
    }
    // 松手后的收位/回弹交给 CSS transition,拖拽期间保持指令式跟手
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
        // 水平意图让给侧滑/横向手势;下拉不足未接管,不干预原生滚动
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
      // 刷新中:内容与圈一起回弹到基位(iOS 原生手感),圈停在 pill 下方留白带
      // (safe+16,卡片顶 safe+64,间距 12px)持续旋转至 refreshAll 收口,pill 已
      // 由 Layout 淡出让位;期间禁止再次下拉
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
