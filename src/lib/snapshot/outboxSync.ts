/**
 * Offline Outbox Scheduler and Sync Coordinator for Managed Mode Snapshots.
 * Manages reliable, idempotent synchronization of encrypted snapshots between
 * local IndexedDB/memory storage and the remote AdGuard Home Console server.
 */

import { type SnapshotEncryptedBlob } from '../crypto/e2ee'
import { loadStore } from '../session/instances'
import {
  deleteOutboxTask,
  deleteSnapshot,
  listOutboxTasks,
  listSnapshots,
  saveSnapshot,
  updateManagedSnapshotStatus,
  updateOutboxTask,
} from './snapshotStorage'

export interface OutboxTask {
  taskId: string
  instanceId: string
  snapshotId: string
  action: 'upload' | 'delete'
  blob?: SnapshotEncryptedBlob
  createdAt: string
  retryCount: number
  lastError?: string
}

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
  private activeSync: Promise<SyncExecutionResult> | null = null
  private syncLock: Promise<void> | null = null
  private listeners: Array<(result: SyncExecutionResult) => void> = []

  public isSyncing(): boolean {
    return this.activeSync !== null || this.syncLock !== null
  }

  public onSyncComplete(listener: (result: SyncExecutionResult) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  /**
   * Triggers an asynchronous synchronization run.
   * If a sync is already in flight, returns the active promise to avoid duplicate runs.
   */
  public triggerSync(serverUrl?: string, instanceId?: string): Promise<SyncExecutionResult> {
    if (this.activeSync) {
      return this.activeSync
    }
    const p = this.syncPendingTasks(instanceId, serverUrl).finally(() => {
      this.activeSync = null
    })
    this.activeSync = p
    return p
  }

  /**
   * Synchronously processes pending tasks in the outbox with mutex locking.
   * Uploads or deletes snapshots on the managed server, updating local status on success.
   */
  public async syncPendingTasks(
    instanceId?: string,
    serverUrl?: string
  ): Promise<SyncExecutionResult> {
    while (this.syncLock) {
      await this.syncLock
    }

    let releaseLock: () => void = () => {}
    this.syncLock = new Promise<void>((resolve) => {
      releaseLock = resolve
    })

    try {
      return await this.executeSync(instanceId, serverUrl)
    } finally {
      this.syncLock = null
      releaseLock()
    }
  }

  private async executeSync(
    instanceId?: string,
    serverUrl?: string
  ): Promise<SyncExecutionResult> {
    const tasks = await listOutboxTasks(instanceId)
    const result: SyncExecutionResult = {
      total: tasks.length,
      succeeded: 0,
      failed: 0,
      tasks: [],
    }

    if (tasks.length === 0) {
      this.notifyListeners(result)
      return result
    }

    const store = loadStore()

    for (const task of tasks) {
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
            throw new Error(`Upload task ${task.taskId} missing encrypted blob`)
          }

          const res = await fetch(url, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(task.blob),
          })

          if (!res.ok) {
            const errText = await res.text().catch(() => '')
            throw new Error(`Upload failed HTTP ${res.status}: ${errText || res.statusText}`)
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
          })

          // 200 OK or 404 Not Found are both considered successful deletion
          if (!res.ok && res.status !== 404) {
            const errText = await res.text().catch(() => '')
            throw new Error(`Delete failed HTTP ${res.status}: ${errText || res.statusText}`)
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
        task.retryCount = (task.retryCount || 0) + 1
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

// Auto-register in browser runtime
if (typeof window !== 'undefined') {
  registerAutoSync()
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
