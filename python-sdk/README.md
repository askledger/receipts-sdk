# Project Ledger Receipts — Python SDK

Wire-format-compatible Python SDK for [Project Ledger Receipts](../README.md). Receipts signed by this SDK verify with the TypeScript reference SDK and vice versa. Cross-language conformance is enforced via shared test vectors in [`../test/conformance/`](../test/conformance/).

## Install

```bash
pip install projectledger-receipts
```

## Quick start

```python
from projectledger.receipts import sign_receipt, verify_receipt, generate_keypair

kp = generate_keypair()
event = {
    "schema_version": "1.0",
    "tenant_id": "demo",
    "event_type": "ide.completion",
    "source_system": "py-demo",
    "event_id": "evt-001",
    "captured_at": "2026-05-13T10:00:00.000Z",
    "subject": {"ai_vendor": "anthropic", "ai_model": "claude-sonnet-4-6"},
    "payload": {"input_classification": "internal", "output_classification": "internal"},
}
signed = sign_receipt(event, kp)
print(verify_receipt(signed, {kp["kid"]: kp["public_key"]}).valid)  # True
```

## Spec

See the [Receipts Protocol Spec](../docs/RECEIPTS_PROTOCOL.md).

## License

Apache-2.0
