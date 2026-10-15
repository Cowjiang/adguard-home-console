/**
 * Captures live configuration slices from an AdGuard Home instance
 * and sanitizes them into standard AghConfigSnapshot format.
 */
import {
  api,
  type AghClient,
  type ClientsData,
  type DnsInfo,
  type FilteringStatus,
  type QueryLogConfig,
  type RewriteEntry,
  type StatsConfig,
  type SvrConfig,
} from '../api'
import {
  ALL_SNAPSHOT_MODULES,
  type AccessListPayload,
  type AghConfigSnapshot,
  type BlockedServicesPayload,
  type GeneralSettingsPayload,
  type SafeSearchPayload,
  type SnapshotMeta,
  type SnapshotModule,
  type SnapshotPayload,
  type SnapshotSourceInstance,
  type SnapshotTrigger,
} from './types'

/**
 * Recursively serializes any JavaScript value into canonical, key-sorted JSON
 * to ensure deterministic hashing across environments.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']'
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  return (
    '{' +
    keys
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((obj as Record<string, unknown>)[k])}`)
      .join(',') +
    '}'
  )
}

/**
 * Computes deterministic SHA-256 checksum hex string for any object.
 * Falls back to numeric fnv1a-like hex digest if crypto.subtle is not available.
 */
export async function computePayloadChecksum(payload: SnapshotPayload): Promise<string> {
  const json = canonicalJson(payload)
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const encoder = new TextEncoder()
    const data = encoder.encode(json)
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // Deterministic fallback for non-crypto environments
  let h1 = 0xdeadbeef
  let h2 = 0x41c64e6d
  for (let i = 0; i < json.length; i++) {
    const ch = json.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, '0')
}

/**
 * Generates UUID v4 with crypto or pseudo-random fallback.
 */
export function generateSnapshotId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'snap-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

/**
 * Sanitizes and strips sensitive credentials or unnecessary runtime states
 * before saving to snapshot payload.
 */
export function sanitizeSnapshotPayload(raw: SnapshotPayload): SnapshotPayload {
  const cleaned: SnapshotPayload = {}

  if (raw.dns) {
    cleaned.dns = { ...raw.dns }
  }

  if (raw.filters) {
    cleaned.filters = {
      enabled: Boolean(raw.filters.enabled),
      interval: Number(raw.filters.interval || 0),
      filters: (raw.filters.filters || []).map((f) => ({
        url: f.url,
        name: f.name,
        id: f.id,
        enabled: f.enabled,
        rules_count: f.rules_count,
        last_updated: f.last_updated,
        last_checked: f.last_checked,
      })),
      whitelist_filters: (raw.filters.whitelist_filters || []).map((f) => ({
        url: f.url,
        name: f.name,
        id: f.id,
        enabled: f.enabled,
        rules_count: f.rules_count,
        last_updated: f.last_updated,
        last_checked: f.last_checked,
      })),
    }
  }

  if (Array.isArray(raw.user_rules)) {
    cleaned.user_rules = [...raw.user_rules]
  }

  if (Array.isArray(raw.rewrites)) {
    cleaned.rewrites = raw.rewrites.map((r) => ({
      domain: r.domain,
      answer: r.answer,
      enabled: r.enabled !== false,
    }))
  }

  if (Array.isArray(raw.clients)) {
    cleaned.clients = raw.clients.map((c) => ({
      ...c,
      ids: [...(c.ids || [])],
      tags: [...(c.tags || [])],
      blocked_services: [...(c.blocked_services || [])],
      upstreams: c.upstreams ? [...c.upstreams] : undefined,
    }))
  }

  if (raw.access) {
    cleaned.access = {
      allowed_clients: [...(raw.access.allowed_clients || [])],
      disallowed_clients: [...(raw.access.disallowed_clients || [])],
      blocked_hosts: [...(raw.access.blocked_hosts || [])],
    }
  }

  if (raw.general) {
    cleaned.general = {
      querylog: { ...raw.general.querylog },
      stats: { ...raw.general.stats },
    }
  }

  if (raw.blocked_services) {
    cleaned.blocked_services = {
      ids: [...(raw.blocked_services.ids || [])],
      schedule: raw.blocked_services.schedule ? JSON.parse(JSON.stringify(raw.blocked_services.schedule)) : undefined,
    }
  }

  if (raw.safesearch) {
    cleaned.safesearch = { ...raw.safesearch }
  }

  return cleaned
}

/**
 * Captures live configuration slice or full snapshot from an AGH endpoint.
 */
