import { describe, expect, it } from 'vitest'
import {
  base64ToUint8Array,
  computeSha256,
  decryptSnapshotBlob,
  decryptSnapshotBlobJson,
  deriveMasterKey,
  deriveRawKey,
  encryptSnapshotBlob,
  generateIv,
  generateSalt,
  serializeAad,
  uint8ArrayToBase64,
  type SnapshotEncryptedBlob,
} from './e2ee'

export const CROSS_PLATFORM_VECTOR = {
  password: 'SuperSecret@AGH#2026',
  id: 'snap-0192e2ee-test-vector-000001',
  instanceId: 'agh-primary-home-lab',
  createdAt: '2026-10-18T12:00:00.000Z',
  saltBase64: 'AQIDBAUGBwgJCgsMDQ4PEA==',
  ivBase64: 'obLD1OX2BxgpOktc',
  derivedKeyHex: '8b8783b61c2e9b68464d8ee5239b647c2687e4344cd19a648a0459628355fae9',
  ciphertextBase64:
    'YNKzO8pggTJuI/F4L/tyZ5OAwLAMJVfj0vDBXc/WsmiWcVnx6ANI8B+x9BGybrlMDhOXAtgWWYqITwnkFG3tRr1Nz/HpOulW45ATOjL++gH6ykVMvg0lwmPZVG+LSFz1fHE=',
  checksum: '26b0e7be4ed91ac5a9016364e10a7b72a7de16b9e1307abec5d79dfb1b969637',
  plaintext:
    '{"dns":{"bootstrap_dns":["1.1.1.1"],"upstream_dns":["9.9.9.9","149.112.112.112"]}}',
} as const

function getTestVectorBlob(): SnapshotEncryptedBlob {
  return {
    id: CROSS_PLATFORM_VECTOR.id,
    instanceId: CROSS_PLATFORM_VECTOR.instanceId,
    createdAt: CROSS_PLATFORM_VECTOR.createdAt,
    version: 1,
    kdf: {
      algorithm: 'PBKDF2-HMAC-SHA256',
      iterations: 600_000,
      salt: CROSS_PLATFORM_VECTOR.saltBase64,
    },
    cipher: {
      algorithm: 'AES-256-GCM',
      iv: CROSS_PLATFORM_VECTOR.ivBase64,
      tagLength: 128,
    },
    ciphertext: CROSS_PLATFORM_VECTOR.ciphertextBase64,
    checksum: CROSS_PLATFORM_VECTOR.checksum,
  }
}

