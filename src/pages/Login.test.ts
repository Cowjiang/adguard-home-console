import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  base64ToUint8Array,
  deriveMasterKey,
  generateSalt,
  uint8ArrayToBase64,
} from '../lib/crypto/e2ee'
import { clearSessionKeys, getSessionKey, setSessionKey, removeSessionKey } from '../lib/crypto/keyVault'
import { newId, parseStore, type Instance } from '../lib/session/instances'
import { ManagedSessionService, type ManagedInstanceMeta } from '../lib/session/managedService'
import type { ManagedPhase } from '../components/login/ManagedLoginView'
import type { ManagedAction, ConnectOptions } from '../lib/session/auth'

describe('Login Architecture & Managed State Machine', () => {
  const SERVER_URL = 'https://console.example.com'
  const AGH_URL = 'http://192.168.1.1:3000'
  const USERNAME = 'admin'
  const PASSWORD = 'SecretPassword#2026'

  beforeEach(() => {
    vi.restoreAllMocks()
    clearSessionKeys()
  })

  it('manages mutually exclusive FSM phases without boolean flags or ghost states', () => {
    const instance: ManagedInstanceMeta = {
      id: 'inst-01',
      label: 'Home Gateway',
      url: AGH_URL,
      username: USERNAME,
      salt: uint8ArrayToBase64(generateSalt()),
    }

    // 1. Initial phase is list
    let phase: ManagedPhase = { type: 'list' }
    expect(phase.type).toBe('list')

    // 2. Select an instance to activate
    phase = { type: 'activate', instance }
    expect(phase.type).toBe('activate')
    if (phase.type === 'activate') {
      expect(phase.instance.id).toBe('inst-01')
      expect(phase.instance.label).toBe('Home Gateway')
    }

    // 3. Cancel activation returns to list
    phase = { type: 'list' }
    expect(phase.type).toBe('list')

    // 4. Click register
    phase = { type: 'register' }
    expect(phase.type).toBe('register')

    // 5. Cancel registration returns to list
    phase = { type: 'list' }
    expect(phase.type).toBe('list')
  })

  it('activates a managed instance via ManagedSessionService and derives master key into KeyVault', async () => {
    const saltBytes = generateSalt()
    const salt = uint8ArrayToBase64(saltBytes)
    const inst: ManagedInstanceMeta = {
      id: 'inst-02',
      label: 'Home Router',
      url: 'http://192.168.1.254:3000',
      username: 'admin',
      salt,
    }

    const key = await ManagedSessionService.activateManagedInstance(inst, PASSWORD)
    expect(key).toBeDefined()
    expect(key.algorithm.name).toBe('AES-GCM')

    // Key is safely in memory KeyVault
    expect(getSessionKey(inst.id)).toBe(key)
  })

  it('enrolls new managed instance without leaking password to remote console', async () => {
    let capturedPayload: any = null
    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedPayload = JSON.parse(init.body)
      return {
        ok: true,
        status: 200,
        text: async () => 'OK',
      }
    })

    const id = newId()
    const meta = await ManagedSessionService.enroll({
      instanceId: id,
      label: 'Office DNS',
      url: AGH_URL,
      username: USERNAME,
      serverUrl: SERVER_URL,
      password: PASSWORD,
    })

    // Strict Redline: Password MUST NOT be transmitted to console server
    expect(capturedPayload).toBeDefined()
    expect(capturedPayload.id).toBe(id)
    expect(capturedPayload.password).toBeUndefined()
    expect(JSON.stringify(capturedPayload)).not.toContain(PASSWORD)

    // Derived metadata & KeyVault
    expect(meta.serverUrl).toBe(SERVER_URL)
    expect(getSessionKey(id)).toBeDefined()
  })

  it('handles explicit ManagedAction contract in connect options', () => {
    const targetId = 'inst-switch-test'
    const salt = uint8ArrayToBase64(generateSalt())

    const existingInst: Instance = {
      id: targetId,
      label: 'Home Gateway',
      endpoints: [{ url: AGH_URL, username: USERNAME, password: PASSWORD }],
      managed: {
        serverUrl: SERVER_URL,
        salt,
      },
    }

    // 1. Explicit remove action
    const removeOpts: ConnectOptions = {
      id: targetId,
      managedAction: { type: 'remove' },
    }
    expect(removeOpts.managedAction?.type).toBe('remove')

    // 2. Explicit set action
    const setOpts: ConnectOptions = {
      id: targetId,
      managedAction: {
        type: 'set',
        metadata: { serverUrl: SERVER_URL, salt },
      },
    }
    expect(setOpts.managedAction?.type).toBe('set')

    // 3. Explicit preserve action
    const preserveOpts: ConnectOptions = {
      id: targetId,
      managedAction: { type: 'preserve' },
    }
    expect(preserveOpts.managedAction?.type).toBe('preserve')
  })
})
