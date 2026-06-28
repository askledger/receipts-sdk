//! Ed25519 + SHA-256 primitives.

use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::Utc;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Compute SHA-256 of bytes, return lowercase hex.
pub fn sha256_hex(b: &[u8]) -> String {
    let h = Sha256::digest(b);
    hex::encode(h)
}

/// Wire-compatible KeyPair (matches TS/Python/Go shape).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyPair {
    pub kid: String,
    pub public_key: String,
    pub private_key: String,
    pub algorithm: String,
    pub curve: String,
    pub created_at: String,
}

pub fn generate_keypair() -> KeyPair {
    let mut csprng = OsRng;
    let sk = SigningKey::generate(&mut csprng);
    let vk = sk.verifying_key();

    // 6-byte kid suffix
    let mut suffix = [0u8; 6];
    use rand_core::RngCore;
    OsRng.fill_bytes(&mut suffix);
    let kid = format!("rs-{}", hex::encode(suffix));

    KeyPair {
        kid,
        public_key: STANDARD.encode(vk.as_bytes()),
        private_key: STANDARD.encode(sk.to_bytes()),
        algorithm: "EdDSA".to_string(),
        curve: "ed25519".to_string(),
        created_at: Utc::now()
            .format("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string(),
    }
}

pub fn sign(payload: &[u8], kp: &KeyPair) -> Result<String, String> {
    let seed = STANDARD
        .decode(&kp.private_key)
        .map_err(|e| format!("private_key decode: {e}"))?;
    if seed.len() != 32 {
        return Err(format!(
            "private_key must decode to 32 bytes (got {})",
            seed.len()
        ));
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&seed);
    let sk = SigningKey::from_bytes(&arr);
    let sig: Signature = sk.sign(payload);
    Ok(STANDARD.encode(sig.to_bytes()))
}

pub fn verify(payload: &[u8], signature_b64: &str, public_key_b64: &str) -> bool {
    let sig = match STANDARD.decode(signature_b64) {
        Ok(v) if v.len() == 64 => {
            let mut a = [0u8; 64];
            a.copy_from_slice(&v);
            Signature::from_bytes(&a)
        }
        _ => return false,
    };
    let pk = match STANDARD.decode(public_key_b64) {
        Ok(v) if v.len() == 32 => {
            let mut a = [0u8; 32];
            a.copy_from_slice(&v);
            match VerifyingKey::from_bytes(&a) {
                Ok(v) => v,
                Err(_) => return false,
            }
        }
        _ => return false,
    };
    pk.verify(payload, &sig).is_ok()
}
