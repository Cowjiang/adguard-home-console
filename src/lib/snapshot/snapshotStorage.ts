/**
 * Local storage vault and file import/export helpers for configuration snapshots.
 * Uses IndexedDB in browser runtime with in-memory fallback for testing/node environments.
 * Version 2 introduces dual-track storage for direct snapshots and managed mode snapshots/outbox.
 */
import {
  base64ToUint8Array,
  encryptSnapshotBlob,
  type SnapshotEncryptedBlob,
} from '../crypto/e2ee'
import { OutboxSyncCoordinator, type OutboxTask } from './outboxSync'
import type {
  AghConfigSnapshot,
  SnapshotBundle,
  SnapshotTrigger,
} from './types'

export type { OutboxTask }

export const DB_NAME = 'agh_console_snapshots'
export const STORE_NAME = 'snapshots'
export const MANAGED_STORE_NAME = 'managed_snapshots'
export const OUTBOX_STORE_NAME = 'managed_outbox'
export const DB_VERSION = 2
export const DEFAULT_MAX_AUTO_SNAPSHOTS = 15

export type ManagedSnapshotStatus = 'pending_upload' | 'synced'

export interface ManagedSnapshotRecord {
  id: string
  instanceId: string
  createdAt: string
  status: ManagedSnapshotStatus
  blob: SnapshotEncryptedBlob
  snapshot?: AghConfigSnapshot
  updatedAt?: string
}

export interface SaveSnapshotOptions {
  password?: string
  key?: CryptoKey
  managedConfig?: { serverUrl: string; salt?: string }
  /** Explicitly treat as managed mode */
  managed?: boolean
  /** Skip immediate fire-and-forget background sync */
  skipAutoSync?: boolean
}

export interface DeleteSnapshotOptions {
  managed?: boolean
  instanceId?: string
  managedConfig?: { serverUrl?: string }
  /** Skip immediate fire-and-forget background sync */
  skipAutoSync?: boolean
}

// In-memory fallback maps for test environments where indexedDB is undefined
const memoryVault = new Map<string, AghConfigSnapshot>()
const memoryManagedVault = new Map<string, ManagedSnapshotRecord>()
const memoryOutboxVault = new Map<string, OutboxTask>()

export function isIdbAvailable(): boolean {
  return typeof globalThis.indexedDB !== 'undefined'
}

/**
 * Resets in-memory storage vaults for testing.
 */
export function resetMemoryVaultsForTesting(): void {
  memoryVault.clear()
  memoryManagedVault.clear()
  memoryOutboxVault.clear()
}

/**
 * Clears all data from both in-memory vaults and IndexedDB stores for clean test isolation.
 */
export async function clearAllDatabase(): Promise<void> {
  resetMemoryVaultsForTesting()
  if (isIdbAvailable()) {
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const storeNames = [STORE_NAME, MANAGED_STORE_NAME, OUTBOX_STORE_NAME].filter((s) =>
          db.objectStoreNames.contains(s)
        )
        if (storeNames.length === 0) {
          db.close()
          resolve()
          return
        }
        const tx = db.transaction(storeNames, 'readwrite')
        for (const s of storeNames) {
          tx.objectStore(s).clear()
        }
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
      })
    } catch {
      // Ignore if DB cannot be opened
    }
  }
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIdbAvailable()) {
      reject(new Error('IndexedDB not supported'))
      return
    }

    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      // Version 1: Direct snapshots store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'meta.id' })
        store.createIndex('instanceId', 'meta.sourceInstance.id', { unique: false })
        store.createIndex('createdAt', 'meta.createdAt', { unique: false })
        store.createIndex('trigger', 'meta.trigger', { unique: false })
      }
      // Version 2: Managed snapshots store
      if (!db.objectStoreNames.contains(MANAGED_STORE_NAME)) {
        const managedStore = db.createObjectStore(MANAGED_STORE_NAME, { keyPath: 'id' })
        managedStore.createIndex('instanceId', 'instanceId', { unique: false })
        managedStore.createIndex('createdAt', 'createdAt', { unique: false })
        managedStore.createIndex('status', 'status', { unique: false })
      }
      // Version 2: Offline outbox tasks store
      if (!db.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
        const outboxStore = db.createObjectStore(OUTBOX_STORE_NAME, { keyPath: 'taskId' })
        outboxStore.createIndex('instanceId', 'instanceId', { unique: false })
        outboxStore.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'))
  })
}

