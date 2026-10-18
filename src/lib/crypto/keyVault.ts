/**
 * In-memory vault for session CryptoKeys.
 * Keys are held strictly in memory during the active session
 * and are never persisted to disk or sent to any server.
 */

const sessionKeys = new Map<string, CryptoKey>()

export function setSessionKey(instanceId: string, key: CryptoKey): void {
  sessionKeys.set(instanceId, key)
}

export function getSessionKey(instanceId: string): CryptoKey | undefined {
  return sessionKeys.get(instanceId)
}

export function removeSessionKey(instanceId: string): boolean {
  return sessionKeys.delete(instanceId)
}

export function clearSessionKeys(): void {
  sessionKeys.clear()
}
