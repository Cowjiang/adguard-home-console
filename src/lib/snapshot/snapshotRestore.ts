/**
 * Safe restoration and rollback engine with pre-validation and fail-safe snapshots.
 */
import {
  api,
  type ClientsData,
  type Filter,
  type FilteringStatus,
  type RewriteEntry,
  type SvrConfig,
} from '../api'
import {
  captureInstanceSnapshot,
  computePayloadChecksum,
} from './snapshotCapture'
import { saveSnapshot } from './snapshotStorage'
import type {
  AghConfigSnapshot,
  ModuleRestoreStatus,
  RestoreExecutionResult,
  SnapshotModule,
  SnapshotSourceInstance,
  SnapshotValidationResult,
} from './types'

/**
 * Validates a snapshot object for schema version, structural completeness, and checksum integrity.
 */
export async function validateSnapshot(snapshot: AghConfigSnapshot): Promise<SnapshotValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []

  if (!snapshot || typeof snapshot !== 'object') {
    return { valid: false, errors: ['Snapshot is not a valid object'], warnings: [] }
  }

  const meta = snapshot.meta
  const data = snapshot.data

  if (!meta) {
    errors.push('Missing snapshot metadata header')
  } else {
    if (meta.schemaVersion !== '1.0') {
      errors.push(`Unsupported schemaVersion: ${meta.schemaVersion} (expected 1.0)`)
    }
    if (!meta.id) errors.push('Missing snapshot ID')
    if (!meta.createdAt) errors.push('Missing creation timestamp')
    if (!meta.sourceInstance?.url) warnings.push('Missing source instance URL')
    if (!Array.isArray(meta.modules) || meta.modules.length === 0) {
      warnings.push('Snapshot metadata declares zero modules')
    }
  }

  if (!data || typeof data !== 'object') {
    errors.push('Missing snapshot data payload')
  } else if (meta?.checksum) {
    try {
      const calculatedChecksum = await computePayloadChecksum(data)
      if (calculatedChecksum !== meta.checksum) {
        warnings.push('Payload checksum mismatch: snapshot data may have been altered or corrupted')
      }
    } catch {
      warnings.push('Failed to verify payload checksum')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Executes a safe, sequential restoration of configuration modules to an AGH instance.
 */
export async function restoreSnapshot(
  cfg: SvrConfig,
  snapshot: AghConfigSnapshot,
  opts: {
    selectedModules?: readonly SnapshotModule[]
    autoPreRollbackSnapshot?: boolean
    currentInstanceMeta?: SnapshotSourceInstance
    /** Localized label / description for the fail-safe snapshot (the UI passes
     *  translated copy; English defaults keep the lib standalone) */
    guardLabel?: string
    guardDescription?: string
  } = {}
): Promise<RestoreExecutionResult> {
  // 1. Pre-validation
  const validation = await validateSnapshot(snapshot)
  if (!validation.valid) {
    throw new Error(`Invalid snapshot: ${validation.errors.join('; ')}`)
  }

  let preRollbackSnapshotId: string | undefined

  // 2. Fail-safe: capture current state before applying rollback
  if (opts.autoPreRollbackSnapshot !== false && opts.currentInstanceMeta) {
    try {
      const guardSnapshot = await captureInstanceSnapshot(cfg, opts.currentInstanceMeta, {
        label: opts.guardLabel ?? `Rollback Guard (${new Date().toLocaleTimeString()})`,
        description:
          opts.guardDescription ??
          `Automated fail-safe backup captured before restoring snapshot ${snapshot.meta.id}`,
        trigger: 'pre_rollback',
      })
      await saveSnapshot(guardSnapshot)
      preRollbackSnapshotId = guardSnapshot.meta.id
    } catch (e: any) {
      // If capturing pre-rollback snapshot fails, do not silently proceed with destructive changes
      throw new Error(`Failed to capture pre-rollback safety snapshot: ${e?.message || String(e)}`)
    }
  }

  const requestedModules = new Set(
    opts.selectedModules && opts.selectedModules.length > 0 ? opts.selectedModules : snapshot.meta.modules
  )

  const moduleResults: ModuleRestoreStatus[] = []

  // Helper to record module result
  const record = (module: SnapshotModule, success: boolean, error?: string) => {
    moduleResults.push({ module, success, error })
  }

  const data = snapshot.data

  // 3. Sequential Module Restorations

  // A. DNS Settings
  if (requestedModules.has('dns') && data.dns) {
    try {
      await api(cfg, '/dns_config', {
        method: 'POST',
        body: data.dns,
      })
      record('dns', true)
    } catch (e: any) {
      record('dns', false, e?.message || String(e))
    }
  }

  // B. Blocked Services
  if (requestedModules.has('blocked_services') && data.blocked_services) {
    try {
      await api(cfg, '/blocked_services/update', {
        method: 'PUT',
        body: {
          ids: data.blocked_services.ids || [],
          schedule: data.blocked_services.schedule,
        },
      })
      record('blocked_services', true)
    } catch (e: any) {
      record('blocked_services', false, e?.message || String(e))
    }
  }

  // C. SafeSearch
  if (requestedModules.has('safesearch') && data.safesearch) {
    try {
      await api(cfg, '/safesearch/settings', {
        method: 'PUT',
        body: data.safesearch,
      })
      record('safesearch', true)
    } catch (e: any) {
      record('safesearch', false, e?.message || String(e))
    }
  }

  // D. Access control
  if (requestedModules.has('access') && data.access) {
    try {
      await api(cfg, '/access/set', {
        method: 'POST',
        body: {
          allowed_clients: data.access.allowed_clients || [],
          disallowed_clients: data.access.disallowed_clients || [],
          blocked_hosts: data.access.blocked_hosts || [],
        },
      })
      record('access', true)
    } catch (e: any) {
      record('access', false, e?.message || String(e))
    }
  }

  // E. Filter lists (blocklists & allowlists: add missing, align properties, remove obsolete)
  if (requestedModules.has('filters') && data.filters) {
    try {
      const currentStatus = await api<FilteringStatus>(cfg, '/filtering/status')

      const syncFilterGroup = async (
        targetFilters: Filter[] = [],
        currentFilters: Filter[] = [],
        whitelist: boolean
      ) => {
        const currentMap = new Map(currentFilters.map((f) => [f.url, f]))
        const targetMap = new Map(targetFilters.map((f) => [f.url, f]))

        // 1. Add missing or update modified on target
        for (const tf of targetFilters) {
          const cf = currentMap.get(tf.url)
          if (!cf) {
            await api(cfg, '/filtering/add_url', {
              method: 'POST',
              body: { name: tf.name, url: tf.url, whitelist },
            })
            if (!tf.enabled) {
              await api(cfg, '/filtering/set_url', {
                method: 'POST',
                body: { url: tf.url, whitelist, data: { name: tf.name, url: tf.url, enabled: false } },
              })
            }
          } else if (cf.enabled !== tf.enabled || cf.name !== tf.name) {
            await api(cfg, '/filtering/set_url', {
              method: 'POST',
              body: { url: tf.url, whitelist, data: { name: tf.name, url: tf.url, enabled: tf.enabled } },
            })
          }
        }

        // 2. Remove obsolete filters on target that do not exist in the rollback snapshot
        for (const cf of currentFilters) {
          if (!targetMap.has(cf.url)) {
            await api(cfg, '/filtering/remove_url', {
              method: 'POST',
              body: { url: cf.url, whitelist },
            })
          }
        }
      }

      await syncFilterGroup(data.filters.filters || [], currentStatus?.filters || [], false)
      await syncFilterGroup(
        data.filters.whitelist_filters || [],
        currentStatus?.whitelist_filters || [],
        true
      )

      // Configure global filter interval & switch
      await api(cfg, '/filtering/config', {
        method: 'POST',
        body: {
          enabled: data.filters.enabled,
          interval: data.filters.interval,
        },
      })

      record('filters', true)
    } catch (e: any) {
      record('filters', false, e?.message || String(e))
    }
  }

  // F. User custom rules
  if (requestedModules.has('user_rules') && Array.isArray(data.user_rules)) {
    try {
      await api(cfg, '/filtering/set_rules', {
        method: 'POST',
        body: { rules: data.user_rules },
      })
      record('user_rules', true)
    } catch (e: any) {
      record('user_rules', false, e?.message || String(e))
    }
  }

  // G. DNS Rewrites
  if (requestedModules.has('rewrites') && Array.isArray(data.rewrites)) {
    try {
      const currentRaw = await api<RewriteEntry[]>(cfg, '/rewrite/list')
      const currentRewrites = Array.isArray(currentRaw) ? currentRaw : []
      const isSame = (a: RewriteEntry, b: RewriteEntry) =>
        a.domain.toLowerCase() === b.domain.toLowerCase() && a.answer === b.answer

      const toAdd = data.rewrites.filter((s) => !currentRewrites.some((c) => isSame(s, c)))
      const toDelete = currentRewrites.filter((c) => !data.rewrites!.some((s) => isSame(s, c)))

      // Safe order: add first, then delete obsolete
      for (const entry of toAdd) {
        await api(cfg, '/rewrite/add', {
          method: 'POST',
          body: { domain: entry.domain, answer: entry.answer },
        })
      }
      for (const entry of toDelete) {
        await api(cfg, '/rewrite/delete', {
          method: 'POST',
          body: { domain: entry.domain, answer: entry.answer },
        })
      }
      record('rewrites', true)
    } catch (e: any) {
      record('rewrites', false, e?.message || String(e))
    }
  }

  // H. Clients
  if (requestedModules.has('clients') && Array.isArray(data.clients)) {
    try {
      const currentData = await api<ClientsData>(cfg, '/clients')
      const currentClients = currentData?.clients || []
      const currentMap = new Map(currentClients.map((c) => [c.name, c]))

      for (const targetClient of data.clients) {
        const existing = currentMap.get(targetClient.name)
        if (!existing) {
          await api(cfg, '/clients/add', {
            method: 'POST',
            body: targetClient,
          })
        } else {
          await api(cfg, '/clients/update', {
            method: 'POST',
            body: {
              name: targetClient.name,
              data: targetClient,
            },
          })
        }
      }
      record('clients', true)
    } catch (e: any) {
      record('clients', false, e?.message || String(e))
    }
  }

  // I. General Settings (Querylog + Stats)
  if (requestedModules.has('general') && data.general) {
    try {
      if (data.general.querylog) {
        await api(cfg, '/querylog/config/update', {
          method: 'PUT',
          body: data.general.querylog,
        })
      }
      if (data.general.stats) {
        await api(cfg, '/stats/config/update', {
          method: 'PUT',
          body: data.general.stats,
        })
      }
      record('general', true)
    } catch (e: any) {
      record('general', false, e?.message || String(e))
    }
  }

  const succeededCount = moduleResults.filter((r) => r.success).length
  const failedCount = moduleResults.filter((r) => !r.success).length

  return {
    success: failedCount === 0,
    totalModules: moduleResults.length,
    succeededModules: succeededCount,
    failedModules: failedCount,
    preRollbackSnapshotId,
    moduleResults,
  }
}
