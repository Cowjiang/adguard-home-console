/**
 * Helpers for synchronizing filtering rules, DNS rewrites, filter lists, and clients across AdGuard Home instances.
 */
import {
  api,
  type AghClient,
  type ClientsData,
  type Filter,
  type FilteringStatus,
  type RewriteEntry,
} from '../api'
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
 * Synchronizes DNS rewrite rules from source entries to target instances.
 * Implements an additive-first diff alignment to safeguard against network dropouts:
 * 1. Read existing target entries
 * 2. Add missing source entries to target
 * 3. Delete obsolete target entries not present in source
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

/**
 * Synchronizes filter lists (both blocklists and whitelists) from source to target instances.
 * Compares by URL:
 * - Adds lists missing on target (/filtering/add_url)
 * - If added list was disabled, disables it (/filtering/set_url), as AGH defaults add_url to enabled: true
 * - Updates name/enabled state for existing lists (/filtering/set_url)
 * - Skips lists that are already identical
 */
export async function syncFilterListsToInstances(
  targetInstances: Instance[],
  sourceFilters: Filter[] = [],
  sourceWhitelistFilters: Filter[] = []
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
      const targetStatus = await api<FilteringStatus>(cfg, '/filtering/status')
      const targetFilters = targetStatus?.filters ?? []
      const targetWhitelist = targetStatus?.whitelist_filters ?? []

      const syncList = async (sourceList: Filter[], targetList: Filter[], whitelist: boolean) => {
        const targetMap = new Map<string, Filter>(targetList.map((f) => [f.url, f]))

        for (const src of sourceList) {
          const tgt = targetMap.get(src.url)
          if (!tgt) {
            // Missing on target -> Add it
            await api(cfg, '/filtering/add_url', {
              method: 'POST',
              body: { name: src.name, url: src.url, whitelist },
            })
            // AGH /filtering/add_url defaults to enabled: true. If source was disabled, explicitly align it.
            if (!src.enabled) {
              await api(cfg, '/filtering/set_url', {
                method: 'POST',
                body: {
                  url: src.url,
                  whitelist,
                  data: { name: src.name, url: src.url, enabled: false },
                },
              })
            }
          } else if (tgt.enabled !== src.enabled || tgt.name !== src.name) {
            // Already exists but name or enabled status differs -> Update it
            await api(cfg, '/filtering/set_url', {
              method: 'POST',
              body: {
                url: src.url,
                whitelist,
                data: { name: src.name, url: src.url, enabled: src.enabled },
              },
            })
          }
        }
      }

      if (sourceFilters.length > 0) {
        await syncList(sourceFilters, targetFilters, false)
      }
      if (sourceWhitelistFilters.length > 0) {
        await syncList(sourceWhitelistFilters, targetWhitelist, true)
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

/**
 * Synchronizes persistent client configurations across target instances.
 * Compares by client name:
 * - Adds clients missing on target (/clients/add)
 * - Updates clients that exist but differ in policies/tags/blocked_services (/clients/update)
 * - Skips clients that are identical
 */
export async function syncClientsToInstances(
  targetInstances: Instance[],
  sourceClients: AghClient[] = []
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
      const targetData = await api<ClientsData>(cfg, '/clients')
      const targetClients = targetData?.clients ?? []
      const targetMap = new Map<string, AghClient>(targetClients.map((c) => [c.name, c]))

      for (const src of sourceClients) {
        const tgt = targetMap.get(src.name)
        if (!tgt) {
          // Missing on target -> Add it
          await api(cfg, '/clients/add', {
            method: 'POST',
            body: src,
          })
        } else {
          // Compare whether configuration differs across all policy fields
          const isSame =
            JSON.stringify(src.ids ?? []) === JSON.stringify(tgt.ids ?? []) &&
            JSON.stringify(src.tags ?? []) === JSON.stringify(tgt.tags ?? []) &&
            JSON.stringify(src.blocked_services ?? []) === JSON.stringify(tgt.blocked_services ?? []) &&
            JSON.stringify(src.upstreams ?? []) === JSON.stringify(tgt.upstreams ?? []) &&
            src.filtering_enabled === tgt.filtering_enabled &&
            src.parental_enabled === tgt.parental_enabled &&
            src.safebrowsing_enabled === tgt.safebrowsing_enabled &&
            src.use_global_settings === tgt.use_global_settings &&
            src.use_global_blocked_services === tgt.use_global_blocked_services &&
            src.ignore_querylog === tgt.ignore_querylog &&
            src.ignore_statistics === tgt.ignore_statistics &&
            src.safe_search?.enabled === tgt.safe_search?.enabled

          if (!isSame) {
            await api(cfg, '/clients/update', {
              method: 'POST',
              body: {
                name: src.name,
                data: src,
              },
            })
          }
        }
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
