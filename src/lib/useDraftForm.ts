/**
 * Draft-form state shared by the settings pages: the draft follows the server
 * copy for as long as the user has not edited it, and stops following once it
 * is edited (dirty). Every save refills from a fresh refetch — the server's own
 * values become the new baseline, so a successful save always clears dirty.
 * `project` maps the server payload onto the draft shape when the two differ
 * (default: a structural clone).
 */
import { useCallback, useEffect, useRef, useState } from 'react'

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

/** What an incoming server payload does to the draft (see `draftFollow`) */
export type DraftFollow = 'adopt' | 'release' | 'keep'

/**
 * Follow rules as a decision table, kept pure so they can be unit-tested (the
 * hook itself needs a DOM to run):
 * - a draft the user never edited always takes the payload the server just
 *   sent; SWR renders the cache first and revalidates after, so the cache the
 *   page mounted on may be stale and the refetch must not be swallowed;
 * - a draft the user edited is kept, except once it matches the server copy
 *   again (edited back by hand, or the server caught up with it), where
 *   following resumes.
 */
export function draftFollow(state: {
  edited: boolean
  /** The payload differs from the one the draft was projected from */
  isNewPayload: boolean
  /** The draft equals the current server copy */
  matchesServer: boolean
}): DraftFollow {
  if (state.isNewPayload && !state.edited) return 'adopt'
  if (state.edited && state.matchesServer) return 'release'
  return 'keep'
}

export function useDraftForm<T, D = T>(
  data: T | undefined | null,
  project: (data: T) => D = clone
): DraftForm<T, D> {
  const [draft, setDraft] = useState<D | null>(null)
  const [edited, setEdited] = useState(false)
  // Payload the draft was projected from — compared by identity, so a
  // re-created `project` alone does not re-project the draft
  const projectedRef = useRef<T | undefined | null>(undefined)

  const patch = useCallback(<K extends keyof D>(key: K, value: D[K]) => {
    setEdited(true)
    setDraft((s) => (s ? { ...s, [key]: value } : s))
  }, [])

  const reset = useCallback((next?: T | null) => {
    // Baseline first: a stale one would have the follow effect re-project
    projectedRef.current = next ?? null
    setEdited(false)
    setDraft(next ? project(next) : null)
  }, [project])

  const dirty = draft !== null && !!data && JSON.stringify(draft) !== JSON.stringify(project(data))

  useEffect(() => {
    const action = draftFollow({
      edited,
      isNewPayload: projectedRef.current !== data,
      matchesServer: !dirty,
    })
    if (action === 'adopt') {
      projectedRef.current = data
      setDraft(data ? project(data) : null)
    } else if (action === 'release') {
      setEdited(false)
    }
  }, [data, edited, dirty, project])

  return { draft, dirty, patch, reset }
}
