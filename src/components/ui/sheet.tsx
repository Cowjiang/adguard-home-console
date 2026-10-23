/** Centered sheet overlay system + confirm dialog. Project red line (user,
 *  refined 2026-10-17): on mobile, **small panels may float** — confirmations,
 *  few-field forms and the instance switcher — while anything whose natural
 *  height approaches half the screen (content browsing, long forms, lists
 *  that grow) must be a sub-page; large panels are never floating windows.
 *  Desktop keeps the centered sheet for all of them. Every dialog appears
 *  centered on screen, never rising from the bottom -- the iOS native tabbar
 *  would cover a bottom sheet. The sheet portals to document.body, i.e.
 *  outside the Router: components rendered inside need navigation injected
 *  via props (see InstanceSwitchList). */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { MenuHost } from './menu'
import { Button } from './primitives'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

interface SheetCtx {
  open: (node: ReactNode, opts?: { title?: string; right?: ReactNode; ariaLabel?: string }) => void
  close: () => void
}
const SheetContext = createContext<SheetCtx>({ open: () => {}, close: () => {} })
export const useSheet = () => useContext(SheetContext)

export function SheetProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [node, setNode] = useState<ReactNode | null>(null)
  const [title, setTitle] = useState<string | undefined>()
  const [ariaLabel, setAriaLabel] = useState<string | undefined>()
  const [right, setRight] = useState<ReactNode>(null)
  const [visible, setVisible] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const open = (n: ReactNode, opts?: { title?: string; right?: ReactNode; ariaLabel?: string }) => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setTitle(opts?.title)
    setAriaLabel(opts?.ariaLabel)
    setRight(opts?.right ?? null)
    setNode(n)
    // Double rAF: the browser must first paint the initial state (transparent
    // + scaled) before visible flips, or the transition won't play; a single
    // rAF merges with the first frame and the sheet "pops in with no animation"
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }
  const close = useCallback(() => {
    setVisible(false)
    const prev = previousFocusRef.current
    previousFocusRef.current = null
    setTimeout(() => {
      setNode(null)
      setRight(null)
      if (prev && document.contains(prev)) prev.focus()
    }, 260)
  }, [])

  useEffect(() => {
    document.body.style.overflow = visible ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [visible])

  // Move focus into the sheet on open so keyboard and screen-reader users are
  // not left behind the backdrop; prefer the content over the header close
  // button, so forms land on their first field
  useEffect(() => {
    if (!node) return
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const first = contentRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? panel).focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [node])

  // Escape closes; Tab cycles inside the sheet instead of leaking to the page
  useEffect(() => {
    if (!node) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0
      )
      if (items.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [node, close])

  return (
    <SheetContext.Provider value={{ open, close }}>
      <MenuHost>{children}</MenuHost>
      {node &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              onClick={close}
              className="absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-250"
              style={{ opacity: visible ? 1 : 0 }}
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel ?? title}
              tabIndex={-1}
              className="glass-strong specular relative m-3 flex w-full max-w-[536px] flex-col overflow-hidden rounded-[28px] p-5 transition-all duration-250 outline-none"
              style={{
                maxHeight: 'calc(100dvh - 24px)',
                transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.95)',
                opacity: visible ? 1 : 0,
                transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {title && (
                <div className="relative mb-3 flex min-h-11 flex-none items-center justify-center">
                  <button
                    type="button"
                    onClick={close}
                    aria-label={t('common.close')}
                    title={t('common.close')}
                    className="press absolute left-0 flex h-11 w-11 items-center justify-center rounded-full text-t3 hover:bg-white/5"
                  >
                    <X size={18} />
                  </button>
                  <h3 className="truncate px-14 text-center text-[16px] font-bold text-t1">{title}</h3>
                  {right && <div className="absolute inset-y-0 right-0 flex items-center">{right}</div>}
                </div>
              )}
              <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
                {node}
              </div>
            </div>
          </div>,
          document.body
        )}
    </SheetContext.Provider>
  )
}

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
      </div>,
      { ariaLabel: opts.title }
    )
  }
}
