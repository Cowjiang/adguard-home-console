/** 本地对 @sosweetham/tauri-plugin-system-components-api 的类型扩充:
   vendor 版插件新增的 appearAnimation / appearOffsetX / appearDuration
   (原生控件入场动画)与 alpha(移除前淡出),见
   src-tauri/plugins/tauri-plugin-system-components。
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
    /** Content color of a button (title + icon), hex `#RRGGBB[AA]`; `tint`
     *  colors the background instead. Locally added for the glass header
     *  actions — npm 包类型未跟版。 */
    foreground?: string;
    /** Opacity of the mounted view (1 default). `updateComponent(id, {alpha: 0})`
     *  fades a control out before removal, since removal itself is instant. */
    alpha?: number;
  }
}
