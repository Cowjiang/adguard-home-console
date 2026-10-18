/**
 * End-to-End Encryption (E2EE) module for AdGuard Home Console managed mode.
 * Implements PBKDF2-HMAC-SHA256 (600,000 iterations) and AES-256-GCM AEAD
 * with deterministic AAD binding, running 100% on standard W3C WebCrypto API.
 */

export const PBKDF2_ITERATIONS = 600_000
export const MIN_PBKDF2_ITERATIONS = 100_000
export const MAX_PBKDF2_ITERATIONS = 2_000_000
export const SALT_LEN = 16
export const IV_LEN = 12
export const KEY_LEN = 32
export const TAG_LEN = 16

export interface KdfMeta {
  algorithm: 'PBKDF2-HMAC-SHA256'
  iterations: number
  salt: string // Base64
}

export interface CipherMeta {
  algorithm: 'AES-256-GCM'
  iv: string // Base64
  tagLength: number // 128
}

export interface AadMeta {
  id: string
  instanceId: string
  createdAt: string
}

export interface SnapshotEncryptedBlob {
  id: string
  instanceId: string
  createdAt: string
  version: 1
  kdf: KdfMeta
  cipher: CipherMeta
  ciphertext: string // Base64 (ciphertext + 16-byte auth tag)
  checksum: string // SHA-256 hex of original plaintext
}

export interface EncryptSnapshotParams {
  id: string
  instanceId: string
  createdAt: string
  plaintext: string | Uint8Array | Record<string, unknown>
  password?: string
  key?: CryptoKey
  salt?: Uint8Array
  iv?: Uint8Array
}

export interface DecryptSnapshotParams {
  blob: SnapshotEncryptedBlob
  password?: string
  key?: CryptoKey
}

/**
 * Encodes Uint8Array to standard Base64 string.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, Array.from(chunk))
  }
  return btoa(binary)
}

/**
 * Decodes standard Base64 string to Uint8Array.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Generates cryptographically secure random salt (default 16 bytes).
 */
export function generateSalt(length = SALT_LEN): Uint8Array {
  const salt = new Uint8Array(length)
  crypto.getRandomValues(salt)
  return salt
}

/**
 * Generates cryptographically secure random IV (default 12 bytes).
 */
export function generateIv(length = IV_LEN): Uint8Array {
  const iv = new Uint8Array(length)
  crypto.getRandomValues(iv)
  return iv
}

/**
 * Computes deterministic SHA-256 hex string for string or Uint8Array.
 */
export async function computeSha256(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Deterministically serializes { id, instanceId, createdAt } to UTF-8 bytes for AAD binding.
 * Guarantees exact property order and encoding across TypeScript and Rust.
 */
export function serializeAad(meta: AadMeta): Uint8Array {
  const json = JSON.stringify({
    id: meta.id,
    instanceId: meta.instanceId,
    createdAt: meta.createdAt,
  })
  return new TextEncoder().encode(json)
}

/**
 * Derives a 256-bit AES-GCM CryptoKey from password and salt via PBKDF2-HMAC-SHA256.
 */
export async function deriveMasterKey(
  password: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  if (salt.length !== SALT_LEN) {
    throw new Error(`Invalid salt length: expected ${SALT_LEN}, got ${salt.length}`)
  }
  if (iterations < MIN_PBKDF2_ITERATIONS || iterations > MAX_PBKDF2_ITERATIONS) {
    throw new Error(
      `KDF iterations out of bounds (${MIN_PBKDF2_ITERATIONS}..${MAX_PBKDF2_ITERATIONS}): ${iterations}`
    )
  }

  const encoder = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey', 'deriveBits']
  )

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

/**
 * Derives raw 32-byte key from password and salt (useful for testing or direct byte comparison).
 */
export async function deriveRawKey(
  password: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS
): Promise<Uint8Array> {
  const key = await deriveMasterKey(password, salt, iterations)
  const raw = await crypto.subtle.exportKey('raw', key)
  return new Uint8Array(raw)
}

/**
 * Encrypts snapshot payload or plaintext into a standard SnapshotEncryptedBlob.
 */
export async function encryptSnapshotBlob(
  params: EncryptSnapshotParams
): Promise<SnapshotEncryptedBlob> {
  const { id, instanceId, createdAt, plaintext, password, key, salt, iv } = params

  if (!password && !key) {
    throw new Error('Either password or key must be provided for encryption')
  }

  const saltBytes = salt ?? generateSalt(SALT_LEN)
  if (saltBytes.length !== SALT_LEN) {
    throw new Error(`Invalid salt length: expected ${SALT_LEN}, got ${saltBytes.length}`)
  }

  const ivBytes = iv ?? generateIv(IV_LEN)
  if (ivBytes.length !== IV_LEN) {
    throw new Error(`Invalid IV length: expected ${IV_LEN}, got ${ivBytes.length}`)
  }

  let derivedKey: CryptoKey
  if (key) {
    derivedKey = key
  } else {
    derivedKey = await deriveMasterKey(password!, saltBytes, PBKDF2_ITERATIONS)
  }

  let plaintextBytes: Uint8Array
  if (typeof plaintext === 'string') {
    plaintextBytes = new TextEncoder().encode(plaintext)
  } else if (plaintext instanceof Uint8Array) {
    plaintextBytes = plaintext
  } else {
    plaintextBytes = new TextEncoder().encode(JSON.stringify(plaintext))
  }

  const checksum = await computeSha256(plaintextBytes)
  const aad = serializeAad({ id, instanceId, createdAt })

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes as BufferSource,
      additionalData: aad as BufferSource,
      tagLength: 128,
    },
    derivedKey,
    plaintextBytes as BufferSource
  )

  return {
    id,
    instanceId,
    createdAt,
    version: 1,
    kdf: {
      algorithm: 'PBKDF2-HMAC-SHA256',
      iterations: PBKDF2_ITERATIONS,
      salt: uint8ArrayToBase64(saltBytes),
    },
    cipher: {
      algorithm: 'AES-256-GCM',
      iv: uint8ArrayToBase64(ivBytes),
      tagLength: 128,
    },
    ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertextBuffer)),
    checksum,
  }
}

