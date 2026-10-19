import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllDatabase,
  deleteOutboxTask,
  deleteSnapshot,
  getManagedSnapshot,
  getSnapshot,
  listManagedSnapshots,
  listOutboxTasks,
  listSnapshots,
  openDatabase,
  resetMemoryVaultsForTesting,
  saveDirectSnapshot,
  saveManagedSnapshot,
  saveSnapshot,
  setSyncTrigger,
  type ManagedSnapshotRecord,
  commitDeleteManagedSnapshotWithOutbox,
} from './snapshotStorage'
import {
  migrateLocalSnapshotsToManaged,
  OutboxSyncCoordinator,
  registerAutoSync,
  type OutboxTask,
  MAX_OUTBOX_RETRIES,
} from './outboxSync'
import type { AghConfigSnapshot } from './types'

function makeSampleSnapshot(id: string, instanceId = 'inst-test'): AghConfigSnapshot {
  return {
    meta: {
      id,
      schemaVersion: '1.0',
      createdAt: new Date().toISOString(),
      label: `Snapshot ${id}`,
      description: 'Test snapshot',
      trigger: 'manual',
      sourceInstance: {
        id: instanceId,
        label: 'Test AGH',
        url: 'http://192.168.1.1',
        aghVersion: '0.107.0',
      },
      modules: ['dns', 'user_rules'],
      checksum: 'fake-checksum-12345',
    },
    data: {
      dns: {
        upstream_dns: ['1.1.1.1', '8.8.8.8'],
      } as any,
      user_rules: ['||example.com^'],
    },
  }
}