describe('Crypto Engine E2EE (Web Crypto API)', () => {
  it('generates random salt (16B) and IV (12B) with correct byte lengths', () => {
    const salt = generateSalt()
    const iv = generateIv()

    expect(salt).toBeInstanceOf(Uint8Array)
    expect(salt.byteLength).toBe(16)

    expect(iv).toBeInstanceOf(Uint8Array)
    expect(iv.byteLength).toBe(12)

    // Ensure consecutive generations produce distinct entropy
    const salt2 = generateSalt()
    expect(salt).not.toEqual(salt2)
  })

  it('serializes AAD deterministically with id, instanceId, and createdAt', () => {
    const aad = serializeAad({
      id: 'snap-1',
      instanceId: 'inst-1',
      createdAt: '2026-10-18T10:00:00.000Z',
    })
    const decoded = new TextDecoder().decode(aad)
    expect(decoded).toBe(
      '{\"id\":\"snap-1\",\"instanceId\":\"inst-1\",\"createdAt\":\"2026-10-18T10:00:00.000Z\"}'
    )
  })

  it('computes deterministic SHA-256 hex checksum', async () => {
    const checksum = await computeSha256(CROSS_PLATFORM_VECTOR.plaintext)
    expect(checksum).toBe(CROSS_PLATFORM_VECTOR.checksum)
  })

  it('derives key matching cross-platform test vector', async () => {
    const salt = base64ToUint8Array(CROSS_PLATFORM_VECTOR.saltBase64)
    const rawKey = await deriveRawKey(
      CROSS_PLATFORM_VECTOR.password,
      salt,
      600_000
    )
    const keyHex = Array.from(rawKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    expect(keyHex).toBe(CROSS_PLATFORM_VECTOR.derivedKeyHex)
  })

  it('encrypts to standard GCM format exactly matching cross-platform vector', async () => {
    const salt = base64ToUint8Array(CROSS_PLATFORM_VECTOR.saltBase64)
    const iv = base64ToUint8Array(CROSS_PLATFORM_VECTOR.ivBase64)

    const blob = await encryptSnapshotBlob({
      id: CROSS_PLATFORM_VECTOR.id,
      instanceId: CROSS_PLATFORM_VECTOR.instanceId,
      createdAt: CROSS_PLATFORM_VECTOR.createdAt,
      plaintext: CROSS_PLATFORM_VECTOR.plaintext,
      password: CROSS_PLATFORM_VECTOR.password,
      salt,
      iv,
    })

    expect(blob.ciphertext).toBe(CROSS_PLATFORM_VECTOR.ciphertextBase64)
    expect(blob.checksum).toBe(CROSS_PLATFORM_VECTOR.checksum)
    expect(blob.kdf.iterations).toBe(600_000)
    expect(blob.cipher.algorithm).toBe('AES-256-GCM')
  })

  it('decrypts cross-platform vector successfully', async () => {
    const blob = getTestVectorBlob()
    const decrypted = await decryptSnapshotBlob({
      blob,
      password: CROSS_PLATFORM_VECTOR.password,
    })

    expect(decrypted).toBe(CROSS_PLATFORM_VECTOR.plaintext)
  })

  it('roundtrip: encrypts and decrypts arbitrary JSON objects and strings', async () => {
    const original = {
      dns: {
        upstream_dns: ['https://dns.adguard.com/dns-query'],
        bootstrap_dns: ['8.8.8.8'],
      },
      clients: [{ name: 'MacBook Pro', ip: '192.168.1.100' }],
    }

    const blob = await encryptSnapshotBlob({
      id: 'snap-roundtrip-test-01',
      instanceId: 'inst-roundtrip-01',
      createdAt: '2026-10-18T14:20:00.000Z',
      plaintext: original,
      password: 'MyVeryStrongSecretPassword!#123',
    })

    expect(blob.ciphertext).toBeTruthy()
    expect(blob.checksum).toBeTruthy()

    const decrypted = await decryptSnapshotBlobJson<typeof original>({
      blob,
      password: 'MyVeryStrongSecretPassword!#123',
    })

    expect(decrypted).toEqual(original)
  })

  it('rejects decryption when password is incorrect', async () => {
    const blob = getTestVectorBlob()
    await expect(
      decryptSnapshotBlob({
        blob,
        password: 'IncorrectPassword999',
      })
    ).rejects.toThrow(/Decryption failed/i)
  })

  it('rejects decryption when AAD is tampered (forged instanceId)', async () => {
    const blob = getTestVectorBlob()
    blob.instanceId = 'agh-forged-instance-id'

    await expect(
      decryptSnapshotBlob({
        blob,
        password: CROSS_PLATFORM_VECTOR.password,
      })
    ).rejects.toThrow(/Decryption failed/i)
  })

  it('rejects decryption when AAD is tampered (id or createdAt altered)', async () => {
    const blob1 = getTestVectorBlob()
    blob1.id = 'snap-forged-id'
    await expect(
      decryptSnapshotBlob({ blob: blob1, password: CROSS_PLATFORM_VECTOR.password })
    ).rejects.toThrow(/Decryption failed/i)

    const blob2 = getTestVectorBlob()
    blob2.createdAt = '2026-10-18T12:00:01.000Z'
    await expect(
      decryptSnapshotBlob({ blob: blob2, password: CROSS_PLATFORM_VECTOR.password })
    ).rejects.toThrow(/Decryption failed/i)
  })

  it('rejects decryption when ciphertext body is tampered', async () => {
    const blob = getTestVectorBlob()
    const raw = base64ToUint8Array(blob.ciphertext)
    raw[8] ^= 0xff
    blob.ciphertext = uint8ArrayToBase64(raw)

    await expect(
      decryptSnapshotBlob({
        blob,
        password: CROSS_PLATFORM_VECTOR.password,
      })
    ).rejects.toThrow(/Decryption failed/i)
  })

  it('rejects decryption when 16-byte auth tag is tampered', async () => {
    const blob = getTestVectorBlob()
    const raw = base64ToUint8Array(blob.ciphertext)
    // Flip bit in the trailing 16B tag
    raw[raw.length - 1] ^= 0x01
    blob.ciphertext = uint8ArrayToBase64(raw)

    await expect(
      decryptSnapshotBlob({
        blob,
        password: CROSS_PLATFORM_VECTOR.password,
      })
    ).rejects.toThrow(/Decryption failed/i)
  })

  it('rejects decryption when checksum does not match payload', async () => {
    const blob = getTestVectorBlob()
    blob.checksum = '0000000000000000000000000000000000000000000000000000000000000000'

    await expect(
      decryptSnapshotBlob({
        blob,
        password: CROSS_PLATFORM_VECTOR.password,
      })
    ).rejects.toThrow(/Checksum verification failed/i)
  })

  it('rejects decryption when iterations are out of bounds (DoS / downgrade protection)', async () => {
    const blobLow = getTestVectorBlob()
    blobLow.kdf.iterations = 10
    await expect(
      decryptSnapshotBlob({
        blob: blobLow,
        password: CROSS_PLATFORM_VECTOR.password,
      })
    ).rejects.toThrow(/iterations out of bounds/i)

    const blobHigh = getTestVectorBlob()
    blobHigh.kdf.iterations = 10_000_000
    await expect(
      decryptSnapshotBlob({
        blob: blobHigh,
        password: CROSS_PLATFORM_VECTOR.password,
      })
    ).rejects.toThrow(/iterations out of bounds/i)
  })

  it('rejects decryption when algorithms are unsupported', async () => {
    const blobBadKdf = getTestVectorBlob()
    ;(blobBadKdf.kdf as any).algorithm = 'MD5'
    await expect(
      decryptSnapshotBlob({
        blob: blobBadKdf,
        password: CROSS_PLATFORM_VECTOR.password,
      })
    ).rejects.toThrow(/Unsupported KDF algorithm/i)

    const blobBadCipher = getTestVectorBlob()
    ;(blobBadCipher.cipher as any).algorithm = 'DES-ECB'
    await expect(
      decryptSnapshotBlob({
        blob: blobBadCipher,
        password: CROSS_PLATFORM_VECTOR.password,
      })
    ).rejects.toThrow(/Unsupported cipher algorithm/i)
  })

  it('rejects decryption when salt or IV length is invalid', async () => {
    const blobBadSalt = getTestVectorBlob()
    blobBadSalt.kdf.salt = uint8ArrayToBase64(new Uint8Array(8))
    await expect(
      decryptSnapshotBlob({
        blob: blobBadSalt,
        password: CROSS_PLATFORM_VECTOR.password,
      })
    ).rejects.toThrow(/Invalid salt length/i)

    const blobBadIv = getTestVectorBlob()
    blobBadIv.cipher.iv = uint8ArrayToBase64(new Uint8Array(8))
    await expect(
      decryptSnapshotBlob({
        blob: blobBadIv,
        password: CROSS_PLATFORM_VECTOR.password,
      })
    ).rejects.toThrow(/Invalid IV length/i)
  })
})
