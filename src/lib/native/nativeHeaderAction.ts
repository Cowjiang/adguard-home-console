/**
 * Native liquid-glass version of a top bar action button
 * (iOS shell, tauri-plugin-system-components createComponent). Handoff rules:
 *
 * - Fades in in place after the page is ready (forward/back transition done),
 *   never follows page sliding; on leave (including unmount) fades out before removal;
 * - While the native control owns the slot the custom (CSS) button never shows
 *   (layout placeholder only), avoiding both buttons on screen at once;
 * - One slot per action (`spec.slot`, 0 = trailing): the native component is
 *   sized and positioned to sit exactly on its CSS placeholder, so a second
 *   action to the left must declare slot 1 — two specs sharing a slot would
 *   delete each other's component (see NativeHeaderSpec.slot);
 * - During the edge-swipe gesture the native button yields (no fade-in), then
 *   fades in after the gesture ends;
 * - No Router context dependency: sheets render outside the Router, and any
 *   Router hook here throws on null context (the add-lease/add-filter sheets
 *   once crashed whole pages because of this).
 *
 * Falls back silently to the CSS button when native is unavailable or creation fails.
 */
import { useEffect, useRef, useState } from 'react'
import { isTauriIOS } from './shell'
import { useGestureActive, useTransitionHalfBusy, TRANSITION_HALF_MS } from '../routeTransition'
import { useIsDesktop } from '../useIsDesktop'
import { consumeGestureCommit } from '../routeTransition'
import { FADE_IN_S, FADE_OUT_S, accentHex } from './nativeGlass'

const BTN_ID = 'nav-action'
/** Square side length of icon buttons (matches the CSS capsule h-11 w-11) */
const ICON_SIZE = 44
const HEIGHT = 44
/** Same vertical band as the CSS nav bar: the plugin positions via
 *  safe-area + margin(16), dy=-8 aligns the capsule top */
const DY = -8
/** Horizontal step between header slots: one 44pt capsule plus the CSS slot
 *  gap (gap-1.5 = 6px). On topTrailing the plugin adds dx to the trailing
 *  inset, so a larger dx moves the button left. */
const SLOT_STEP = ICON_SIZE + 6
const plugin = () => import('@sosweetham/tauri-plugin-system-components-api')

/** Native component id and trailing offset of one header slot. Slot 0 is the
 *  trailing action; each further slot is one 44pt capsule + CSS gap (6px)
 *  further left (the plugin adds dx to the topTrailing inset). Exported so the
 *  layout contract stays testable — a shared id silently deletes the other
 *  button, and a wrong step makes the second button miss its placeholder. */
export function headerSlotGeometry(slot: number): { id: string; dx: number } {
  return { id: slot === 0 ? BTN_ID : `${BTN_ID}-${slot + 1}`, dx: slot * SLOT_STEP }
}

/** Instance currently owning each slot's native component; only the owner may
 *  touch it (coexisting instances don't delete each other) */
const owners = new Map<string, symbol>()

export interface NativeHeaderSpec {
  /** Button label (for text actions); provide at least one of label/sfSymbol */
  label?: string
  /** Icon SF Symbol */
  sfSymbol?: string
  /** Spoken label for the native control (VoiceOver). The CSS button's own
   *  `label` is forwarded here, so an icon-only native button does not fall
   *  back to the SF Symbol's name (e.g. `arrow.up.doc` → "Previous Page"). */
  a11yLabel?: string
  /** Label and icon color; 'accent' uses the current theme accent,
   *  omit for system default */
  foreground?: string | 'accent'
  /** Icon button: square 44×44 (same shape as the CSS circular capsule) */
  iconOnly?: boolean
  /** Header slot: 0 (default) is the trailing action, 1 the next 44pt capsule
   *  to its left. Slots ≥ 1 are icon-only by construction — the offset is a
   *  fixed 44pt step, so a labelled spec there would overlap its neighbour.
   *  Every slot needs its own native component id; two specs sharing slot 0
   *  would remove each other's button (the plugin drops an id before recreating
   *  it), leaving the loser's CSS placeholder hidden and the action gone. */
  slot?: number
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
  // Stable per-instance token identifying who owns the slot's native component
  const tokenRef = useRef<symbol>(Symbol('header-action'))

  const label = spec?.label
  const sfSymbol = spec?.sfSymbol
  const foreground = spec?.foreground
  const a11yLabel = spec?.a11yLabel
  const iconOnly = spec?.iconOnly ?? false
  // Slot 0 is the trailing action; the offset only holds for 44pt capsules
  const slot = iconOnly ? spec?.slot ?? 0 : 0
  const { id, dx } = headerSlotGeometry(slot)
  const active = enabled && !isDesktop && isTauriIOS() && (!!label || !!sfSymbol)

  // Click → the page's own handler (latest via ref, listener mounted once)
  useEffect(() => {
    if (!active) return
    let disposed = false
    let un: (() => void) | undefined
    plugin()
      .then(async (p) => {
        const l = await p.onComponentEvent((e) => {
          if (e.id !== id || e.event !== 'click') return
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
  }, [active, id])

  // Transition finished → fade in; during transition/gesture/inactive →
  // fade out and remove
  useEffect(() => {
    // Plain Buttons in non-top-bar slots (enabled=false) must not participate
    // at all, or they'd delete the same page's top bar component
    if (!enabled) return
    const mine = tokenRef.current
    const fadeOutRemove = () => {
      if (owners.get(id) !== mine) return
      owners.delete(id)
      void plugin()
        .then(async (p) => {
          await p.updateComponent(id, { alpha: 0, appearDuration: FADE_OUT_S }).catch(() => {})
          setTimeout(() => void p.removeComponent(id).catch(() => {}), FADE_OUT_S * 1000 + 40)
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
            id,
            kind: 'button',
            props: {
              label,
              sfSymbol,
              foreground: color,
              accessibilityLabel: a11yLabel,
              ...(iconOnly ? { width: ICON_SIZE } : {}),
              height: HEIGHT,
              // Fade in in place (plugin's native entrance: fade + slight
              // scale), never follows page sliding
              appearAnimation: true,
              appearDuration: FADE_IN_S,
            },
            anchor: 'topTrailing',
            // Slot 0 sits at the trailing inset; each further slot steps one
            // capsule + gap leftwards (the plugin adds dx to the trailing inset)
            dx,
            dy: DY,
          })
          .then(() => {
            if (!cancelled) owners.set(id, mine)
          })
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
    }
  }, [enabled, active, gesturing, halfBusy, label, sfSymbol, foreground, a11yLabel, iconOnly, id, dx])

  // Unmount: fade out after the exit passes halfway, no ghost left (a swipe
  // commit has no CSS exit animation, so fade out immediately)
  const commitSeen = useRef(0)
  useEffect(
    () => () => {
      const mine = tokenRef.current
      if (owners.get(id) !== mine) return
      owners.delete(id)
      const delay = consumeGestureCommit(commitSeen) ? 0 : TRANSITION_HALF_MS
      setTimeout(() => {
        // If a new instance took over meanwhile (same-page rebuild / new page
        // entering), don't delete its button
        if (owners.has(id)) return
        void plugin()
          .then(async (p) => {
            await p.updateComponent(id, { alpha: 0, appearDuration: FADE_OUT_S }).catch(() => {})
            setTimeout(() => void p.removeComponent(id).catch(() => {}), FADE_OUT_S * 1000 + 40)
          })
          .catch(() => {})
      }, delay)
    },
    [id]
  )

  return active && !failed
}
