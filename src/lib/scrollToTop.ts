/**
 * 平滑滚动主文档到顶部(再点当前 tab 的回顶部手势)。
 * 已在顶部时跳过;系统开启"减弱动态效果"时退化为瞬时跳转。
 */
export function scrollToTop(): void {
  const el = document.scrollingElement
  if (!el || el.scrollTop === 0) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
}
