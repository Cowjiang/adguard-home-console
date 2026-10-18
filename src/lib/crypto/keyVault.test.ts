import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearSessionKeys,
  getSessionKey,
  removeSessionKey,
  setSessionKey,
} from './keyVault'
import { deriveMasterKey, generateSalt } from './e2ee'

describe('Session KeyVault', () => {
  beforeEach(() => {
    clearSessionKeys()
  })

  it('stores and retrieves session CryptoKey for an instance', async () => {
    const salt = generateSalt()
    const key = await deriveMasterKey('TestPass#123', salt, 100_000)

    expect(getSessionKey('inst-1')).toBeUndefined()
    setSessionKey('inst-1', key)
    expect(getSessionKey('inst-1')).toBe(key)
  })

  it('removes session key for a specific instance', async () => {
    const salt = generateSalt()
    const key1 = await deriveMasterKey('Pass1', salt, 100_000)
    const key2 = await deriveMasterKey('Pass2', salt, 100_000)

    setSessionKey('inst-1', key1)
    setSessionKey('inst-2', key2)

    expect(removeSessionKey('inst-1')).toBe(true)
    expect(getSessionKey('inst-1')).toBeUndefined()
    expect(getSessionKey('inst-2')).toBe(key2)
  })

  it('clears all session keys on logout', async () => {
    const salt = generateSalt()
    const key = await deriveMasterKey('Pass', salt, 100_000)

    setSessionKey('inst-1', key)
    setSessionKey('inst-2', key)

    clearSessionKeys()
    expect(getSessionKey('inst-1')).toBeUndefined()
    expect(getSessionKey('inst-2')).toBeUndefined()
  })
})
