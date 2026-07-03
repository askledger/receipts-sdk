//! Independent receipt verifier.

use crate::canonicalize::canonicalize_bytes;
use crate::crypto::{sha256_hex, verify as verify_sig};
use crate::receipt::SignedReceipt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct VerifyResult {
    pub valid: bool,
    pub canonical_hash_matches: bool,
    pub signature_valid: bool,
    pub chain_link_valid: Option<bool>,
    pub errors: Vec<String>,
}

pub fn verify_receipt(
    signed: &SignedReceipt,
    public_keys: &HashMap<String, String>,
    previous_receipt: Option<&SignedReceipt>,
) -> VerifyResult {
    let mut result = VerifyResult::default();

    // 0. structural guard: `integrity` must be present and an object.
    //    Mirror the hardened Go/Java behavior — bail out early as invalid.
    if signed
        .receipt
        .get("integrity")
        .and_then(Value::as_object)
        .is_none()
    {
        result
            .errors
            .push("integrity block missing or not an object".to_string());
        result.valid = false;
        return result;
    }

    // 1. recompute receipt_hash
    let mut body = signed.receipt.clone();
    if let Some(integrity) = body.get_mut("integrity").and_then(Value::as_object_mut) {
        integrity.insert("receipt_hash".to_string(), Value::String(String::new()));
    }
    let expected = sha256_hex(&canonicalize_bytes(&body));
    let got = signed
        .receipt
        .get("integrity")
        .and_then(|i| i.get("receipt_hash"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if expected == got {
        result.canonical_hash_matches = true;
    } else {
        result.errors.push(format!(
            "canonical hash mismatch: expected {expected}, got {got}"
        ));
    }

    // 2. signatures
    let canon_sign = canonicalize_bytes(&signed.receipt);
    let mut any = false;
    for s in &signed.signatures {
        // Defense-in-depth: reject any signature whose alg is not exactly
        // "EdDSA" before running Ed25519 verification (spec §3).
        if s.alg != "EdDSA" {
            result
                .errors
                .push(format!("unsupported signature alg={} for kid={}", s.alg, s.kid));
            continue;
        }
        match public_keys.get(&s.kid) {
            Some(pk) => {
                if verify_sig(&canon_sign, &s.sig, pk) {
                    any = true;
                } else {
                    result.errors.push(format!("signature invalid for kid={}", s.kid));
                }
            }
            None => {
                result.errors.push(format!("no public key for kid={}", s.kid));
            }
        }
    }
    result.signature_valid = any;

    // 3. chain link
    if let Some(prev) = previous_receipt {
        let prev_hash = prev
            .receipt
            .get("integrity")
            .and_then(|i| i.get("receipt_hash"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let this_prev = signed
            .receipt
            .get("integrity")
            .and_then(|i| i.get("previous_receipt_hash"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let ok = prev_hash == this_prev;
        result.chain_link_valid = Some(ok);
        if !ok {
            result.errors.push("chain link broken".to_string());
        }
    }

    let chain_ok = result.chain_link_valid.unwrap_or(true);
    result.valid = result.canonical_hash_matches && result.signature_valid && chain_ok;
    result
}
