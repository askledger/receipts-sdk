# Threat Model — AskLedger Receipts SDK + Platform

**Version:** 1.0 · v0.3 codebase
**Methodology:** STRIDE + LINDDUN (privacy) + adversarial review per OWASP AI Security & Privacy Guide
**Intended audience:** External security auditors (Trail of Bits, NCC Group, Cure53, Bishop Fox), internal red team, regulator security reviewers (CBUAE, SAMA, ECB IT supervisory teams), enterprise security teams evaluating the platform.

This is the artifact a Trail-of-Bits-style audit firm expects to see on day 1 of an engagement. It defines what we are protecting, what we are protecting it from, what is in scope, and where the residual risk sits.

---

## 1. System under threat

AskLedger is composed of two layers (see [ARCHITECTURE](../ARCHITECTURE.md)):

1. **The Receipts SDKs** (TypeScript, Python, Go, Rust, Java) — a cryptographic substrate that produces signed, hash-chained receipts for AI runtime events.
2. **The Platform** (hosted cloud + on-prem self-deploy reference): a multi-tenant SaaS that stores, indexes, batch-commits, verifies, and exports receipts.

The threat model covers both. Some threats only apply to the platform; some only to the SDK; we annotate each.

---

## 2. Trust boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│ Customer org (tenant)                                               │
│  ┌──────────────────────────┐    ┌────────────────────────────┐    │
│  │ Application(s) using AI  │───▶│ Receipts SDK (in-process)  │    │
│  └──────────────────────────┘    └────────────┬───────────────┘    │
│                                                │ TB-1               │
│                                                ▼                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ HSM / KMS (FIPS-validated)                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Customer-controlled storage (Postgres + S3)                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  │ TB-2 (mTLS, JWT, OIDC)
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ AskLedger Platform (multi-tenant cloud OR customer-deployed)   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │ Ingest API │─▶│ Verifier   │─▶│ Storage    │─▶│ Console    │    │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘    │
│  TB-3a           TB-3b           TB-3c           TB-3d              │
└─────────────────────────────────────────────────────────────────────┘
                                  │ TB-4 (TSA over HTTPS)
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ External services: TSA (FreeTSA, DigiCert) · Transparency log       │
│ (Sigstore Rekor or hosted) · OIDC provider · Regulator-facing       │
│ verifier endpoint                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Boundary list:**
- **TB-1** — Customer application → SDK in-process call (same address space)
- **TB-2** — Customer → Platform (network, mTLS)
- **TB-3a/b/c/d** — Inter-service boundaries inside Platform (mTLS, SPIFFE SVIDs, AuthZ via OPA)
- **TB-4** — Platform → External services (TSA, transparency log)

---

## 3. Assets

| ID | Asset | Sensitivity | Owner |
|---|---|---|---|
| A-1 | Tenant signing private key | Critical — compromise = all receipts forgeable for that tenant | HSM/KMS only |
| A-2 | Per-tenant chain state (chain_height, previous_receipt_hash) | High — truncation/forking compromises evidentiary value | Postgres with RLS |
| A-3 | Signed receipts (canonical bytes + signatures) | High — these ARE the evidence | Customer's durable store + Platform store |
| A-4 | Policy bundles | High — define what the AI is permitted to do | Platform; signed by customer key |
| A-5 | Audit log (admin actions, key rotations, plan changes) | High | Platform |
| A-6 | Customer data inside receipt payloads (hashed or redacted by default) | Variable (PII, PCI, MNPI) | Customer; SDK enforces classification field |
| A-7 | TSA/transparency log credentials | High | Platform secrets manager |
| A-8 | OIDC tokens, mTLS keys, SPIFFE SVIDs | High | Workload-bound via SPIRE |
| A-9 | Public verification keys (`KeyRegistry`) | Low confidentiality, high integrity | Platform; published; only integrity matters |
| A-10 | Customer master key in customer-managed-key (CMK) deployments | Critical | Customer KMS |

---

## 4. Attacker classes

| Class | Capability | Goal |
|---|---|---|
| **C-1 External unauthenticated** | Can hit public endpoints | Discovery, abuse, account takeover, leaked-receipt scraping |
| **C-2 Customer rogue user** | Has valid credentials, low-privilege role | Privilege escalation, cross-tenant access, evidence tampering |
| **C-3 Customer rogue admin** | Has tenant-admin privileges | Tamper with audit trail, hide actions, forge receipts |
| **C-4 Platform rogue insider (support engineer)** | Has support-tier access to platform | Read customer data, plant evidence |
| **C-5 Platform rogue insider (SRE/DBA)** | Has DB and cloud-infrastructure access | Modify receipts at rest, hide forging activity |
| **C-6 Compromised third-party dependency** | Malicious npm/PyPI/Cargo/Maven package via supply-chain attack | Steal signing keys, exfiltrate receipts |
| **C-7 Compromised TSA / transparency log** | Trusted external service turns adversarial | Backdate, suppress, or fork timestamps |
| **C-8 State-level adversary** | Network position + legal compulsion | Compel platform to alter or surrender data |
| **C-9 Future quantum adversary** | Store-now-decrypt-later | Forge historical receipts once a CRQC exists |