export async function captureInstanceSnapshot(
  cfg: SvrConfig,
  instanceMeta: SnapshotSourceInstance,
  opts: {
    label: string
    trigger: SnapshotTrigger
    description?: string
    modules?: readonly SnapshotModule[]
  }
): Promise<AghConfigSnapshot> {
  const targetModules = new Set<SnapshotModule>(opts.modules && opts.modules.length > 0 ? opts.modules : ALL_SNAPSHOT_MODULES)
  const payload: SnapshotPayload = {}
  const capturedModules: SnapshotModule[] = []

  const tasks: Promise<void>[] = []

  // 1. DNS module
  if (targetModules.has('dns')) {
    tasks.push(
      api<DnsInfo>(cfg, '/dns_info')
        .then((info) => {
          payload.dns = info
          capturedModules.push('dns')
        })
        .catch(() => {
          /* Graceful module degradation */
        })
    )
  }

  // 2. Filters & User rules
  const needFiltering = targetModules.has('filters') || targetModules.has('user_rules')
  if (needFiltering) {
    tasks.push(
      api<FilteringStatus>(cfg, '/filtering/status')
        .then((status) => {
          if (targetModules.has('filters')) {
            payload.filters = {
              enabled: status.enabled,
              interval: status.interval,
              filters: status.filters || [],
              whitelist_filters: status.whitelist_filters || [],
            }
            capturedModules.push('filters')
          }
          if (targetModules.has('user_rules')) {
            payload.user_rules = status.user_rules || []
            capturedModules.push('user_rules')
          }
        })
        .catch(() => {
          /* Graceful degradation */
        })
    )
  }

  // 3. Rewrites
  if (targetModules.has('rewrites')) {
    tasks.push(
      api<RewriteEntry[]>(cfg, '/rewrite/list')
        .then((list) => {
          payload.rewrites = Array.isArray(list) ? list : []
          capturedModules.push('rewrites')
        })
        .catch(() => {
          /* Graceful degradation */
        })
    )
  }

  // 4. Clients
  if (targetModules.has('clients')) {
    tasks.push(
      api<ClientsData>(cfg, '/clients')
        .then((data) => {
          payload.clients = data?.clients || []
          capturedModules.push('clients')
        })
        .catch(() => {
          /* Graceful degradation */
        })
    )
  }

  // 5. Access control
  if (targetModules.has('access')) {
    tasks.push(
      api<AccessListPayload>(cfg, '/access/list')
        .then((res) => {
          payload.access = {
            allowed_clients: res.allowed_clients || [],
            disallowed_clients: res.disallowed_clients || [],
            blocked_hosts: res.blocked_hosts || [],
          }
          capturedModules.push('access')
        })
        .catch(() => {
          /* Graceful degradation */
        })
    )
  }

  // 6. General (querylog + stats)
  if (targetModules.has('general')) {
    tasks.push(
      Promise.all([
        api<QueryLogConfig>(cfg, '/querylog/config'),
        api<StatsConfig>(cfg, '/stats/config'),
      ])
        .then(([querylog, stats]) => {
          payload.general = { querylog, stats }
          capturedModules.push('general')
        })
        .catch(() => {
          /* Graceful degradation */
        })
    )
  }

  // 7. Blocked services
  if (targetModules.has('blocked_services')) {
    tasks.push(
      api<BlockedServicesPayload>(cfg, '/blocked_services/get')
        .then((res) => {
          payload.blocked_services = {
            ids: res.ids || [],
            schedule: res.schedule,
          }
          capturedModules.push('blocked_services')
        })
        .catch(() => {
          /* Graceful degradation */
        })
    )
  }

  // 8. SafeSearch
  if (targetModules.has('safesearch')) {
    tasks.push(
      api<SafeSearchPayload>(cfg, '/safesearch/status')
        .then((res) => {
          payload.safesearch = res
          capturedModules.push('safesearch')
        })
        .catch(() => {
          /* Graceful degradation */
        })
    )
  }

  await Promise.allSettled(tasks)

  if (capturedModules.length === 0 && targetModules.size > 0) {
    throw new Error('Failed to capture any configuration modules from the instance (check connection and credentials)')
  }

  const sanitized = sanitizeSnapshotPayload(payload)
  const checksum = await computePayloadChecksum(sanitized)

  const meta: SnapshotMeta = {
    id: generateSnapshotId(),
    schemaVersion: '1.0',
    createdAt: new Date().toISOString(),
    label: opts.label,
    description: opts.description,
    trigger: opts.trigger,
    sourceInstance: { ...instanceMeta },
    modules: capturedModules,
    checksum,
  }

  return {
    meta,
    data: sanitized,
  }
}
