/**
 * Offline Outbox Scheduler and Sync Coordinator for Managed Mode Snapshots.
 * Manages reliable, idempotent synchronization of encrypted snapshots between
 * local IndexedDB/memory storage and the remote AdGuard Home Console server.
 */

import {
  base64ToUint8Array,
  deriveMasterKey,
  decryptSnapshotBlob,
  type SnapshotEncryptedBlob,
} from '../crypto/e2ee'
import { getSessionKey, setSessionKey } from '../crypto/keyVault'
import { activeEndpoint, loadStore } from '../session/instances'
import {
  deleteOutboxTask,
  deleteSnapshot,
  getManagedSnapshot,
  listOutboxTasks,
  listSnapshots,
  saveManagedSnapshot,
  saveSnapshot,
  setSyncTrigger,
  updateManagedSnapshotStatus,
  updateOutboxTask,
  type ManagedSnapshotRecord,
  type OutboxTask,
} from './snapshotStorage'
import type { AghConfigSnapshot } from './types'

export type { OutboxTask }

export const MAX_OUTBOX_RETRIES = 5

export interface TaskSyncResult {
  taskId: string
  snapshotId: string
  action: 'upload' | 'delete'
  success: boolean
  error?: string
}

export interface SyncExecutionResult {
  total: number
  succeeded: number
  failed: number
  tasks: TaskSyncResult[]
}

export interface MigrationSummary {
  total: number
  migrated: number
  synced: number
  failed: number
}

export interface PullRemoteResult {
  total: number
  pulled: number
  failed: number
}

/**
 * Builds the API endpoint URL for an instance snapshot.
 */
export function buildSnapshotApiUrl(
  serverUrl: string | undefined,
  instanceId: string,
  snapshotId: string
): string {
  const base = serverUrl ? serverUrl.replace(/\/+$/, '') : ''
  return `${base}/api/managed/instances/${encodeURIComponent(instanceId)}/snapshots/${encodeURIComponent(snapshotId)}`
}

export class OutboxSyncCoordinatorClass {
  private activeSyncs = new Map<string, Promise<SyncExecutionResult>>()
  private syncLocks = new Map<string, Promise<void>>()
  private listeners: Array<(result: SyncExecutionResult) => void> = []

  public isSyncing(instanceId?: string): boolean {
    if (instanceId) {
      return (
        this.activeSyncs.has(instanceId) ||
        this.activeSyncs.has('__global__') ||
        this.syncLocks.has(instanceId) ||
        this.syncLocks.has('__global__')
      )
    }
    return this.activeSyncs.size > 0 || this.syncLocks.size > 0
  }

  public onSyncComplete(listener: (result: SyncExecutionResult) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  /**
   * Resets active synchronization state, locks, and listeners for testing.
   */
  public resetForTesting(): void {
    this.activeSyncs.clear()
    this.syncLocks.clear()
    this.listeners = []
  }

  /**
   * Triggers an asynchronous synchronization run.
   * If a sync is already in flight for this instanceId (or globally), returns the active promise to avoid duplicate runs.
   */
  public triggerSync(serverUrl?: string, instanceId?: string): Promise<SyncExecutionResult> {
    const key = instanceId || '__global__'
    const existing = this.activeSyncs.get(key)
    if (existing) {
      return existing
    }
    if (instanceId && this.activeSyncs.has('__global__')) {
      return this.activeSyncs.get('__global__')!
    }

    const p = this.syncPendingTasks(instanceId, serverUrl).finally(() => {
      this.activeSyncs.delete(key)
    })
    this.activeSyncs.set(key, p)
    return p
  }

  /**
   * Synchronously processes pending tasks in the outbox with mutex locking per instance.
   * Uploads or deletes snapshots on the managed server, updating local status on success.
   */
  public async syncPendingTasks(
    instanceId?: string,
    serverUrl?: string
  ): Promise<SyncExecutionResult> {
    const key = instanceId || '__global__'

    if (key === '__global__') {
      while (this.syncLocks.size > 0) {
        await Promise.all(Array.from(this.syncLocks.values()))
      }
    } else {
      while (this.syncLocks.has(key) || this.syncLocks.has('__global__')) {
        await Promise.race(
          [this.syncLocks.get(key), this.syncLocks.get('__global__')].filter(
            (p): p is Promise<void> => Boolean(p)
          )
        )
      }
    }

    let releaseLock: () => void = () => {}
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve
    })
    this.syncLocks.set(key, lockPromise)

