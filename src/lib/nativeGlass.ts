/**
 * Appearance helpers shared by native glass controls (back button, top bar
 * action button).
 *
 * Entrance no longer follows page sliding: controls fade in in place once the
 * page is ready (transition finished) and fade out before leaving; each hook
 * owns its timing. This module only holds color and duration constants.
 */

/** Fade-in duration (s): the plugin's native entrance animation
 *  (UIKit spring, alpha + slight scale-up) */
export const FADE_IN_S = 0.22
/** Fade-out duration (s), slightly faster than fade-in — leaving is snappier */
export const FADE_OUT_S = 0.14

/** Current theme accent color (native controls ignore CSS variables; read
 *  the computed value once at creation) */
export function accentHex(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return v || '#34d399'
}
