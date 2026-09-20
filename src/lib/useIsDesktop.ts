/** 桌面断点(≥lg 1024px)检测:matchMedia + useSyncExternalStore,避免双套 DOM 常驻 */
import { useSyncExternalStore } from 'react'

const mq = typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)') : null

function subscribe(cb: () => void) {
  mq?.addEventListener('change', cb)
  return () => mq?.removeEventListener('change', cb)
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => mq?.matches ?? false,
    () => false
  )
}