    try {
      return await this.executeSync(instanceId, serverUrl)
    } finally {
      this.syncLocks.delete(key)
      releaseLock()
    }
  }

  private async executeSync(
    instanceId?: string,
    serverUrl?: string
  ): Promise<SyncExecutionResult> {
    const tasks = await listOutboxTasks(instanceId)
    const executableTasks = tasks.filter((t) => (t.retryCount || 0) < MAX_OUTBOX_RETRIES)
    const result: SyncExecutionResult = {
      total: executableTasks.length,
      succeeded: 0,
      failed: 0,
      tasks: [],
    }

    if (executableTasks.length === 0) {
      this.notifyListeners(result)
      return result
    }

    const store = loadStore()

    for (const task of executableTasks) {
      let targetServerUrl = serverUrl
      if (!targetServerUrl && store) {
        const inst = store.instances.find((i) => i.id === task.instanceId)
        if (inst?.managed?.serverUrl) {
          targetServerUrl = inst.managed.serverUrl
        }
      }

      const url = buildSnapshotApiUrl(targetServerUrl, task.instanceId, task.snapshotId)

      try {
        if (task.action === 'upload') {
          if (!task.blob) {
            const err = new Error(`Upload task ${task.taskId} missing encrypted blob`) as Error & { fatal?: boolean }
            err.fatal = true
            throw err
          }

          const res = await fetch(url, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(task.blob),
            signal: AbortSignal.timeout(15_000),
          })

          if (!res.ok) {
            const errText = await res.text().catch(() => '')
            const isFatal = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429
            const err = new Error(`Upload failed HTTP ${res.status}: ${errText || res.statusText}`) as Error & { fatal?: boolean }
            err.fatal = isFatal
            throw err
          }

          // Successfully uploaded: remove from outbox and update status to 'synced'
          await deleteOutboxTask(task.taskId)
          await updateManagedSnapshotStatus(task.snapshotId, 'synced')

          result.succeeded++
          result.tasks.push({
            taskId: task.taskId,
            snapshotId: task.snapshotId,
            action: 'upload',
            success: true,
          })
        } else if (task.action === 'delete') {
          const res = await fetch(url, {
            method: 'DELETE',
            signal: AbortSignal.timeout(15_000),
          })

          // 200 OK or 404 Not Found are both considered successful deletion
          if (!res.ok && res.status !== 404) {
            const errText = await res.text().catch(() => '')
            const isFatal = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429
            const err = new Error(`Delete failed HTTP ${res.status}: ${errText || res.statusText}`) as Error & { fatal?: boolean }
            err.fatal = isFatal
            throw err
          }

          // Successfully deleted: remove from outbox
          await deleteOutboxTask(task.taskId)

          result.succeeded++
          result.tasks.push({
            taskId: task.taskId,
            snapshotId: task.snapshotId,
            action: 'delete',
            success: true,
          })
        }
      } catch (err: any) {
        if (err?.fatal) {
          task.retryCount = MAX_OUTBOX_RETRIES
        } else {
          task.retryCount = (task.retryCount || 0) + 1
        }
        task.lastError = err?.message || String(err)
        await updateOutboxTask(task)

        result.failed++
        result.tasks.push({
          taskId: task.taskId,
          snapshotId: task.snapshotId,
          action: task.action,
          success: false,
          error: task.lastError,
        })
      }
    }

    this.notifyListeners(result)
    return result
  }

  private notifyListeners(result: SyncExecutionResult) {
    for (const listener of this.listeners) {
      try {
        listener(result)
      } catch {
        // Listener errors should not interrupt execution
      }
    }
  }
}

export const OutboxSyncCoordinator = new OutboxSyncCoordinatorClass()

// Wire up storage trigger to OutboxSyncCoordinator
setSyncTrigger((serverUrl, instanceId) => OutboxSyncCoordinator.triggerSync(serverUrl, instanceId))

/**
 * Triggers an immediate outbox synchronization flush.
 */
export async function flushOutbox(
  instanceId?: string,
  serverUrl?: string
): Promise<SyncExecutionResult> {
  return await OutboxSyncCoordinator.triggerSync(serverUrl, instanceId)
}

/**
 * Pulls remote snapshots from the managed console server, decrypts them locally,
 * and saves them into the local managed_snapshots store.
 */
