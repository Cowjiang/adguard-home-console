/** iOS-style base component library */
import {
  createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent as RMouseEvent, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Loader2, Search, X,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useIsDesktop } from '../lib/useIsDesktop'
import { TAB_ROOT_ROUTES, TOP_LEVEL_ROUTES } from '../lib/nav/routes'
import { useRouteTransition, useEnterSkip } from '../lib/routeTransition'
import { useNativeBackShown } from '../lib/native/nativeBackButton'
import { useNativeHeaderAction, type NativeHeaderSpec } from '../lib/native/nativeHeaderAction'
import { navBack } from '../lib/nav/backNav'
import { copyText } from '../lib/clipboard'

/* ---------- Page containers and titles ---------- */

/** Top-level routes live in lib/routes.ts; re-exported here for older importers */
export { TOP_LEVEL_ROUTES, TAB_ROOT_ROUTES }

/** page-in latch: skip the page-in fade while a slide transition runs so it
 *  doesn't stack with the translation; the latch is one-shot, so once dir
 *  resets after the transition the page-in class is not re-attached and the
 *  animation does not replay. Page roots attach page-in through this, with or
 *  without Screen. */
export function usePageInClass(): string {
  const t = useRouteTransition()
  const noAnim = useRef(false)
  if (t.dir) noAnim.current = true
  return noAnim.current ? '' : 'page-in'
}
export function Screen({ children, pad = true }: { children: ReactNode; pad?: boolean }) {
  return (
    <div className={`page-shell mx-auto w-full ${pad ? 'px-4' : ''} ${usePageInClass()}`}>
      {children}
    </div>
  )
}

/** Top scroll-edge gradient mask: fades out as content scrolls under the
 *  status/nav bar area; a pure gradient, no backdrop-filter (avoids the iOS
 *  heat red line) */
