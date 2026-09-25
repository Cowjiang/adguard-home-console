/**
 * Native liquid-glass version of the top bar's trailing action button
 * (iOS shell, tauri-plugin-system-components createComponent). Handoff rules:
 *
 * - Fades in in place after the page is ready (forward/back transition done),
 *   never follows page sliding; on leave (including unmount) fades out before removal;
 * - While the native control owns the slot the custom (CSS) button never shows
 *   (layout placeholder only), avoiding both buttons on screen at once;
 * - During the edge-swipe gesture the native button yields (no fade-in), then
 *   fades in after the gesture ends;
 * - No Router context dependency: sheets render outside the Router, and any
 *   Router hook here throws on null context (the add-lease/add-filter sheets
 *   once crashed whole pages because of this).
 *
 * Falls back silently to the CSS button when native is unavailable or creation fails.
 */
import { useEffect, useRef, useState } from 'react'
import { isTauriIOS, useGestureActive, useTransitionHalfBusy, TRANSITION_HALF_MS } from './routeTransition'
import { useIsDesktop } from './useIsDesktop'
import { consumeGestureCommit } from './routeTransition'
import { FADE_IN_S, FADE_OUT_S, accentHex } from './nativeGlass'

const BTN_ID = 'nav-action'
/** Square side length of icon buttons (matches the CSS capsule h-11 w-11) */
const ICON_SIZE = 44
const HEIGHT = 44
/** Same vertical band as the CSS nav bar: the plugin positions via
 *  safe-area + margin(16), dy=-8 aligns the capsule top */
const DY = -8
const plugin = () => import('@sosweetham/tauri-plugin-system-components-api')
/** Instance currently owning the native top bar component; only the owner
 *  may touch it (coexisting instances don't delete each other) */
let owner: symbol | null = null

export interface NativeHeaderSpec {
  /** Button label (for text actions); provide at least one of label/sfSymbol */
  label?: string
  /** Icon SF Symbol */
  sfSymbol?: string
  /** Label and icon color; 'accent' uses the current theme accent,
   *  omit for system default */
  foreground?: string | 'accent'
  /** Icon button: square 44×44 (same shape as the CSS circular capsule) */
  iconOnly?: boolean
}

/** Whether the native button has taken over (custom button hides on this,
 *  placeholder only) */
export function useNativeHeaderAction(
  spec: NativeHeaderSpec | undefined,
  onPress: (() => void) | undefined,
  enabled: boolean
): boolean {
  const isDesktop = useIsDesktop()
  const gesturing = useGestureActive()
  // No entrance during the first half of the transition: fade in past halfway
  // (≈170ms), synced with the page settling
  const halfBusy = useTransitionHalfBusy()
  // Once the native path holds, the custom button never shows (including
  // gesture/transition gaps — otherwise a CSS capsule pops up mid-swipe
  // next to the native button); fall back to CSS only on creation failure.
  const [failed, setFailed] = useState(false)
  const pressRef = useRef(onPress)
  pressRef.current = onPress
  const tokenRef = useRef<symbol | null>(null)
  if (tokenRef.current === null) tokenRef.current = Symbol('header-action')

  const label = spec?.label
  const sfSymbol = spec?.sfSymbol
  const foreground = spec?.foreground
  const iconOnly = spec?.iconOnly ?? false
  const active = enabled && !isDesktop && isTauriIOS() && (!!label || !!sfSymbol)

  // Click → the page's own handler (latest via ref, listener mounted once)
  useEffect(() => {
    if (!active) return
    let disposed = false
    let un: (() => void) | undefined
    plugin()
      .then(async (p) => {
        const l = await p.onComponentEvent((e) => {
          if (e.id !== BTN_ID || e.event !== 'click') return
          pressRef.current?.()
        })
        if (disposed) {
          void l.unregister()
          return
        }
        un = () => void l.unregister()
      })
      .catch(() => {})
    return () => {
      disposed = true
      un?.()
    }
  }, [active])

  // Transition finished → fade in; during transition/gesture/inactive →
  // fade out and remove
  useEffect(() => {
    // Plain Buttons in non-top-bar slots (enabled=false) must not participate
    // at all, or they'd delete the same page's top bar component
    if (!enabled) return
    const mine = tokenRef.current
    const fadeOutRemove = () => {
      if (owner !== mine) return
      owner = null
      void plugin()
        .then(async (p) => {
          await p.updateComponent(BTN_ID, { alpha: 0, appearDuration: FADE_OUT_S }).catch(() => {})
          setTimeout(() => void p.removeComponent(BTN_ID).catch(() => {}), FADE_OUT_S * 1000 + 40)
        })
        .catch(() => {})
    }
    const ready = active && !gesturing && !halfBusy
    if (!ready) {
      fadeOutRemove()
      return
    }
    const color = foreground === 'accent' ? accentHex() : foreground
    let cancelled = false
    plugin()
      .then((p) => {
        if (cancelled) return
        return p
          .createComponent({
            id: BTN_ID,
            kind: 'button',
            props: {
              label,
              sfSymbol,
              foreground: color,
              ...(iconOnly ? { width: ICON_SIZE } : {}),
              height: HEIGHT,
              // Fade in in place (plugin's native entrance: fade + slight
              // scale), never follows page sliding
              appearAnimation: true,
              appearDuration: FADE_IN_S,
            },
            anchor: 'topTrailing',
            dx: 0,
            dy: DY,
          })
          .then(() => {
            if (!cancelled) owner = mine
          })
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
    }
  }, [enabled, active, gesturing, halfBusy, label, sfSymbol, foreground, iconOnly])

  // Unmount: fade out after the exit passes halfway, no ghost left (a swipe
  // commit has no CSS exit animation, so fade out immediately)
  const commitSeen = useRef(0)
  useEffect(
    () => () => {
      const mine = tokenRef.current
      if (owner !== mine) return
      owner = null
      const delay = consumeGestureCommit(commitSeen) ? 0 : TRANSITION_HALF_MS
      setTimeout(() => {
        // If a new instance took over meanwhile (same-page rebuild / new page
        // entering), don't delete its button
        if (owner !== null) return
        void plugin()
          .then(async (p) => {
            await p.updateComponent(BTN_ID, { alpha: 0, appearDuration: FADE_OUT_S }).catch(() => {})
            setTimeout(() => void p.removeComponent(BTN_ID).catch(() => {}), FADE_OUT_S * 1000 + 40)
          })
          .catch(() => {})
      }, delay)
    },
    []
  )

  return active && !failed
}
