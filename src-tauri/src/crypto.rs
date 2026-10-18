//! End-to-End Encryption (E2EE) module for AdGuard Home Console managed mode.
//! Implements PBKDF2-HMAC-SHA256 (600,000 iterations) and AES-256-GCM AEAD
//! with deterministic AAD binding, exactly matching the TypeScript WebCrypto engine.

use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Key, Nonce,
};
use base64::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

pub const PBKDF2_ITERATIONS: u32 = 600_000;
pub const MIN_PBKDF2_ITERATIONS: u32 = 100_000;
pub const MAX_PBKDF2_ITERATIONS: u32 = 2_000_000;
pub const SALT_LEN: usize = 16;
pub const IV_LEN: usize = 12;
pub const KEY_LEN: usize = 32;
pub const TAG_LEN: usize = 16;

#[derive(Error, Debug, PartialEq, Eq)]
pub enum CryptoError {
    #[error("Invalid key length: expected {expected}, got {actual}")]
    InvalidKeyLength { expected: usize, actual: usize },
    #[error("Invalid IV length: expected {expected}, got {actual}")]
    InvalidIvLength { expected: usize, actual: usize },
    #[error("Invalid salt length: expected {expected}, got {actual}")]
    InvalidSaltLength { expected: usize, actual: usize },
    #[error("Base64 decode failed: {0}")]
    Base64DecodeError(String),
    #[error("AEAD decryption failed: ciphertext corrupted, wrong password, or AAD mismatch")]
    DecryptionFailed,
    #[error("UTF-8 decode failed: {0}")]
    Utf8Error(String),
    #[error("Checksum mismatch: expected {expected}, got {actual}")]
    ChecksumMismatch { expected: String, actual: String },
    #[error("Unsupported algorithm: {0}")]
    UnsupportedAlgorithm(String),
    #[error("KDF iterations out of bounds ({min}..={max}): got {actual}")]
    InvalidIterations { min: u32, max: u32, actual: u32 },
    #[error("CSPRNG random generation failed: {0}")]
    RngError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KdfMeta {
    pub algorithm: String,
    pub iterations: u32,
    pub salt: String, // Base64
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CipherMeta {
    pub algorithm: String,
    pub iv: String, // Base64
    #[serde(rename = "tagLength")]
    pub tag_length: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AadMeta<'a> {
    pub id: &'a str,
    #[serde(rename = "instanceId")]
    pub instance_id: &'a str,
    #[serde(rename = "createdAt")]
    pub created_at: &'a str,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SnapshotEncryptedBlob {
    pub id: String,
    #[serde(rename = "instanceId")]
    pub instance_id: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub version: u32,
    pub kdf: KdfMeta,
    pub cipher: CipherMeta,
    pub ciphertext: String, // Base64 (ciphertext + 16-byte auth tag)
    pub checksum: String,   // SHA-256 hex
}

/// Generates a cryptographically secure random 16-byte salt using system CSPRNG.
pub fn generate_salt() -> Result<[u8; SALT_LEN], CryptoError> {
    let mut salt = [0u8; SALT_LEN];
    getrandom::getrandom(&mut salt).map_err(|e| CryptoError::RngError(e.to_string()))?;
    Ok(salt)
}

/// Generates a cryptographically secure random 12-byte IV (nonce) using system CSPRNG.
pub fn generate_iv() -> Result<[u8; IV_LEN], CryptoError> {
    let mut iv = [0u8; IV_LEN];
    getrandom::getrandom(&mut iv).map_err(|e| CryptoError::RngError(e.to_string()))?;
    Ok(iv)
}

/// Derives a 32-byte (256-bit) AES key using PBKDF2-HMAC-SHA256.
pub fn derive_key(password: &str, salt: &[u8], iterations: u32) -> [u8; KEY_LEN] {
    let mut derived_key = [0u8; KEY_LEN];
    pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, iterations, &mut derived_key);
    derived_key
}

/// Computes a lowercase hex SHA-256 digest of data.
pub fn compute_sha256(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

/// Deterministically serializes AAD metadata to JSON bytes.
pub fn serialize_aad(id: &str, instance_id: &str, created_at: &str) -> Vec<u8> {
    let meta = AadMeta {
        id,
        instance_id,
        created_at,
    };
    serde_json::to_vec(&meta).expect("AAD serialization cannot fail")
}

/// Encrypts plaintext with AES-256-GCM.
/// Appends 16-byte GCM authentication tag to the end of ciphertext (standard WebCrypto output format).
pub fn encrypt_gcm(
    key: &[u8],
    iv: &[u8],
    plaintext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    if key.len() != KEY_LEN {
        return Err(CryptoError::InvalidKeyLength {
            expected: KEY_LEN,
            actual: key.len(),
        });
    }
    if iv.len() != IV_LEN {
        return Err(CryptoError::InvalidIvLength {
            expected: IV_LEN,
            actual: iv.len(),
        });
    }

    let cipher_key = Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(cipher_key);
    let nonce = Nonce::from_slice(iv);

    let payload = Payload {
        msg: plaintext,
        aad,
    };

    cipher
        .encrypt(nonce, payload)
        .map_err(|_| CryptoError::DecryptionFailed)
}

/// Decrypts AES-256-GCM ciphertext where the last 16 bytes are the authentication tag.
pub fn decrypt_gcm(
    key: &[u8],
    iv: &[u8],
    ciphertext_with_tag: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    if key.len() != KEY_LEN {
        return Err(CryptoError::InvalidKeyLength {
            expected: KEY_LEN,
            actual: key.len(),
        });
    }
    if iv.len() != IV_LEN {
        return Err(CryptoError::InvalidIvLength {
            expected: IV_LEN,
            actual: iv.len(),
        });
    }

    let cipher_key = Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(cipher_key);
    let nonce = Nonce::from_slice(iv);

    let payload = Payload {
        msg: ciphertext_with_tag,
        aad,
    };

    cipher
        .decrypt(nonce, payload)
        .map_err(|_| CryptoError::DecryptionFailed)
}

/// High-level function: Decrypts a `SnapshotEncryptedBlob` with password and verifies AAD & checksum.
pub fn decrypt_snapshot_blob(
    blob: &SnapshotEncryptedBlob,
    password: &str,
) -> Result<String, CryptoError> {
    if blob.kdf.algorithm != "PBKDF2-HMAC-SHA256" {
        return Err(CryptoError::UnsupportedAlgorithm(format!(
            "Unsupported KDF algorithm: {}",
            blob.kdf.algorithm
        )));
    }
    if blob.cipher.algorithm != "AES-256-GCM" {
        return Err(CryptoError::UnsupportedAlgorithm(format!(
            "Unsupported cipher algorithm: {}",
            blob.cipher.algorithm
        )));
    }
    if blob.kdf.iterations < MIN_PBKDF2_ITERATIONS || blob.kdf.iterations > MAX_PBKDF2_ITERATIONS {
        return Err(CryptoError::InvalidIterations {
            min: MIN_PBKDF2_ITERATIONS,
            max: MAX_PBKDF2_ITERATIONS,
            actual: blob.kdf.iterations,
        });
    }

    let salt = BASE64_STANDARD
        .decode(&blob.kdf.salt)
        .map_err(|e| CryptoError::Base64DecodeError(e.to_string()))?;
    if salt.len() != SALT_LEN {
        return Err(CryptoError::InvalidSaltLength {
            expected: SALT_LEN,
            actual: salt.len(),
        });
    }

    let iv = BASE64_STANDARD
        .decode(&blob.cipher.iv)
        .map_err(|e| CryptoError::Base64DecodeError(e.to_string()))?;
    if iv.len() != IV_LEN {
        return Err(CryptoError::InvalidIvLength {
            expected: IV_LEN,
            actual: iv.len(),
        });
    }

    let ciphertext = BASE64_STANDARD
        .decode(&blob.ciphertext)
        .map_err(|e| CryptoError::Base64DecodeError(e.to_string()))?;

    let key = derive_key(password, &salt, blob.kdf.iterations);
    let aad = serialize_aad(&blob.id, &blob.instance_id, &blob.created_at);

    let plaintext_bytes = decrypt_gcm(&key, &iv, &ciphertext, &aad)?;
    let plaintext = String::from_utf8(plaintext_bytes)
        .map_err(|e| CryptoError::Utf8Error(e.to_string()))?;

    let checksum = compute_sha256(plaintext.as_bytes());
    if checksum != blob.checksum {
        return Err(CryptoError::ChecksumMismatch {
            expected: blob.checksum.clone(),
            actual: checksum,
        });
    }

    Ok(plaintext)
}

/// High-level function: Encrypts a plaintext string into a `SnapshotEncryptedBlob`.
/// Uses system CSPRNG if salt or iv are None.
pub fn encrypt_snapshot_blob(
    id: &str,
    instance_id: &str,
    created_at: &str,
    plaintext: &str,
    password: &str,
    salt: Option<&[u8]>,
    iv: Option<&[u8]>,
) -> Result<SnapshotEncryptedBlob, CryptoError> {
    let salt_vec = match salt {
        Some(s) => {
            if s.len() != SALT_LEN {
                return Err(CryptoError::InvalidSaltLength {
                    expected: SALT_LEN,
                    actual: s.len(),
                });
            }
            s.to_vec()
        }
        None => generate_salt()?.to_vec(),
    };
    let iv_vec = match iv {
        Some(v) => {
            if v.len() != IV_LEN {
                return Err(CryptoError::InvalidIvLength {
                    expected: IV_LEN,
                    actual: v.len(),
                });
            }
            v.to_vec()
        }
        None => generate_iv()?.to_vec(),
    };

    let key = derive_key(password, &salt_vec, PBKDF2_ITERATIONS);
    let aad = serialize_aad(id, instance_id, created_at);
    let checksum = compute_sha256(plaintext.as_bytes());

    let ciphertext_bytes = encrypt_gcm(&key, &iv_vec, plaintext.as_bytes(), &aad)?;

    Ok(SnapshotEncryptedBlob {
        id: id.to_string(),
        instance_id: instance_id.to_string(),
        created_at: created_at.to_string(),
        version: 1,
        kdf: KdfMeta {
            algorithm: "PBKDF2-HMAC-SHA256".to_string(),
            iterations: PBKDF2_ITERATIONS,
            salt: BASE64_STANDARD.encode(&salt_vec),
        },
        cipher: CipherMeta {
            algorithm: "AES-256-GCM".to_string(),
            iv: BASE64_STANDARD.encode(&iv_vec),
            tag_length: 128,
        },
        ciphertext: BASE64_STANDARD.encode(&ciphertext_bytes),
        checksum,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_PASSWORD: &str = "SuperSecret@AGH#2026";
    const TEST_ID: &str = "snap-0192e2ee-test-vector-000001";
    const TEST_INSTANCE: &str = "agh-primary-home-lab";
    const TEST_CREATED: &str = "2026-10-18T12:00:00.000Z";
    const TEST_SALT_B64: &str = "AQIDBAUGBwgJCgsMDQ4PEA==";
    const TEST_IV_B64: &str = "obLD1OX2BxgpOktc";
    const TEST_KEY_HEX: &str =
        "8b8783b61c2e9b68464d8ee5239b647c2687e4344cd19a648a0459628355fae9";
    const TEST_CIPHERTEXT_B64: &str = "YNKzO8pggTJuI/F4L/tyZ5OAwLAMJVfj0vDBXc/WsmiWcVnx6ANI8B+x9BGybrlMDhOXAtgWWYqITwnkFG3tRr1Nz/HpOulW45ATOjL++gH6ykVMvg0lwmPZVG+LSFz1fHE=";
    const TEST_PLAINTEXT: &str = "{\"dns\":{\"bootstrap_dns\":[\"1.1.1.1\"],\"upstream_dns\":[\"9.9.9.9\",\"149.112.112.112\"]}}";
    const TEST_CHECKSUM: &str = "26b0e7be4ed91ac5a9016364e10a7b72a7de16b9e1307abec5d79dfb1b969637";

    #[test]
    fn test_csprng_random_generation() {
        let salt1 = generate_salt().expect("salt generation succeeds");
        let salt2 = generate_salt().expect("salt generation succeeds");
        assert_ne!(salt1, salt2, "Two generated salts must not collide");

        let iv1 = generate_iv().expect("iv generation succeeds");
        let iv2 = generate_iv().expect("iv generation succeeds");
        assert_ne!(iv1, iv2, "Two generated IVs must not collide");
    }

    #[test]
    fn test_cross_platform_vector_derivation() {
        let salt = BASE64_STANDARD.decode(TEST_SALT_B64).unwrap();
        let key = derive_key(TEST_PASSWORD, &salt, PBKDF2_ITERATIONS);
        let key_hex = key.iter().map(|b| format!("{:02x}", b)).collect::<String>();
        assert_eq!(key_hex, TEST_KEY_HEX);
    }

    #[test]
    fn test_cross_platform_vector_decrypt_ts_blob() {
        let blob = SnapshotEncryptedBlob {
            id: TEST_ID.to_string(),
            instance_id: TEST_INSTANCE.to_string(),
            created_at: TEST_CREATED.to_string(),
            version: 1,
            kdf: KdfMeta {
                algorithm: "PBKDF2-HMAC-SHA256".to_string(),
                iterations: PBKDF2_ITERATIONS,
                salt: TEST_SALT_B64.to_string(),
            },
            cipher: CipherMeta {
                algorithm: "AES-256-GCM".to_string(),
                iv: TEST_IV_B64.to_string(),
                tag_length: 128,
            },
            ciphertext: TEST_CIPHERTEXT_B64.to_string(),
            checksum: TEST_CHECKSUM.to_string(),
        };

        let decrypted = decrypt_snapshot_blob(&blob, TEST_PASSWORD).unwrap();
        assert_eq!(decrypted, TEST_PLAINTEXT);
    }

    #[test]
    fn test_cross_platform_vector_encrypt_reproducibility() {
        let salt = BASE64_STANDARD.decode(TEST_SALT_B64).unwrap();
        let iv = BASE64_STANDARD.decode(TEST_IV_B64).unwrap();

        let blob = encrypt_snapshot_blob(
            TEST_ID,
            TEST_INSTANCE,
            TEST_CREATED,
            TEST_PLAINTEXT,
            TEST_PASSWORD,
            Some(&salt),
            Some(&iv),
        )
        .unwrap();

        assert_eq!(blob.ciphertext, TEST_CIPHERTEXT_B64);
        assert_eq!(blob.checksum, TEST_CHECKSUM);
    }

    #[test]
    fn test_roundtrip_encryption() {
        let plaintext = "{\"clients\":[{\"name\":\"iPhone\",\"ip\":\"192.168.1.10\"}]}";
        let blob = encrypt_snapshot_blob(
            "snap-100",
            "inst-living-room",
            "2026-10-18T12:05:00Z",
            plaintext,
            "MySecretPassword",
            None,
            None,
        )
        .unwrap();

        let decrypted = decrypt_snapshot_blob(&blob, "MySecretPassword").unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_wrong_password_rejected() {
        let blob = encrypt_snapshot_blob(
            "snap-101",
            "inst-1",
            "2026-10-18T12:05:00Z",
            "secret content",
            "CorrectPassword",
            None,
            None,
        )
        .unwrap();

        let err = decrypt_snapshot_blob(&blob, "WrongPassword").unwrap_err();
        assert_eq!(err, CryptoError::DecryptionFailed);
    }

    #[test]
    fn test_tampered_aad_rejected() {
        let mut blob = encrypt_snapshot_blob(
            "snap-102",
            "inst-original",
            "2026-10-18T12:05:00Z",
            "secret content",
            "Password123",
            None,
            None,
        )
        .unwrap();

        // Tamper instance_id (simulate copy-paste attack)
        blob.instance_id = "inst-attacker".to_string();
        let err = decrypt_snapshot_blob(&blob, "Password123").unwrap_err();
        assert_eq!(err, CryptoError::DecryptionFailed);
    }

    #[test]
    fn test_tampered_ciphertext_rejected() {
        let mut blob = encrypt_snapshot_blob(
            "snap-103",
            "inst-1",
            "2026-10-18T12:05:00Z",
            "secret content",
            "Password123",
            None,
            None,
        )
        .unwrap();

        let mut bytes = BASE64_STANDARD.decode(&blob.ciphertext).unwrap();
        bytes[0] ^= 0x42;
        blob.ciphertext = BASE64_STANDARD.encode(&bytes);

        let err = decrypt_snapshot_blob(&blob, "Password123").unwrap_err();
        assert_eq!(err, CryptoError::DecryptionFailed);
    }

    #[test]
    fn test_tampered_auth_tag_rejected() {
        let mut blob = encrypt_snapshot_blob(
            "snap-104",
            "inst-1",
            "2026-10-18T12:05:00Z",
            "secret content",
            "Password123",
            None,
            None,
        )
        .unwrap();

        let mut bytes = BASE64_STANDARD.decode(&blob.ciphertext).unwrap();
        let last_idx = bytes.len() - 1;
        bytes[last_idx] ^= 0x01;
        blob.ciphertext = BASE64_STANDARD.encode(&bytes);

        let err = decrypt_snapshot_blob(&blob, "Password123").unwrap_err();
        assert_eq!(err, CryptoError::DecryptionFailed);
    }

    #[test]
    fn test_tampered_checksum_rejected() {
        let mut blob = encrypt_snapshot_blob(
            "snap-105",
            "inst-1",
            "2026-10-18T12:05:00Z",
            "secret content",
            "Password123",
            None,
            None,
        )
        .unwrap();

        blob.checksum = "0000000000000000000000000000000000000000000000000000000000000000".to_string();
        let err = decrypt_snapshot_blob(&blob, "Password123").unwrap_err();
        assert!(matches!(err, CryptoError::ChecksumMismatch { .. }));
    }

    #[test]
    fn test_out_of_bounds_iterations_rejected() {
        let mut blob = encrypt_snapshot_blob(
            "snap-106",
            "inst-1",
            "2026-10-18T12:05:00Z",
            "secret content",
            "Password123",
            None,
            None,
        )
        .unwrap();

        blob.kdf.iterations = 10; // Too low
        let err = decrypt_snapshot_blob(&blob, "Password123").unwrap_err();
        assert!(matches!(err, CryptoError::InvalidIterations { .. }));

        blob.kdf.iterations = 10_000_000; // Too high (DoS attempt)
        let err = decrypt_snapshot_blob(&blob, "Password123").unwrap_err();
        assert!(matches!(err, CryptoError::InvalidIterations { .. }));
    }
}
