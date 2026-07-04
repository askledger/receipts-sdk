# AskLedger Receipts — Rust SDK

Wire-format compatible. Cross-verified via shared conformance vectors. Apache-2.0.

> Not yet on crates.io — use the git dependency below.

```toml
[dependencies]
askledger-receipts = { git = "https://github.com/askledger/receipts-sdk", package = "askledger-receipts" }
```

```rust
use askledger_receipts::{generate_keypair, sign_receipt, verify_receipt};
use std::collections::HashMap;

let kp = generate_keypair();
let event = serde_json::json!({
    "schema_version": "1.0",
    "tenant_id": "acme",
    "event_type": "ide.completion",
    "source_system": "vs-code-plugin",
    "event_id": "evt-001",
    "captured_at": "2026-05-13T10:00:00.000Z",
    "subject": { "ai_vendor": "anthropic", "ai_model": "claude-sonnet-4-6" },
    "payload": { "input_classification": "internal", "output_classification": "internal" }
});
let r = sign_receipt(event, &kp).unwrap();
let mut keys = HashMap::new();
keys.insert(kp.kid.clone(), kp.public_key.clone());
let res = verify_receipt(&r, &keys, None);
assert!(res.valid);
```

Spec: [../docs/RECEIPTS_PROTOCOL.md](../docs/RECEIPTS_PROTOCOL.md)
