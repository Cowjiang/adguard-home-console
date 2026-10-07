/** Top-center toast host with an imperative toast() callable from anywhere
 *  (non-React helpers included); the host must be mounted exactly once. */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
