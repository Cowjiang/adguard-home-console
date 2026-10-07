/** Anchor-positioned single-select menus: a drawn anchored dropdown. Apple
 *  devices use the native <select> overlay instead (PickSelect); the native
 *  entry must be a really rendered <select> because WebKit does not implement
 *  HTMLSelectElement.showPicker(). */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'

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

/** Mounted by SheetProvider so sheets and their forms can open pick menus too */
export function MenuHost({ children }: { children: ReactNode }) {
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
