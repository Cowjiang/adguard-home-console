import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { IdbStore } from './idbStore'
import {
  clearAllDatabase,
  commitManagedSnapshotWithOutbox,
  getManagedSnapshot,
  getOutboxTask,
  MANAGED_STORE_NAME,
  openDatabase,
  OUTBOX_STORE_NAME,
  type ManagedSnapshotRecord,
  type OutboxTask,
} from './snapshotStorage'
import type { SnapshotEncryptedBlob } from '../crypto/e2ee'

interface SampleEntity {
  id: string
  name: string
  meta: {
    nestedId: string
  }
}

const sampleBlob: SnapshotEncryptedBlob = {
  id: 'sample-blob',
  instanceId: 'inst-test',
  createdAt: new Date().toISOString(),
  version: 1,
  kdf: { algorithm: 'PBKDF2-HMAC-SHA256', salt: 'salt-base64', iterations: 100_000 },
  cipher: { algorithm: 'AES-256-GCM', iv: 'iv-base64', tagLength: 128 },
  ciphertext: 'cipher-base64',
}

describe('IdbStore Driver & Atomic Dual-Write Transactions', () => {
  beforeEach(async () => {
    await clearAllDatabase()
  })

  describe('IdbStore in IndexedDB environment', () => {
    it('supports basic CRUD operations with simple keyPath', async () => {
      const store = new IdbStore<SampleEntity>(MANAGED_STORE_NAME, 'id', openDatabase)

      // 1. Initial get should return null
      expect(await store.get('e-1')).toBeNull()

      // 2. Put entity
      const item: SampleEntity = { id: 'e-1', name: 'Alpha', meta: { nestedId: 'n-1' } }
      await store.put(item)

      // 3. Get entity
      const fetched = await store.get('e-1')
      expect(fetched).toEqual(item)

      // 4. GetAll
      const all = await store.getAll()
      expect(all).toHaveLength(1)
      expect(all[0].name).toBe('Alpha')

      // 5. Delete entity
      const deleted = await store.delete('e-1')
      expect(deleted).toBe(true)
      expect(await store.get('e-1')).toBeNull()

      // 6. Clear
      await store.put(item)
      expect((await store.getAll()).length).toBe(1)
      await store.clear()
      expect(await store.getAll()).toEqual([])
    })

    it('supports external transaction for cross-store operations', async () => {
      const db = await openDatabase()
      const managedStore = new IdbStore<ManagedSnapshotRecord>(MANAGED_STORE_NAME, 'id', openDatabase)
      const outboxStore = new IdbStore<OutboxTask>(OUTBOX_STORE_NAME, 'taskId', openDatabase)

      const record: ManagedSnapshotRecord = {
        id: 'rec-tx-1',
        instanceId: 'inst-1',
        createdAt: new Date().toISOString(),
        status: 'pending_upload',
        blob: { ...sampleBlob, id: 'rec-tx-1', instanceId: 'inst-1' },
      }

      const task: OutboxTask = {
        taskId: 'task-tx-1',
        instanceId: 'inst-1',
        snapshotId: 'rec-tx-1',
        action: 'upload',
        blob: record.blob,
        createdAt: new Date().toISOString(),
        retryCount: 0,
      }

      // Execute in explicit transaction
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([MANAGED_STORE_NAME, OUTBOX_STORE_NAME], 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)

        void managedStore.put(record, tx)
        void outboxStore.put(task, tx)
      })

      // Verify both written
      expect(await managedStore.get('rec-tx-1')).toEqual(record)
      expect(await outboxStore.get('task-tx-1')).toEqual(task)
    })
  })

  describe('commitManagedSnapshotWithOutbox atomic dual-write', () => {
    it('commits managed record and outbox task simultaneously in one transaction', async () => {
      const record: ManagedSnapshotRecord = {
        id: 'atomic-snap-1',
        instanceId: 'inst-test',
        createdAt: new Date().toISOString(),
        status: 'pending_upload',
        blob: { ...sampleBlob, id: 'atomic-snap-1' },
      }

      const task: OutboxTask = {
        taskId: 'atomic-task-1',
        instanceId: 'inst-test',
        snapshotId: 'atomic-snap-1',
        action: 'upload',
        blob: record.blob,
        createdAt: new Date().toISOString(),
        retryCount: 0,
      }

      await commitManagedSnapshotWithOutbox(record, task)

      const fetchedRecord = await getManagedSnapshot('atomic-snap-1')
      const fetchedTask = await getOutboxTask('atomic-task-1')

      expect(fetchedRecord).toBeDefined()
      expect(fetchedRecord?.id).toBe('atomic-snap-1')
      expect(fetchedTask).toBeDefined()
      expect(fetchedTask?.taskId).toBe('atomic-task-1')
    })
  })

  describe('IdbStore In-Memory Fallback', () => {
    it('supports nested key paths and map storage when indexedDB is undefined', async () => {
      const origIdb = globalThis.indexedDB
      try {
        // @ts-expect-error simulate non-browser environment
        delete globalThis.indexedDB

        const store = new IdbStore<SampleEntity>('test_store', 'meta.nestedId')

        const item: SampleEntity = {
          id: '1',
          name: 'Nested Item',
          meta: { nestedId: 'nested-key-42' },
        }

        await store.put(item)
        expect(await store.get('nested-key-42')).toEqual(item)
        expect(await store.getAll()).toHaveLength(1)

        await store.delete('nested-key-42')
        expect(await store.get('nested-key-42')).toBeNull()

        await store.put(item)
        store.clearMemory()
        expect(await store.get('nested-key-42')).toBeNull()
      } finally {
        globalThis.indexedDB = origIdb
      }
    })
  })
})
