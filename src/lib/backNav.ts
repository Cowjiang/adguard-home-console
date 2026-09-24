import type { NavigateFunction } from 'react-router-dom'

/**
 * "点击返回按钮"标记:用于区分程序化返回与侧滑手势返回。
 * 两者在 react-router 里都是 POP,但侧滑时 WKWebView 已有原生快照平移动画,
 * 若 CSS 转场再动一次会出现双重动画;因此只有带此标记的 POP 才做滑动转场。
 */
let pending = false

export function markBackTap() {
  pending = true
}

/** 读取并清除标记;返回是否为"点按钮触发"的返回 */
export function consumeBackTap(): boolean {
  const v = pending
  pending = false
  return v
}

/** 只读窥探:当前是否带着"点按钮返回"标记(不清除)。供转场层之外的固定件
 *  (TopBar 状态 pill)在渲染期判定入场动画 —— 挂载后经 store 补挂动画类会
 *  晚一帧(闪帧);消费仍由 consumeBackTap 完成,这里不改变状态 */
export function peekBackTap(): boolean {
  return pending
}

/**
 * 统一返回语义:有历史条目就 POP(带标记,供转场层播放返回动画);栈空
 * (直落子页 / 刷新)才 replace 回父级。
 *
 * 返回胶囊、原生返回按钮、表单保存与删除收尾共用此函数 —— 移动端不得用
 * replace 导航到父级页,那会在栈里留下重复条目,浏览器返回一次看起来"没反应"。
 */
export function navBack(nav: NavigateFunction, pathname: string) {
  const idx = (window.history.state as { idx?: number } | null)?.idx
  if (idx !== undefined && idx <= 0) {
    const seg = pathname.split('/').filter(Boolean)
    nav(seg.length > 1 ? `/${seg[0]}` : '/', { replace: true })
    return
  }
  markBackTap()
  nav(-1)
}
