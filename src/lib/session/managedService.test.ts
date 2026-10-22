import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ManagedSessionService,
  enroll,
  unenroll,
  activateManagedInstance,
} from './managedService'
import { getSessionKey, setSessionKey, clearSessionKeys } from '../crypto/keyVault'
import * as e2ee from '../crypto/e2ee'
import * as outboxSync from '../snapshot/outboxSync'

describe('ManagedSessionService', () => {
  const SERVER_URL = 'https://console.example.com'
  const AGH_URL = 'http://192.168.1.1:3000'
  const USERNAME = 'admin'
  const PASSWORD = 'SecretPassword#2026'
  const INSTANCE_ID = 'inst-test-01'

  beforeEach(() => {
    vi.restoreAllMocks()
    clearSessionKeys()
  })

  describe('enroll', () => {
    it('successfully registers instance, derives key, caches it, and calls snapshot migration', async () => {
      const migrateSpy = vi
        .spyOn(outboxSync, 'migrateLocalSnapshotsToManaged')
        .mockResolvedValue({ total: 0, migrated: 0, synced: 0, failed: 0 })

      let capturedPayload: any = null
      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedPayload = JSON.parse(init.body)
        return {
          ok: true,
          status: 200,
          text: async () => 'OK',
        }
      })

      const meta = await enroll({
        instanceId: INSTANCE_ID,
        label: 'My AGH',
        url: AGH_URL,
        username: USERNAME,
        serverUrl: SERVER_URL,
        password: PASSWORD,
      })

      // Strict redline: password must NEVER be sent to remote server
      expect(capturedPayload).toBeDefined()
      expect(capturedPayload.id).toBe(INSTANCE_ID)
      expect(capturedPayload.label).toBe('My AGH')
      expect(capturedPayload.url).toBe(AGH_URL)
      expect(capturedPayload.username).toBe(USERNAME)
      expect(capturedPayload.salt).toBeDefined()
      expect(capturedPayload.password).toBeUndefined()
      expect(JSON.stringify(capturedPayload)).not.toContain(PASSWORD)

      // Metadata returned
      expect(meta.serverUrl).toBe(SERVER_URL)
      expect(meta.salt).toBe(capturedPayload.salt)

      // KeyVault session key cached
      const cachedKey = getSessionKey(INSTANCE_ID)
      expect(cachedKey).toBeDefined()

      // Snapshot migration invoked
      expect(migrateSpy).toHaveBeenCalledWith(INSTANCE_ID, PASSWORD, meta)
    })

    it('rolls back and removes session key if remote registration fails', async () => {
      // Pre-populate key to test transactional rollback
      const dummyKey = {} as CryptoKey
      setSessionKey(INSTANCE_ID, dummyKey)

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server DB down',
      })

      await expect(
        enroll({
          instanceId: INSTANCE_ID,
          label: 'My AGH',
          url: AGH_URL,
          username: USERNAME,
          serverUrl: SERVER_URL,
          password: PASSWORD,
        })
      ).rejects.toThrow(/HTTP 500/)

      // Key must be wiped, no orphaned key left
      expect(getSessionKey(INSTANCE_ID)).toBeUndefined()
    })

    it('rolls back and removes session key if key derivation throws', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'OK',
      })

      vi.spyOn(e2ee, 'deriveMasterKey').mockRejectedValueOnce(
        new Error('Crypto derivation error')
      )

      await expect(
        enroll({
          instanceId: INSTANCE_ID,
          label: 'My AGH',
          url: AGH_URL,
          username: USERNAME,
          serverUrl: SERVER_URL,
          password: PASSWORD,
        })
      ).rejects.toThrow('Crypto derivation error')

      // Key must be wiped
      expect(getSessionKey(INSTANCE_ID)).toBeUndefined()
    })
  })

  describe('unenroll', () => {
    it('removes the session key from KeyVault', () => {
      setSessionKey(INSTANCE_ID, {} as CryptoKey)
      expect(getSessionKey(INSTANCE_ID)).toBeDefined()

      unenroll(INSTANCE_ID)
      expect(getSessionKey(INSTANCE_ID)).toBeUndefined()
    })
  })

  describe('activateManagedInstance', () => {
    it('derives key and caches it in KeyVault', async () => {
      const salt = e2ee.uint8ArrayToBase64(e2ee.generateSalt())
      const key = await activateManagedInstance(
        {
          id: INSTANCE_ID,
          label: 'Managed Inst',
          url: AGH_URL,
          username: USERNAME,
          salt,
        },
        PASSWORD
      )

      expect(key).toBeDefined()
      expect(getSessionKey(INSTANCE_ID)).toBe(key)
    })

    it('cleans up session key if activation throws', async () => {
      setSessionKey(INSTANCE_ID, {} as CryptoKey)
      const validSalt = e2ee.uint8ArrayToBase64(e2ee.generateSalt())
      vi.spyOn(e2ee, 'deriveMasterKey').mockRejectedValueOnce(
        new Error('Derive failed')
      )

      await expect(
        activateManagedInstance(
          {
            id: INSTANCE_ID,
            label: 'Managed Inst',
            url: AGH_URL,
            username: USERNAME,
            salt: validSalt,
          },
          PASSWORD
        )
      ).rejects.toThrow('Derive failed')

      expect(getSessionKey(INSTANCE_ID)).toBeUndefined()
    })
  })
})
