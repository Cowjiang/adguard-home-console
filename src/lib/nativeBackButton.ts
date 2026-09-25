/**
 * iOS native liquid-glass back button (tauri-plugin-system-components
 * createComponent; glass capsule floating above the WebView, truly refracting
 * page content on iOS 26, same source as the native TabBar).
 *
 * Enabled when the native TabBar is available (iOS/macOS shell) and the layout
 * is mobile (below the desktop breakpoint).
 * Route arbitration: removed on top-level routes, created on sub-pages; taps
 * reuse PageHeader's goBack semantics (replace to the parent when the history
 * stack is empty, to avoid pushing an entry).
 *
 * Handoff with page transitions: the native control floats above the WebView
 * and takes no part in CSS translation, so it never follows page sliding
 * — it fades in in place once the page is ready (transition finished), and
 * fades out before removal when leaving (page switch / entering a transition).
 * During the edge-swipe gesture the whole button yields to the CSS capsule
 * sliding with the page (via useNativeBackShown, to avoid double buttons).
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TAB_ROOT_ROUTES } from './routes'
import { navBack } from './backNav'
import { consumeGestureCommit, useTransitionHalfBusy, TRANSITION_HALF_MS } from './routeTransition'
import { FADE_IN_S, FADE_OUT_S } from './nativeGlass'

const BTN_ID = 'nav-back'
const plugin = () => import('@sosweetham/tauri-plugin-system-components-api')

/* ---------- Shared visibility store (PageHeader hides the CSS capsule on it) ---------- */

let shown = false
const subs = new Set<() => void>()

function setShown(v: boolean) {
  if (v === shown) return
  shown = v
  subs.forEach((f) => f())
}

export function useNativeBackShown(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => shown
  )
}

/* ---------- Controller ---------- */

export function useNativeBackButton(enabled: boolean) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // Edge-swipe in progress: the button yields to the CSS capsule sliding with
  // the page (native controls cannot join gesture translation)
  const halfBusy = useTransitionHalfBusy()
  const commitSeen = useRef(0)
  // Event listener mounted once; latest navigate/pathname read via refs
  const navRef = useRef(navigate)
  navRef.current = navigate
  const pathRef = useRef(pathname)
  pathRef.current = pathname

    // Click event → back navigation
  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let un: (() => void) | undefined
    plugin()
      .then(async (p) => {
        const l = await p.onComponentEvent((e) => {
          if (e.id !== BTN_ID || e.event !== 'click') return
          // WKWebView has no native animation for programmatic back (verified);
          // the back transition is handled by the CSS snapshot layer
          navBack(navRef.current, pathRef.current)
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
      void plugin()
        .then((p) => p.removeComponent(BTN_ID))
        .catch(() => {})
      setShown(false)
    }
  }, [enabled])

  // Route → visibility (removed on top-level pages, created on sub-pages;
  // fades in in place once the page is ready, never follows page sliding)
  useEffect(() => {
    if (!enabled) return
    const onSubpage = !TAB_ROOT_ROUTES.includes(pathname)
    // Stay in place during the edge swipe: it sits exactly where the revealed
    // page's back capsule is, replacing the earlier approach of yielding to
    // the CSS capsule (custom buttons never show); entrance is merely delayed
    // during the first half of the transition.
    const want = onSubpage && !halfBusy
    // CSS capsule visibility is judged only by "this page is natively taken
    // over": during gestures/transitions the native control may be withdrawn
    // temporarily, but custom buttons never show (otherwise a CSS capsule pops
    // up mid-swipe next to the native button)
    setShown(onSubpage)
    let cancelled = false
    plugin()
      .then((p) => {
        if (cancelled) return
        if (!want) {
          // Leaving: fade out after the exit passes halfway (a swipe commit
          // has no CSS exit animation, so fade out immediately).
          // Every step checks whether this effect run was cancelled — a new
          // effect run creating the button starts at the halfway mark; if
          // removal drags past that point it would delete the fresh button.
          const delay = consumeGestureCommit(commitSeen) ? 0 : TRANSITION_HALF_MS
          return new Promise((r) => setTimeout(r, delay))
            .then(() => {
              if (cancelled) throw new Error('cancelled')
              return p.updateComponent(BTN_ID, { alpha: 0, appearDuration: FADE_OUT_S })
            })
            .then(() => new Promise((r) => setTimeout(r, FADE_OUT_S * 1000 + 40)))
            .then(() => {
              if (cancelled) return
              return p.removeComponent(BTN_ID)
            })
            .catch(() => {})
        }
        return p
          .createComponent({
            id: BTN_ID,
            kind: 'button',
            // No glass:true: glass wraps the button in a capsule (fixed 14/10pt
            // padding, turning it into a large oval). On iOS 26
            // UIButton.Configuration.glass() is itself a native liquid-glass
            // circular button and honors width/height constraints (see the
            // plugin's ComponentsOverlay.swift). Size matches the CSS capsule
            // h-11 w-11 (iOS 26 HIG minimum tap target 44×44pt; the system
            // circular glass button is 44pt visually)
            props: {
              sfSymbol: 'chevron.left',
              width: 44,
              height: 44,
              appearAnimation: true,
              appearDuration: FADE_IN_S,
            },
            // The plugin positions via safeAreaLayoutGuide + (margin=16)+dx/dy
            // constraints (ComponentsOverlay.activateAnchorConstraints, margin
            // applied to both axes):
            // left = 16+dx, top = safe-area-top + 16+dy. The CSS capsule sits at
            // left 16 / top safe-area+8 (floater starts at safe+6, h-12, with
            // h-11 centered inside) → dx=0, dy=-8
            anchor: 'topLeading',
            dx: 0,
            dy: -8,
          })
          .then(() => {
            if (!cancelled) setShown(true)
          })
          .catch(() => {
            // Native creation failed: fall back to the CSS capsule, don't leave
            // the button slot empty
            if (!cancelled) setShown(false)
          })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pathname, enabled, halfBusy])
}
