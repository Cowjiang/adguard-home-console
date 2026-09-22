/**
 * 移动端"下拉选择"的原生化:苹果设备上用 WebKit 原生 <select>(showPicker)
 * 弹出系统选择器(输入附件层,与 DNS 设置页的原生下拉一致),其余设备由调用方
 * 回退到自绘锚定下拉菜单。
 */
import type { ReactNode } from 'react'

export interface NativePickReq<T extends string | number> {
  options: { label: ReactNode; value: T }[]
  value?: T
  onPick: (value: T) => void
  title?: string
}

/**
 * 苹果移动设备(iPhone/iPad/iPod,含 iPadOS 13+ 伪装成 Mac 的情况)。
 * PC 浏览器的设备模拟会把 UA 伪装成 iPhone/iPad,但 navigator.vendor 不跟随伪装
 * (Chrome 系为 "Google Inc." 等),真苹果 WebKit(含 iOS 上的第三方浏览器)恒为
 * "Apple Computer, Inc."——以此把模拟环境排除回自绘下拉,避免 showPicker 在
 * 桌面浏览器里弹出锚在左下角隐藏 select 上的原生下拉(异常弹层)。
 */
export function isAppleMobile(): boolean {
  const ua = navigator.userAgent
  if (!(/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))) return false
  return navigator.vendor === 'Apple Computer, Inc.'
}

/** WebKit 对连续两次弹出系统选择器有约 300ms 的内部冷却,冷却期内 showPicker 被静默吞掉 */
let lastDismissAt = 0

/** ReactNode → 纯文本(原生选择器的选项只接受字符串) */
function nodeText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  const props = (node as { props?: { children?: ReactNode } }).props
  return props ? nodeText(props.children) : ''
}

/**
 * 用系统原生选择器完成单选。成功唤起返回 true;非苹果设备、浏览器不支持
 * showPicker、处于弹出冷却期或唤起被拒时返回 false(调用方回退自绘菜单)。
 * 注意:showPicker() 需要用户手势激活,必须在点击事件同步调用链内执行;
 * 因此本函数内部不做任何 await,保持同步语义。
 */
export function pickViaNativeSelect<T extends string | number>(req: NativePickReq<T>): boolean {
  if (!isAppleMobile()) return false
  if (Date.now() - lastDismissAt < 400) return false
  const sel = document.createElement('select')
  // 视觉上隐藏但仍需可聚焦(WKWebView 的选择器以输入附件层呈现,与元素可见性无关)
  sel.setAttribute('aria-hidden', 'true')
  Object.assign(sel.style, {
    position: 'fixed', left: '0', bottom: '0', width: '1px', height: '1px',
    opacity: '0', border: '0', padding: '0', pointerEvents: 'none',
  } as CSSStyleDeclaration)
  for (const o of req.options) {
    const opt = document.createElement('option')
    opt.value = String(o.value)
    opt.textContent = nodeText(o.label)
    if (o.value === req.value) opt.selected = true
    sel.appendChild(opt)
  }
  let settled = false
  const cleanup = () => {
    lastDismissAt = Date.now()
    sel.remove()
  }
  sel.addEventListener('change', () => {
    if (settled) return
    settled = true
    const picked = req.options.find((o) => String(o.value) === sel.value)
    cleanup()
    if (picked) req.onPick(picked.value)
  })
  // 取消/失焦(未产生 change)→ 直接收场;change 先于 blur 触发,settled 已防重
  sel.addEventListener('cancel', cleanup)
  sel.addEventListener('blur', () => {
    // 不支持 cancel 事件的旧 WebKit:选择器关闭只会有 blur;稍等给 change 让路
    setTimeout(() => {
      if (!settled && sel.isConnected) cleanup()
    }, 250)
  })
  document.body.appendChild(sel)
  const picker = sel as HTMLSelectElement & { showPicker?: () => void }
  if (typeof picker.showPicker !== 'function') {
    cleanup()
    return false
  }
  try {
    picker.showPicker()
    return true
  } catch {
    cleanup()
    return false
  }
}
