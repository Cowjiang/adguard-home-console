/**
 * Single source of shell/platform detection: every runtime environment branch
 * takes its predicate from here (previously five files, three conventions).
 * Predicates re-run on every call; only isTauriIOS memoizes — the UA and the
 * shell marker are stable for the lifetime of the webview.
 */
export type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

/** Tauri invoke function, any shell (desktop/iOS/Android); null on plain web */
export function getTauriInvoke(): TauriInvoke | null {
  const w = window as unknown as { __TAURI_INTERNALS__?: { invoke?: TauriInvoke } }
  return w.__TAURI_INTERNALS__?.invoke ?? null
}

/** Any Tauri shell, incl. debug shells */
export function isTauriShell(): boolean {
  return !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
}

/**
 * Apple mobile devices (iPhone/iPad/iPod, including iPadOS 13+ posing as Mac).
 * Decides whether a single-select uses the native <select> overlay or a
 * self-drawn anchored dropdown: the native select entry must be a real
 * <select> rendered in the page (see PickSelect in components/ui); it cannot
 * be invoked from JS — WebKit does not implement
 * HTMLSelectElement.showPicker(), so the old showPicker approach always ended
 * in fallback on iOS.
 *
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

/** iOS shell only: browsers and desktop have their own native history
 *  gestures the in-app swipe must not steal */
let tauriIOS: boolean | null = null
export function isTauriIOS(): boolean {
  if (tauriIOS === null) {
    tauriIOS =
      typeof window !== 'undefined' &&
      '__TAURI_INTERNALS__' in window &&
      isAppleMobile()
  }
  return tauriIOS
}
