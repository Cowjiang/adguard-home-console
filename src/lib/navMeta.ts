/**
 * Navigation meta: decouples "transition animation direction" from "history
 * stack operation".
 *
 * The back swipe relies on the WKWebView history stack (backForwardList), so
 * jumps between tab root pages must replace or the previous tab gets pushed
 * onto the stack (otherwise the swipe would go back across tabs, see the
 * routing/transition conventions in docs/web-interaction.md); but replace has
 * no transition by default. markNavAnim('push') makes TransitionArea play the
 * usual push translation for such replaces — visually a drill-down, stack-wise
 * a sibling move.
 */
import { useNavigate } from 'react-router-dom'

let pending: 'push' | null = null

/** Mark the next navigation to animate as push (used together with replace) */
export function markNavAnim(kind: 'push') {
  pending = kind
}

/** TransitionArea reads and clears the marker when the route commits */
export function consumeNavAnim(): 'push' | null {
  const v = pending
  pending = null
  return v
}

/**
 * Cross-tab jump: replace (no history entry → not back-swipeable) + push
 * transition animation. For business entries between tab root pages
 * (e.g. overview → logs/clients); semantics = switching tabs.
 */
export function useTabJump() {
  const nav = useNavigate()
  return (to: string) => {
    markNavAnim('push')
    nav(to, { replace: true })
  }
}
