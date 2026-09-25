/**
 * Apple mobile detection: decides whether a single-select uses the native
 * <select> overlay or a self-drawn anchored dropdown.
 *
 * The native select entry must be a real <select> rendered in the page (see
 * PickSelect in ui.tsx); it cannot be invoked from JS — WebKit does not
 * implement HTMLSelectElement.showPicker() (only Safari Technology Preview
 * exposes it behind a flag), so the old showPicker approach always ended in
 * fallback on iOS.
 */

/**
 * Apple mobile devices (iPhone/iPad/iPod, including iPadOS 13+ posing as Mac).
 * Desktop browser device emulation spoofs the UA to iPhone/iPad, but
 * navigator.vendor does not follow the spoof (Chrome-family reports
 * "Google Inc." etc.), while genuine Apple WebKit (including third-party
 * browsers on iOS) always reports "Apple Computer, Inc." — this excludes
 * emulated environments back to the self-drawn dropdown.
 */
export function isAppleMobile(): boolean {
  const ua = navigator.userAgent
  if (!(/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))) return false
  return navigator.vendor === 'Apple Computer, Inc.'
}
