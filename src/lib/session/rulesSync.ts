/**
 * Helpers for synchronizing filtering rules and DNS rewrites across AdGuard Home instances.
 */
import { api, type RewriteEntry } from '../api'
import { activeEndpoint, type Instance, type SvrConfig } from './instances'

export interface SyncTargetResult {
  instanceId: string
  label: string
  success: boolean
  error?: string
}

export interface SyncExecutionSummary {
  total: number
  succeeded: number
  failed: number
  results: SyncTargetResult[]
}

function toSvrConfig(inst: Instance): SvrConfig | null {
  const ep = activeEndpoint(inst)
  if (!ep) return null
  return {
    url: ep.url,
    username: ep.username,
    password: ep.password,
  }
}

/**
 * Pushes custom filtering rules (user_rules) from a source rule list
 * to one or more target instances. Overwrites existing rules on targets.
 */
export async function syncUserRulesToInstances(
  targetInstances: Instance[],
  rules: string[]
): Promise<SyncExecutionSummary> {
  const summary: SyncExecutionSummary = {
    total: targetInstances.length,
    succeeded: 0,
    failed: 0,
    results: [],
  }

  const tasks = targetInstances.map(async (inst) => {
    const cfg = toSvrConfig(inst)
    if (!cfg) {
      summary.failed++
      summary.results.push({
        instanceId: inst.id,
        label: inst.label,
        success: false,
        error: 'Missing endpoint configuration',
      })
      return
    }

    try {
      await api(cfg, '/filtering/set_rules', {
        method: 'POST',
        body: { rules },
      })
      summary.succeeded++
      summary.results.push({
        instanceId: inst.id,
        label: inst.label,
        success: true,
      })
    } catch (e: any) {
      summary.failed++
      summary.results.push({
        instanceId: inst.id,
        label: inst.label,
        success: false,
        error: e?.message || String(e),
      })
    }
  })

  await Promise.allSettled(tasks)
  return summary
}

/**
 * Robustly mirrors DNS rewrite entries to target instances using differential sync:
 * 1. Computes toAdd (source entries missing on target) and toDelete (target entries not in source)
 * 2. Adds missing entries first (preventing DNS service outage and avoiding data loss if aborted)
 * 3. Deletes obsolete entries only after additions succeed
 * Identical entries are skipped, drastically reducing network round-trips.
 */
export async function syncRewritesToInstances(
  targetInstances: Instance[],
  sourceEntries: RewriteEntry[]
): Promise<SyncExecutionSummary> {
  const summary: SyncExecutionSummary = {
    total: targetInstances.length,
    succeeded: 0,
    failed: 0,
    results: [],
  }

  const tasks = targetInstances.map(async (inst) => {
    const cfg = toSvrConfig(inst)
    if (!cfg) {
      summary.failed++
      summary.results.push({
        instanceId: inst.id,
        label: inst.label,
        success: false,
        error: 'Missing endpoint configuration',
      })
      return
    }

    try {
      const rawTarget = await api<any>(cfg, '/rewrite/list')
      const targetEntries: RewriteEntry[] = Array.isArray(rawTarget) ? rawTarget : []

      // Identify diff sets
      const isSame = (a: RewriteEntry, b: RewriteEntry) =>
        a.domain.toLowerCase() === b.domain.toLowerCase() && a.answer === b.answer

      const toAdd = sourceEntries.filter((s) => !targetEntries.some((t) => isSame(s, t)))
      const toDelete = targetEntries.filter((t) => !sourceEntries.some((s) => isSame(s, t)))

      // 1. Add missing entries first (safe against network interruptions)
      for (const entry of toAdd) {
        await api(cfg, '/rewrite/add', {
          method: 'POST',
          body: { domain: entry.domain, answer: entry.answer },
        })
      }

      // 2. Remove obsolete entries on target
      for (const entry of toDelete) {
        await api(cfg, '/rewrite/delete', {
          method: 'POST',
          body: { domain: entry.domain, answer: entry.answer },
        })
      }

      summary.succeeded++
      summary.results.push({
        instanceId: inst.id,
        label: inst.label,
        success: true,
      })
    } catch (e: any) {
      summary.failed++
      summary.results.push({
        instanceId: inst.id,
        label: inst.label,
        success: false,
        error: e?.message || String(e),
      })
    }
  })

  await Promise.allSettled(tasks)
  return summary
}
