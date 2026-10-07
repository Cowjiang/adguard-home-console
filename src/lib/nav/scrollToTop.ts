/**
 * Smooth-scroll the main document to the top (tap-current-tab-again gesture).
 * Skips when already at top; degrades to an instant jump when the system has
 * "Reduce Motion" enabled.
 */
export function scrollToTop(): void {
  const el = document.scrollingElement
  if (!el || el.scrollTop === 0) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
}