// --- Direct Snapshot Storage Helpers ---

export async function saveDirectSnapshot(snapshot: AghConfigSnapshot): Promise<void> {
  if (!isIdbAvailable()) {
    memoryVault.set(snapshot.meta.id, JSON.parse(JSON.stringify(snapshot)))
    return
  }

  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(snapshot)

    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function getDirectSnapshot(id: string): Promise<AghConfigSnapshot | null> {
  if (!isIdbAvailable()) {
    return memoryVault.get(id) || null
  }

  const db = await openDatabase()
  return new Promise<AghConfigSnapshot | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(id)

    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function listDirectSnapshots(instanceId?: string): Promise<AghConfigSnapshot[]> {
  if (!isIdbAvailable()) {
    const all = Array.from(memoryVault.values())
    const filtered = instanceId ? all.filter((s) => s.meta.sourceInstance.id === instanceId) : all
    return filtered.sort(
      (a, b) => new Date(b.meta.createdAt).getTime() - new Date(a.meta.createdAt).getTime()
    )
  }

  const db = await openDatabase()
  return new Promise<AghConfigSnapshot[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()

    req.onsuccess = () => {
      const results: AghConfigSnapshot[] = req.result || []
      const filtered = instanceId
        ? results.filter((s) => s.meta.sourceInstance.id === instanceId)
        : results
      filtered.sort(
        (a, b) => new Date(b.meta.createdAt).getTime() - new Date(a.meta.createdAt).getTime()
      )
      resolve(filtered)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function deleteDirectSnapshot(id: string): Promise<boolean> {
  if (!isIdbAvailable()) {
    return memoryVault.delete(id)
  }

  const db = await openDatabase()
  return new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(id)

    req.onsuccess = () => resolve(true)
    req.onerror = () => reject(req.error)
  })
}

// --- Managed Snapshot Storage Helpers ---

export async function saveManagedSnapshot(record: ManagedSnapshotRecord): Promise<void> {
  if (!isIdbAvailable()) {
    memoryManagedVault.set(record.id, JSON.parse(JSON.stringify(record)))
    return
  }

  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MANAGED_STORE_NAME, 'readwrite')
    const store = tx.objectStore(MANAGED_STORE_NAME)
    const req = store.put(record)

    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function getManagedSnapshot(id: string): Promise<ManagedSnapshotRecord | null> {
  if (!isIdbAvailable()) {
    return memoryManagedVault.get(id) || null
  }

  const db = await openDatabase()
  return new Promise<ManagedSnapshotRecord | null>((resolve, reject) => {
    const tx = db.transaction(MANAGED_STORE_NAME, 'readonly')
    const store = tx.objectStore(MANAGED_STORE_NAME)
    const req = store.get(id)

    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function listManagedSnapshots(instanceId?: string): Promise<ManagedSnapshotRecord[]> {
  if (!isIdbAvailable()) {
    const all = Array.from(memoryManagedVault.values())
    const filtered = instanceId ? all.filter((s) => s.instanceId === instanceId) : all
    return filtered.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  const db = await openDatabase()
  return new Promise<ManagedSnapshotRecord[]>((resolve, reject) => {
    const tx = db.transaction(MANAGED_STORE_NAME, 'readonly')
    const store = tx.objectStore(MANAGED_STORE_NAME)
    const req = store.getAll()

    req.onsuccess = () => {
      const results: ManagedSnapshotRecord[] = req.result || []
      const filtered = instanceId
        ? results.filter((s) => s.instanceId === instanceId)
        : results
      filtered.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      resolve(filtered)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function deleteManagedSnapshot(id: string): Promise<boolean> {
  if (!isIdbAvailable()) {
    return memoryManagedVault.delete(id)
  }

  const db = await openDatabase()
  return new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction(MANAGED_STORE_NAME, 'readwrite')
    const store = tx.objectStore(MANAGED_STORE_NAME)
    const req = store.delete(id)

    req.onsuccess = () => resolve(true)
    req.onerror = () => reject(req.error)
  })
}

export async function updateManagedSnapshotStatus(
  id: string,
  status: ManagedSnapshotStatus
): Promise<void> {
  const record = await getManagedSnapshot(id)
  if (!record) return
  record.status = status
  record.updatedAt = new Date().toISOString()
  await saveManagedSnapshot(record)
}

// --- Offline Outbox Storage Helpers ---

export async function saveOutboxTask(task: OutboxTask): Promise<void> {
  if (!isIdbAvailable()) {
    memoryOutboxVault.set(task.taskId, JSON.parse(JSON.stringify(task)))
    return
  }

  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE_NAME, 'readwrite')
    const store = tx.objectStore(OUTBOX_STORE_NAME)
    const req = store.put(task)

    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function getOutboxTask(taskId: string): Promise<OutboxTask | null> {
  if (!isIdbAvailable()) {
    return memoryOutboxVault.get(taskId) || null
  }

  const db = await openDatabase()
  return new Promise<OutboxTask | null>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE_NAME, 'readonly')
    const store = tx.objectStore(OUTBOX_STORE_NAME)
    const req = store.get(taskId)

    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function listOutboxTasks(instanceId?: string): Promise<OutboxTask[]> {
  if (!isIdbAvailable()) {
    const all = Array.from(memoryOutboxVault.values())
    const filtered = instanceId ? all.filter((t) => t.instanceId === instanceId) : all
    return filtered.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
  }

  const db = await openDatabase()
  return new Promise<OutboxTask[]>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE_NAME, 'readonly')
    const store = tx.objectStore(OUTBOX_STORE_NAME)
    const req = store.getAll()

    req.onsuccess = () => {
      const results: OutboxTask[] = req.result || []
      const filtered = instanceId
        ? results.filter((t) => t.instanceId === instanceId)
        : results
      filtered.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
      resolve(filtered)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function deleteOutboxTask(taskId: string): Promise<boolean> {
  if (!isIdbAvailable()) {
    return memoryOutboxVault.delete(taskId)
  }

  const db = await openDatabase()
  return new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE_NAME, 'readwrite')
    const store = tx.objectStore(OUTBOX_STORE_NAME)
    const req = store.delete(taskId)

    req.onsuccess = () => resolve(true)
    req.onerror = () => reject(req.error)
  })
}

export async function updateOutboxTask(task: OutboxTask): Promise<void> {
  await saveOutboxTask(task)
}

// --- Dual-Track High-Level Snapshot Operations ---

/**
 * Persists a snapshot to storage vault.
 * - In direct mode: saves directly to local snapshots store.
 * - In managed mode: encrypts locally via encryptSnapshotBlob, stores in managed_snapshots
 *   with status 'pending_upload', queues upload task in managed_outbox, and asynchronously
 *   triggers OutboxSyncCoordinator without blocking local save completion.
 */
export async function saveSnapshot(
  snapshot: AghConfigSnapshot,
  options?: SaveSnapshotOptions
): Promise<void> {
  const isManaged = Boolean(
    options?.managed || options?.managedConfig || options?.password || options?.key
  )

  if (!isManaged) {
    await saveDirectSnapshot(snapshot)
    if (snapshot.meta.trigger === 'pre_sync' || snapshot.meta.trigger === 'pre_rollback') {
      await pruneAutoSnapshots(snapshot.meta.sourceInstance.id, DEFAULT_MAX_AUTO_SNAPSHOTS, false)
    }
    return
  }

  // Managed mode:
  // 1. Encrypt snapshot locally
  const saltBytes = options?.managedConfig?.salt
    ? base64ToUint8Array(options.managedConfig.salt)
    : undefined

  const blob = await encryptSnapshotBlob({
    id: snapshot.meta.id,
    instanceId: snapshot.meta.sourceInstance.id,
    createdAt: snapshot.meta.createdAt,
    plaintext: snapshot as unknown as Record<string, unknown>,
    password: options?.password,
    key: options?.key,
    salt: saltBytes,
  })

  // 2. Put into managed_snapshots marked 'pending_upload'
  const record: ManagedSnapshotRecord = {
    id: snapshot.meta.id,
    instanceId: snapshot.meta.sourceInstance.id,
    createdAt: snapshot.meta.createdAt,
    status: 'pending_upload',
    blob,
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    updatedAt: new Date().toISOString(),
  }
  await saveManagedSnapshot(record)

  // 3. Put upload task into managed_outbox
  const outboxTask: OutboxTask = {
    taskId: `outbox-${snapshot.meta.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    instanceId: snapshot.meta.sourceInstance.id,
    snapshotId: snapshot.meta.id,
    action: 'upload',
    blob,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  }
  await saveOutboxTask(outboxTask)

  // 4. Asynchronously trigger OutboxSyncCoordinator without blocking saveSnapshot
  if (!options?.skipAutoSync) {
    void OutboxSyncCoordinator.triggerSync(
      options?.managedConfig?.serverUrl,
      snapshot.meta.sourceInstance.id
    ).catch(() => {
      // Expected when offline or server unreachable; tasks are safely persisted in outbox
    })
  }

  // Auto-prune managed snapshots if needed
  if (snapshot.meta.trigger === 'pre_sync' || snapshot.meta.trigger === 'pre_rollback') {
    await pruneAutoSnapshots(snapshot.meta.sourceInstance.id, DEFAULT_MAX_AUTO_SNAPSHOTS, true)
  }
}

/**
 * Retrieves a single snapshot by UUID.
 * Supports direct and managed mode retrieval.
 */
export async function getSnapshot(
  id: string,
  options?: { managed?: boolean }
): Promise<AghConfigSnapshot | null> {
  if (options?.managed === true) {
    const record = await getManagedSnapshot(id)
    return record?.snapshot || null
  }

  const direct = await getDirectSnapshot(id)
  if (direct) return direct

  if (options?.managed !== false) {
    const managed = await getManagedSnapshot(id)
    if (managed?.snapshot) return managed.snapshot
  }

  return null
}

/**
 * Lists all snapshots, optionally filtered by instanceId, sorted by createdAt descending.
 * When options.managed is true, returns snapshots from managed storage.
 */
export async function listSnapshots(
  instanceId?: string,
  options?: { managed?: boolean }
): Promise<AghConfigSnapshot[]> {
  if (options?.managed === true) {
    const records = await listManagedSnapshots(instanceId)
    return records
      .map((r) => r.snapshot)
      .filter((s): s is AghConfigSnapshot => Boolean(s))
  }

  return listDirectSnapshots(instanceId)
}

/**
 * Deletes a snapshot by UUID.
 * In managed mode, enqueues a delete task into the outbox and triggers synchronization.
 */
export async function deleteSnapshot(
  id: string,
  options?: DeleteSnapshotOptions
): Promise<boolean> {
  let deleted = false

  // 1. Direct snapshot deletion (unless options.managed === true)
  if (options?.managed !== true) {
    const directDeleted = await deleteDirectSnapshot(id)
    if (directDeleted) deleted = true
  }

  // 2. Managed snapshot deletion (unless options.managed === false)
  if (options?.managed !== false) {
    const managedRecord = await getManagedSnapshot(id)
    if (managedRecord || options?.managed) {
      const instId = managedRecord?.instanceId || options?.instanceId || ''
      await deleteManagedSnapshot(id)
      deleted = true

      const delTask: OutboxTask = {
        taskId: `outbox-del-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        instanceId: instId,
        snapshotId: id,
        action: 'delete',
        createdAt: new Date().toISOString(),
        retryCount: 0,
      }
      await saveOutboxTask(delTask)

      if (!options?.skipAutoSync) {
        void OutboxSyncCoordinator.triggerSync(options?.managedConfig?.serverUrl, instId).catch(() => {})
      }
    }
  }

  return deleted
}

/**
 * Prunes automatic guard snapshots (pre_sync, pre_rollback) to maintain LRU quota.
 */
export async function pruneAutoSnapshots(
  instanceId: string,
  maxRetained: number = DEFAULT_MAX_AUTO_SNAPSHOTS,
  managed = false
): Promise<number> {
  if (managed) {
    const all = await listManagedSnapshots(instanceId)
    const autoSnapshots = all.filter(
      (s) => s.snapshot?.meta.trigger === 'pre_sync' || s.snapshot?.meta.trigger === 'pre_rollback'
    )

    if (autoSnapshots.length <= maxRetained) {
      return 0
    }

    const toDelete = autoSnapshots.slice(maxRetained)
    for (const item of toDelete) {
      await deleteSnapshot(item.id, { managed: true, instanceId })
    }
    return toDelete.length
  }

  const all = await listSnapshots(instanceId)
  const autoSnapshots = all.filter(
    (s) => s.meta.trigger === 'pre_sync' || s.meta.trigger === 'pre_rollback'
  )

  if (autoSnapshots.length <= maxRetained) {
    return 0
  }

  const toDelete = autoSnapshots.slice(maxRetained)
  for (const item of toDelete) {
    await deleteSnapshot(item.meta.id)
  }
  return toDelete.length
}

/**
 * Formats a single snapshot as an indented JSON string.
 */
export function exportSnapshotJson(snapshot: AghConfigSnapshot): string {
  return JSON.stringify(snapshot, null, 2)
}

/**
 * Packs multiple snapshots into a unified snapshot bundle.
 */
export function exportSnapshotBundleJson(
  snapshots: AghConfigSnapshot[],
  instanceLabel?: string
): string {
  const bundle: SnapshotBundle = {
    bundleVersion: '1.0',
    createdAt: new Date().toISOString(),
    instanceLabel,
    snapshots,
  }
  return JSON.stringify(bundle, null, 2)
}

/**
 * Backward compatibility alias for exportSnapshotBundleJson.
 * @deprecated Use exportSnapshotBundleJson instead.
 */
export function exportClusterBundleJson(
  snapshots: AghConfigSnapshot[],
  clusterName?: string
): string {
  return exportSnapshotBundleJson(snapshots, clusterName)
}

/**
 * Parses and validates an imported JSON string into snapshots array.
 */
export function parseSnapshotImport(jsonText: string): {
  isBundle: boolean
  snapshots: AghConfigSnapshot[]
  instanceLabel?: string
} {
  const parsed = JSON.parse(jsonText)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON format')
  }

  // Detect bundle vs single snapshot
  if (Array.isArray(parsed.snapshots) && parsed.bundleVersion === '1.0') {
    return {
      isBundle: true,
      snapshots: parsed.snapshots,
      instanceLabel: parsed.instanceLabel || parsed.clusterName,
    }
  }

  if (parsed.meta && parsed.data && parsed.meta.schemaVersion === '1.0') {
    return {
      isBundle: false,
      snapshots: [parsed],
    }
  }

  throw new Error('Unrecognized snapshot format: missing schemaVersion 1.0 or meta payload')
}
