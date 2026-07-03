# AI Decision Receipt Protocol Specification

**Version:** 0.1 (draft)
**Status:** Open for public review · subject to change before v1.0
**Editors:** AskLedger
**Authors of source implementation:** see [CONTRIBUTORS](../CONTRIBUTORS.md)

---

## Abstract

This document specifies the AI Decision Receipt Protocol — a cryptographic envelope format for recording AI runtime activity in a tamper-evident, hash-chained, third-party-verifiable manner. The protocol is designed to be the substrate that turns scattered AI telemetry into evidence regulated enterprises can present to auditors, regulators, and insurers.

This is **not** a competing standard to Sigstore, in-toto, SLSA, or OWASP AIBOM. It composes with them: those standards address build-time, model-identity, and dependency-graph attestation; this protocol addresses AI runtime decision and execution attestation.

---

## 1. Status of this document

This specification is at **early-preview maturity**. The schema, signature scheme, and verification rules described here are implemented in the reference implementation [@askledger/receipts-sdk](https://github.com/askledger/receipts-sdk). Breaking changes are possible between minor versions before v1.0.

The protocol is intended for submission to the **Linux Foundation AI &amp; Data Foundation** as a hosted standard, targeted for Year 2 (2027).

---

## 2. Terminology

The key words "MUST," "MUST NOT," "REQUIRED," "SHALL," "SHALL NOT," "SHOULD," "SHOULD NOT," "RECOMMENDED," "MAY," and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

**Receipt** — a signed, hash-chained record of a single AI event.

**Event** — a structured description of an AI runtime occurrence (a prompt sent, a response received, a decision made, a tool invoked, etc.).

**Issuer** — the entity producing receipts. Typically the enterprise or its agent.

**Verifier** — any party (regulator, auditor, customer, third-party service) that holds the public key and verifies receipts independently.

**Tenant** — a logical grouping under which receipts share an append-only chain.

**Canonical form** — the deterministic byte representation of a JSON value per [RFC 8785](https://datatracker.ietf.org/doc/html/rfc8785).

---

## 3. Protocol overview

A receipt is a signed envelope of the form:

```
SignedReceipt {
  receipt: Receipt,
  signatures: Signature[],
  timestamps: TimestampToken[]?
}
```

The protocol guarantees four properties:

1. **Canonical hashability** — any two compliant implementations produce identical hashes from identical inputs (via RFC 8785).
2. **Cryptographic non-repudiation** — Ed25519 signatures bind the receipt to a specific signing key.
3. **Tamper evidence on the chain** — each receipt references the SHA-256 of the prior receipt in its tenant; modification of any historical receipt breaks every subsequent receipt's verification.
4. **Third-party verifiability** — given only the public key and the receipt JSON, any verifier can establish properties 1–3 with no API call to the issuer.

---

## 4. Receipt schema

A `Receipt` is a JSON object with the following fields. Implementations MUST emit these fields and MUST reject receipts that do not include the REQUIRED fields.

### 4.1 Top-level fields

| Field | Type | Required | Description |
|---|---|---|---|
| `schema_version` | string | MUST | Currently `"1.0"`. Implementations MUST reject unknown values. |
| `receipt_id` | string | MUST | UUIDv7 (RFC 9562 sect. 5.7). |
| `tenant_id` | string | MUST | Opaque tenant identifier. SHOULD be a UUID or other globally-unique identifier. |
| `issued_at` | string | MUST | RFC 3339 with at least millisecond precision. |
| `event` | object | MUST | The Event block (Section 4.2). |
| `decision` | object | MAY | The Decision block (Section 4.3) — present for receipts produced by policy decisions. |
| `provenance` | object | MAY | The Provenance block (Section 4.4) — present for receipts that link to parents in a workflow. |
| `integrity` | object | MUST | The Integrity block (Section 4.5). |

### 4.2 Event block

| Field | Type | Required | Description |
|---|---|---|---|
| `schema_version` | string | MUST | Currently `"1.0"`. |
| `tenant_id` | string | MUST | MUST match the parent `tenant_id`. |
| `event_type` | string | MUST | A dotted identifier like `ide.completion`, `gateway.request`, `agent.tool_call`. |
| `source_system` | string | MUST | The originating system (e.g. `vs-code-plugin`, `portkey-gateway`). |
| `event_id` | string | MUST | Opaque identifier unique within tenant. |
| `captured_at` | string | MUST | RFC 3339 timestamp from the capture source. |
| `context` | object | MAY | Context block (Section 4.2.1). |
| `subject` | object | MAY | Subject block (Section 4.2.2). |
| `payload` | object | MAY | Payload block (Section 4.2.3). |
| `lineage` | object | MAY | Lineage block (Section 4.2.4). |

#### 4.2.1 Context

| Field | Type | Description |
|---|---|---|
| `user_id` | string | The human user identifier (SHOULD be an IdP `sub`). |
| `session_id` | string | Session identifier. |
| `service_id` | string | Service workload identifier (SHOULD be a SPIFFE ID). |
| `environment` | enum | `production`, `staging`, `development`. |
| `region` | string | Deployment region. |
| `correlation_id` | string | OpenTelemetry-compatible trace ID. |

#### 4.2.2 Subject — describes the AI system being invoked

| Field | Type | Description |
|---|---|---|
| `ai_vendor` | string | e.g. `anthropic`, `openai`, `google`, `bedrock`, `local`. |
| `ai_model` | string | e.g. `claude-sonnet-4-6`. |
| `ai_provider` | string | e.g. `direct`, `gateway:portkey`. |
| `ai_capability` | string | e.g. `text-generation`, `code-completion`, `embedding`. |

#### 4.2.3 Payload — describes the data flowing through the AI system

| Field | Type | Description |
|---|---|---|
| `input_hash` | string | SHA-256 hex of canonical input bytes. |
| `input_classification` | enum | `public`, `internal`, `pii`, `pii_redacted`, `pci`, `mnpi`. |
| `input_size_bytes` | number | Length of canonical input. |
| `input_token_count` | number | Tokens consumed (issuer-specific definition). |
| `output_hash` | string | SHA-256 hex of canonical output bytes. |
| `output_classification` | enum | Same enum as input. |
| `tool_calls` | array | List of tool invocations during the event. |
| `retrieval_refs` | array | RAG retrieval references. |
| `metadata` | object | Open-ended issuer-specific fields. |

#### 4.2.4 Lineage

| Field | Type | Description |
|---|---|---|
| `parent_event_ids` | string[] | Parent events. |
| `workflow_id` | string | Workflow identifier. |
| `trace_id` | string | OTel trace correlation. |

### 4.3 Decision block

For receipts produced by a policy evaluation:

| Field | Type | Required | Description |
|---|---|---|---|
| `policy_bundle_hash` | string | MUST | SHA-256 hex of the canonical bytes of the policy bundle in effect. |
| `applied_policies` | string[] | MUST | List of policy identifiers evaluated. |
| `decision` | enum | MUST | `allow`, `block`, `flag`, `require-approval`. |
| `reason_codes` | string[] | MAY | Machine-readable reason codes. |

### 4.4 Provenance block

| Field | Type | Description |
|---|---|---|
| `parent_receipt_ids` | string[] | Receipts that contributed to this one. |
| `workflow_id` | string | Workflow grouping. |
| `lineage_root` | string | Root receipt of the workflow. |

### 4.5 Integrity block — the cryptographic substrate

| Field | Type | Required | Description |
|---|---|---|---|
| `previous_receipt_hash` | string | MUST | SHA-256 hex of the previous receipt's canonical bytes (see Section 5.2). For the first receipt in a tenant's chain, MUST be the all-zero string (`"0000...0000"`, 64 hex chars). |
| `receipt_hash` | string | MUST | SHA-256 hex of this receipt's canonical bytes with `receipt_hash` set to the empty string (see Section 5.1). |
| `chain_height` | number | MUST | Monotonically increasing position in the tenant's chain. The first receipt MUST have `chain_height: 1`. |
| `merkle_period` | string | MAY | Identifier of a Merkle commitment batch (planned for v0.2). |

---

## 5. Hashing and signing

### 5.1 Computing `receipt_hash`

Issuers MUST compute `receipt_hash` as follows:

1. Construct the Receipt object with `integrity.receipt_hash` set to the empty string (`""`).
2. Canonicalize the object per RFC 8785.
3. Compute SHA-256 of the canonical bytes.
4. Encode as lowercase hex.
5. Set `integrity.receipt_hash` to the resulting value.

### 5.2 Computing `previous_receipt_hash`

The `previous_receipt_hash` is computed identically to `receipt_hash` — but it is the value present in the immediately preceding receipt in the same tenant's chain.

### 5.3 Signing

Issuers MUST sign the receipt as follows:

1. After populating `receipt_hash`, canonicalize the full Receipt body per RFC 8785.
2. Sign the canonical bytes using Ed25519 (RFC 8032).
3. Encode the signature in base64 (RFC 4648 §4 standard encoding).
4. Place the signature in the `signatures[]` array of the `SignedReceipt` envelope.

### 5.4 Signature object

```
Signature {
  alg: "EdDSA",
  kid: string,    // key identifier
  sig: string     // base64-encoded 64-byte Ed25519 signature
}
```

Receipts MAY carry multiple signatures (issuer + customer-managed-key + co-signer). Verifiers MUST verify at least one valid signature against a trusted public key.

---

## 6. Verification

A verifier given a SignedReceipt and a map of `kid → public_key` MUST perform the following checks. The receipt is VALID if and only if all REQUIRED checks pass.

| # | Check | Required |
|---|---|---|
| 1 | `receipt.schema_version` is `"1.0"` | MUST |
| 2 | `integrity.receipt_hash` matches the recomputed value per Section 5.1 | MUST |
| 3 | At least one `signature` in `signatures[]` verifies against a known public key | MUST |
| 4 | If a previous SignedReceipt is provided, `integrity.previous_receipt_hash` matches that receipt's `integrity.receipt_hash` | SHOULD (when chain check is required) |
| 5 | `chain_height` is monotonically increasing relative to the previous receipt | SHOULD |
| 6 | Optional timestamp tokens, if present, validate per their respective protocols (RFC 3161 etc.) | MAY (when timestamps are present) |

---

## 7. Optional extensions

### 7.1 RFC 3161 timestamping (planned for v0.2)

Issuers MAY include `TimestampToken[]` entries on the SignedReceipt:

```
TimestampToken {
  tsa: string,                  // TSA identifier
  timestamp_token: string       // base64-encoded RFC 3161 TST
}
```

When present, verifiers MUST validate the TST signature against the TSA's public certificate.

### 7.2 Merkle batch commitments (planned for v0.2)

Receipts MAY reference a Merkle batch they belong to via `integrity.merkle_period`. The issuer SHALL publish the Merkle root to a transparency log (Sigstore Rekor-compatible).

### 7.3 Multi-signature for customer-managed keys (planned for v0.3)

Tenants MAY require a second signature on every receipt from a customer-controlled key. The verifier SHALL require all required signatures to be valid.

---

## 8. Security considerations

**Key compromise.** If a signing private key is compromised, all subsequently signed receipts SHOULD be considered tainted. Issuers SHOULD use HSM-backed keys (FIPS 140-3 Level 3 or higher) in production. The local-file key storage in the reference SDK is for development only.

**Replay.** Receipts include `event_id` and `chain_height`; verifiers can detect replay within a tenant. Cross-tenant replay is prevented by `tenant_id` binding.

**Side-channel attacks.** Issuers SHOULD use constant-time Ed25519 implementations to avoid timing oracles.

**Hash-chain truncation.** A malicious issuer could attempt to truncate or suppress historical receipts. Mitigations: periodic Merkle root publication to a public transparency log (planned for v0.2), out-of-band chain attestations to customers, customer-side independent storage.

**Quantum threat.** Ed25519 is not quantum-safe. A hybrid signature scheme (Ed25519 + Dilithium) is planned for v2.0 of this specification.

---

## 9. Relationship to other standards

| Standard | Relationship |
|---|---|
| [RFC 8785](https://datatracker.ietf.org/doc/html/rfc8785) JCS | This protocol uses RFC 8785 as the canonical form for hashing and signing. |
| [RFC 8032](https://datatracker.ietf.org/doc/html/rfc8032) EdDSA | This protocol uses Ed25519 from RFC 8032 as the signing algorithm. |
| [RFC 7515](https://datatracker.ietf.org/doc/html/rfc7515) JWS | Receipt signatures are structured similarly to JWS detached signatures. |
| [RFC 3161](https://datatracker.ietf.org/doc/html/rfc3161) TSP | Optional RFC 3161 timestamps may be carried alongside receipts. |
| [Sigstore Model Signing (OMS)](https://github.com/sigstore/model-transparency) | Receipts MAY reference an OMS-signed model artifact in `event.subject.ai_model`. |
| [in-toto / SLSA](https://slsa.dev/) | Receipts complement build-time attestations with runtime attestations. |
| [OpenTelemetry GenAI](https://opentelemetry.io/docs/specs/semconv/gen-ai/) | Event fields are designed to align with OTel GenAI semantic conventions. |
| [OWASP AIBOM](https://owaspaibom.org/) | Receipts populate the runtime portion of an AIBOM. |
| [SPIFFE / SPIRE](https://spiffe.io/) | Receipts SHOULD reference workload SPIFFE IDs in `event.context.service_id`. |

---

## 10. Future direction

- **v0.2 (Q3 2026):** RFC 3161 timestamping, Merkle batch commitments, transparency log integration, Rust + Python SDKs.
- **v0.3 (Q1 2027):** Customer-managed keys, more language SDKs, conformance test suite.
- **v1.0 (target Year 2 of AskLedger):** Stable wire format, Linux Foundation AI hosted, third-party verifier ecosystem.

---

## 11. References

- RFC 2119 — Key words for use in RFCs
- RFC 3161 — Time-Stamp Protocol
- RFC 4648 — Base16, Base32, Base64 Encodings
- RFC 8032 — Edwards-Curve Digital Signature Algorithm (EdDSA)
- RFC 7515 — JSON Web Signature
- RFC 8785 — JSON Canonicalization Scheme (JCS)
- RFC 9562 — UUIDs

---

*This protocol is being authored as a candidate open standard. We welcome public review via [GitHub Discussions](https://github.com/askledger/receipts-sdk/discussions).*