---

## 5. STRIDE per asset

### A-1 — Signing private key

| Threat | Mitigation | Status |
|---|---|---|
| **S**poofing — attacker signs as tenant | Key stored only in HSM/KMS (FIPS-validated). SDK enforces SigningProvider abstraction; SoftwareSigningProvider is documented as dev-only. | Mitigated |
| **T**ampering — key replaced | KeyRegistry signs every key transition; rotation events emit receipts on a meta-chain. | Mitigated |
| **R**epudiation — tenant denies signing | Independent third-party verifier proves signature against published public key. RFC 3161 timestamps add a third-party time attestation. | Mitigated |
| **I**nformation disclosure — key exfiltrated | Key never leaves HSM. Audit log alerts on any GetPublicKey/Sign anomaly. | Mitigated for HSM; **residual risk** for SoftwareSigningProvider |
| **D**oS — key revoked maliciously | Revocation requires customer-controlled admin role + audit-logged. SDK-side rate limiting on Sign calls. | Mitigated |
| **E**oP — non-tenant role gains sign rights | RBAC enforced at both SDK (KeyRegistry trust map) and platform (OPA). | Mitigated |

### A-2 — Chain state

| Threat | Mitigation |
|---|---|
| **T**ampering — past receipts modified | Hash chain breaks on next verify. Customer-side independent storage. |
| **T**ampering — chain truncation by Platform insider | Periodic Merkle root commitment to a public transparency log makes truncation detectable. |
| **R**epudiation — disputed chain height | RFC 3161 timestamps + transparency-log inclusion proof. |
| **I**nformation disclosure | Postgres row-level security + tenant SVID binding. |
| **E**oP — cross-tenant chain pollution | RLS + SDK-side `tenant_id` validation + chain CAS keyed on (tenant, height). |

### A-3 — Signed receipts

| Threat | Mitigation |
|---|---|
| **T**ampering — receipt body altered | RFC 8785 canonical hash + Ed25519 signature breaks on any byte change. |
| **R**epudiation — issuer denies issuing | Signature is non-repudiable; RFC 3161 timestamp ties to absolute time. |
| **I**nformation disclosure — receipt scraping | Default classification labels (`pii_redacted`, `pii`) push hashing instead of raw text; Platform access is RBAC-gated. |

### A-4 — Policy bundles (OPA)

| Threat | Mitigation |
|---|---|
| **T**ampering — adverse policy substituted | Policy bundles are content-addressed (sha256) and the hash is included in every decision receipt's `decision.policy_bundle_hash`. |
| **R**epudiation — disputed decision | Decision receipt records the bundle hash; verifier can re-evaluate. |

### A-5 — Admin audit log

| Threat | Mitigation |
|---|---|
| **T**ampering by SRE | Audit log entries are themselves receipts on a meta-chain signed by a platform key separate from tenant keys; SRE access does not include sign capability. |

### A-6 — Customer data in payloads

| Threat | Mitigation |
|---|---|
| **I**nformation disclosure via stored receipts | Default is `hashOnly` in adapters — only SHA-256 of input/output. Customers explicitly opt-in to store raw. Field-level encryption via Postgres `pgcrypto` for opt-in raw mode. |

### A-7 — TSA / transparency log credentials

| Threat | Mitigation |
|---|---|
| **S**poofing of TSA | TSA response is itself signed by the TSA's cert; verifier validates against TSA CA. |
| **D**oS of TSA | Asynchronous batching; offline timestamping resumes on TSA recovery; chain remains valid pre-timestamp. |

### A-8 — Workload credentials

| Threat | Mitigation |
|---|---|
| **S**poofing of services | SPIFFE SVID short-lived (≤1h), workload-bound, automatic rotation by SPIRE. |

---

## 6. LINDDUN privacy threats

| Threat category | Mitigation |
|---|---|
| **L**inkability — receipts correlate users across tenants | `tenant_id` separated; user IDs hashed at customer's option. |
| **I**dentifiability | `userIdResolver` is customer-owned; default omitted. |
| **N**on-repudiation (privacy sense) | Receipts ARE designed to be non-repudiable for the issuer; this is desired. |
| **D**etectability | Receipts MUST be detectable — that is the point. Confidentiality protected via classification labels. |
| **D**isclosure of information | Hash-only mode is default for adapters. |
| **U**nawareness | Tenant admin console exposes everything captured. |
| **N**on-compliance | GDPR/CCPA support via tenant-scoped delete-on-request; cryptographic receipt remains as `tombstone` containing only the hash. |