export function NavScrim({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 top-0 ${className}`}
      style={{
        // Tailwind arbitrary class names with spaces are not generated; height
        // goes in inline style
        height: 'calc(env(safe-area-inset-top, 0px) + 72px)',
        background: 'linear-gradient(to bottom, color-mix(in srgb, var(--bg) 98%, transparent) 58%, transparent)',
      }}
    />
  )
}

export function PageHeader({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate()
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const isDesktop = useIsDesktop()
  // When the native liquid-glass back button takes over inside the iOS shell,
  // the CSS pill yields (avoids double buttons)
  const nativeBack = useNativeBackShown()
  const transition = useRouteTransition()
  // Top-level pages (sidebar/TabBar direct) need no back button on desktop;
  // back belongs to secondary pages only
  const isTopLevel = TOP_LEVEL_ROUTES.includes(pathname)
  const showBack = back && !(isDesktop && isTopLevel)
  // Mobile secondary page: back pill + centered title pinned top-left, content
  // scrolls beneath (matches the iOS 26 liquid-glass nav bar)
  const floating = showBack && !isDesktop

  const goBack = () => navBack(nav, pathname)

  if (floating) {
    // The fixed nav bar translates in sync with the page layer (push/pop),
    // sliding along during transitions. The old page's nav bar slides out
    // carried by the exit snapshot clone; the surviving new page's nav bar
    // always gets the IN animation (OUT would translate it backwards then jump
    // = a glitch on push); native gesture transitions have no CSS animation,
    // so no class is added
    const barAnim = transition.exiting
      ? transition.dir === 'push'
        ? 'rt-push-in'
        : 'rt-pop-in'
      : ''
    return createPortal(
      <div
        data-floating-nav
        className={`pointer-events-none fixed inset-x-0 top-0 z-40 lg:hidden ${barAnim}`}
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}
      >
        {/* Scroll-edge gradient mask: see the NavScrim comment */}
        <NavScrim />
        <div className="relative flex h-12 items-center px-4">
          {/* When the native glass button takes over it is only visually
              hidden: the transition snapshot clone of this bar restores the
              button, so the sliding old page doesn't leave a hole at its spot
              (the native control is removed instantly and cannot slide with
              the page) */}
          <button
            data-back-btn
            onClick={goBack}
            style={nativeBack ? { visibility: 'hidden' } : undefined}
            className="press glass specular pointer-events-auto flex h-11 w-11 flex-none items-center justify-center rounded-full text-t2"
            aria-label={t('common.back')}
          >
            <ChevronLeft size={22} />
          </button>
          <div className="pointer-events-none absolute left-1/2 w-full max-w-[min(58vw, 240px)] -translate-x-1/2 truncate text-center text-[17px] font-semibold text-t1">
            {title}
          </div>
          {right && <div className="pointer-events-auto ml-auto flex flex-none items-center gap-2">{right}</div>}
        </div>
      </div>,
      document.body
    )
  }
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5">
        {showBack && (
          <button
            onClick={goBack}
            className="press glass flex h-9 w-9 flex-none items-center justify-center rounded-full text-t2"
            aria-label={t('common.back')}
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight text-t1">{title}</h1>
          {subtitle && <p className="truncate text-[13px] text-t2">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex-none">{right}</div>}
    </div>
  )
}

/**
 * Header-right action buttons (PageHeader's right slot): mobile height matches
 * the back pill (h-11 / 44pt, the iOS minimum tap target); icon buttons add
 * w-11, text buttons px-4; desktop (lg) drops back to h-10. All header-right
 * buttons go through this or Button's size="header".
 *
 * With `native`, the Apple shell creates a co-located native liquid-glass
 * button that takes over display -- the CSS button keeps only a placeholder
 * (visibility:hidden), restored visible in transition snapshot clones to avoid
 * a double-button glitch.
 */
export function HeaderAction({ onClick, label, className = '', native, children }: {
  onClick?: (e: RMouseEvent<HTMLButtonElement>) => void
  label?: string
  className?: string
  native?: NativeHeaderSpec
  children: ReactNode
}) {
  const nativeHandled = useNativeHeaderAction(native, () => onClick?.(undefined as unknown as RMouseEvent<HTMLButtonElement>), true)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-header-action={native ? '1' : undefined}
      data-native-hidden={nativeHandled ? '1' : undefined}
      style={nativeHandled ? { visibility: 'hidden' } : undefined}
      className={`press glass flex h-11 flex-none items-center justify-center gap-1.5 rounded-full lg:h-10 ${className}`}
    >
      {children}
    </button>
  )
}

/* ---------- Cards and lists ---------- */

export function Card({ children, className = '', strong = false, onClick }: { children: ReactNode; className?: string; strong?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`specular relative overflow-hidden rounded-3xl ${strong ? 'glass-strong' : 'glass'} ${onClick ? 'press cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function GroupTitle({ children, right, className = '' }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`mb-1.5 mt-5 flex items-baseline justify-between px-2 ${className}`}>
      <span className="text-[13px] font-semibold uppercase tracking-wide text-t3">{children}</span>
      {right}
    </div>
  )
}

export function Group({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Card className={`!rounded-[22px] ${className}`}><div>{children}</div></Card>
}

export function Row({
  icon, title, subtitle, value, right, onClick, danger, last,
}: {
  icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; value?: ReactNode
  right?: ReactNode; onClick?: (e: RMouseEvent<HTMLElement>) => void; danger?: boolean; last?: boolean
}) {
  const Comp: any = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left ${onClick ? 'active:bg-white/5' : ''}`}
      style={{ textAlign: 'left' }}
    >
      {icon && <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[15.5px] font-medium ${danger ? 'text-danger' : 'text-t1'}`}>{title}</div>
        {subtitle && <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-t2">{subtitle}</div>}
      </div>
      {value !== undefined && <div className="flex-none text-[14px] text-t2">{value}</div>}
      {right !== undefined ? (
        right
      ) : onClick ? (
        <ChevronRight size={17} className="flex-none text-t3" />
      ) : null}
      {!last && <div className="sep absolute" style={{ display: 'none' }} />}
    </Comp>
  )
}

export function Rows({ children }: { children: ReactNode }) {
  // Insert a divider after every child except the last
  const arr = Array.isArray(children) ? children : [children]
  return (
    <div>
      {arr.map((c: any, i: number) => (
        <div key={c?.key ?? i}>
          {c}
          {i < arr.length - 1 && <div className="mx-4 h-px" style={{ background: 'var(--glass-border)' }} />}
        </div>
      ))}
    </div>
  )
}

/* ---------- Switch ---------- */

export function Switch({ on, onChange, danger, disabled, loading }: { on: boolean; onChange: (v: boolean, e: RMouseEvent<HTMLButtonElement>) => void; danger?: boolean; disabled?: boolean; loading?: boolean }) {
  const inert = disabled || loading
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={inert}
      data-on={on}
      data-danger={danger}
      className="switch"
      style={inert ? { opacity: 0.55, pointerEvents: 'none' } : undefined}
      onClick={(e: any) => {
        e.stopPropagation()
        onChange(!on, e)
      }}
    >
      <span className="knob" />
    </button>
  )
}

