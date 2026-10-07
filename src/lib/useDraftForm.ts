/**
 * Draft-form state shared by the settings pages: the draft follows the server
 * copy until the user edits it (dirty), and every save refills from a fresh
 * refetch — the server's own values become the new baseline, so a successful
 * save always clears dirty. `project` maps the server payload onto the draft
 * shape when the two differ (default: a structural clone).
 */
import { useCallback, useEffect, useState } from 'react'

/** Default projection: the draft is a plain clone of the server payload */
const clone = <T, D>(data: T): D => structuredClone(data) as unknown as D

export interface DraftForm<T, D = T> {
  draft: D | null
  dirty: boolean
  patch: <K extends keyof D>(key: K, value: D[K]) => void
  /** Replace the draft from the latest server payload (discard / post-save
   *  refill); a nullish payload drops back to "waiting for data" */
  reset: (next?: T | null) => void
}

export function useDraftForm<T, D = T>(
  data: T | undefined | null,
  project: (data: T) => D = clone
): DraftForm<T, D> {
  const [draft, setDraft] = useState<D | null>(null)
  useEffect(() => {
    if (data && draft === null) setDraft(project(data))
  }, [data, draft, project])

  const patch = useCallback(<K extends keyof D>(key: K, value: D[K]) => {
    setDraft((s) => (s ? { ...s, [key]: value } : s))
  }, [])
  const reset = useCallback((next?: T | null) => setDraft(next ? project(next) : null), [project])

  const dirty = draft !== null && !!data && JSON.stringify(draft) !== JSON.stringify(project(data))
  return { draft, dirty, patch, reset }
}
