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
import { getSessionKey } from '../crypto/keyVault'
import { loadStore } from '../session/instances'
import type {
  AghConfigSnapshot,
  SnapshotBundle,
  SnapshotTrigger,
} from './types'
import { IdbStore, isIdbAvailable } from './idbStore'

export { isIdbAvailable }

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

export type SyncTriggerFn = (serverUrl?: string, instanceId?: string) => Promise<unknown> | unknown

let syncTrigger: SyncTriggerFn | null = null

export function setSyncTrigger(fn: SyncTriggerFn | null): void {
  syncTrigger = fn
}

export function getSyncTrigger(): SyncTriggerFn | null {
  return syncTrigger
}

export function notifySyncTrigger(serverUrl?: string, instanceId?: string): void {
  if (syncTrigger) {
    try {
      void Promise.resolve(syncTrigger(serverUrl, instanceId)).catch(() => {
        // Expected when offline or server unreachable; tasks are safely persisted in outbox
      })
    } catch {
      // Ignore synchronous exceptions
    }
  }
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

let cachedDb: IDBDatabase | null = null
let openingPromise: Promise<IDBDatabase> | null = null

export function openDatabase(): Promise<IDBDatabase> {
  if (cachedDb) {
    try {
      cachedDb.transaction([STORE_NAME], 'readonly')
      return Promise.resolve(cachedDb)
    } catch {
      cachedDb = null
    }
  }
  if (openingPromise) {
    return openingPromise
  }
  openingPromise = new Promise<IDBDatabase>((resolve, reject) => {
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

    request.onsuccess = () => {
      cachedDb = request.result
      cachedDb.onversionchange = () => {
        cachedDb?.close()
        cachedDb = null
      }
      cachedDb.onclose = () => {
        cachedDb = null
      }
      resolve(cachedDb)
    }
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'))
    request.onblocked = () => {
      cachedDb?.close()
      cachedDb = null
    }
  }).finally(() => {
    openingPromise = null
  })

  return openingPromise
}

// Wire default db opener and instantiate store drivers
IdbStore.defaultOpenDb = openDatabase
export const directStore = new IdbStore<AghConfigSnapshot>(STORE_NAME, 'meta.id')
export const managedStore = new IdbStore<ManagedSnapshotRecord>(MANAGED_STORE_NAME, 'id')
export const outboxStore = new IdbStore<OutboxTask>(OUTBOX_STORE_NAME, 'taskId')

/**
 * Resets in-memory storage vaults for testing.
 */
export function resetMemoryVaultsForTesting(): void {
  cachedDb?.close()
  cachedDb = null
  openingPromise = null
  directStore.clearMemory()
  managedStore.clearMemory()
  outboxStore.clearMemory()
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
        const closeAndClear = () => {
          if (cachedDb === db) cachedDb = null
          db.close()
        }
        if (storeNames.length === 0) {
          closeAndClear()
          resolve()
          return
        }
        const tx = db.transaction(storeNames, 'readwrite')
        for (const s of storeNames) tx.objectStore(s).clear()
        tx.oncomplete = () => {
          closeAndClear()
          resolve()
        }
        tx.onerror = () => {
          closeAndClear()
          reject(tx.error)
        }
      })
    } catch {
      // Ignore if DB cannot be opened
    }
  }
}

/**
 * Commits managed snapshot record and outbox task atomically in a single IndexedDB transaction.
 * Completely resolves hanging pending upload state if write is interrupted.
 */
export async function commitManagedSnapshotWithOutbox(
  record: ManagedSnapshotRecord,
  task: OutboxTask
): Promise<void> {
  if (!isIdbAvailable()) {
    await managedStore.put(record)
    await outboxStore.put(task)
    return
  }

  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([MANAGED_STORE_NAME, OUTBOX_STORE_NAME], 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))

    try {
      void managedStore.put(record, tx).catch(reject)
      void outboxStore.put(task, tx).catch(reject)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Deletes managed snapshot record and commits outbox delete task atomically in a single IndexedDB transaction.
 * Completely eliminates orphaned local deletion without remote outbox task.
 */
export async function commitDeleteManagedSnapshotWithOutbox(
  id: string,
  task: OutboxTask
): Promise<void> {
  if (!isIdbAvailable()) {
    await managedStore.delete(id)
    await outboxStore.put(task)
    return
  }

  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([MANAGED_STORE_NAME, OUTBOX_STORE_NAME], 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))

    try {
      void managedStore.delete(id, tx).catch(reject)
      void outboxStore.put(task, tx).catch(reject)
    } catch (err) {
      reject(err)
    }
  })
}

// --- Direct Snapshot Storage Helpers ---

export const saveDirectSnapshot = (snapshot: AghConfigSnapshot): Promise<void> => directStore.put(snapshot)

export const getDirectSnapshot = (id: string): Promise<AghConfigSnapshot | null> => directStore.get(id)

