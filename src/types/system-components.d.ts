/** Local type augmentation for @sosweetham/tauri-plugin-system-components-api:
   the vendored plugin adds appearAnimation / appearOffsetX / appearDuration
   (native control enter animation), alpha (fade out before removal) and
   accessibilityLabel (spoken label for icon-only buttons), see
   src-tauri/plugins/tauri-plugin-system-components.
   The npm package types have not caught up. */
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
     *  actions — the npm package types have not caught up. */
    foreground?: string;
    /** Spoken label for a control without visible text (icon-only button);
     *  the native header actions pass the CSS button's `aria-label` so
     *  VoiceOver does not fall back to the SF Symbol's own name. */
    accessibilityLabel?: string;
    /** Opacity of the mounted view (1 default). `updateComponent(id, {alpha: 0})`
     *  fades a control out before removal, since removal itself is instant. */
    alpha?: number;
  }
}
