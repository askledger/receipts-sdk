use askledger_receipts::{
    canonicalize, generate_keypair, sha256_hex, sign_receipt, verify_receipt,
};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;

#[derive(serde::Deserialize)]
struct CanonVec {
    vectors: Vec<CanonItem>,
}
#[derive(serde::Deserialize)]
struct CanonItem {
    name: String,
    input: Value,
    expected: String,
}
#[derive(serde::Deserialize)]
struct ShaVec {
    vectors: Vec<ShaItem>,
}
#[derive(serde::Deserialize)]
struct ShaItem {
    name: String,
    input: String,
    expected_hex: String,
}

#[test]
fn canonicalize_conformance() {
    let bytes = fs::read("../test/conformance/canonicalize.json").unwrap();
    let f: CanonVec = serde_json::from_slice(&bytes).unwrap();
    for v in f.vectors {
        let got = canonicalize(&v.input);
        assert_eq!(got, v.expected, "vector: {}", v.name);
    }
}

#[test]
fn sha256_conformance() {
    let bytes = fs::read("../test/conformance/sha256.json").unwrap();
    let f: ShaVec = serde_json::from_slice(&bytes).unwrap();
    for v in f.vectors {
        let got = sha256_hex(v.input.as_bytes());
        assert_eq!(got, v.expected_hex, "vector: {}", v.name);
    }
}

#[test]
fn sign_verify_roundtrip() {
    let kp = generate_keypair();
    let event = serde_json::json!({
        "schema_version": "1.0",
        "tenant_id": "rs-test",
        "event_type": "ide.completion",
        "source_system": "rs-runner",
        "event_id": "evt-rs-001",
        "captured_at": "2026-05-13T10:00:00.000Z",
        "subject": { "ai_vendor": "anthropic", "ai_model": "claude-sonnet-4-6" },
        "payload": { "input_classification": "internal", "output_classification": "internal" }
    });
    let r = sign_receipt(event, &kp).expect("sign");
    let mut keys = HashMap::new();
    keys.insert(kp.kid.clone(), kp.public_key.clone());
    let res = verify_receipt(&r, &keys, None);
    assert!(res.valid, "errors: {:?}", res.errors);
}
