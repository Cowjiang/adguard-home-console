/**
 * Shared mutation orchestration: run the action, revalidate the scoped SWR
 * keys, toast the outcome — the single helper the pages' try→api→mutate→toast
 * copies converge on (see docs/engineering.md). Optimistic update idioms
 * (pending mirror + rollback, save queues) deliberately stay in their pages.
 */
import type { ParseKeys } from 'i18next'
import { i18n } from './i18n'
import { toast } from '../components/ui/toast'

/** Message keys are type-checked against the zh dictionary (see lib/i18n) */
type MsgKey = ParseKeys

export interface MutationSpec<T> {
  action: () => Promise<T>
  /** Revalidate the scoped SWR keys after success; not awaited, matching the
   *  copies this replaces */
  invalidate?: () => unknown
  /** Success toast; silent when omitted */
  okKey?: MsgKey
  /** Interpolation values for okKey, derived from the action's result */
  okVars?: (result: T) => Record<string, string | number>
  /** Failure toast; defaults to common.saveFailed. `msg` is the error message
   *  (adapter kinds arrive already localized from api()) */
  failKey?: MsgKey
  /** Busy flag while in flight (`setSaving` / `setRefreshing`) */
  setBusy?: (busy: boolean) => void
}

/** True on success. Failures are toasted, never thrown: call sites either
 *  ignore the result or guard follow-up steps (close, navigate) with it */
export async function runMutation<T>(spec: MutationSpec<T>): Promise<boolean> {
  spec.setBusy?.(true)
  try {
    const result = await spec.action()
    spec.invalidate?.()
    if (spec.okKey) toast(i18n.t(spec.okKey, spec.okVars?.(result)))
    return true
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    toast(i18n.t(spec.failKey ?? 'common.saveFailed', { msg }), 'err')
    return false
  } finally {
    spec.setBusy?.(false)
  }
}
