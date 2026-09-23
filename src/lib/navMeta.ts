/**
 * 导航元信息:让"转场动画方向"与"历史栈操作"解耦。
 *
 * 侧滑返回依赖 WKWebView 历史栈(backForwardList),tab 根页面之间的跳转必须
 * replace 才不会把上一个 tab 压进栈(否则侧滑会跨 tab 返回,见
 * docs/WEB_INTERACTION.md 的路由与转场约定);但 replace 默认无转场。
 * markNavAnim('push') 让 TransitionArea 对这类 replace 照常执行 push 平移动画
 * —— 视觉上是下钻,栈上是平级。
 */
import { useNavigate } from 'react-router-dom'

let pending: 'push' | null = null

/** 标记下一次导航按 push 方向做转场动画(配合 replace 使用) */
export function markNavAnim(kind: 'push') {
  pending = kind
}

/** TransitionArea 在路由提交时读取并清除标记 */
export function consumeNavAnim(): 'push' | null {
  const v = pending
  pending = null
  return v
}

/**
 * 跨 tab 跳转:replace(不进历史栈 → 侧滑不可返回)+ push 转场动画。
 * 用于 tab 根页面之间的业务入口(如概览 → 日志/客户端),语义 = 切 tab。
 */
export function useTabJump() {
  const nav = useNavigate()
  return (to: string) => {
    markNavAnim('push')
    nav(to, { replace: true })
  }
}
