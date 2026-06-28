# PL-RFC-003 · Chain Semantics

**Status:** Draft v0.1
**Date:** 2026-06-13

## 1 · Purpose

Define how Receipts for a single tenant form an append-only chain, how
chain state is advanced, and how verifiers detect tampering or
re-ordering.

## 2 · Chain head

For each `tenant_id` an implementation MAINTAINS a `ChainHead`:

```
ChainHead = {
  "tenant_id"        : <string>,
  "chain_height"     : <uint64>,
  "head_hash"        : <hex SHA-256>,
  "updated_at"       : <RFC 3339>
}
```

`chain_height` is a monotonically increasing counter starting at 0 for
an empty chain. `head_hash` is the `receipt_hash` of the most recent
Receipt; the empty string when `chain_height == 0`.

## 3 · Advance procedure

Producing a new Receipt for `tenant_id` proceeds atomically:

```
1. Acquire exclusive lock on ChainHead(tenant_id).
2. prev := ChainHead(tenant_id)
3. body.integrity.previous_receipt_hash = prev.head_hash
4. body.integrity.chain_height          = prev.chain_height + 1
5. body.integrity.receipt_hash          = SHA-256(canonical(body with receipt_hash=""))
6. signature                             = sign(canonical(body))
7. PERSIST receipt
8. ChainHead(tenant_id) := { height = prev.height+1, head = body.integrity.receipt_hash }
9. Release lock.
```

Steps 7 and 8 **MUST** be atomic relative to each other so a crash
between them does not leave a persisted receipt that is not the new
head. The reference implementation uses a row-level lock in Postgres;
the in-memory store uses a process-level mutex.

## 4 · Verification of a chain

Given a sequence of N Receipts `[R₁, R₂, …, R_N]` for `tenant_id`:

- For all `i`, `R_i.integrity.chain_height == i`.
- `R₁.integrity.previous_receipt_hash == ""`.
- For all `i > 1`, `R_i.integrity.previous_receipt_hash == R_{i-1}.integrity.receipt_hash`.
- For all `i`, the Receipt is *valid* per PL-RFC-001 §8.

A verifier that returns "valid" for a sequence violating any condition
is not conformant.

## 5 · Cross-tenant isolation

Implementations **MUST NOT** maintain a single chain across tenants.
Each `tenant_id` has its own `ChainHead`. Cross-tenant attempts to
advance another tenant's chain **MUST** be detected and rejected;
detection is a security event (see PL-RFC-001 §9).

## 6 · Reorganizations and forks

This protocol does **not** support chain reorganizations. A chain is
append-only. A receipt that fails verification **MUST NOT** cause prior
valid receipts to be discarded. If duplicate `chain_height` values
exist for a tenant, the implementation **MUST** treat the lower-`receipt_hash`
candidate as authoritative for archival purposes and flag the
conflict as a P0 security event.

## 7 · Persistence

The reference implementation persists `ChainHead` in two locations:

- Hot path: in-process cache for read performance.
- Durable path: Postgres `pl.chain_heads` row with row-level locking.

Implementations **MAY** use other persistence backends (etcd, DynamoDB,
SQLite, files-on-disk) provided they satisfy the atomicity requirement
in §3.

## 8 · Conformance

An implementation is *CL3-conformant* iff:

- 100 sequential events produce a chain where every receipt's
  `previous_receipt_hash` equals the prior receipt's `receipt_hash`.
- A 101st receipt re-signed from the same inputs produces the same
  `receipt_hash` as the original (determinism).
- Concurrent invocations across multiple processes/threads do not
  produce duplicate `chain_height` values for the same tenant.

## 9 · References

- PL-RFC-001 — Receipt Schema.
- PL-RFC-002 — Canonical Bytes Profile.
