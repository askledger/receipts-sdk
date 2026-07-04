//! Independent receipt verifier.

use crate::canonicalize::canonicalize_bytes;
use crate::crypto::{sha256_hex, verify as verify_sig};
use crate::receipt::{SignedReceipt, GENESIS_HASH};
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
    let integrity = signed.receipt.get("integrity");
    // chain_height must be a positive integer (>= 1). A non-integer or a
    // non-integral JSON number leaves `height` as None -> reported invalid.
    let height: Option<i64> = integrity
        .and_then(|i| i.get("chain_height"))
        .and_then(Value::as_i64);
    let prev_hash_claim = integrity
        .and_then(|i| i.get("previous_receipt_hash"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match height {
        Some(h) if h >= 1 => {
            if let Some(prev) = previous_receipt {
                let prev_hash = prev
                    .receipt
                    .get("integrity")
                    .and_then(|i| i.get("receipt_hash"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let prev_height = prev
                    .receipt
                    .get("integrity")
                    .and_then(|i| i.get("chain_height"))
                    .and_then(Value::as_i64)
                    .unwrap_or(0);
                let link_ok = prev_hash == prev_hash_claim;
                let height_ok = h == prev_height + 1;
                result.chain_link_valid = Some(link_ok && height_ok);
                if !link_ok {
                    result.errors.push(format!(
                        "Chain link broken: previous_receipt_hash {prev_hash_claim} \
                         does not match previous receipt's receipt_hash {prev_hash}"
                    ));
                }
                if !height_ok {
                    result.errors.push(format!(
                        "Chain height not contiguous: expected {}, got {h}",
                        prev_height + 1
                    ));
                }
            } else if h == 1 || prev_hash_claim == GENESIS_HASH {
                // Genesis reference and chain_height 1 must agree.
                let genesis_ok = h == 1 && prev_hash_claim == GENESIS_HASH;
                result.chain_link_valid = Some(genesis_ok);
                if !genesis_ok {
                    result.errors.push(format!(
                        "Genesis inconsistency: chain_height {h} with \
                         previous_receipt_hash {prev_hash_claim} (chain_height 1 \
                         must reference GENESIS_HASH, and vice-versa)"
                    ));
                }
            }
            // else: mid-chain (height > 1) without predecessor -> leave
            // chain_link_valid as None: position not attested, but not failed.
        }
        _ => {
            // chain_height missing, non-integral, or < 1.
            result.chain_link_valid = Some(false);
            result.errors.push(format!(
                "Invalid chain_height: {}",
                integrity
                    .and_then(|i| i.get("chain_height"))
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "null".to_string())
            ));
        }
    }

    let chain_ok = result.chain_link_valid.unwrap_or(true);
    result.valid = result.canonical_hash_matches && result.signature_valid && chain_ok;
    result
}
