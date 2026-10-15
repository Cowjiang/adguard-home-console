/**
 * Local storage vault and file import/export helpers for configuration snapshots.
 * Uses IndexedDB in browser runtime with in-memory fallback for testing/node environments.
 */
import type {
  AghConfigSnapshot,
  ClusterSnapshotBundle,
  SnapshotTrigger,
} from './types'

const DB_NAME = 'agh_console_snapshots'
const STORE_NAME = 'snapshots'
const DB_VERSION = 1
const DEFAULT_MAX_AUTO_SNAPSHOTS = 15

// In-memory fallback map for test environments where indexedDB is undefined
const memoryVault = new Map<string, AghConfigSnapshot>()

function isIdbAvailable(): boolean {
  return typeof globalThis.indexedDB !== 'undefined'
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIdbAvailable()) {
      reject(new Error('IndexedDB not supported'))
      return
    }

    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'meta.id' })
        store.createIndex('instanceId', 'meta.sourceInstance.id', { unique: false })
        store.createIndex('createdAt', 'meta.createdAt', { unique: false })
        store.createIndex('trigger', 'meta.trigger', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'))
  })
}

/**
 * Persists a snapshot to local vault and triggers auto-pruning if it's an automated guard snapshot.
 */
export async function saveSnapshot(snapshot: AghConfigSnapshot): Promise<void> {
  if (!isIdbAvailable()) {
    memoryVault.set(snapshot.meta.id, JSON.parse(JSON.stringify(snapshot)))
    if (snapshot.meta.trigger === 'pre_sync' || snapshot.meta.trigger === 'pre_rollback') {
      await pruneAutoSnapshots(snapshot.meta.sourceInstance.id)
    }
    return
  }

  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(snapshot)

    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })

  if (snapshot.meta.trigger === 'pre_sync' || snapshot.meta.trigger === 'pre_rollback') {
    await pruneAutoSnapshots(snapshot.meta.sourceInstance.id)
  }
}

/**
 * Retrieves a single snapshot by UUID.
 */
export async function getSnapshot(id: string): Promise<AghConfigSnapshot | null> {
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

/**
 * Lists all snapshots, optionally filtered by instanceId, sorted by createdAt descending.
 */
export async function listSnapshots(instanceId?: string): Promise<AghConfigSnapshot[]> {
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

/**
 * Deletes a snapshot by UUID.
 */
export async function deleteSnapshot(id: string): Promise<boolean> {
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

/**
 * Prunes automatic guard snapshots (pre_sync, pre_rollback) to maintain LRU quota.
 */
export async function pruneAutoSnapshots(
  instanceId: string,
  maxRetained: number = DEFAULT_MAX_AUTO_SNAPSHOTS
): Promise<number> {
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
 * Packs multiple snapshots into a unified cluster snapshot bundle.
 */
export function exportClusterBundleJson(
  snapshots: AghConfigSnapshot[],
  clusterName?: string
): string {
  const bundle: ClusterSnapshotBundle = {
    bundleVersion: '1.0',
    createdAt: new Date().toISOString(),
    clusterName,
    snapshots,
  }
  return JSON.stringify(bundle, null, 2)
}

/**
 * Parses and validates an imported JSON string into snapshots array.
 */
export function parseSnapshotImport(jsonText: string): {
  isBundle: boolean
  snapshots: AghConfigSnapshot[]
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