/* ---------- Buttons ---------- */

export function Button({
  children, onClick, variant = 'primary', size = 'md', loading, disabled, className = '', type, label, native,
}: {
  children: ReactNode; onClick?: (e: RMouseEvent<HTMLButtonElement>) => void; variant?: 'primary' | 'glass' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg' | 'header'; loading?: boolean; disabled?: boolean; className?: string; type?: 'button' | 'submit'; label?: string
  native?: NativeHeaderSpec
}) {
  // With size="header" (the header-right slot), the Apple shell hands off to
  // the native liquid-glass button; the CSS side keeps only a placeholder
  const nativeHandled = useNativeHeaderAction(native, () => onClick?.(undefined as unknown as RMouseEvent<HTMLButtonElement>), size === 'header')
  const base = 'press inline-flex items-center justify-center gap-2 rounded-full font-semibold select-none'
  // header: header-right slot only; mobile matches the back pill height (h-11),
  // desktop matches sm
  const sizes = { sm: 'h-8 px-3.5 text-[13px]', md: 'h-10 px-5 text-[14.5px]', lg: 'h-12 px-6 text-[16px]', header: 'h-11 px-4 text-[13px] lg:h-8 lg:px-3.5' }[size]
  const variants = {
    primary: 'text-white',
    glass: 'glass text-t1',
    danger: 'bg-danger text-white',
    ghost: 'text-accent',
  }[variant]
  const style =
    variant === 'primary'
      ? { background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--accent-2)))' }
      : variant === 'danger'
        ? { background: 'var(--danger)' }
        : undefined
  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={label}
      data-header-action={native ? '1' : undefined}
      data-native-hidden={nativeHandled ? '1' : undefined}
      className={`${base} ${sizes} ${variants} ${disabled || loading ? 'opacity-50' : ''} ${nativeHandled ? 'invisible' : ''} ${className}`}
      style={nativeHandled ? { ...style, visibility: 'hidden' } : style}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  )
}

/* ---------- Segmented control ---------- */