/**
 * Decrypts a SnapshotEncryptedBlob using password or pre-derived key.
 * Verifies AAD, algorithms, iteration bounds, and SHA-256 checksum, throwing on any tamper or error.
 */
export async function decryptSnapshotBlob(
  params: DecryptSnapshotParams
): Promise<string> {
  const { blob, password, key } = params

  if (!password && !key) {
    throw new Error('Either password or key must be provided for decryption')
  }

  if (blob.kdf.algorithm !== 'PBKDF2-HMAC-SHA256') {
    throw new Error(`Unsupported KDF algorithm: ${blob.kdf.algorithm}`)
  }
  if (blob.cipher.algorithm !== 'AES-256-GCM') {
    throw new Error(`Unsupported cipher algorithm: ${blob.cipher.algorithm}`)
  }
  if (
    blob.kdf.iterations < MIN_PBKDF2_ITERATIONS ||
    blob.kdf.iterations > MAX_PBKDF2_ITERATIONS
  ) {
    throw new Error(
      `KDF iterations out of bounds (${MIN_PBKDF2_ITERATIONS}..${MAX_PBKDF2_ITERATIONS}): ${blob.kdf.iterations}`
    )
  }

  const saltBytes = base64ToUint8Array(blob.kdf.salt)
  if (saltBytes.length !== SALT_LEN) {
    throw new Error(`Invalid salt length: expected ${SALT_LEN}, got ${saltBytes.length}`)
  }

  const ivBytes = base64ToUint8Array(blob.cipher.iv)
  if (ivBytes.length !== IV_LEN) {
    throw new Error(`Invalid IV length: expected ${IV_LEN}, got ${ivBytes.length}`)
  }

  const derivedKey =
    key ?? (await deriveMasterKey(password!, saltBytes, blob.kdf.iterations))

  const ciphertextBytes = base64ToUint8Array(blob.ciphertext)
  const aad = serializeAad({
    id: blob.id,
    instanceId: blob.instanceId,
    createdAt: blob.createdAt,
  })

  let decryptedBuffer: ArrayBuffer
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes as BufferSource,
        additionalData: aad as BufferSource,
        tagLength: blob.cipher.tagLength || 128,
      },
      derivedKey,
      ciphertextBytes as BufferSource
    )
  } catch (_err) {
    throw new Error(
      'Decryption failed: invalid password, corrupted ciphertext, or tampered AAD'
    )
  }

  const decryptedBytes = new Uint8Array(decryptedBuffer)
  const checksum = await computeSha256(decryptedBytes)
  if (checksum !== blob.checksum) {
    throw new Error(
      `Checksum verification failed: expected ${blob.checksum}, got ${checksum}`
    )
  }

  return new TextDecoder().decode(decryptedBytes)
}

/**
 * Decrypts a SnapshotEncryptedBlob and parses the result as JSON.
 */
export async function decryptSnapshotBlobJson<T = unknown>(
  params: DecryptSnapshotParams
): Promise<T> {
  const jsonStr = await decryptSnapshotBlob(params)
  return JSON.parse(jsonStr) as T
}
