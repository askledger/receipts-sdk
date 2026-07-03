# Architecture · Receipts SDK

A walk-through of how the SDK is structured and why each component exists.

## Layered overview

```
┌──────────────────────────────────────────────────────┐
│  CLI (src/cli.ts)                                    │
│  · keygen / sign / verify / demo                     │
└──────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────┐
│  Public API (src/index.ts)                           │
│  · signReceipt, verifyReceipt, generateKeyPair, ...  │
└──────────────────────────────────────────────────────┘
            │            │            │
            ▼            ▼            ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│ receipt.ts   │ │ verify.ts    │ │ crypto.ts        │
│ (build chain │ │ (check chain │ │ (Ed25519 + SHA)  │
│  + sign)     │ │  + signature)│ │                  │
└──────────────┘ └──────────────┘ └──────────────────┘
            │            │              │
            ▼            ▼              ▼
┌──────────────────────────────────────────────────────┐
│  canonicalize.ts (RFC 8785) + chain.ts (state)       │
└──────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────┐
│  External libraries (audited):                       │
│  · @noble/ed25519                                    │
│  · @noble/hashes                                     │
│  · canonicalize                                      │
└──────────────────────────────────────────────────────┘
```

## File-by-file

### `src/types.ts`

The single source of truth for all TypeScript types used in the SDK. Defines the `Receipt`, `SignedReceipt`, `Event`, `Signature`, `KeyPair`, and `ChainState` interfaces. These types are exported publicly via `src/index.ts`.

### `src/canonicalize.ts`

Wraps the `canonicalize` npm package to produce RFC 8785-compliant byte representations. Exposes `canonicalize(value)` returning a string and `canonicalizeBytes(value)` returning a `Uint8Array`.

This is the foundation — every hash and every signature is computed over the canonical bytes.

### `src/crypto.ts`

The cryptographic primitives:

- **`sha256(bytes)`** — SHA-256 returning lowercase hex
- **`generateKeyPair()`** — Ed25519 keypair generation (32-byte private + 32-byte public)
- **`sign(payload, keypair)`** — Ed25519 sign returning base64
- **`verify(payload, sig, public_key)`** — Ed25519 verify returning boolean

Uses `@noble/ed25519` and `@noble/hashes` — both audited pure-TypeScript libraries.

In production this file would be replaced or augmented to delegate signing to an HSM via PKCS#11. The interface stays the same; the implementation changes.

### `src/chain.ts`

Per-tenant append-only chain state management. In the reference SDK, state is persisted to local JSON files under `.ledger/chains/{tenant_id}.json`. In production this would be a Postgres table with strict row-level security.

The chain tracks:
- `tenant_id`
- `chain_height` (monotonically increasing)
- `previous_receipt_hash`
- `last_receipt_id`
- `updated_at`

### `src/receipt.ts`

The orchestration layer. `signReceipt({event, keypair})` performs the full sign pipeline:

1. Load tenant chain state
2. Build the Receipt body with `receipt_hash` initially set to `""`
3. Canonicalize and hash → populate `receipt_hash`
4. Re-canonicalize the full body → sign
5. Persist updated chain state
6. Return the SignedReceipt envelope

The reason for the two-pass canonicalization is to ensure the `receipt_hash` field itself doesn't change its own hash — we hash with the field empty, then populate it.

### `src/verify.ts`

The verifier. Given a `SignedReceipt`, a map of `kid → public_key`, and optionally a previous receipt for chain-link verification, returns a structured `VerifyResult` with `{valid, checks, errors}`.

Verification is fully independent — no network calls, no server lookups. The verifier only needs the receipt JSON and the public key.

### `src/cli.ts`

Command-line interface wrapping the public API. Provides `keygen`, `sign`, `verify`, and `demo` subcommands. Useful for shell-based integration and demos.

### `src/index.ts`

Public exports. Anything not exported here is internal.

## Key design decisions

### Why a two-pass canonicalization

The `receipt_hash` field is part of the receipt body, so we can't hash the body including `receipt_hash` without circularity. The convention is: set `receipt_hash` to `""`, canonicalize, hash, then populate the field with the hash. Verifiers re-do the same procedure: replace `receipt_hash` with `""`, canonicalize, hash, compare.

### Why per-tenant chains

Different tenants of the same SaaS deployment must not share chain state — otherwise tampering in one tenant breaks verification in unrelated tenants. The chain is logically a per-tenant Merkle linked list.

### Why local JSON files for state

For the reference SDK and the developer-tier playground, local JSON is simple and adequate. Production deployments will use Postgres with row-level security and tenant-bound encryption keys. The interface in `chain.ts` is designed for that swap.

### Why Ed25519 instead of ECDSA P-256 or RSA

Ed25519 is faster (signing in ~70µs), deterministic (no random-nonce reuse vulnerability), and standard across Signal, WireGuard, and Sigstore. ECDSA implementations have historically suffered from random-nonce reuse bugs (Sony PS3, Java SecureRandom). RSA is slower and produces larger signatures.

### Why we re-implement signing rather than depend on JWS libraries

JWS libraries typically support multiple algorithms and bring transitive dependencies. We use only Ed25519, and we're sensitive to dependency surface area for a security-critical library. Direct use of `@noble/ed25519` (single algorithm, audited, zero transitive dependencies for crypto) is cleaner.

## Performance characteristics

| Operation | Time (commodity laptop) |
|---|---|
| `canonicalize` (typical receipt) | 1–5 ms |
| `sha256` (typical canonical bytes) | ~0.1 ms |
| Ed25519 sign | ~70 µs |
| Ed25519 verify | ~250 µs |
| Total `signReceipt` end-to-end | 5–15 ms |
| Total `verifyReceipt` end-to-end | 2–8 ms |

The fundamental cost is canonicalization. The cryptographic operations are negligible by comparison.

## Future architecture

When this SDK migrates to v0.2 + v0.3:

- `crypto.ts` gains an HSM backend (PKCS#11 or AWS CloudHSM)
- `receipt.ts` gains optional RFC 3161 timestamping and Merkle batch commitment
- `chain.ts` gains a PostgreSQL backend (with the local-JSON backend retained for development)
- `verify.ts` gains transparency-log integration for proof-of-inclusion checks
- New files: `merkle.ts`, `transparency-log.ts`, `tsa-client.ts`

The public API in `src/index.ts` will remain stable.