export function Segmented<T extends string>({
  options, value, onChange, size = 'md', fit = false,
}: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md'
  /** true = shrink to content width (for pickers inside cards); full width by default */
  fit?: boolean
}) {
  const refs = useRef(new Map<T, HTMLButtonElement | null>())
  // Sliding indicator: translates left/right between active items like a
  // tabbar, instead of each item flashing its own
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null)

  useEffect(() => {
    const measure = () => {
      const el = refs.current.get(value)
      if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [value, options.length])

  return (
    <div className={`glass relative flex rounded-full p-1 ${fit ? 'w-fit' : ''} ${size === 'sm' ? 'text-[12px]' : 'text-[13.5px]'}`}>
      {ind && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 top-1 rounded-full transition-[left,width] duration-300"
          style={{
            left: ind.left,
            width: ind.width,
            background: 'var(--accent-soft)',
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)',
            transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      )}
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current.set(o.value, el) }}
            onClick={() => onChange(o.value)}
            className={`press relative z-10 ${fit ? '' : 'flex-1'} whitespace-nowrap rounded-full px-3 py-1.5 font-semibold transition-colors ${active ? '' : 'text-t2'}`}
            style={active ? { color: 'var(--accent)' } : undefined}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Tab switch content animation ---------- */

/** Wraps children in the tab-in animation: on value change the children
 *  remount and the switch animation replays (use with Segmented / Chip).
 *  Mounted mid slide-transition, this enter is skipped (during the gesture the
 *  animation is suspended -> fill both first frame transparent = blank page);
 *  the latch affects only the mount, later user-triggered value switches still
 *  animate. */
export function TabContent<T extends string | number>({
  value, children, className = '',
}: { value: T; children: ReactNode; className?: string }) {
  const skip = useEnterSkip()
  const first = useRef(true)
  const lastValue = useRef<T>(value)
  let animate: boolean
  if (first.current) {
    animate = !skip
    first.current = false
  } else {
    animate = value !== lastValue.current
  }
  lastValue.current = value
  return (
    <div key={String(value)} className={`${animate ? 'tab-in ' : ''}${className}`}>
      {children}
    </div>
  )
}

/* ---------- Sheet overlays ---------- */

interface SheetCtx {
  open: (node: ReactNode, opts?: { title?: string }) => void
  close: () => void
}
const SheetContext = createContext<SheetCtx>({ open: () => {}, close: () => {} })
export const useSheet = () => useContext(SheetContext)

export function SheetProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode | null>(null)
  const [title, setTitle] = useState<string | undefined>()
  const [visible, setVisible] = useState(false)

  const open = (n: ReactNode, opts?: { title?: string }) => {
    setTitle(opts?.title)
    setNode(n)
    // Double rAF: the browser must first paint the initial state (transparent
    // + scaled) before visible flips, or the transition won't play; a single
    // rAF merges with the first frame and the sheet "pops in with no animation"
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }
  const close = () => {
    setVisible(false)
    setTimeout(() => setNode(null), 260)
  }

  useEffect(() => {
    document.body.style.overflow = visible ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [visible])

  return (
    <SheetContext.Provider value={{ open, close }}>
      <MenuHost>{children}</MenuHost>
      {node &&
        createPortal(
          // Project red line (finalized by the user 2026-09-23): every dialog
          // appears centered on screen, never rising from the bottom -- the
          // iOS native tabbar would cover a bottom sheet. Confirm dialogs /
          // forms / detail sheets all go through here, unified by construction.
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              onClick={close}
              className="absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-250"
              style={{ opacity: visible ? 1 : 0 }}
            />
            <div
              className="glass-strong specular relative m-3 w-full max-w-[536px] rounded-[28px] p-5 transition-all duration-250"
              style={{
                transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.95)',
                opacity: visible ? 1 : 0,
                transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {title && <h3 className="mb-3 text-center text-[16px] font-bold text-t1">{title}</h3>}
              {node}
            </div>
          </div>,
          document.body
        )}
    </SheetContext.Provider>
  )
}

/* ---------- Single-select menus (anchor-positioned: native select on Apple
   devices, drawn anchored dropdown elsewhere) ---------- */

interface PickReq<T extends string | number> {
  options: { label: ReactNode; value: T }[]
  value?: T
  onPick: (value: T) => void
  /** Popup title (the anchored dropdown doesn't show it yet; kept for compatibility) */
  title?: string
  /** Trigger element; the desktop dropdown positions itself by its rect */
  anchor: HTMLElement
  align?: 'left' | 'right'
}

interface MenuState {
  req: PickReq<any>
  rect: DOMRect
  visible: boolean
}

interface MenuCtx {
  open: <T extends string | number>(req: PickReq<T>) => void
}
const MenuContext = createContext<MenuCtx>({ open: () => {} })

function MenuHost({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<MenuState | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const reqRef = useRef<PickReq<any> | null>(null)

  const close = () => {
    setSt((s) => (s ? { ...s, visible: false } : s))
    setTimeout(() => {
      setSt(null)
      reqRef.current = null
    }, 140)
  }

  const open = <T extends string | number>(req: PickReq<T>) => {
    // Clicking the same trigger again = close (toggle); a different anchor
    // switches to the new menu
    setSt((prev) => {
      if (prev && reqRef.current?.anchor === req.anchor) {
        reqRef.current = null
        return null
      }
      reqRef.current = req
      return { req, rect: req.anchor.getBoundingClientRect(), visible: false }
    })
    requestAnimationFrame(() => setSt((s) => (s ? { ...s, visible: true } : s)))
  }

  useEffect(() => {
    if (!st) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || reqRef.current?.anchor.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    // Close immediately on scroll/resize; no follow-along repositioning
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.req])

  // Measure the menu after render: opens below the anchor by default, flips
  // above when there is no room
  useLayoutEffect(() => {
    if (!st || !menuRef.current) return
    const el = menuRef.current
    const h = el.offsetHeight
    const w = el.offsetWidth
    const below = st.rect.bottom + 6
    const above = st.rect.top - 6 - h
    const top = below + h <= window.innerHeight - 8 || above < 8 ? below : Math.max(8, above)
    const left = st.req.align === 'left'
      ? Math.min(st.rect.left, window.innerWidth - w - 8)
      : Math.max(8, Math.min(st.rect.right - w, window.innerWidth - w - 8))
    if (el.style.top !== `${top}px`) el.style.top = `${top}px`
    if (el.style.left !== `${left}px`) el.style.left = `${left}px`
  }, [st])

  return (
    <MenuContext.Provider value={{ open }}>
      {children}
      {st &&
        createPortal(
          <div
            ref={menuRef}
            className="glass-strong fixed z-[55] min-w-[160px] max-w-[calc(100vw-16px)] rounded-2xl p-1.5 shadow-2xl"
            style={{
              // top is computed by useLayoutEffect from the menu's real height
              top: st.rect.bottom + 6,
              left: st.req.align === 'left' ? st.rect.left : Math.min(st.rect.right - 160, window.innerWidth - 168),
              opacity: st.visible ? 1 : 0,
              transform: st.visible ? 'translateY(0) scale(1)' : 'translateY(-4px) scale(0.98)',
              transformOrigin: 'top',
              transition: 'opacity 0.14s ease, transform 0.14s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {st.req.options.map((o: { label: ReactNode; value: string | number }) => {
              const active = o.value === st.req.value
              return (
                <button
                  key={o.value}
                  onClick={() => {
                    close()
                    st.req.onPick(o.value)
                  }}
                  className={`menu-item flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-left text-[13.5px] font-medium ${active ? 'font-semibold text-accent' : 'text-t1'}`}
                >
                  {o.label}
                  {active && <Check size={15} className="flex-none" />}
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </MenuContext.Provider>
  )
}

/**
 * Single-select picker: always the drawn anchored dropdown menu.
 * Native pickers on Apple devices never go through this -- WebKit has not
 * implemented <select>'s showPicker() (Safari only has it in preview builds
 * behind a flag), so the native entry point must be a really rendered
 * <select> overlay; see PickSelect and the isAppleMobile() branches in pages.
 */
export function usePick() {
  const menu = useContext(MenuContext)
  return <T extends string | number>(req: PickReq<T>) => menu.open(req)
}

function pickText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(pickText).join('')
  const props = (node as { props?: { children?: ReactNode } }).props
  return props ? pickText(props.children) : ''
}

/** Real native <select> for Apple mobile devices: tapping pops the system
 *  picker, with no JS involvement */
export function PickSelect<T extends string | number>({
  value, options, onPick, className, placeholder, ariaLabel,
}: {
  value?: T
  options: { label: ReactNode; value: T }[]
  onPick: (v: T) => void
  className?: string
  placeholder?: string
  ariaLabel?: string
}) {
  const current = value != null ? String(value) : (placeholder ?? '')
  return (
    <select
      // overflow-hidden: WebKit lays out <option> text at its real width, so
      // long options (e.g. a sort label) overflow this overlay squeezed to
      // 56pt and widen the whole document, letting the page be dragged
      // sideways
      className={`appearance-none outline-none overflow-hidden ${className ?? ''}`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      aria-label={ariaLabel}
      value={current}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value)
        if (o) onPick(o.value)
        if (value == null && placeholder != null) e.currentTarget.value = placeholder
      }}
    >
      {value == null && placeholder != null && <option value={placeholder}>{placeholder}</option>}
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>{pickText(o.label)}</option>
      ))}
    </select>
  )
}

/* ---------- Badges / tags ---------- */

export function Badge({ children, kind = 'ok' }: { children: ReactNode; kind?: 'ok' | 'blocked' | 'warn' | 'rewrite' | 'info' }) {
  const map = {
    ok: { c: 'var(--ok)', bg: 'var(--ok-soft)' },
    blocked: { c: 'var(--danger)', bg: 'var(--danger-soft)' },
    warn: { c: 'var(--warn)', bg: 'var(--warn-soft)' },
    rewrite: { c: 'var(--violet)', bg: 'var(--violet-soft)' },
    info: { c: 'var(--accent-2)', bg: 'color-mix(in srgb, var(--accent-2) 14%, transparent)' },
  }[kind]
  return (
    <span
      className="inline-flex flex-none items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: map.c, background: map.bg }}
    >
      {children}
    </span>
  )
}

/** Online dot for an instance's /status probe result (shared by the switcher
 *  and the instance list); ok pulses like the protection dot */
export function StatusDot({ online, size = 10 }: { online: 'ok' | 'down' | 'unknown'; size?: number }) {
  const color = online === 'ok' ? 'var(--ok)' : online === 'down' ? 'var(--danger)' : 'var(--t3)'
  return (
    <span
      className={`inline-block flex-none rounded-full ${online === 'ok' ? 'pulse-dot' : ''}`}
      style={{ width: size, height: size, background: color }}
    />
  )
}

/* ---------- Source badges (client origin; a color per source) ---------- */

const SOURCE_STYLE: Record<string, { c: string; bg: string }> = {
  ARP: { c: 'var(--accent-2)', bg: 'color-mix(in srgb, var(--accent-2) 14%, transparent)' },
  DHCP: { c: 'var(--violet)', bg: 'var(--violet-soft)' },
  rDNS: { c: 'var(--warn)', bg: 'var(--warn-soft)' },
  WHOIS: { c: 'var(--ok)', bg: 'var(--ok-soft)' },
  'etc/hosts': { c: 'var(--t2)', bg: 'var(--glass)' },
}

export function SourceBadge({ source }: { source: string }) {
  const st = SOURCE_STYLE[source] ?? { c: 'var(--t2)', bg: 'var(--glass)' }
  return (
    <span
      className="inline-flex flex-none items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: st.c, background: st.bg }}
    >
      {source}
    </span>
  )
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`press flex-none rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${active ? 'font-semibold' : 'glass text-t2'}`}
      style={active ? { background: 'var(--accent-soft)', color: 'var(--accent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent)' } : undefined}
    >
      {children}
    </button>
  )
}

