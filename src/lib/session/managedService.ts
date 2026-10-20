/**
 * Domain service for managing Console Managed Instance enrollment,
 * unenrollment, key derivation, and transactional session rollback.
 */
import {
  base64ToUint8Array,
  deriveMasterKey,
  generateSalt,
  uint8ArrayToBase64,
} from '../crypto/e2ee'
import { removeSessionKey, setSessionKey } from '../crypto/keyVault'
import { migrateLocalSnapshotsToManaged } from '../snapshot/outboxSync'
import type { InstanceManagedMetadata } from './instances'

export interface ManagedInstanceMeta {
  id: string
  label: string
  url: string
  username: string
  salt: string
  syncedAt?: string
}

export interface EnrollManagedParams {
  instanceId: string
  label: string
  url: string
  username: string
  serverUrl: string
  password: string
  salt?: string
}

/**
 * Enrolls an instance in Console Managed mode:
 * 1. Registers metadata to Console server (STRICT REDLINE: NEVER send password!).
 * 2. Derives CryptoKey locally using PBKDF2 with instance salt.
 * 3. Stores key in memory KeyVault.
 * 4. Triggers background migration of local snapshots.
 *
 * Transactional guarantee: On any failure (network, server rejection, key derivation),
 * any intermediate cached session key is immediately wiped to avoid orphaned/dangling keys.
 */
export async function enroll(params: EnrollManagedParams): Promise<InstanceManagedMetadata> {
  const { instanceId, label, url, username, serverUrl, password } = params
  const cleanServer = serverUrl.trim().replace(/\/+$/, '')
  const cleanUrl = url.trim().replace(/\/+$/, '')
  const cleanLabel = label.trim()
  const cleanUsername = username.trim()
  const salt = params.salt || uint8ArrayToBase64(generateSalt())

  try {
    // 1. Register metadata with Console server (STRICT REDLINE: NO password!)
    const res = await fetch(`${cleanServer}/api/managed/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: instanceId,
        label: cleanLabel,
        url: cleanUrl,
        username: cleanUsername,
        salt,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`)
    }

    const metadata: InstanceManagedMetadata = { serverUrl: cleanServer, salt }

    // 2. Derive and cache master key in memory
    const saltBytes = base64ToUint8Array(salt)
    const key = await deriveMasterKey(password, saltBytes)
    setSessionKey(instanceId, key)

    // 3. Attempt background migration of any unmanaged local snapshots
    void migrateLocalSnapshotsToManaged(instanceId, password, metadata).catch(() => {})

    return metadata
  } catch (err) {
    // Transactional rollback: ensure no orphaned key remains
    removeSessionKey(instanceId)
    throw err
  }
}

/**
 * Unenrolls an instance from managed mode:
 * Atomically cleans up any cached CryptoKey from memory KeyVault.
 */
export function unenroll(instanceId: string): void {
  removeSessionKey(instanceId)
}

/**
 * Activates an existing managed instance:
 * Converts salt, derives master CryptoKey, and caches it in memory KeyVault.
 * On failure, automatically cleans up session key.
 */
export async function activateManagedInstance(
  instance: ManagedInstanceMeta,
  password: string
): Promise<CryptoKey> {
  try {
    const saltBytes = base64ToUint8Array(instance.salt)
    const key = await deriveMasterKey(password, saltBytes)
    setSessionKey(instance.id, key)
    return key
  } catch (err) {
    removeSessionKey(instance.id)
    throw err
  }
}

export const ManagedSessionService = {
  enroll,
  unenroll,
  activateManagedInstance,
}
