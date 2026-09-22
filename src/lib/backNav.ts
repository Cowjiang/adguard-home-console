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
