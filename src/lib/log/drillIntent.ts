/**
 * Query-log drill handoff: the mobile analytics sub-page records the tapped
 * metric, then pops back with navBack(); the log list reads it on its next
 * mount and applies it through its own replace-based URL sync. That mirrors the
 * desktop sheet's in-place drill (list filtered, no layer left open) without
 * adding a history entry -- replace-navigating from a sub-page to the parent
 * list would leave a duplicate entry (see docs/web-interaction.md).
 */
export interface LogDrill {
  q?: string
  filter?: string
}

let pending: LogDrill | null = null

export function markLogDrill(intent: LogDrill) {
  pending = intent
}

/** Read without clearing: the list reads during render so its state
 *  initializers already start from the drilled value, then clears after commit
 *  (clearing while rendering would lose the value on a StrictMode re-render) */
export function peekLogDrill(): LogDrill | null {
  return pending
}

export function consumeLogDrill() {
  pending = null
}
