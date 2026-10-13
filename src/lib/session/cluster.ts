/**
 * Cluster-wide protection actions across multiple online AdGuard Home instances.
 */
import { api } from '../api'
import { activeEndpoint, type Instance, type SvrConfig } from './instances'

export interface ClusterProtectionResult {
  total: number
  succeeded: number
  failed: number
  skipped: number
  errors: { instanceId: string; label: string; error: string }[]
}

export interface SetClusterProtectionOptions {
  enabled: boolean
  durationMs?: number
  /**
   * Filter predicate to determine if an instance should be targeted.
   * By default, targets all instances whose online status is not 'down'.
   */
  isTarget?: (inst: Instance) => boolean
}

/**
 * Concurrently dispatches POST /control/protection to all matching instances.
 */
export async function setClusterProtection(
  instances: Instance[],
  options: SetClusterProtectionOptions
): Promise<ClusterProtectionResult> {
  const { enabled, durationMs = 0, isTarget } = options
  const result: ClusterProtectionResult = {
    total: instances.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  const tasks = instances.map(async (inst) => {
    if (isTarget && !isTarget(inst)) {
      result.skipped++
      return
    }

    const ep = activeEndpoint(inst)
    if (!ep) {
      result.skipped++
      return
    }

    const cfg: SvrConfig = {
      url: ep.url,
      username: ep.username,
      password: ep.password,
    }

    try {
      await api(cfg, '/protection', {
        method: 'POST',
        body: { enabled, duration: durationMs },
      })
      result.succeeded++
    } catch (e: any) {
      result.failed++
      result.errors.push({
        instanceId: inst.id,
        label: inst.label,
        error: e?.message || String(e),
      })
    }
  })

  await Promise.allSettled(tasks)
  return result
}
