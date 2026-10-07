/**
 * Native layer appearance follows the app theme.
 *
 * UIKit native controls default to the **system** appearance, while the app
 * theme (light/dark/follow-system in settings) may differ from it — the glass
 * TabBar, back capsule, top bar action button and native sheets would all
 * render in the opposite light/dark. This passes the finally resolved
 * light/dark to the plugin explicitly.
 *
 * The npm package (@sosweetham/...-api 0.1.8) has no JS implementation for this
 * command yet, so we go through the command channel directly; plugin side:
 * src-tauri/plugins/tauri-plugin-system-components
 * (SystemComponentsPlugin.setAppearance).
 */
import { isTauriIOS } from './shell'

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