export async function listDirectSnapshots(instanceId?: string): Promise<AghConfigSnapshot[]> {
  const all = await directStore.getAll()
  const filtered = instanceId ? all.filter((s) => s.meta?.sourceInstance?.id === instanceId) : all
  return filtered.sort(
    (a, b) => new Date(b.meta.createdAt).getTime() - new Date(a.meta.createdAt).getTime()
  )
}

export const deleteDirectSnapshot = (id: string): Promise<boolean> => directStore.delete(id)

// --- Managed Snapshot Storage Helpers ---

export const saveManagedSnapshot = (record: ManagedSnapshotRecord): Promise<void> => managedStore.put(record)

export const getManagedSnapshot = (id: string): Promise<ManagedSnapshotRecord | null> => managedStore.get(id)

export async function listManagedSnapshots(instanceId?: string): Promise<ManagedSnapshotRecord[]> {
  const all = await managedStore.getAll()
  const filtered = instanceId ? all.filter((s) => s.instanceId === instanceId) : all
  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export const deleteManagedSnapshot = (id: string): Promise<boolean> => managedStore.delete(id)

export async function updateManagedSnapshotStatus(
  id: string,
  status: ManagedSnapshotStatus
): Promise<void> {
  const record = await managedStore.get(id)
  if (!record) return
  record.status = status
  record.updatedAt = new Date().toISOString()
  await managedStore.put(record)
}

// --- Offline Outbox Storage Helpers ---

export const saveOutboxTask = (task: OutboxTask): Promise<void> => outboxStore.put(task)

export const getOutboxTask = (taskId: string): Promise<OutboxTask | null> => outboxStore.get(taskId)

export async function listOutboxTasks(instanceId?: string): Promise<OutboxTask[]> {
  const all = await outboxStore.getAll()
  const filtered = instanceId ? all.filter((t) => t.instanceId === instanceId) : all
  return filtered.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
}

export const deleteOutboxTask = (taskId: string): Promise<boolean> => outboxStore.delete(taskId)

export const updateOutboxTask = (task: OutboxTask): Promise<void> => outboxStore.put(task)

// --- Dual-Track High-Level Snapshot Operations ---

/**
 * Persists a snapshot to storage vault.
 * - In direct mode: saves directly to local snapshots store.
 * - In managed mode: encrypts locally via encryptSnapshotBlob, stores in managed_snapshots
 *   with status 'pending_upload', queues upload task in managed_outbox atomically, and
 *   asynchronously triggers registered sync without blocking local save completion.
 */
export async function saveSnapshot(
  snapshot: AghConfigSnapshot,
  options?: SaveSnapshotOptions
): Promise<void> {
  let isManaged = options?.managed
  let password = options?.password
  let key = options?.key
  let managedConfig = options?.managedConfig
  const instId = snapshot.meta.sourceInstance.id

  if (isManaged === undefined) {
    if (options?.managedConfig || options?.password || options?.key) {
      isManaged = true
    } else if (instId) {
      const store = loadStore()
      const inst = store?.instances.find((i) => i.id === instId)
      if (inst?.managed) {
        isManaged = true
        if (!managedConfig) {
          managedConfig = inst.managed
        }

      }
    }
  }

  if (isManaged && instId) {
    if (!key) {
      key = getSessionKey(instId)
    }
    if (!key && !password) {
      const store = loadStore()
      const inst = store?.instances.find((i) => i.id === instId)
      if (inst) {
        const ep = inst.endpoints[0]
        if (ep?.password) password = ep.password
      }
    }
  }

  if (!isManaged) {
    await saveDirectSnapshot(snapshot)
    if (snapshot.meta.trigger === 'pre_sync' || snapshot.meta.trigger === 'pre_rollback') {
      await pruneAutoSnapshots(snapshot.meta.sourceInstance.id, DEFAULT_MAX_AUTO_SNAPSHOTS, false)
    }
    return
  }

  // Managed mode:
  // 1. Encrypt snapshot locally
  const saltBytes = managedConfig?.salt
    ? base64ToUint8Array(managedConfig.salt)
    : undefined

  const baseEncryptParams = {
    id: snapshot.meta.id,
    instanceId: snapshot.meta.sourceInstance.id,
    createdAt: snapshot.meta.createdAt,
    plaintext: snapshot as unknown as Record<string, unknown>,
  }

  const blob = key
    ? await encryptSnapshotBlob({
        ...baseEncryptParams,
        key,
        salt: saltBytes!,
        password,
      })
    : await encryptSnapshotBlob({
        ...baseEncryptParams,
        password: password!,
        salt: saltBytes,
      })

  // 2. Prepare record and outbox upload task
  const record: ManagedSnapshotRecord = {
    id: snapshot.meta.id,
    instanceId: snapshot.meta.sourceInstance.id,
    createdAt: snapshot.meta.createdAt,
    status: 'pending_upload',
    blob,
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    updatedAt: new Date().toISOString(),
  }

  const outboxTask: OutboxTask = {
    taskId: `outbox-${snapshot.meta.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    instanceId: snapshot.meta.sourceInstance.id,
    snapshotId: snapshot.meta.id,
    action: 'upload',
    blob,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  }

  // 3. Atomically commit both into managed_snapshots and managed_outbox
  await commitManagedSnapshotWithOutbox(record, outboxTask)

  // 4. Asynchronously trigger registered sync without blocking saveSnapshot
  if (!options?.skipAutoSync) {
    notifySyncTrigger(managedConfig?.serverUrl, snapshot.meta.sourceInstance.id)
  }

  // Auto-prune managed snapshots if needed
  if (snapshot.meta.trigger === 'pre_sync' || snapshot.meta.trigger === 'pre_rollback') {
    await pruneAutoSnapshots(snapshot.meta.sourceInstance.id, DEFAULT_MAX_AUTO_SNAPSHOTS, true)
  }
}

/**
 * Creates a lightweight locked snapshot placeholder for an un-decrypted managed record.
 */
function createLockedSnapshotPlaceholder(record: ManagedSnapshotRecord): AghConfigSnapshot {
  return {
    meta: {
      id: record.id,
      schemaVersion: '1.0',
      createdAt: record.createdAt,
      label: 'Encrypted Snapshot',
      description: 'This snapshot is encrypted and cannot be viewed without the decryption key.',
      trigger: 'manual',
      sourceInstance: {
        id: record.instanceId,
        label: 'Encrypted Snapshot',
        url: '',
        aghVersion: '',
      },
      modules: [],
      checksum: '',
    },
    data: {},
    isLocked: true,
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
    if (!record) return null
    return record.snapshot || createLockedSnapshotPlaceholder(record)
  }

  const direct = await getDirectSnapshot(id)
  if (direct) return direct

  if (options?.managed !== false) {
    const managed = await getManagedSnapshot(id)
    if (managed) {
      return managed.snapshot || createLockedSnapshotPlaceholder(managed)
    }
  }

  return null
}

/**
 * Lists all snapshots, optionally filtered by instanceId, sorted by createdAt descending.
 * When options.managed is true, returns snapshots from managed storage.
 * Does not silently drop undecrypted records, returning an isLocked placeholder instead.
 */
export async function listSnapshots(
  instanceId?: string,
  options?: { managed?: boolean }
): Promise<AghConfigSnapshot[]> {
  let isManaged = options?.managed
  if (isManaged === undefined && instanceId) {
    const store = loadStore()
    const inst = store?.instances.find((i) => i.id === instanceId)
    if (inst?.managed) {
      isManaged = true
    }
  }

  if (isManaged === true) {
    const records = await listManagedSnapshots(instanceId)
    return records.map((record) => {
      if (record.snapshot) {
        return record.snapshot
      }
      return createLockedSnapshotPlaceholder(record)
    })
  }

  return listDirectSnapshots(instanceId)
}

/**
 * Deletes a snapshot by UUID.
 * In managed mode, atomically deletes the local managed record and enqueues an outbox delete task.
 */
export async function deleteSnapshot(
  id: string,
  options?: DeleteSnapshotOptions
): Promise<boolean> {
  let deleted = false
  let isManaged = options?.managed
  const instId = options?.instanceId
  let serverUrl = options?.managedConfig?.serverUrl

  if (isManaged === undefined && instId) {
    const store = loadStore()
    const inst = store?.instances.find((i) => i.id === instId)
    if (inst?.managed) {
      isManaged = true
      if (!serverUrl) serverUrl = inst.managed.serverUrl
    }
  }

  // 1. Direct snapshot deletion (unless options.managed === true)
  if (isManaged !== true) {
    const directDeleted = await deleteDirectSnapshot(id)
    if (directDeleted) deleted = true
  }

  // 2. Managed snapshot deletion (unless options.managed === false)
  if (isManaged !== false) {
    const managedRecord = await getManagedSnapshot(id)
    if (managedRecord || isManaged) {
      const targetInstId = managedRecord?.instanceId || instId || ''
      const delTask: OutboxTask = {
        taskId: `outbox-del-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        instanceId: targetInstId,
        snapshotId: id,
        action: 'delete',
        createdAt: new Date().toISOString(),
        retryCount: 0,
      }
      await commitDeleteManagedSnapshotWithOutbox(id, delTask)
      deleted = true

      if (!options?.skipAutoSync) {
        notifySyncTrigger(serverUrl, targetInstId)
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
 * Filters out locked/un-decrypted placeholders to preserve bundle integrity.
 */
export function exportSnapshotBundleJson(
  snapshots: AghConfigSnapshot[],
  instanceLabel?: string
): string {
  const exportable = snapshots.filter((s) => !s.isLocked)
  const bundle: SnapshotBundle = {
    bundleVersion: '1.0',
    createdAt: new Date().toISOString(),
    instanceLabel,
    snapshots: exportable,
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
