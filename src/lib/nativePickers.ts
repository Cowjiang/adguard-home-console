/**
 * 苹果移动设备判定:决定单选项走原生 <select> 覆盖层还是自绘锚定下拉。
 *
 * 原生 select 入口必须是页面里真实渲染的 <select>(见 ui.tsx 的 PickSelect),
 * 不能靠 JS 唤起——WebKit 没有实现 HTMLSelectElement.showPicker()
 * (Safari 仅预览版把该项放在开关后),旧的 showPicker 方案在 iOS 上恒为失败回退。
 */

/**
 * 苹果移动设备(iPhone/iPad/iPod,含 iPadOS 13+ 伪装成 Mac 的情况)。
 * PC 浏览器的设备模拟会把 UA 伪装成 iPhone/iPad,但 navigator.vendor 不跟随伪装
 * (Chrome 系为 "Google Inc." 等),真苹果 WebKit(含 iOS 上的第三方浏览器)恒为
 * "Apple Computer, Inc."——以此把模拟环境排除回自绘下拉。
 */
export function isAppleMobile(): boolean {
  const ua = navigator.userAgent
  if (!(/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))) return false
  return navigator.vendor === 'Apple Computer, Inc.'
}
