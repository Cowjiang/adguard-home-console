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
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { MenuHost } from './menu'
import { Button } from './primitives'

interface SheetCtx {
  open: (node: ReactNode, opts?: { title?: string; right?: ReactNode }) => void
  close: () => void
}
const SheetContext = createContext<SheetCtx>({ open: () => {}, close: () => {} })
export const useSheet = () => useContext(SheetContext)

export function SheetProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode | null>(null)
  const [title, setTitle] = useState<string | undefined>()
  const [right, setRight] = useState<ReactNode>(null)
  const [visible, setVisible] = useState(false)

  const open = (n: ReactNode, opts?: { title?: string; right?: ReactNode }) => {
    setTitle(opts?.title)
    setRight(opts?.right ?? null)
    setNode(n)
    // Double rAF: the browser must first paint the initial state (transparent
    // + scaled) before visible flips, or the transition won't play; a single
    // rAF merges with the first frame and the sheet "pops in with no animation"
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }
  const close = () => {
    setVisible(false)
    setTimeout(() => {
      setNode(null)
      setRight(null)
    }, 260)
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
              {title && (
                <div className="relative mb-3 flex min-h-8 items-center justify-center">
                  <h3 className="truncate px-14 text-center text-[16px] font-bold text-t1">{title}</h3>
                  {right && <div className="absolute inset-y-0 right-0 flex items-center">{right}</div>}
                </div>
              )}
              {node}
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
      </div>
    )
  }
}
