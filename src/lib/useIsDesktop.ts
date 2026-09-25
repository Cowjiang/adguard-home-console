/** Desktop breakpoint (≥lg 1024px) detection: matchMedia +
 *  useSyncExternalStore, avoids keeping two DOM sets mounted */
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
