# Conformance test vectors

These vectors are the **wire-format contract** for any language
implementation of the Project Ledger Receipts protocol. Any SDK in any
language must produce identical bytes for the canonicalize and sha256
test vectors, and must verify the pre-signed receipts in this folder
against the public keys provided.

| File | Purpose |
|---|---|
| `canonicalize.json` | Inputs and expected RFC 8785 canonical strings. |
| `sha256.json` | Inputs and expected SHA-256 hex digests. |
| `receipts-valid.json` | Signed receipts that MUST verify VALID. |
| `receipts-tampered.json` | Signed receipts that MUST verify INVALID. |

A new SDK passes conformance if all four vectors pass.