/* ---------- Search bar ---------- */

export function SearchBar({ value, onChange, placeholder, className = '' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={`glass flex items-center gap-2 rounded-full px-4 py-2.5 ${className}`}>
      <Search size={16} className="flex-none text-t3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('common.searchPlaceholder')}
        className="w-full min-w-0 bg-transparent text-[15px] text-t1 outline-none"
        autoCapitalize="none"
        autoCorrect="off"
        enterKeyHint="search"
      />
      {value && (
        <button onClick={() => onChange('')} className="press flex-none text-t3" aria-label={t('common.clear')}>
          <X size={16} />
        </button>
      )}
    </div>
  )
}

/* ---------- Copy button ---------- */

/** Icon copy button: copies text on tap, briefly turns into a check on
 *  success; used at the end of detail-page rows like IP/WHOIS */
export function CopyIconButton({ text, label = '', className = '' }: { text?: string; label?: string; className?: string }) {
  const { t } = useTranslation()
  const [done, setDone] = useState(false)
  if (!text) return null
  const what = label || t('common.content')
  return (
    <button
      onClick={async (e: any) => {
        e.stopPropagation()
        const ok = await copyText(text)
        if (ok) {
          setDone(true)
          toast(t('common.copiedLabel', { what }))
          setTimeout(() => setDone(false), 1500)
        } else {
          toast(t('common.copyFailed'), 'err')
        }
      }}
      className={`press flex-none text-t3 transition-colors hover:text-accent ${className}`}
      aria-label={t('common.copyLabel', { what })}
      title={t('common.copyLabel', { what })}
    >
      {done ? <Check size={14} style={{ color: 'var(--ok)' }} /> : <Copy size={14} />}
    </button>
  )
}

