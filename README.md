# Project Ledger — Receipts SDK

> Cryptographic AI Decision Receipts for enterprise AI.
> RFC 8785 canonical JSON · JWS Ed25519 · per-tenant hash chains · regulator-verifiable.

This is the reference TypeScript implementation of the Project Ledger receipts protocol — the cryptographic substrate that turns scattered AI telemetry into evidence a regulator can verify without trusting any Ledger server.

**Status:** v0.1 · early preview · not for production use yet.

---

## Quick start

```bash
# Clone and install
git clone https://github.com/projectledger/receipts-sdk-ts.git
cd receipts-sdk-ts
npm install
npm run build

# Run the full demo (keygen + sign + verify)
node dist/cli.js demo
```

Expected output:

```
────────────────────────────────────────────────────────────────────────
Project Ledger — Receipts SDK · Demo
────────────────────────────────────────────────────────────────────────

1. Generating Ed25519 keypair…
   kid: dev-3a7c9b2e8f4a

2. Signing a sample AI event…
   receipt_id:   01HXYZ123ABC...
   receipt_hash: 9a4f8e0c2b1d3a6c...
   chain_height: 1

3. Verifying receipt independently (no Ledger server needed)…
   ✓ canonical hash matches
   ✓ Ed25519 signature valid

✓ RECEIPT VALID
```

---

## What this SDK does

Every AI interaction in your enterprise — a Copilot completion, a Claude API call, a Bedrock inference, an MCP tool invocation — should produce a receipt that has these properties:

1. **Canonical** — anyone can compute the exact same bytes from the same input (RFC 8785).
2. **Hashed** — SHA-256 over the canonical bytes proves the receipt has not been altered.
3. **Signed** — Ed25519 signature proves who issued the receipt.
4. **Chained** — each receipt's `previous_receipt_hash` links to the prior receipt in the tenant's chain. Tampering with any historical receipt breaks the chain.
5. **Independent** — a regulator with only the public key and the receipt JSON can verify all of the above cryptographically, with no API call to Ledger.

This SDK provides the primitives for all five properties.

---

## Usage

### Programmatic

```typescript
import {
  generateKeyPair,
  signReceipt,
  verifyReceipt,
} from "@projectledger/receipts-sdk";

// 1. Generate (or load) a keypair
const kp = generateKeyPair();

// 2. Sign an event
const signed = signReceipt({
  event: {
    schema_version: "1.0",
    tenant_id: "tenant-001",
    event_type: "ide.completion",
    source_system: "vs-code-plugin",
    event_id: "evt-123",
    captured_at: new Date().toISOString(),
    subject: {
      ai_vendor: "anthropic",
      ai_model: "claude-sonnet-4-6",
      ai_capability: "code-completion",
    },
  },
  keypair: kp,
});

// 3. Anyone can verify with just the public key
const result = verifyReceipt(signed, {
  publicKeys: { [kp.kid]: kp.public_key },
});

console.log(result.valid); // true
```

### CLI

```bash
# Generate a keypair
node dist/cli.js keygen --out .ledger/keys/default.json

# Sign an event (chains automatically per tenant)
node dist/cli.js sign examples/event.json

# Verify a receipt
node dist/cli.js verify .ledger/last-receipt.json

# Verify with chain link check (against previous receipt)
node dist/cli.js verify .ledger/last-receipt.json --prev .ledger/prev.json

# Full demo cycle
node dist/cli.js demo
```

---

## What a receipt looks like

```json
{
  "receipt": {
    "schema_version": "1.0",
    "receipt_id": "01HXYZ123ABC...",
    "tenant_id": "demo-tenant",
    "issued_at": "2026-05-13T10:30:00.123456789Z",
    "event": {
      "schema_version": "1.0",
      "tenant_id": "demo-tenant",
      "event_type": "ide.completion",
      "source_system": "vs-code-plugin",
      "event_id": "evt-2026-001",
      "captured_at": "2026-05-13T10:30:00.000Z",
      "subject": {
        "ai_vendor": "anthropic",
        "ai_model": "claude-sonnet-4-6"
      }
    },
    "integrity": {
      "previous_receipt_hash": "0000...0000",
      "receipt_hash": "9a4f8e0c2b1d3a6c...",
      "chain_height": 1
    }
  },
  "signatures": [
    {
      "alg": "EdDSA",
      "kid": "dev-3a7c9b2e8f4a",
      "sig": "base64-encoded-Ed25519-signature..."
    }
  ]
}
```

---

## Architecture

This SDK implements **Plane 5** of the Project Ledger 8-plane architecture. The full architecture covers:

```
Plane 8 · Console
Plane 7 · Integration (IDE plugins, GitHub, CI/CD)
Plane 6 · Evidence (regulator framework mappers)
★ Plane 5 · Records (this SDK) ★
Plane 4 · Decision · Plane 3 · Policy
Plane 2 · Telemetry Ingest
Plane 1 · Identity & Tenant (foundation)
```

For the full technical architecture, see Project Ledger Technical Architecture v0.2 (NDA required).

---

## Cryptographic choices

| Layer | Choice | Rationale |
|---|---|---|
| Canonicalization | RFC 8785 (JCS) | Deterministic JSON byte representation — the foundational requirement for independent verification |
| Hashing | SHA-256 | Standard, widely-supported, well-understood security margin |
| Signing | Ed25519 (EdDSA) | Fast, deterministic, audited, used by Signal, WireGuard, Sigstore. Quantum-vulnerable in 10+ years; we plan a hybrid Ed25519 + Dilithium scheme for v2. |
| Encoding | base64 standard | Cross-platform, RFC 4648 |
| ID generation | UUIDv7 | Sortable, embedded timestamp |

Implementation libraries:
- [`@noble/ed25519`](https://github.com/paulmillr/noble-ed25519) — audited pure-TS Ed25519
- [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) — audited hashing
- [`canonicalize`](https://www.npmjs.com/package/canonicalize) — RFC 8785 implementation

---

## What's not in v0.1 (planned for v0.2)

- RFC 3161 timestamping via independent TSAs (DigiCert + FreeTSA)
- Merkle commitments published to a transparency log
- HSM integration (AWS CloudHSM, Azure Dedicated HSM, PKCS#11)
- Customer-managed-key (CMK) support
- Multi-signer support (Ledger + customer-supplied KMS)
- gRPC + REST receipt collector reference implementation
- Rust reference verifier

These are deliberately out of scope for v0.1. The goal of v0.1 is to demonstrate the core protocol end-to-end with a single signer.

---

## Project status

This is the reference implementation of the Project Ledger receipts protocol — currently in early preview, ahead of the full open-spec submission to **Linux Foundation AI** (target: Year 2).

**Built by Rashed Ali Khan & Mahamed Arif.**

Confidential pre-publication artifact. Distribute under NDA only until v1.0 launch.

---

## License

Apache-2.0.

The open-source license is deliberate: receipts are the moat through adoption, not lock-in. Our commercial layer (verifier model, regulator portal, evidence packs, vendor benchmark data) is proprietary; the protocol substrate is open.
