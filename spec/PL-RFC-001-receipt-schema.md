# PL-RFC-001 · Receipt Schema

**Status:** Draft v0.1
**Editor:** Project Ledger Working Group
**Date:** 2026-06-13
**Supersedes:** none

## 1 · Abstract

This document specifies the wire-format and semantics of an AI Decision
Receipt — the cryptographically signed record produced by a Project
Ledger implementation in response to an AI invocation. A Receipt
captures the actor, the action, the model, the decision applied, the
chain linkage to the preceding receipt for the same tenant, and the
signature over the canonical bytes of the receipt body.

## 2 · Terminology

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and
**MAY** are to be interpreted as described in BCP 14 (RFC 2119) when
they appear in all capitals.

## 3 · Top-level structure

A `SignedReceipt` is a JSON object with the following members:

```
SignedReceipt = {
  "receipt"    : Receipt,            ; the body
  "signatures" : [ Signature, ... ], ; >= 1 entries
  "timestamps" : [ TimestampToken, ... ] OPTIONAL
}
```

A `Receipt` has the following members:

```
Receipt = {
  "schema_version" : "1.0",
  "receipt_id"     : <UUIDv7 hex>,
  "tenant_id"      : <opaque string>,
  "issued_at"      : <RFC 3339 timestamp>,
  "event"          : RawEvent,
  "decision"       : DecisionBlock OPTIONAL,
  "provenance"     : ProvenanceBlock OPTIONAL,
  "integrity"      : IntegrityBlock
}
```

Field-by-field semantics are normative; field-order is not (see PL-RFC-002).

## 4 · RawEvent

```
RawEvent = {
  "schema_version" : "1.0",
  "tenant_id"      : <string>,
  "event_type"     : <string>,       ; e.g. "ai.model_invocation"
  "source_system"  : <string>,
  "event_id"       : <opaque>,
  "captured_at"    : <RFC 3339>,
  "context"        : EventContext OPTIONAL,
  "subject"        : EventSubject OPTIONAL,
  "payload"        : EventPayload OPTIONAL,
  "lineage"        : EventLineage OPTIONAL
}
```

`EventContext` carries the actor identity (user_id, session_id),
environment, and correlation/trace ids. `EventSubject` carries the AI
vendor + model identifiers. `EventPayload` carries hashes of input and
output (NEVER plaintext PII), token counts, and per-call metadata.

Implementations **MUST NOT** include plaintext PII in any Receipt field.
PII redaction **MUST** occur before canonicalization (PL-RFC-002).

## 5 · Signature envelope

Default algorithm: `EdDSA` over the curve `Ed25519` (RFC 8037).
FIPS-mode implementations **MAY** use `ES256` (ECDSA P-256 / SHA-256) as
permitted by FIPS 186-5.

```
Signature = {
  "alg" : "EdDSA" | "ES256",
  "kid" : <key identifier>,
  "sig" : <base64-standard signature>
}
```

The signature is computed over the canonical bytes (PL-RFC-002) of the
`Receipt` object **with `integrity.receipt_hash` populated**. Verifiers
**MUST** recompute the canonical bytes and verify the signature against
the public key identified by `kid`.

## 6 · IntegrityBlock

```
IntegrityBlock = {
  "previous_receipt_hash" : <hex-encoded SHA-256 | "">,
  "receipt_hash"          : <hex-encoded SHA-256>,
  "chain_height"          : <unsigned int>,
  "merkle_period"         : <opaque> OPTIONAL
}
```

`receipt_hash` is the SHA-256 of the canonical bytes of the Receipt with
`receipt_hash` set to the empty string. `previous_receipt_hash` is the
`receipt_hash` of the immediately preceding Receipt for the same
`tenant_id`. Chain semantics are specified in PL-RFC-003.

## 7 · Decision and Provenance blocks

```
DecisionBlock = {
  "policy_bundle_hash" : <hex-encoded SHA-256>,
  "applied_policies"   : [ <policy_id>, ... ],
  "decision"           : "allow" | "block" | "flag" | "review",
  "reason_codes"       : [ <code>, ... ]
}

ProvenanceBlock = {
  "ingest_pipeline"      : <string>,
  "transformation_chain" : [ <string>, ... ],
  "policy_engine_kid"    : <kid>
}
```

These blocks are OPTIONAL. When present they **MUST** be canonicalized
and included in the signature input.

## 8 · Validation rules

A receipt is *valid* iff all of the following hold:

1. The receipt parses as a `SignedReceipt`.
2. All required fields are present and well-formed.
3. `integrity.receipt_hash` equals SHA-256 of the canonical bytes of the
   Receipt with `receipt_hash` set to `""`.
4. At least one entry in `signatures` verifies against a public key
   identified by its `kid` over the canonical bytes of the Receipt.
5. If chain validation is requested, `integrity.previous_receipt_hash`
   equals the `receipt_hash` of the immediately preceding Receipt for
   the same `tenant_id`.

A verifier that returns "valid" without satisfying conditions 1-4 is
not conformant (see [conformance](../conformance/)).

## 9 · Security considerations

- Implementations **MUST NOT** include private key material in any Receipt.
- Implementations **MUST** use a cryptographically secure RNG for key generation (e.g. `crypto.randomBytes`, `secrets.token_bytes`, `crypto/rand.Reader`).
- The receipt body is the persistent record; the signature is the proof. Tampering with the body invalidates the signature; tampering with the signature is detected by signature verification.
- Receipts **MUST** be considered public records. Confidentiality of inputs/outputs is achieved by hashing or omission, not encryption.

## 10 · References

- RFC 2119 — Key words for use in RFCs.
- RFC 3339 — Date and Time on the Internet.
- RFC 8037 — CFRG ECDH and EdDSA in JWS.
- RFC 8785 — JSON Canonicalization Scheme.
- RFC 9162 — Certificate Transparency Version 2.0.
- PL-RFC-002 — Canonical Bytes Profile.
- PL-RFC-003 — Chain Semantics.
- FIPS 186-5 — Digital Signature Standard.

## 11 · Changelog

- v0.1 (2026-06-13) — Initial public draft.