/* ---------- Pagination ---------- */

/**
 * Lightweight pagination: prev/next + page number, shared by both platforms;
 * desktop additionally shows the total count and a page-size picker.
 * Not rendered at all with a single page (mobile); on desktop the summary row
 * still shows when total is passed.
 */
export function Pagination({
  page, pages, onChange, total, pageSize, onPageSize,
}: {
  page: number
  pages: number
  onChange: (p: number) => void
  total?: number
  pageSize?: number
  onPageSize?: (n: number) => void
}) {
  const pick = usePick()
  const { t } = useTranslation()
  const pagesSafe = Math.max(1, pages)
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 lg:justify-between">
      <p className="hidden text-[12px] text-t3 lg:block">
        {t('common.totalItems', { n: total ?? 0 })}{pagesSafe > 1 ? ' · ' + t('common.pageXofY', { page, pages: pagesSafe }) : ''}
      </p>
      {pagesSafe > 1 && (
        <div className="glass flex items-center gap-0.5 rounded-full p-1">
          <button
            onClick={() => onChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="press flex h-7 w-7 items-center justify-center rounded-full text-t2 disabled:opacity-30"
            aria-label={t('common.prevPage')}
          >
            <ChevronLeft size={15} />
          </button>
          <span className="num px-1.5 text-[12.5px] text-t2">{page} / {pagesSafe}</span>
          <button
            onClick={() => onChange(Math.min(pagesSafe, page + 1))}
            disabled={page >= pagesSafe}
            className="press flex h-7 w-7 items-center justify-center rounded-full text-t2 disabled:opacity-30"
            aria-label={t('common.nextPage')}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
      {onPageSize && pageSize != null && (
        <button
          onClick={(e: any) =>
            pick({
              options: [20, 50, 100].map((n) => ({ value: n, label: t('common.perPageOption', { n }) })),
              value: pageSize,
              title: t('common.perPageTitle'),
              anchor: e.currentTarget,
              onPick: onPageSize,
            })
          }
          className="press glass hidden items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium text-t2 lg:inline-flex"
        >
          {t('common.perPageOption', { n: pageSize })} <ChevronDown size={13} />
        </button>
      )}
    </div>
  )
}

/* ---------- Small status components ---------- */

export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-t2" />
}

export function Loading({ text }: { text?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-t2">
      <Spinner size={24} />
      <span className="text-[13px]">{text ?? t('common.loading')}</span>
    </div>
  )
}

export function EmptyState({ icon, title, subtitle }: { icon?: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icon && <div className="mb-1 opacity-60">{icon}</div>}
      <p className="text-[15px] font-semibold text-t2">{title}</p>
      {subtitle && <p className="max-w-[280px] text-[13px] text-t3">{subtitle}</p>}
    </div>
  )
}