---

## 7. Supply-chain threats (C-6)

| Risk | Mitigation |
|---|---|
| Malicious npm package | Pinned dependencies; npm provenance attestation on publish; CycloneDX SBOM; minimal direct dependency surface (3 crypto-related: `@noble/ed25519`, `@noble/hashes`, `canonicalize`). |
| Malicious PyPI package | Pinned `cryptography>=42`; reproducible build. |
| Malicious Go module | Module hashes pinned in go.sum; verified against Go's checksum database. |
| Malicious Cargo/Maven artifact | Cargo.lock + Maven sealed POMs; signed releases via Sigstore Cosign. |
| Build pipeline compromise | SLSA Level 3 provenance; npm provenance verified by consumers. |

---

## 8. Cryptographic agility

| Issue | Plan |
|---|---|
| Ed25519 is not quantum-safe (C-9) | v2.0 protocol introduces hybrid signatures (Ed25519 + ML-DSA / Dilithium). Receipts produced in v0–v1 era retain provability for ~5–10 years; long-archival receipts SHOULD be re-timestamped under hybrid scheme as soon as available. |
| SHA-256 collision resistance | SHA-256 has no known practical collisions; if NIST deprecates, the protocol's `schema_version` allows transition to SHA3-256 or SHAKE128. |
| RFC 8785 canonicalization edge cases | Cross-language conformance vectors enforced; numeric edge cases (large floats) explicitly out of scope for the receipts schema (integer-only numeric fields). |

---

## 9. Adversarial test cases

These are explicitly exercised in the test suite and / or the fuzz harness in `test/fuzz/`:

| Test | What it proves |
|---|---|
| `chain-tamper.test.ts` (7 tests) | Mutating chain_height, previous_receipt_hash, nested event fields, or issued_at breaks verification |
| `validate.test.ts` (19 tests) | SQL-injection-style tenant_id, malformed event_type, oversize keys all rejected pre-sign |
| `signing-provider.test.ts` | Two providers cannot impersonate each other |
| `hsm.test.ts` | HSM drivers refuse asFipsProvider() when not configured for FIPS |
| `merkle.test.ts` (6 tests) | Tampered receipts fail inclusion proof against original root |
| `key-management.test.ts` | Revoked key cannot verify receipts even signed before revocation |
| `adapters.test.ts` | onReceipt errors do not propagate; AI calls always complete |
| Fuzz harness | Property-based: any random byte flip in receipt or signature → verifier returns false |

---

## 10. Residual risk register

| Risk | Severity | Why we accept it (or how we contain) |
|---|---|---|
| Software-only signing in dev tier | Low (dev only) | Documented; production refused via `requireFipsMode('required-strict')` |
| FIPS validation is provider-delegated, not SDK-validated | Low | This is the industry-standard pattern; explicitly disclosed in `FipsSigningProvider` doc |
| Quantum threat to Ed25519 | Medium long-term | Hybrid scheme in v2.0 protocol; documented; receipts older than ~10y may need re-timestamping |
| Customer-side platform insider | Medium | Out of scope for SDK threat model; mitigated by customer's own RBAC + SoD |
| State-level legal compulsion | Out of scope | Customer-controlled deployment option for jurisdictions requiring it |

---

## 11. External audit checklist

When a Trail of Bits / NCC Group / Cure53 audit is commissioned, this document plus the following code paths are the recommended scope:

```
src/canonicalize.ts        — RFC 8785 implementation
src/crypto.ts              — Ed25519 + SHA-256 bindings
src/receipt.ts             — Hash-chain orchestration
src/verify.ts              — Independent verifier
src/merkle.ts              — Merkle batch + inclusion proofs
src/tsa.ts                 — RFC 3161 encoder + client
src/signing-provider.ts    — Signing abstraction
src/hsm/*.ts               — HSM/KMS drivers (call shapes only — providers themselves are FIPS-validated upstream)
src/chain-store.ts         — Postgres CAS concurrency
src/key-management.ts      — Key rotation + revocation
src/fips.ts                — FIPS posture enforcement
test/                      — Adversarial corpus
```

Cross-language conformance (TS ↔ Python ↔ Go ↔ Rust ↔ Java) should be exercised against the shared vectors in `test/conformance/`.

---

## 12. Document maintenance

This document is updated on every release with a new envelope field, new attacker class, or new external dependency. The version at the top tracks the codebase version it applies to. Changes require security review per [CONTRIBUTING.md](../../CONTRIBUTING.md).
