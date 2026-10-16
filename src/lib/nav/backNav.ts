import type { NavigateFunction } from 'react-router-dom'

/**
 * "Back button tapped" marker: distinguishes programmatic back from the
 * edge-swipe gesture back. Both are POP in react-router, but during a swipe
 * WKWebView already plays its native snapshot translation; a CSS transition
 * moving again would double-animate, so only a POP carrying this marker gets
 * the sliding transition.
 */
let pending = false

export function markBackTap() {
  pending = true
}

/** Read and clear the marker; returns whether this back was button-triggered */
export function consumeBackTap(): boolean {
  const v = pending
  pending = false
  return v
}

/** Read-only peek: whether the "back button tapped" marker is set (not
 *  cleared). Lets fixed widgets outside the transition layer (TopBar status
 *  pill) decide entrance animation at render time — adding the animation class
 *  via store after mount runs a frame late (flicker); consumption stays with
 *  consumeBackTap, this doesn't mutate state */
export function peekBackTap(): boolean {
  return pending
}

/**
 * Unified back semantics: POP when history exists (with the marker, for the
 * transition layer to play the back animation); replace to the parent only
 * when the stack is empty (deep-linked sub-page / reload).
 *
 * Shared by the back capsule, the native back button, and form save/delete
 * finishing — on mobile never replace-navigate to the parent page: that leaves
 * a duplicate entry in the stack and the first browser back appears to "do
 * nothing".
 */
export function navBack(nav: NavigateFunction, pathname: string) {
  const idx = typeof window !== 'undefined'
    ? (window.history?.state as { idx?: number } | null)?.idx
    : undefined
  if (idx !== undefined && idx <= 0) {
    const seg = pathname.split('/').filter(Boolean)
    nav(seg.length > 1 ? `/${seg.slice(0, -1).join('/')}` : '/', { replace: true })
    return
  }
  markBackTap()
  nav(-1)
}