export function ErrorBox({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="glass flex items-center justify-between gap-3 rounded-2xl border-l-4 px-4 py-3" style={{ borderLeftColor: 'var(--danger)' }}>
      <span className="text-[13.5px] text-t2">{children}</span>
      {onRetry && (
        <button onClick={onRetry} className="press flex-none text-[13px] font-semibold text-accent">
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}

/* ---------- Toast ---------- */

let toastFn: ((msg: string, kind?: 'ok' | 'err') => void) | null = null
export function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  toastFn?.(msg, kind)
}

export function ToastHost() {
  const [items, setItems] = useState<{ id: number; msg: string; kind: 'ok' | 'err' }[]>([])
  const seq = useRef(0)
  useEffect(() => {
    toastFn = (msg, kind = 'ok') => {
      const id = ++seq.current
      setItems((s) => [...s, { id, msg, kind }])
      setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 2600)
    }
    return () => {
      toastFn = null
    }
  }, [])
  return createPortal(
    <div
      className="pointer-events-none fixed left-1/2 z-[60] flex w-max max-w-[86vw] -translate-x-1/2 flex-col items-center gap-2"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
    >
      {items.map((i) => (
        <div
          key={i.id}
          className="glass-strong rise-in rounded-full px-4 py-2.5 text-[13.5px] font-medium shadow-xl"
          style={{ color: i.kind === 'err' ? 'var(--danger)' : 'var(--t1)' }}
        >
          {i.msg}
        </div>
      ))}
    </div>,
    document.body
  )
}

/* ---------- Confirm dialog ---------- */

export function useConfirm() {
  const sheet = useSheet()
  const { t } = useTranslation()
  return (opts: {
    title: string
    message?: string
    confirmText?: string
    destructive?: boolean
    onConfirm: () => void | Promise<void>
  }) => {
    let busy = false
    sheet.open(
      <div>
        <p className="mb-1 text-center text-[17px] font-bold text-t1">{opts.title}</p>
        {opts.message && <p className="mb-4 text-center text-[13.5px] leading-relaxed text-t2">{opts.message}</p>}
        <div className="mt-4 flex gap-2.5">
          <Button variant="glass" className="flex-1" onClick={sheet.close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={opts.destructive ? 'danger' : 'primary'}
            className="flex-1"
            loading={busy}
            onClick={async () => {
              busy = true
              try {
                await opts.onConfirm()
                sheet.close()
              } finally {
                busy = false
              }
            }}
          >
            {opts.confirmText ?? t('common.confirm')}
          </Button>
        </div>
      </div>
    )
  }
}
