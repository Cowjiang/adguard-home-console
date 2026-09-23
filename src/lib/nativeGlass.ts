/**
 * 原生玻璃控件(返回按钮、顶栏操作按钮)共用的外观工具。
 *
 * 出场不再跟随页面滑动:控件在页面就绪(转场结束)后原地淡入、离开前淡出,
 * 由各自的 hook 负责时机,这里只放颜色与时长常量。
 */

/** 淡入时长(秒):插件原生入场动画(UIKit spring,alpha + 轻微放大) */
export const FADE_IN_S = 0.22
/** 淡出时长(秒),略快于淡入 —— 离开时干脆一点 */
export const FADE_OUT_S = 0.14

/** 取当前主题的强调色(原生控件不吃 CSS 变量,创建时读一次计算值) */
export function accentHex(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return v || '#34d399'
}
