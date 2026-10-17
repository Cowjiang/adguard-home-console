/** iOS-style base primitives: page containers, headers, cards, lists, controls */
import {
  useEffect, useRef, useState, type MouseEvent as RMouseEvent, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useIsDesktop } from '../../lib/useIsDesktop'
import { TOP_LEVEL_ROUTES, isDesktopSettingsTopLevel } from '../../lib/nav/routes'
import { useRouteTransition, useEnterSkip } from '../../lib/routeTransition'
import { useNativeBackShown } from '../../lib/native/nativeBackButton'
import { useNativeHeaderAction, type NativeHeaderSpec } from '../../lib/native/nativeHeaderAction'
import { navBack } from '../../lib/nav/backNav'

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
  // back belongs to secondary pages only.
  // In the desktop split layout, settings sub-pages (except /settings/server/edit)
  // have top-level semantics where the secondary sidebar handles navigation.
  const isTopLevel = TOP_LEVEL_ROUTES.includes(pathname) || isDesktopSettingsTopLevel(pathname, isDesktop)
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
