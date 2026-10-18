import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllDatabase,
  getManagedSnapshot,
  listManagedSnapshots,
  listOutboxTasks,
  listSnapshots,
  saveSnapshot,
} from './snapshotStorage'
import {
  flushOutbox,
  pullRemoteSnapshots,
  OutboxSyncCoordinator,
} from './outboxSync'
import {
  base64ToUint8Array,
  deriveMasterKey,
  generateSalt,
  uint8ArrayToBase64,
} from '../crypto/e2ee'
import { clearSessionKeys, getSessionKey, setSessionKey } from '../crypto/keyVault'
import { saveStore, type InstanceStoreData } from '../session/instances'
import type { AghConfigSnapshot } from './types'

// Polyfill localStorage for node/vitest environment
const memStorage = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => memStorage.get(k) ?? null,
  setItem: (k: string, v: string) => memStorage.set(k, String(v)),
  removeItem: (k: string) => memStorage.delete(k),
  clear: () => memStorage.clear(),
  length: 0,
  key: () => null,
} as any

function makeSampleSnapshot(id: string, instanceId = 'inst-managed-e2e'): AghConfigSnapshot {
  return {
    meta: {
      id,
      schemaVersion: '1.0',
      createdAt: '2026-10-18T10:00:00.000Z',
      label: `Snapshot ${id}`,
      description: 'E2E Cross-device sync test',
      trigger: 'manual',
      sourceInstance: {
        id: instanceId,
        label: 'Primary AGH',
        url: 'http://192.168.1.1:3000',
        aghVersion: '0.107.80',
      },
      modules: ['dns', 'user_rules'],
      checksum: 'fake-checksum-hash',
    },
    data: {
      dns: {
        upstream_dns: ['1.1.1.1', 'https://dns.adguard.com/dns-query'],
      } as any,
      user_rules: ['||malware-domain.test^', '@@||whitelist.test^'],
    },
  }
}

