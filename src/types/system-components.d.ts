/* 本地对 @sosweetham/tauri-plugin-system-components-api 的类型扩充:
   vendor 版插件新增的 appearAnimation / appearOffsetX / appearDuration
   (原生控件入场动画),见 src-tauri/plugins/tauri-plugin-system-components。
   npm 包类型未跟版。 */
import '@sosweetham/tauri-plugin-system-components-api'

declare module '@sosweetham/tauri-plugin-system-components-api' {
  interface ComponentProps {
    /** Fade + scale-in the view on creation (native appear affordance). */
    appearAnimation?: boolean;
    /** Slide in from this horizontal offset (points) instead, riding the page
     *  transition; pass the incoming nav bar's own travel so the control never
     *  appears detached from it. */
    appearOffsetX?: number;
    /** Duration (seconds) of the slide-in, matched to the CSS transition. */
    appearDuration?: number;
  }
}
