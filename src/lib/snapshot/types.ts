/**
 * Type definitions and schemas for Configuration Snapshots & Rollback (P3-1).
 */
import type {
  AghClient,
  DnsInfo,
  Filter,
  FilteringStatus,
  QueryLogConfig,
  RewriteEntry,
  StatsConfig,
} from '../api'

export type { Filter }

/** Supported configuration slice modules */
export type SnapshotModule =
  | 'dns'
  | 'filters'
  | 'user_rules'
  | 'rewrites'
  | 'clients'
  | 'access'
  | 'general'
  | 'blocked_services'
  | 'safesearch'

export const ALL_SNAPSHOT_MODULES: readonly SnapshotModule[] = [
  'dns',
  'filters',
  'user_rules',
  'rewrites',
  'clients',
  'access',
  'general',
  'blocked_services',
  'safesearch',
] as const

/** Trigger source of the snapshot */
export type SnapshotTrigger = 'manual' | 'pre_sync' | 'pre_rollback' | 'scheduled'

export interface SnapshotSourceInstance {
  id: string
  label: string
  url: string
  aghVersion: string
}

export interface SnapshotMeta {
  id: string
  schemaVersion: '1.0'
  createdAt: string // ISO 8601
  label: string
  description?: string
  trigger: SnapshotTrigger
  sourceInstance: SnapshotSourceInstance
  modules: SnapshotModule[]
  checksum: string
}

export interface AccessListPayload {
  allowed_clients: string[]
  disallowed_clients: string[]
  blocked_hosts: string[]
}

export interface GeneralSettingsPayload {
  querylog: QueryLogConfig
  stats: StatsConfig
}

export interface BlockedServicesPayload {
  ids: string[]
  schedule?: unknown
}

export interface SafeSearchPayload {
  enabled: boolean
  [engine: string]: boolean
}

export interface SnapshotPayload {
  dns?: DnsInfo
  filters?: {
    enabled: boolean
    interval: number
    filters: Filter[]
    whitelist_filters: Filter[]
  }
  user_rules?: string[]
  rewrites?: RewriteEntry[]
  clients?: AghClient[]
  access?: AccessListPayload
  general?: GeneralSettingsPayload
  blocked_services?: BlockedServicesPayload
  safesearch?: SafeSearchPayload
}

export interface AghConfigSnapshot {
  meta: SnapshotMeta
  data: SnapshotPayload
}

export interface SnapshotBundle {
  bundleVersion: '1.0'
  createdAt: string
  instanceLabel?: string
  /** Kept for backward compatibility with pre-managed-mode v1.0 bundles */
  clusterName?: string
  snapshots: AghConfigSnapshot[]
}

/** @deprecated Use SnapshotBundle instead */
export type ClusterSnapshotBundle = SnapshotBundle

export interface DiffItem {
  module: SnapshotModule
  path: string
  label: string
  oldValue: unknown
  newValue: unknown
  type: 'added' | 'modified' | 'deleted'
}

export interface ModuleDiffSummary {
  module: SnapshotModule
  hasChanges: boolean
  diffs: DiffItem[]
}

export interface SnapshotValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface ModuleRestoreStatus {
  module: SnapshotModule
  success: boolean
  error?: string
}

export interface RestoreExecutionResult {
  success: boolean
  totalModules: number
  succeededModules: number
  failedModules: number
  preRollbackSnapshotId?: string
  moduleResults: ModuleRestoreStatus[]
}