describe('Storage & Outbox Dual-Track Engine', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    await clearAllDatabase()
  })

  describe('IndexedDB Version 2 Upgrade Compatibility', () => {
    it('seamlessly upgrades from Version 1 preserving existing snapshots data and adds managed stores', async () => {
      const DB_NAME = 'agh_console_snapshots'

      // Delete existing to start clean
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(DB_NAME)
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
        req.onblocked = () => resolve()
      })

      // 1. Simulate an existing Version 1 database
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => {
          const db = req.result
          const store = db.createObjectStore('snapshots', { keyPath: 'meta.id' })
          store.createIndex('instanceId', 'meta.sourceInstance.id', { unique: false })
          store.createIndex('createdAt', 'meta.createdAt', { unique: false })
          store.createIndex('trigger', 'meta.trigger', { unique: false })
        }
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('snapshots', 'readwrite')
          const store = tx.objectStore('snapshots')
          const v1Snapshot = makeSampleSnapshot('v1-legacy-snap')
          store.put(v1Snapshot)
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => {
            db.close()
            reject(tx.error)
          }
        }
        req.onerror = () => reject(req.error)
      })

      // 2. Open via snapshotStorage openDatabase() which requests Version 2
      const dbV2 = await openDatabase()
      expect(dbV2.version).toBe(2)

      // Verify all 3 stores exist
      expect(dbV2.objectStoreNames.contains('snapshots')).toBe(true)
      expect(dbV2.objectStoreNames.contains('managed_snapshots')).toBe(true)
      expect(dbV2.objectStoreNames.contains('managed_outbox')).toBe(true)

      // Verify managed_snapshots indexes
      const tx = dbV2.transaction(['snapshots', 'managed_snapshots', 'managed_outbox'], 'readonly')
      const managedStore = tx.objectStore('managed_snapshots')
      expect(managedStore.keyPath).toBe('id')
      expect(managedStore.indexNames.contains('instanceId')).toBe(true)
      expect(managedStore.indexNames.contains('createdAt')).toBe(true)
      expect(managedStore.indexNames.contains('status')).toBe(true)

      // Verify managed_outbox indexes
      const outboxStore = tx.objectStore('managed_outbox')
      expect(outboxStore.keyPath).toBe('taskId')
      expect(outboxStore.indexNames.contains('instanceId')).toBe(true)
      expect(outboxStore.indexNames.contains('createdAt')).toBe(true)

      // 3. Verify original Version 1 snapshot is 100% intact
      const legacySnap = await getSnapshot('v1-legacy-snap')
      expect(legacySnap).not.toBeNull()
      expect(legacySnap?.meta.id).toBe('v1-legacy-snap')
      expect(legacySnap?.meta.label).toBe('Snapshot v1-legacy-snap')
      expect(legacySnap?.data.user_rules).toEqual(['||example.com^'])
      dbV2.close()
    })
  })

  describe('Managed Mode Local Encrypted Save & Offline Staging', () => {
    it('encrypts locally and stages pending_upload task in outbox without blocking on network', async () => {
      // Mock fetch to simulate complete network offline / server downtime
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error: server unreachable'))

      const snap = makeSampleSnapshot('managed-snap-01', 'inst-managed')

      // Save in managed mode
      await saveSnapshot(snap, {
        password: 'TestPassword#2026',
        managedConfig: {
          serverUrl: 'https://managed.example.com',
          salt: 'c2FsdDEyMzQ1Njc4OTAxMg==',
        },
      })

      // 1. Verify managed snapshot record was created locally with status 'pending_upload'
      const managedRecord = await getManagedSnapshot('managed-snap-01')
      expect(managedRecord).not.toBeNull()
      expect(managedRecord?.id).toBe('managed-snap-01')
      expect(managedRecord?.instanceId).toBe('inst-managed')
      expect(managedRecord?.status).toBe('pending_upload')
      expect(managedRecord?.blob).toBeDefined()
      expect(managedRecord?.blob.version).toBe(1)
      expect(managedRecord?.blob.cipher.algorithm).toBe('AES-256-GCM')
      expect(managedRecord?.blob.kdf.algorithm).toBe('PBKDF2-HMAC-SHA256')
      expect(managedRecord?.blob.ciphertext).toBeTruthy()
      expect((managedRecord?.blob as any).checksum).toBeUndefined()

      // 2. Verify snapshot content is retrieved through getSnapshot
      const retrieved = await getSnapshot('managed-snap-01', { managed: true })
      expect(retrieved?.meta.id).toBe('managed-snap-01')
      expect(retrieved?.data.user_rules).toEqual(['||example.com^'])

      // 3. Verify task is queued in managed_outbox
      const outboxTasks = await listOutboxTasks('inst-managed')
      expect(outboxTasks.length).toBe(1)
      expect(outboxTasks[0].snapshotId).toBe('managed-snap-01')
      expect(outboxTasks[0].action).toBe('upload')
      expect(outboxTasks[0].blob?.id).toBe('managed-snap-01')
    })
  })

  describe('Outbox Scheduler Automatic Sync & Status Updates', () => {
    it('processes pending upload tasks and updates status to synced upon success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
        text: async () => JSON.stringify({ ok: true }),
      })
      globalThis.fetch = mockFetch

      const snap = makeSampleSnapshot('sync-snap-02', 'inst-managed')

      await saveSnapshot(snap, {
        password: 'Password123!',
        managedConfig: {
          serverUrl: 'https://managed.example.com',
        },
        skipAutoSync: true,
      })

      // Trigger sync manually to verify batch execution
      const syncResult = await OutboxSyncCoordinator.syncPendingTasks('inst-managed', 'https://managed.example.com')

      expect(syncResult.total).toBe(1)
      expect(syncResult.succeeded).toBe(1)
      expect(syncResult.failed).toBe(0)

      // Verify request payload
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, req] = mockFetch.mock.calls[0]
      expect(url).toBe('https://managed.example.com/api/managed/instances/inst-managed/snapshots/sync-snap-02')
      expect(req.method).toBe('PUT')
      const body = JSON.parse(req.body)
      expect(body.id).toBe('sync-snap-02')
      expect(body.instanceId).toBe('inst-managed')
      expect(body.ciphertext).toBeTruthy()
      expect(body.checksum).toBeUndefined()

      // Verify task removed from outbox
      const remainingTasks = await listOutboxTasks('inst-managed')
      expect(remainingTasks.length).toBe(0)

      // Verify status in managed_snapshots is updated to 'synced'
      const updatedRecord = await getManagedSnapshot('sync-snap-02')
      expect(updatedRecord?.status).toBe('synced')
    })

    it('automatically triggers background sync when saveSnapshot completes', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
        text: async () => JSON.stringify({ ok: true }),
      })
      globalThis.fetch = mockFetch

      const snap = makeSampleSnapshot('auto-sync-snap-03', 'inst-auto')

      await saveSnapshot(snap, {
        password: 'Password123!',
        managedConfig: {
          serverUrl: 'https://managed.example.com',
        },
      })

      // Await in-flight auto sync
      await OutboxSyncCoordinator.triggerSync('https://managed.example.com', 'inst-auto')

      // Record should be updated to synced automatically
      const record = await getManagedSnapshot('auto-sync-snap-03')
      expect(record?.status).toBe('synced')

      const remainingTasks = await listOutboxTasks('inst-auto')
      expect(remainingTasks.length).toBe(0)
    })
  })

  describe('Network Failure Retention & Idempotent Retry', () => {
    it('retains failed task in outbox with retry count, then idempotently recovers when network restored', async () => {
      // Step 1: Network failure
      const failingFetch = vi.fn().mockRejectedValue(new Error('Connection timed out'))
      globalThis.fetch = failingFetch

      const snap = makeSampleSnapshot('retry-snap-03', 'inst-retry')
      await saveSnapshot(snap, {
        password: 'Password123!',
        managedConfig: { serverUrl: 'https://managed.example.com' },
        skipAutoSync: true,
      })

      const firstSync = await OutboxSyncCoordinator.syncPendingTasks('inst-retry', 'https://managed.example.com')
      expect(firstSync.failed).toBe(1)
      expect(firstSync.succeeded).toBe(0)

      // Verify task remains in outbox with retryCount and lastError recorded
      let tasks = await listOutboxTasks('inst-retry')
      expect(tasks.length).toBe(1)
      expect(tasks[0].retryCount).toBeGreaterThanOrEqual(1)
      expect(tasks[0].lastError).toContain('Connection timed out')

      // Record remains pending_upload
      let record = await getManagedSnapshot('retry-snap-03')
      expect(record?.status).toBe('pending_upload')

      // Step 2: Network restored
      const successFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, deduplicated: true }),
        text: async () => JSON.stringify({ ok: true, deduplicated: true }),
      })
      globalThis.fetch = successFetch

      const secondSync = await OutboxSyncCoordinator.syncPendingTasks('inst-retry', 'https://managed.example.com')
      expect(secondSync.succeeded).toBe(1)
      expect(secondSync.failed).toBe(0)

      // Task is now removed
      tasks = await listOutboxTasks('inst-retry')
      expect(tasks.length).toBe(0)

      // Record becomes synced
      record = await getManagedSnapshot('retry-snap-03')
      expect(record?.status).toBe('synced')
    })

    it('enqueues delete action in outbox and synchronizes server deletion', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
        text: async () => JSON.stringify({ ok: true }),
      })
      globalThis.fetch = mockFetch

      const snap = makeSampleSnapshot('del-snap-04', 'inst-del')
      await saveSnapshot(snap, {
        password: 'Password123!',
        managedConfig: { serverUrl: 'https://managed.example.com' },
        skipAutoSync: true,
      })
      await OutboxSyncCoordinator.syncPendingTasks('inst-del', 'https://managed.example.com')

      // Delete snapshot with skipAutoSync to inspect outbox
      await deleteSnapshot('del-snap-04', {
        managed: true,
        instanceId: 'inst-del',
        managedConfig: { serverUrl: 'https://managed.example.com' },
        skipAutoSync: true,
      })

      // Verify local managed record is gone
      const record = await getManagedSnapshot('del-snap-04')
      expect(record).toBeNull()

      // Verify outbox has delete task
      const tasks = await listOutboxTasks('inst-del')
      expect(tasks.length).toBe(1)
      expect(tasks[0].action).toBe('delete')
      expect(tasks[0].snapshotId).toBe('del-snap-04')

      // Sync delete
      const delSync = await OutboxSyncCoordinator.syncPendingTasks('inst-del', 'https://managed.example.com')
      expect(delSync.succeeded).toBe(1)

      const [url, req] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
      expect(url).toBe('https://managed.example.com/api/managed/instances/inst-del/snapshots/del-snap-04')
      expect(req.method).toBe('DELETE')

      // Outbox task removed
      const remainingTasks = await listOutboxTasks('inst-del')
      expect(remainingTasks.length).toBe(0)
    })
  })

  describe('One-Click Local to Managed Migration', () => {
    it('migrates existing local direct snapshots into managed storage with E2EE encryption', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
        text: async () => JSON.stringify({ ok: true }),
      })
      globalThis.fetch = mockFetch

      const snapA = makeSampleSnapshot('local-snap-a', 'inst-migrate')
      const snapB = makeSampleSnapshot('local-snap-b', 'inst-migrate')

      // Save directly to local storage (unmanaged)
      await saveSnapshot(snapA)
      await saveSnapshot(snapB)

      const directListBefore = await listSnapshots('inst-migrate', { managed: false })
      expect(directListBefore.length).toBe(2)

      // Execute migration with local cleanup
      const summary = await migrateLocalSnapshotsToManaged(
        'inst-migrate',
        'MigrationSecretKey#2026',
        { serverUrl: 'https://managed.example.com' },
        { deleteLocalAfterMigration: true }
      )

      expect(summary.total).toBe(2)
      expect(summary.migrated).toBe(2)
      expect(summary.synced).toBe(2)
      expect(summary.failed).toBe(0)

      // Local direct snapshots should be cleaned up
      const directListAfter = await listSnapshots('inst-migrate', { managed: false })
      expect(directListAfter.length).toBe(0)

      // Managed snapshots should now hold both records marked 'synced'
      const managedList = await listManagedSnapshots('inst-migrate')
      expect(managedList.length).toBe(2)
      expect(managedList.every((s) => s.status === 'synced')).toBe(true)

      // Outbox should be empty after sync
      const outbox = await listOutboxTasks('inst-migrate')
      expect(outbox.length).toBe(0)
    })
  })

  describe('In-Memory Fallback (when IndexedDB is not available)', () => {
    it('provides full equivalent dual-track storage and outbox support via in-memory vaults', async () => {
      const originalIdb = globalThis.indexedDB
      try {
        // Temporarily disable IndexedDB to force in-memory vaults
        delete (globalThis as any).indexedDB

        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => JSON.stringify({ ok: true }),
        })
        globalThis.fetch = mockFetch

        const snapDirect = makeSampleSnapshot('mem-direct', 'inst-mem')
        const snapManaged = makeSampleSnapshot('mem-managed', 'inst-mem')

        // 1. Direct snapshot in memory
        await saveSnapshot(snapDirect)
        const directList = await listSnapshots('inst-mem', { managed: false })
        expect(directList.length).toBe(1)
        expect(directList[0].meta.id).toBe('mem-direct')

        // 2. Managed snapshot in memory
        await saveSnapshot(snapManaged, {
          password: 'MemoryPassword#2026',
          managedConfig: { serverUrl: 'https://managed.example.com' },
          skipAutoSync: true,
        })

        const managedList = await listManagedSnapshots('inst-mem')
        expect(managedList.length).toBe(1)
        expect(managedList[0].id).toBe('mem-managed')
        expect(managedList[0].status).toBe('pending_upload')

        // Outbox tasks in memory
        const outboxTasks = await listOutboxTasks('inst-mem')
        expect(outboxTasks.length).toBe(1)
        expect(outboxTasks[0].snapshotId).toBe('mem-managed')

        // 3. Sync pending tasks in memory
        const syncRes = await OutboxSyncCoordinator.syncPendingTasks('inst-mem', 'https://managed.example.com')
        expect(syncRes.succeeded).toBe(1)

        const tasksAfter = await listOutboxTasks('inst-mem')
        expect(tasksAfter.length).toBe(0)

        const managedAfter = await getManagedSnapshot('mem-managed')
        expect(managedAfter?.status).toBe('synced')

        // 4. Delete in memory
        await deleteSnapshot('mem-direct')
        expect(await getSnapshot('mem-direct')).toBeNull()
      } finally {
        globalThis.indexedDB = originalIdb
      }
    })
  })

  describe('Per-Instance Concurrency Isolation and Locks', () => {
    it('executes Instance A and Instance B synchronization concurrently without blocking or crosstalk', async () => {
      let resolveInstA: () => void = () => {}
      const instAPromise = new Promise<void>((resolve) => {
        resolveInstA = resolve
      })

      const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
        const urlStr = String(input)
        if (urlStr.includes('/inst-a/')) {
          await instAPromise
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
            text: async () => JSON.stringify({ ok: true }),
          }
        }
        if (urlStr.includes('/inst-b/')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
            text: async () => JSON.stringify({ ok: true }),
          }
        }
        return { ok: true, status: 200, json: async () => ({}) }
      })
      globalThis.fetch = mockFetch as any

      const snapA = makeSampleSnapshot('snap-inst-a', 'inst-a')
      const snapB = makeSampleSnapshot('snap-inst-b', 'inst-b')

      await saveSnapshot(snapA, {
        password: 'Pass',
        managedConfig: { serverUrl: 'https://managed.example.com' },
        skipAutoSync: true,
      })
      await saveSnapshot(snapB, {
        password: 'Pass',
        managedConfig: { serverUrl: 'https://managed.example.com' },
        skipAutoSync: true,
      })

      // Trigger sync for both instances concurrently
      const promiseA = OutboxSyncCoordinator.triggerSync('https://managed.example.com', 'inst-a')
      const promiseB = OutboxSyncCoordinator.triggerSync('https://managed.example.com', 'inst-b')

      // Instance B should complete immediately without being blocked by Instance A's pending sync
      const resultB = await promiseB
      expect(resultB.succeeded).toBe(1)
      expect(OutboxSyncCoordinator.isSyncing('inst-b')).toBe(false)
      expect(OutboxSyncCoordinator.isSyncing('inst-a')).toBe(true)

      // Unblock Instance A
      resolveInstA()
      const resultA = await promiseA
      expect(resultA.succeeded).toBe(1)
      expect(OutboxSyncCoordinator.isSyncing('inst-a')).toBe(false)
    })
  })

  describe('Timeout Protection and Storage Decoupling', () => {
    it('passes 15s timeout signal to fetch and updates retryCount on timeout error', async () => {
      let passedSignal: AbortSignal | undefined

      const mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        passedSignal = init?.signal as AbortSignal
        const err = new Error('The operation was aborted due to timeout')
        err.name = 'TimeoutError'
        throw err
      })
      globalThis.fetch = mockFetch as any

      const snap = makeSampleSnapshot('snap-timeout', 'inst-timeout')
      await saveSnapshot(snap, {
        password: 'Pass',
        managedConfig: { serverUrl: 'https://managed.example.com' },
        skipAutoSync: true,
      })

      const res = await OutboxSyncCoordinator.syncPendingTasks('inst-timeout', 'https://managed.example.com')
      expect(res.failed).toBe(1)
      expect(passedSignal).toBeDefined()

      const tasks = await listOutboxTasks('inst-timeout')
      expect(tasks.length).toBe(1)
      expect(tasks[0].retryCount).toBe(1)
      expect(tasks[0].lastError).toContain('timeout')
    })

    it('allows registering a decoupled custom sync trigger in snapshotStorage', async () => {
      const triggerMock = vi.fn()
      setSyncTrigger(triggerMock)

      try {
        const snap = makeSampleSnapshot('snap-custom-trigger', 'inst-custom')
        await saveSnapshot(snap, {
          password: 'Pass',
          managedConfig: { serverUrl: 'https://custom.example.com' },
        })

        expect(triggerMock).toHaveBeenCalledWith('https://custom.example.com', 'inst-custom')
      } finally {
        // Restore default trigger
        setSyncTrigger((serverUrl, instanceId) => OutboxSyncCoordinator.triggerSync(serverUrl, instanceId))
      }
    })

    it('registerAutoSync registers online and visibilitychange listeners and cleans them up', () => {
      const addWindowSpy = vi.fn()
      const removeWindowSpy = vi.fn()
      const addDocSpy = vi.fn()
      const removeDocSpy = vi.fn()

      const origWindow = (globalThis as any).window
      const origDocument = (globalThis as any).document
      try {
        ;(globalThis as any).window = {
          addEventListener: addWindowSpy,
          removeEventListener: removeWindowSpy,
        }
        ;(globalThis as any).document = {
          visibilityState: 'visible',
          addEventListener: addDocSpy,
          removeEventListener: removeDocSpy,
        }

        const unregister = registerAutoSync()
        expect(addWindowSpy).toHaveBeenCalledWith('online', expect.any(Function))
        expect(addDocSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))

        unregister()
        expect(removeWindowSpy).toHaveBeenCalledWith('online', expect.any(Function))
        expect(removeDocSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
      } finally {
        ;(globalThis as any).window = origWindow
        ;(globalThis as any).document = origDocument
      }
    })
  })
  describe('Locked / Undecrypted Managed Snapshots Preservation', () => {
    it('preserves undecrypted managed snapshot records and returns isLocked: true placeholder', async () => {
      // 1. Insert an undecrypted managed snapshot record (e.g. pulled from server without key)
      const undecryptedRecord: ManagedSnapshotRecord = {
        id: 'remote-encrypted-123',
        instanceId: 'inst-remote',
        createdAt: '2026-10-18T10:00:00.000Z',
        status: 'synced',
        blob: {
          version: 1,
          id: 'remote-encrypted-123',
          instanceId: 'inst-remote',
          createdAt: '2026-10-18T10:00:00.000Z',
          ciphertext: 'mock-ciphertext-abc',
          cipher: {
            algorithm: 'AES-256-GCM',
            iv: 'mock-iv',
            tagLength: 128,
          },
          kdf: {
            algorithm: 'PBKDF2-HMAC-SHA256',
            salt: 'mock-salt',
            iterations: 100_000,
          },
        },
        snapshot: undefined, // Not yet decrypted locally
      }
      await saveManagedSnapshot(undecryptedRecord)

      // Also save a normal decrypted snapshot
      const decryptedSnapshot = makeSampleSnapshot('decrypted-456', 'inst-remote')
      await saveSnapshot(decryptedSnapshot, {
        password: 'Pass',
        managedConfig: { serverUrl: 'https://managed.example.com' },
        skipAutoSync: true,
      })

      // 2. Query snapshots via listSnapshots with managed: true
      const snapshots = await listSnapshots('inst-remote', { managed: true })

      // Both snapshots MUST be returned - the undecrypted one must NOT be silently dropped!
      expect(snapshots.length).toBe(2)

      const locked = snapshots.find((s) => s.meta.id === 'remote-encrypted-123')
      expect(locked).toBeDefined()
      expect(locked?.isLocked).toBe(true)
      expect(locked?.meta.id).toBe('remote-encrypted-123')
      expect(locked?.meta.sourceInstance.id).toBe('inst-remote')
      expect(locked?.data).toEqual({})

      const unlocked = snapshots.find((s) => s.meta.id === 'decrypted-456')
      expect(unlocked).toBeDefined()
      expect(unlocked?.isLocked).toBeUndefined()
      expect(unlocked?.data.dns).toBeDefined()

      // 3. getSnapshot also returns locked placeholder for undecrypted records
      const fetchedLocked = await getSnapshot('remote-encrypted-123', { managed: true })
      expect(fetchedLocked).toBeDefined()
      expect(fetchedLocked?.isLocked).toBe(true)
      expect(fetchedLocked?.meta.id).toBe('remote-encrypted-123')
    })
  })
  describe('Thermo-Nuclear Audit Invariants (Atomic Deletion & Poison-Pill Hardening)', () => {
    it('atomically deletes managed snapshot and stages delete outbox task', async () => {
      const snap = makeSampleSnapshot('del-atomic-01', 'inst-del')
      await saveSnapshot(snap, {
        password: 'Pass',
        managedConfig: { serverUrl: 'https://managed.example.com' },
        skipAutoSync: true,
      })

      // Verify it exists in managed store
      expect(await getManagedSnapshot('del-atomic-01')).not.toBeNull()

      // Delete snapshot
      const deleted = await deleteSnapshot('del-atomic-01', {
        managed: true,
        instanceId: 'inst-del',
        skipAutoSync: true,
      })
      expect(deleted).toBe(true)

      // Verify managed store record was deleted
      expect(await getManagedSnapshot('del-atomic-01')).toBeNull()

      // Verify delete task is committed into outbox
      const tasks = await listOutboxTasks('inst-del')
      const delTask = tasks.find((t) => t.action === 'delete' && t.snapshotId === 'del-atomic-01')
      expect(delTask).toBeDefined()
      expect(delTask?.retryCount).toBe(0)
    })

    it('marks deterministic 4xx errors as fatal with MAX_OUTBOX_RETRIES to prevent head-of-line blocking', async () => {
      const snap = makeSampleSnapshot('poison-snap-01', 'inst-poison')
      await saveSnapshot(snap, {
        password: 'Pass',
        managedConfig: { serverUrl: 'https://managed.example.com' },
        skipAutoSync: true,
      })

      // Mock 400 Bad Request (e.g. malformed or rejected payload)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Schema validation rejected'),
      } as unknown as Response)

      const result = await OutboxSyncCoordinator.syncPendingTasks('inst-poison')
      expect(result.failed).toBe(1)

      const tasks = await listOutboxTasks('inst-poison')
      expect(tasks[0].retryCount).toBe(MAX_OUTBOX_RETRIES)
      expect(tasks[0].lastError).toContain('400')

      // Subsequent sync runs should skip dead-letter task and not block execution
      const secondSync = await OutboxSyncCoordinator.syncPendingTasks('inst-poison')
      expect(secondSync.total).toBe(0)
      expect(secondSync.failed).toBe(0)
    })


  })
});
