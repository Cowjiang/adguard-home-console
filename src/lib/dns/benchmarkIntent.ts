/** One-shot handoff: the mobile benchmark sub-page hands the applied upstream
 *  list back to the DNS settings draft after a POP (mirrors the log drill
 *  intent in src/lib/log/drillIntent.ts) */
let pending: string[] | null = null

export function markBenchmarkApply(upstreams: string[]) {
  pending = upstreams
}

export function peekBenchmarkApply(): string[] | null {
  return pending
}

export function consumeBenchmarkApply() {
  pending = null
}