export async function pullRemoteSnapshots(
  instanceId: string,
  serverUrl?: string,
  options?: { key?: CryptoKey; password?: string }
): Promise<PullRemoteResult> {
  const store = loadStore()
  const inst = store?.instances.find((i) => i.id === instanceId)
  const targetServer = serverUrl || inst?.managed?.serverUrl
  if (!targetServer) {
    return { total: 0, pulled: 0, failed: 0 }
  }

  const base = targetServer.replace(/\/+$/, '')
  const listUrl = `${base}/api/managed/instances/${encodeURIComponent(instanceId)}/snapshots`

  let summaries: Array<{ id: string; instanceId: string; createdAt: string }> = []
  try {
    const res = await fetch(listUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      if (res.status === 404) return { total: 0, pulled: 0, failed: 0 }
      throw new Error(`Failed to list remote snapshots HTTP ${res.status}`)
    }
    summaries = await res.json()
    if (!Array.isArray(summaries)) return { total: 0, pulled: 0, failed: 0 }
  } catch {
    return { total: 0, pulled: 0, failed: 0 }
  }

  const result: PullRemoteResult = {
    total: summaries.length,
    pulled: 0,
    failed: 0,
  }

  let key = options?.key || getSessionKey(instanceId)
  const password = options?.password || (inst ? activeEndpoint(inst)?.password : undefined)
  if (!key && password && inst?.managed?.salt) {
    try {
      key = await deriveMasterKey(password, base64ToUint8Array(inst.managed.salt))
      setSessionKey(instanceId, key)
    } catch {
      // Ignore key derivation failure
    }
  }

  for (const item of summaries) {
    const local = await getManagedSnapshot(item.id)
    if (local && local.snapshot) {
      continue
    }

    try {
      const snapUrl = `${listUrl}/${encodeURIComponent(item.id)}`
      const snapRes = await fetch(snapUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(15_000),
      })
      if (!snapRes.ok) {
        result.failed++
        continue
      }
      const blob: SnapshotEncryptedBlob = await snapRes.json()
      if (!blob || !blob.ciphertext) {
        result.failed++
        continue
      }

      let decrypted: AghConfigSnapshot | undefined
      if (key || password) {
        try {
          const jsonStr = await decryptSnapshotBlob({ blob, key, password })
          decrypted = JSON.parse(jsonStr) as AghConfigSnapshot
        } catch {
          result.failed++
          continue
        }
      }

      const record: ManagedSnapshotRecord = {
        id: blob.id,
        instanceId: blob.instanceId,
        createdAt: blob.createdAt,
        status: 'synced',
        blob,
        snapshot: decrypted,
        updatedAt: new Date().toISOString(),
      }
      await saveManagedSnapshot(record)
      result.pulled++
    } catch {
      result.failed++
    }
  }

  return result
}

/**
 * Registers event listeners for automatic outbox sync on online and visibilitychange events.
 * Returns an unregister cleanup function.
 */
export function registerAutoSync(): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleOnline = () => {
    void OutboxSyncCoordinator.triggerSync()
  }

  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void OutboxSyncCoordinator.triggerSync()
    }
  }

  window.addEventListener('online', handleOnline)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  return () => {
    window.removeEventListener('online', handleOnline)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }
}

/**
 * Migrates local unmanaged snapshots to managed storage by encrypting them locally,
 * saving them to managed_snapshots and queuing upload tasks in the outbox.
 */
export async function migrateLocalSnapshotsToManaged(
  instanceId: string,
  password: string,
  managedConfig: { serverUrl: string; salt?: string },
  options?: { deleteLocalAfterMigration?: boolean }
): Promise<MigrationSummary> {
  const localSnapshots = await listSnapshots(instanceId, { managed: false })
  const summary: MigrationSummary = {
    total: localSnapshots.length,
    migrated: 0,
    synced: 0,
    failed: 0,
  }

  if (localSnapshots.length === 0) {
    return summary
  }

  for (const snap of localSnapshots) {
    try {
      await saveSnapshot(snap, {
        password,
        managedConfig,
        managed: true,
        skipAutoSync: true, // Batch sync at the end
      })
      summary.migrated++

      if (options?.deleteLocalAfterMigration) {
        await deleteSnapshot(snap.meta.id, { managed: false })
      }
    } catch {
      summary.failed++
    }
  }

  // Trigger sync to upload queued tasks
  try {
    const syncRes = await OutboxSyncCoordinator.syncPendingTasks(instanceId, managedConfig.serverUrl)
    summary.synced = syncRes.succeeded
  } catch {
    // Non-fatal: offline tasks remain in outbox for subsequent sync
  }

  return summary
}
