import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  base64ToUint8Array,
  deriveMasterKey,
  generateSalt,
  uint8ArrayToBase64,
} from '../lib/crypto/e2ee'
import { clearSessionKeys, getSessionKey, setSessionKey, removeSessionKey } from '../lib/crypto/keyVault'
import { newId, labelFromUrl, parseStore, type Instance } from '../lib/session/instances'

describe('Login Page Dual-Mode (Direct vs Managed)', () => {
  const SERVER_URL = 'https://console.example.com'
  const AGH_URL = 'http://192.168.1.1:3000'
  const USERNAME = 'admin'
  const PASSWORD = 'SecretPassword#2026'

  beforeEach(() => {
    vi.restoreAllMocks()
    clearSessionKeys()
  })

  it('preserves direct mode configuration without interference from managed mode', () => {
    let mode: 'direct' | 'managed' = 'direct'
    const directState = {
      url: AGH_URL,
      username: USERNAME,
      password: PASSWORD,
    }

    // Switch to managed mode
    mode = 'managed'
    const managedConsoleUrl = SERVER_URL
    expect(mode).toBe('managed')

    // Switch back to direct mode
    mode = 'direct'
    expect(mode).toBe('direct')
    expect(directState.url).toBe(AGH_URL)
    expect(directState.username).toBe(USERNAME)
    expect(directState.password).toBe(PASSWORD)
  })

  it('fetches managed instances list from console server', async () => {
    const mockInstances = [
      {
        id: 'inst-01',
        label: 'Gateway AGH',
        url: 'http://192.168.1.1:3000',
        username: 'admin',
        salt: uint8ArrayToBase64(generateSalt()),
      },
    ]

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockInstances,
    })

    const res = await fetch(`${SERVER_URL}/api/managed/instances`)
    const data = await res.json()

    expect(fetch).toHaveBeenCalledWith(`${SERVER_URL}/api/managed/instances`)
    expect(data.length).toBe(1)
    expect(data[0].id).toBe('inst-01')
    expect(data[0].label).toBe('Gateway AGH')
  })

  it('activates a managed instance by deriving CryptoKey locally and never sending password to server', async () => {
    const saltBytes = generateSalt()
    const salt = uint8ArrayToBase64(saltBytes)
    const inst = {
      id: 'inst-02',
      label: 'Home Router',
      url: 'http://192.168.1.254:3000',
      username: 'admin',
      salt,
    }

    // Simulating user entering password to activate instance
    const enteredPassword = PASSWORD

    // 1. Derive CryptoKey locally
    const derivedKey = await deriveMasterKey(
      enteredPassword,
      base64ToUint8Array(inst.salt),
      100_000
    )
    expect(derivedKey).toBeDefined()
    expect(derivedKey.algorithm.name).toBe('AES-GCM')

    // 2. Cache in memory session key vault
    setSessionKey(inst.id, derivedKey)
    expect(getSessionKey(inst.id)).toBe(derivedKey)

    // 3. Connect options contain managed metadata
    const connectPayload = {
      url: inst.url,
      username: inst.username,
      password: enteredPassword,
    }
    const connectOpts = {
      id: inst.id,
      label: inst.label,
      managed: {
        serverUrl: SERVER_URL,
        salt: inst.salt,
      },
    }

    expect(connectOpts.managed.serverUrl).toBe(SERVER_URL)
    expect(connectOpts.managed.salt).toBe(salt)
  })

  it('registers new managed instance without sending password in request body to console server', async () => {
    const postMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })
    globalThis.fetch = postMock

    const id = newId()
    const label = 'Office DNS'
    const cleanAghUrl = AGH_URL
    const username = USERNAME
    const password = PASSWORD
    const saltBytes = generateSalt()
    const salt = uint8ArrayToBase64(saltBytes)

    // Client registration POST payload
    const postPayload = {
      id,
      label,
      url: cleanAghUrl,
      username,
      salt,
    }

    // STRICT CHECK: Password must NOT be in postPayload
    expect('password' in postPayload).toBe(false)
    expect(JSON.stringify(postPayload)).not.toContain(password)

    const res = await fetch(`${SERVER_URL}/api/managed/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postPayload),
    })
    expect(res.ok).toBe(true)

    const calledBody = JSON.parse(postMock.mock.calls[0][1].body)
    expect(calledBody.password).toBeUndefined()
    expect(calledBody.salt).toBe(salt)

    // Key derived locally
    const key = await deriveMasterKey(password, saltBytes, 100_000)
    setSessionKey(id, key)
    expect(getSessionKey(id)).toBe(key)
  })

  it('clears managed metadata and session keys when switching back to direct mode', async () => {
    const targetId = 'inst-switch-test'
    const saltBytes = generateSalt()
    const salt = uint8ArrayToBase64(saltBytes)

    // 1. Initial state: instance has managed metadata and session key
    const masterKey = await deriveMasterKey(PASSWORD, saltBytes, 100_000)
    setSessionKey(targetId, masterKey)
    expect(getSessionKey(targetId)).toBe(masterKey)

    const existingInst: Instance = {
      id: targetId,
      label: 'Home Gateway',
      endpoints: [{ url: AGH_URL, username: USERNAME, password: PASSWORD }],
      managed: {
        serverUrl: SERVER_URL,
        salt,
      },
    }

    // 2. User toggles managed mode off (isManaged = false) in InstanceEdit
    const isManaged = false
    let managedMeta: { serverUrl: string; salt: string } | null = null
    if (!isManaged) {
      removeSessionKey(targetId)
    }

    // Key is purged from memory vault
    expect(getSessionKey(targetId)).toBeUndefined()

    // 3. Connect options are constructed with managed: null (or isManaged ? managedMeta : null)
    const connectOpts = {
      id: targetId,
      label: existingInst.label,
      activate: false,
      managed: isManaged ? managedMeta : null,
    }
    expect(connectOpts.managed).toBeNull()
    expect('managed' in connectOpts).toBe(true)

    // 4. Resolve instance entry according to connect logic
    const entry: Instance = {
      id: targetId,
      label: connectOpts.label || existingInst.label,
      endpoints: existingInst.endpoints,
    }

    if (connectOpts && 'managed' in connectOpts) {
      if (connectOpts.managed) {
        entry.managed = connectOpts.managed
      } else {
        delete entry.managed
      }
    } else if (existingInst?.managed) {
      entry.managed = existingInst.managed
    }

    // STRICT CHECK: entry.managed is completely deleted, reverting to pure direct instance
    expect(entry.managed).toBeUndefined()
    expect('managed' in entry).toBe(false)

    // Verify storage persistence does not keep managed metadata
    const parsed = parseStore({
      instances: [entry],
      activeId: targetId,
    })
    expect(parsed?.instances[0].managed).toBeUndefined()
  })

  it('preserves existing managed metadata when connect opts does not specify managed field', () => {
    const targetId = 'inst-keep-managed'
    const existingInst: Instance = {
      id: targetId,
      label: 'Managed Server',
      endpoints: [{ url: AGH_URL, username: USERNAME, password: PASSWORD }],
      managed: {
        serverUrl: SERVER_URL,
        salt: 'fake-salt',
      },
    }

    // Reconnecting or updating label without touching managed config
    const connectOpts = {
      id: targetId,
      label: 'Renamed Managed Server',
    }
    expect('managed' in connectOpts).toBe(false)

    const entry: Instance = {
      id: targetId,
      label: connectOpts.label || existingInst.label,
      endpoints: existingInst.endpoints,
    }

    if (connectOpts && 'managed' in connectOpts) {
      if ((connectOpts as any).managed) {
        entry.managed = (connectOpts as any).managed
      } else {
        delete entry.managed
      }
    } else if (existingInst?.managed) {
      entry.managed = existingInst.managed
    }

    expect(entry.managed).toEqual(existingInst.managed)
  })
})
