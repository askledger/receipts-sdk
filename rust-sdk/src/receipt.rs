//! Receipt builder. Wire-format compatible with the TS reference SDK.

use crate::canonicalize::canonicalize_bytes;
use crate::crypto::{sha256_hex, sign as sign_bytes, KeyPair};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

pub const GENESIS_HASH: &str =
    "0000000000000000000000000000000000000000000000000000000000000000";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Signature {
    pub alg: String,
    pub kid: String,
    pub sig: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedReceipt {
    pub receipt: Value,
    pub signatures: Vec<Signature>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChainState {
    tenant_id: String,
    chain_height: i64,
    previous_receipt_hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_receipt_id: Option<String>,
    updated_at: String,
}

fn safe_tenant(t: &str) -> String {
    t.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn chain_path(tenant: &str) -> PathBuf {
    PathBuf::from(".ledger")
        .join("chains")
        .join(format!("{}.json", safe_tenant(tenant)))
}

fn load_chain(tenant: &str) -> ChainState {
    let p = chain_path(tenant);
    if let Ok(bytes) = fs::read(&p) {
        if let Ok(s) = serde_json::from_slice::<ChainState>(&bytes) {
            return s;
        }
    }
    ChainState {
        tenant_id: tenant.to_string(),
        chain_height: 0,
        previous_receipt_hash: GENESIS_HASH.to_string(),
        last_receipt_id: None,
        updated_at: Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
    }
}

fn save_chain(state: &ChainState) -> std::io::Result<()> {
    let p = chain_path(&state.tenant_id);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(state).unwrap();
    fs::write(p, bytes)
}

fn now_iso() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// Build, chain, and sign a receipt for one event.
pub fn sign_receipt(event: Value, kp: &KeyPair) -> Result<SignedReceipt, String> {
    let tenant = event
        .get("tenant_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "event.tenant_id required".to_string())?
        .to_string();

    let prev = load_chain(&tenant);

    let receipt_id = Uuid::now_v7().to_string();
    let mut integrity = Map::new();
    integrity.insert(
        "previous_receipt_hash".to_string(),
        Value::String(prev.previous_receipt_hash.clone()),
    );
    integrity.insert("receipt_hash".to_string(), Value::String(String::new()));
    integrity.insert(
        "chain_height".to_string(),
        Value::Number(serde_json::Number::from(prev.chain_height + 1)),
    );

    let mut receipt = Map::new();
    receipt.insert(
        "schema_version".to_string(),
        Value::String("1.0".to_string()),
    );
    receipt.insert("receipt_id".to_string(), Value::String(receipt_id.clone()));
    receipt.insert("tenant_id".to_string(), Value::String(tenant.clone()));
    receipt.insert("issued_at".to_string(), Value::String(now_iso()));
    receipt.insert("event".to_string(), event);
    receipt.insert("integrity".to_string(), Value::Object(integrity));

    let body = Value::Object(receipt);
    // 1. hash with receipt_hash=""
    let canon = canonicalize_bytes(&body);
    let rhash = sha256_hex(&canon);

    // 2. set receipt_hash
    let mut body_obj = body.as_object().unwrap().clone();
    let integrity_v = body_obj.get_mut("integrity").unwrap();
    if let Value::Object(ref mut m) = integrity_v {
        m.insert("receipt_hash".to_string(), Value::String(rhash.clone()));
    }
    let final_body = Value::Object(body_obj);

    // 3. canonical sign
    let canon_sign = canonicalize_bytes(&final_body);
    let sig = sign_bytes(&canon_sign, kp)?;

    // 4. persist chain
    let _ = save_chain(&ChainState {
        tenant_id: tenant,
        chain_height: prev.chain_height + 1,
        previous_receipt_hash: rhash.clone(),
        last_receipt_id: Some(receipt_id),
        updated_at: now_iso(),
    });

    Ok(SignedReceipt {
        receipt: final_body,
        signatures: vec![Signature {
            alg: "EdDSA".to_string(),
            kid: kp.kid.clone(),
            sig,
        }],
    })
}
