# PL-RFC-004 · Transparency Log Binding

**Status:** Draft v0.1
**Date:** 2026-06-13

## 1 · Purpose

Define how AskLedger Receipts are committed to an append-only,
publicly-witnessed transparency log, and how third parties verify
inclusion without trusting any single operator.

## 2 · Underlying primitive

AskLedger adopts **RFC 9162 (Certificate Transparency Version 2.0)**
Merkle log semantics: every entry is hashed into a tip Merkle tree;
the log periodically publishes a Signed Tree Head (STH) signed by the
log operator's key; inclusion proofs are O(log n) Merkle audit paths.

The reference implementation uses Trillian
(`github.com/google/trillian`) as the backing store.

## 3 · Leaf format

A leaf is the SHA-256 of the tuple `(tenant_id || ":" || receipt_hash)`,
encoded as the leaf value. The pair binding prevents collisions across
tenants that happen to produce the same `receipt_hash`.

```
LeafValue = SHA-256( UTF-8( tenant_id + ":" + receipt_hash ) )
```

The original Receipt body is **NOT** stored in the log. The log
provides proof-of-inclusion only; the body resides with the producing
party and is presented to verifiers separately.

## 4 · Signed Tree Head (STH)

```
STH = {
  "tree_size"   : <uint64>,
  "root_hash"   : <hex>,
  "timestamp_ms": <uint64>,
  "signature"   : <base64>,
  "log_id"      : <opaque>
}
```

The log operator **MUST** publish a new STH at least every 5 minutes.
The signature is produced by the log's signing key (Ed25519). The
public key of the log **MUST** be distributed out-of-band (DNS TXT
record, well-known URL, package).

## 5 · STH archive

STHs **MUST** be archived to immutable object storage (e.g. S3 Object
Lock, Azure Blob Immutable, GCS Bucket Lock) for a minimum of **10
years**. This is the artifact regulators inspect.

## 6 · Federation

Implementations **MAY** require a Receipt to be witnessed by `K` of `N`
independent transparency logs. The witness signatures are stored in the
Receipt's `timestamps[]` array (PL-RFC-001 §3). Customers requiring
non-single-operator trust **SHOULD** configure `K >= 2`.

## 7 · Inclusion proof verification

A verifier given (Receipt R, STH S, inclusion proof P) accepts iff:

1. R is *valid* per PL-RFC-001 §8.
2. The leaf hash computed from R per §3 appears in P's leaf position.
3. The Merkle path in P, applied to the leaf hash, reproduces S.root_hash.
4. S.signature verifies against the log's public key.

## 8 · Privacy considerations

- The leaf value is a hash; it reveals no Receipt content.
- The `tenant_id` is mixed into the leaf hash; an attacker observing
  the log cannot enumerate Receipts of a specific tenant without
  knowing the tenant_id first.
- Operators **SHOULD** rate-limit inclusion-proof queries to mitigate
  enumeration attacks.

## 9 · Operational requirements

- Log uptime SLO: ≥ 99.9%.
- STH publish cadence SLA: ≤ 5 min.
- Inclusion-proof endpoint p95 latency: ≤ 300 ms.
- These are monitored via `monitoring/alerts.yml` `pl_tlog_*` rules.

## 10 · References

- RFC 9162 — Certificate Transparency Version 2.0.
- Sigstore Rekor — reference implementation for software-supply-chain.
- `src/transparency-log/trillian-client.ts` — reference client.
