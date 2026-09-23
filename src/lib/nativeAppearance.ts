/**
 * 原生层外观跟随应用主题。
 *
 * UIKit 的原生控件默认跟随**系统**外观,而应用主题(设置里的浅色/深色/跟随系统)
 * 可能与系统不一致 —— 玻璃 TabBar、返回胶囊、顶栏操作按钮与原生弹层都会因此
 * 渲染成相反的明暗。这里把最终解析出的明暗显式告诉插件。
 *
 * npm 包(@sosweetham/...-api 0.1.8)尚无该命令的 JS 实现,故直接走命令通道;
 * 插件侧见 src-tauri/plugins/tauri-plugin-system-components(SystemComponentsPlugin.setAppearance)。
 */
import { isTauriIOS } from './routeTransition'

export function applyNativeAppearance(dark: boolean) {
  if (!isTauriIOS()) return
  void import('@tauri-apps/api/core')
    .then(({ invoke }) =>
      invoke('plugin:system-components|set_appearance', {
        options: { style: dark ? 'dark' : 'light' },
      })
    )
    .catch(() => {})
}