describe('Managed Mode E2E Cross-Device Zero-Knowledge Synchronization', () => {
  const SERVER_URL = 'https://console.example.com'
  const INSTANCE_ID = 'inst-managed-e2e'
  const AGH_PASSWORD = 'SuperSecureAghPassword#2026'
  const saltBytes = generateSalt()
  const saltBase64 = uint8ArrayToBase64(saltBytes)

  // In-memory mock server database
  const remoteServerStorage = {
    instances: new Map<string, any>(),
    snapshots: new Map<string, any>(), // key: `${instanceId}/${snapshotId}`
  }

  beforeEach(async () => {
    vi.restoreAllMocks()
    await clearAllDatabase()
    clearSessionKeys()
    localStorage.clear()
    remoteServerStorage.instances.clear()
    remoteServerStorage.snapshots.clear()

    // Mock fetch for remote console server API
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = String(input)

      // GET /api/managed/instances
      if (urlStr.endsWith('/api/managed/instances') && (!init || init.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => Array.from(remoteServerStorage.instances.values()),
        } as Response
      }

      // POST /api/managed/instances
      if (urlStr.endsWith('/api/managed/instances') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        if ('password' in body) {
          return {
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            text: async () => 'Password must never be sent to console server',
          } as Response
        }
        remoteServerStorage.instances.set(body.id, body)
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, instance: body }),
        } as Response
      }

      // GET /api/managed/instances/:id/snapshots
      const listSnapRegex = /\/api\/managed\/instances\/([^/]+)\/snapshots$/
      const listMatch = urlStr.match(listSnapRegex)
      if (listMatch && (!init || init.method === 'GET')) {
        const instId = decodeURIComponent(listMatch[1])
        const summaries: any[] = []
        for (const [key, blob] of remoteServerStorage.snapshots.entries()) {
          if (key.startsWith(`${instId}/`)) {
            summaries.push({
              id: blob.id,
              instanceId: blob.instanceId,
              createdAt: blob.createdAt,
              checksum: blob.checksum,
            })
          }
        }
        return {
          ok: true,
          status: 200,
          json: async () => summaries,
        } as Response
      }

      // GET /api/managed/instances/:id/snapshots/:snapshotId
      const singleSnapRegex = /\/api\/managed\/instances\/([^/]+)\/snapshots\/([^/]+)$/
      const singleMatch = urlStr.match(singleSnapRegex)
      if (singleMatch) {
        const instId = decodeURIComponent(singleMatch[1])
        const snapId = decodeURIComponent(singleMatch[2])
        const key = `${instId}/${snapId}`

        if (init?.method === 'PUT') {
          const blob = JSON.parse(String(init.body))
          remoteServerStorage.snapshots.set(key, blob)
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
            text: async () => JSON.stringify({ ok: true }),
          } as Response
        }

        if (init?.method === 'DELETE') {
          remoteServerStorage.snapshots.delete(key)
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
            text: async () => JSON.stringify({ ok: true }),
          } as Response
        }

        // GET
        const blob = remoteServerStorage.snapshots.get(key)
        if (!blob) {
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: async () => 'Snapshot not found',
          } as Response
        }
        return {
          ok: true,
          status: 200,
          json: async () => blob,
          text: async () => JSON.stringify(blob),
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response
    })
  })

  it('Device A registers managed instance and flushes encrypted snapshot to server', async () => {
    // 1. Device A sets up instance in local store
    const storeA: InstanceStoreData = {
      activeId: INSTANCE_ID,
      instances: [
        {
          id: INSTANCE_ID,
          label: 'Primary AGH',
          endpoints: [
            {
              url: 'http://192.168.1.1:3000',
              username: 'admin',
              password: AGH_PASSWORD,
            },
          ],
          managed: {
            serverUrl: SERVER_URL,
            salt: saltBase64,
          },
        },
      ],
    }
    saveStore(storeA)

    // Device A derives master key and caches in session keyVault
    const keyA = await deriveMasterKey(AGH_PASSWORD, saltBytes, 100_000)
    setSessionKey(INSTANCE_ID, keyA)

    // 2. Device A creates and saves snapshot
    const snap = makeSampleSnapshot('snap-e2e-01', INSTANCE_ID)
    await saveSnapshot(snap, {
      managed: true,
      managedConfig: { serverUrl: SERVER_URL, salt: saltBase64 },
      key: keyA,
      skipAutoSync: true, // Manual flush test
    })

    // Outbox has 1 task
    const tasks = await listOutboxTasks(INSTANCE_ID)
    expect(tasks.length).toBe(1)
    expect(tasks[0].action).toBe('upload')

    // 3. Device A triggers flushOutbox
    const syncRes = await flushOutbox(INSTANCE_ID, SERVER_URL)
    expect(syncRes.total).toBe(1)
    expect(syncRes.succeeded).toBe(1)
    expect(syncRes.failed).toBe(0)

    // Outbox is now empty and local record marked 'synced'
    expect((await listOutboxTasks(INSTANCE_ID)).length).toBe(0)
    const localRecord = await getManagedSnapshot('snap-e2e-01')
    expect(localRecord?.status).toBe('synced')

    // 4. Verify server holds only encrypted ciphertext blob without AGH password or plain config
    const serverKey = `${INSTANCE_ID}/snap-e2e-01`
    const serverBlob = remoteServerStorage.snapshots.get(serverKey)
    expect(serverBlob).toBeDefined()
    expect(serverBlob.ciphertext).toBeTypeOf('string')
    expect(JSON.stringify(serverBlob)).not.toContain(AGH_PASSWORD)
    expect(JSON.stringify(serverBlob)).not.toContain('malware-domain.test')
  })

  it('Device B activates instance with AGH password, pulls and decrypts Device A snapshot', async () => {
    // Populate server storage directly as if Device A had uploaded it
    const snap = makeSampleSnapshot('snap-e2e-02', INSTANCE_ID)
    const keyA = await deriveMasterKey(AGH_PASSWORD, saltBytes, 100_000)
    await saveSnapshot(snap, {
      managed: true,
      managedConfig: { serverUrl: SERVER_URL, salt: saltBase64 },
      key: keyA,
      skipAutoSync: true,
    })
    await flushOutbox(INSTANCE_ID, SERVER_URL)

    // Verify snapshot is in server storage
    expect(remoteServerStorage.snapshots.has(`${INSTANCE_ID}/snap-e2e-02`)).toBe(true)

    // Now switch to Device B: clean database & memory
    await clearAllDatabase()
    clearSessionKeys()
    localStorage.clear()

    // Verify Device B currently has 0 local snapshots
    const initialList = await listSnapshots(INSTANCE_ID, { managed: true })
    expect(initialList.length).toBe(0)

    // Device B sets up instance store as received from GET /api/managed/instances
    const storeB: InstanceStoreData = {
      activeId: INSTANCE_ID,
      instances: [
        {
          id: INSTANCE_ID,
          label: 'Primary AGH',
          endpoints: [
            {
              url: 'http://192.168.1.1:3000',
              username: 'admin',
              password: AGH_PASSWORD, // Entered by user on Device B during activation
            },
          ],
          managed: {
            serverUrl: SERVER_URL,
            salt: saltBase64,
          },
        },
      ],
    }
    saveStore(storeB)

    // Device B derives master key on activation
    const keyB = await deriveMasterKey(AGH_PASSWORD, saltBytes, 100_000)
    setSessionKey(INSTANCE_ID, keyB)

    // Device B pulls remote snapshots
    const pullResult = await pullRemoteSnapshots(INSTANCE_ID, SERVER_URL, { key: keyB })
    expect(pullResult.total).toBe(1)
    expect(pullResult.pulled).toBe(1)
    expect(pullResult.failed).toBe(0)

    // Device B lists snapshots and verifies decrypted content matches Device A's snapshot!
    const snapshotsB = await listSnapshots(INSTANCE_ID, { managed: true })
    expect(snapshotsB.length).toBe(1)
    expect(snapshotsB[0].meta.id).toBe('snap-e2e-02')
    expect(snapshotsB[0].meta.label).toBe('Snapshot snap-e2e-02')
    expect(snapshotsB[0].data.user_rules).toEqual([
      '||malware-domain.test^',
      '@@||whitelist.test^',
    ])
    expect((snapshotsB[0].data.dns as any)?.upstream_dns).toEqual([
      '1.1.1.1',
      'https://dns.adguard.com/dns-query',
    ])
  })

  it('Device B with invalid password fails to decrypt snapshot and does not expose corrupted plaintext', async () => {
    // Populate server storage
    const snap = makeSampleSnapshot('snap-e2e-03', INSTANCE_ID)
    const keyA = await deriveMasterKey(AGH_PASSWORD, saltBytes, 100_000)
    await saveSnapshot(snap, {
      managed: true,
      managedConfig: { serverUrl: SERVER_URL, salt: saltBase64 },
      key: keyA,
      skipAutoSync: true,
    })
    await flushOutbox(INSTANCE_ID, SERVER_URL)

    // Device B with WRONG password
    await clearAllDatabase()
    clearSessionKeys()
    const wrongKey = await deriveMasterKey('WrongPassword#999', saltBytes, 100_000)

    const pullResult = await pullRemoteSnapshots(INSTANCE_ID, SERVER_URL, { key: wrongKey })
    expect(pullResult.total).toBe(1)
    expect(pullResult.pulled).toBe(0)
    expect(pullResult.failed).toBe(1)

    // Decrypted list remains 0
    const list = await listSnapshots(INSTANCE_ID, { managed: true })
    expect(list.length).toBe(0)
  })
})
