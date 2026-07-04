# AskLedger · Receipts SDK

Open-source, vendor-neutral cryptographic trust substrate for enterprise AI. Every AI invocation produces a signed, hash-chained, tamper-evident receipt that auditors, regulators, and insurers verify independently with only the public key. No platform dependency.

**[Open spec · PL-RFC-001…010](spec/README.md)** · **[Conformance](conformance/README.md)** · **[Architecture](docs/ARCHITECTURE.md)** · **[Policy mapping](docs/POLICY_MAPPING.md)** · **[Security](SECURITY.md)** · **[Contributing](CONTRIBUTING.md)**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Spec](https://img.shields.io/badge/PL--RFC-001…010-blueviolet)](spec/README.md)
[![Conformance](https://img.shields.io/badge/conformance-CL1%2FCL2%2FCL3-blue)](conformance/README.md)
[![Tests](https://img.shields.io/badge/tests-304%20passing-brightgreen)](#testing)
[![Hardening](https://img.shields.io/badge/hardening-66%2F66%20PASS-brightgreen)](docs/security/HARDENING_CHECKLIST.md)

---

## Project status

**v0.6.0 · live on npm.** The cryptographic core is hardened and
independently verifiable — cross-language conformance tests enforce
byte-identical receipts across the TypeScript, Python, Go, Rust, and
Java SDKs, and a machine-checked hardening checklist runs in CI. SDK,
integrations, browser extension, console, public verifier, specification,
and conformance program are publicly available. A third-party
penetration test and SOC 2 Type II report are scoped for Q4 2026 - Q1
2027, and the hosted SaaS is in development. We are at the
**design-partner stage** and welcome architectural review, pilot
interest, and standards-body co-authorship.

- Package: [npm install @askledger/receipts-sdk](https://www.npmjs.com/package/@askledger/receipts-sdk)
- Site: [askledger.org](https://askledger.org)
- Source: [github.com/askledger/receipts-sdk](https://github.com/askledger/receipts-sdk)

---

## Install

```bash
npm install @askledger/receipts-sdk
```

Or install from source:

```bash
git clone https://github.com/askledger/receipts-sdk
cd receipts-sdk
npm install
npm run build
```

## Sign your first receipt

```ts
import { generateKeyPair, signReceipt, verifyReceipt } from "@askledger/receipts-sdk";

const keypair = generateKeyPair();
const receipt = signReceipt({
  event: {
    schema_version: "1.0",
    tenant_id: "acme",
    event_type: "gateway.request",
    source_system: "my-app",
    event_id: "evt-001",
    captured_at: new Date().toISOString(),
    subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
    payload: { input_classification: "internal", output_classification: "internal" },
  },
  keypair,
});

const result = verifyReceipt(receipt, {
  publicKeys: { [keypair.kid]: keypair.public_key },
});
console.log(result.valid); // true
```

That's it. Six lines and you have a regulator-verifiable receipt.

## Wrap your AI vendor

```ts
import OpenAI from "openai";
import { wrapOpenAI, generateKeyPair } from "@askledger/receipts-sdk";

const client = wrapOpenAI(new OpenAI({ apiKey }), {
  tenantId: "acme",
  keypair: generateKeyPair(),       // production: HSM-backed
  onReceipt: async (r) => store.append(r),
});

// Your application code is unchanged.
const resp = await client.chat.completions.create({ model: "gpt-5", messages });
console.log(resp.x_ledger_receipt_id);   // cryptographic evidence id
```

Adapters available today: `wrapOpenAI` · `wrapAnthropic` · `withReceipts(fetch)` (covers 11 vendors) · `ReceiptsCallbackHandler` for LangChain.

## Try it without installing

```bash
git clone https://github.com/askledger/receipts-sdk.git && cd receipts-sdk
npm install && npm run build
node dist/cli.js demo
```

You'll see output like:

```
────────────────────────────────────────────────────────────────────────
AskLedger — Receipts SDK · Demo
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

That's it. The receipt is in `.ledger/last-receipt.json`. The keypair is in `.ledger/keys/default.json`. The chain state is in `.ledger/chains/`. **None of this required a network call to AskLedger.** A regulator verifying this receipt only needs the public key.

---

## How a receipt looks

```json
{
  "receipt": {
    "schema_version": "1.0",
    "receipt_id": "01HXYZ123ABC...",
    "tenant_id": "demo-tenant",
    "issued_at": "2026-05-13T10:30:00.123456789Z",
    "event": {
      "schema_version": "1.0",
      "event_type": "ide.completion",
      "source_system": "vs-code-plugin",
      "captured_at": "2026-05-13T10:30:00.000Z",
      "subject": {
        "ai_vendor": "anthropic",
        "ai_model": "claude-sonnet-4-6",
        "ai_capability": "code-completion"
      },
      "payload": {
        "input_hash": "9a4f8e0c2b1d3a6c...",
        "input_classification": "internal",
        "input_token_count": 245
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

Every field is part of the canonical hash. Any modification to any field — including reordering keys — breaks the signature.

---

## Programmatic usage

```typescript
import {
  generateKeyPair,
  signReceipt,
  verifyReceipt,
} from "@askledger/receipts-sdk";

// 1. Generate (or load) a keypair
const kp = generateKeyPair();

// 2. Sign an AI event
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

---

## CLI reference

```bash
# Generate a keypair (HSM-backed in production; JSON file in dev)
node dist/cli.js keygen --out .ledger/keys/default.json

# Sign an event (auto-chains per tenant)
node dist/cli.js sign examples/event.json

# Verify a receipt against a public key
node dist/cli.js verify .ledger/last-receipt.json

# Verify chain continuity to a previous receipt
node dist/cli.js verify .ledger/last-receipt.json --prev .ledger/prev.json

# Full demo cycle
node dist/cli.js demo
```

---

## How it works · the cryptographic design

| Layer | Choice | Why |
|---|---|---|
| **Canonicalization** | [RFC 8785 (JCS)](https://datatracker.ietf.org/doc/html/rfc8785) | Deterministic JSON byte representation. Independent verifiers compute identical hashes from identical data. The foundational requirement for regulator-independent verification. |
| **Hashing** | SHA-256 | Standard, audited, well-understood security margin. |
| **Signing** | Ed25519 ([EdDSA](https://datatracker.ietf.org/doc/html/rfc8032)) | Fast (~70µs/sig), deterministic (no random nonce reuse risk), used by Signal, WireGuard, Sigstore. |
| **Encoding** | [JWS](https://datatracker.ietf.org/doc/html/rfc7515) base64 | Standard, parseable across platforms. |
| **Chain** | Per-tenant append-only hash chain | Each receipt's `previous_receipt_hash` is SHA-256 of the prior receipt's canonical bytes. Tampering with any historical receipt breaks every subsequent one. |
| **ID generation** | UUIDv7 | Sortable, embedded timestamp, collision-resistant. |
| **Post-quantum readiness** | Hybrid signature scheme planned for v2 (Ed25519 + Dilithium) | Practical quantum threats are 8–12 years out; retention is 7–10 years. Migration plan documented. |

**Implementation libraries:**
- [`@noble/ed25519`](https://github.com/paulmillr/noble-ed25519) — audited pure-TypeScript Ed25519
- [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) — audited hashing
- [`canonicalize`](https://www.npmjs.com/package/canonicalize) — RFC 8785 implementation

---

## Standards & compatibility

This SDK composes with rather than competes against the standards already used in software supply-chain security:

| Standard | Relationship |
|---|---|
| [Sigstore Model Signing (OMS)](https://github.com/sigstore/model-transparency) | Used for model identity verification within receipts |
| [in-toto Attestation Framework (ITE-6)](https://github.com/in-toto/attestation) | Envelope format reference for provenance claims |
| [SLSA](https://slsa.dev/) | Build-time attestation reference; receipts cover runtime |
| [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) | Event field alignment |
| [OWASP AIBOM](https://owaspaibom.org/) | AI Bill of Materials populated from receipts |
| [SPIFFE/SPIRE](https://spiffe.io/) | Workload identity for service-to-service calls |

We are not reinventing the cryptographic primitives. We are composing them into a layer specifically for **AI runtime accountability** — which none of the existing standards target.

---

## Roadmap

### v0.2 (next)
- Rust reference verifier
- Python SDK
- Go SDK
- RFC 3161 timestamping integration (FreeTSA + DigiCert)
- Merkle commitments + transparency log integration
- HSM signing reference (PKCS#11)

### v0.3
- Reference implementations in 5 more languages
- Receipt browser (web UI)
- Bridge to OpenTelemetry GenAI conventions
- Customer-managed-key reference design

### v1.0 (target: Year 2)
- Stable wire format
- Linux Foundation AI hosted standard
- Conformance test suite
- Third-party verifier ecosystem

---

## Try it without installing

A browser-based playground and verifier ship in this repository at
[`site/playground.html`](site/playground.html) and
[`site/verify.html`](site/verify.html). Open either file in a browser
to generate a keypair, sign a sample event, and verify the resulting
receipt — entirely client-side, no server, no install.

A hosted version is live at
[askledger.github.io/receipts-sdk/playground.html](https://askledger.github.io/receipts-sdk/playground.html).

---

## Documentation

| Document | What's inside |
|---|---|
| [**Receipts Protocol Spec v0.1**](docs/RECEIPTS_PROTOCOL.md) | The formal envelope, schema, hashing and verification rules — IETF-style. Candidate for Linux Foundation AI hosting. |
| [**Architecture**](docs/ARCHITECTURE.md) | Layered overview, file-by-file walk-through, design decisions, performance numbers. |
| [**Examples folder**](examples/README.md) | End-to-end integration patterns. |
| [**Python SDK**](python-sdk/README.md) | Wire-format compatible Python implementation. |
| [**Conformance vectors**](test/conformance/README.md) | Shared cross-language test vectors. Any new SDK passes conformance by matching these byte-for-byte. |
| [**CHANGELOG**](CHANGELOG.md) | Version history + roadmap to v1.0. |
| [**Contributing**](CONTRIBUTING.md) | How to build, test, propose changes. |
| [**Security policy**](SECURITY.md) | How to report vulnerabilities. |

---

## Auto-capture adapters — supporting any AI tool

The SDK ships drop-in capture adapters so every AI invocation in your stack emits a signed receipt without changing application code.

| Adapter | What it wraps | One-liner |
|---|---|---|
| `wrapOpenAI(client, ctx)` | The official `openai` SDK and any OpenAI-compatible provider (LiteLLM, Groq, Together, Mistral OpenAI-compat, DeepSeek, Anyscale) | Wraps `chat.completions.create` + `embeddings.create` |
| `wrapAnthropic(client, ctx)` | The official `@anthropic-ai/sdk` | Wraps `messages.create` |
| `withReceipts(ctx)` | Any global `fetch` | Detects calls to OpenAI, Azure OpenAI, Anthropic, Google Gemini, Bedrock, Cohere, Hugging Face, Mistral, Groq, Together, Vercel AI Gateway. Custom endpoints via `extraPatterns`. |
| `ReceiptsCallbackHandler` | LangChain.js | Implements `BaseCallbackHandler` surface; drop into any chain or agent |

Pattern:

```ts
import OpenAI from "openai";
import { wrapOpenAI, generateKeyPair } from "@askledger/receipts-sdk";

const client = wrapOpenAI(new OpenAI({ apiKey }), {
  tenantId: "acme-corp",
  keypair: generateKeyPair(),
  onReceipt: async (r) => store.append(r),  // ship to durable store
});

// Application code is unchanged
const resp = await client.chat.completions.create({...});
console.log(resp.x_ledger_receipt_id);   // cryptographic evidence id
```

Errors from the wrapped client always propagate — receipts never take down the AI call they instrument.

---

## Multi-language

| SDK | Language | Status | Conformance |
|---|---|---|---|
| `@askledger/receipts-sdk` | TypeScript / Node 18+ / browsers | v0.6.0 · 280 tests passing | Reference |
| `askledger-receipts` (Python) | Python 3.10+ | v0.6.0 · cross-verified against TS vectors | Cross-verified |
| `askledger-receipts-go` | Go 1.22+ | v0.6.0 · cross-verified against TS vectors | Cross-verified |
| `askledger-receipts-rs` | Rust 1.75+ | v0.6.0 · cross-verified against TS vectors | Cross-verified |
| `askledger-receipts-java` | Java 17+ | v0.6.0 · cross-verified against TS vectors | Cross-verified |

Wire-format compatibility is enforced by [shared conformance vectors](test/conformance/) that every SDK must pass.

---

## Production hardening modules

These are the v0.2 surface that turns the reference SDK into a production-deployable substrate.

| Module | What it provides | When you need it |
|---|---|---|
| `SoftwareSigningProvider` | In-memory Ed25519 keys | Dev, browser playground, SMB |
| `HSMSigningProvider` | Interface for PKCS#11 / AWS CloudHSM / Azure Key Vault / GCP KMS | Regulated BFSI, FIPS-required deployments |
| `TSAClient` (RFC 3161) | Real RFC 3161 TimeStampReq encoder + network client (default: FreeTSA; commercial TSAs via Basic Auth) | When you need independently provable "when this was signed" |
| `buildBatch` / `verifyInclusion` (Merkle) | SHA-256 binary Merkle tree with inclusion proofs (RFC 9162 leaf/internal prefix scheme — second-preimage safe) | Batch commitment to a transparency log; prove a single receipt belonged to the committed set |
| `PostgresChainStateStore` | Postgres backend for chain state with CAS concurrency, row-level security pattern | SaaS multi-tenant deployments past single-process |
| `MemoryChainStateStore` | In-process backend | Tests, serverless |
| `KeyRegistry` | Key rotation, retirement, revocation, historical-time-window-aware trusted set | Long-lived issuers (key rotation every 90 days per NIST SP 800-57) |

---

## Performance

Measured numbers from `npm run bench` (5000 iterations after warmup, Node 22, sandboxed Linux/arm64):

| Operation | p50 | p95 | p99 |
|---|---|---|---|
| `canonicalize` (RFC 8785) | 5.4 µs | 7.7 µs | 13.2 µs |
| `sha256` (canonical bytes) | 6.7 µs | 11.3 µs | 22.5 µs |
| Ed25519 sign | 425 µs | 551 µs | 662 µs |
| Ed25519 verify | 1.78 ms | 1.96 ms | 2.06 ms |
| `signReceipt` end-to-end | 1.64 ms | 2.13 ms | 2.47 ms |
| `verifyReceipt` end-to-end | 1.91 ms | 2.13 ms | 2.26 ms |

Note: Ed25519 numbers reflect pure-TypeScript `@noble/ed25519` (zero native dependencies, audited). When deployed against a native libsodium binding or HSM, signing drops to ~70 µs. The dominant cost in `signReceipt` is canonicalization + file I/O for chain state — production deployments swap the file backend for Postgres + HSM and stay well within an enterprise gateway's latency budget.

---

## Ecosystem · related open-source projects

AskLedger is not the only effort in cryptographic AI receipts. The following projects address overlapping problems and we acknowledge them openly:

| Project | Focus area |
|---|---|
| [Sigstore Model Signing (OMS)](https://github.com/sigstore/model-transparency) | Build-time model artifact signing |
| [in-toto](https://in-toto.io/) / [SLSA](https://slsa.dev/) | Build pipeline attestation |
| [OWASP AIBOM](https://owaspaibom.org/) | AI Bill of Materials |
| [OpenTelemetry GenAI](https://opentelemetry.io/docs/specs/semconv/gen-ai/) | Runtime telemetry conventions |
| AgentMint, OrgKernel, Pipelock, ArkForge, Garl Protocol, AEGIS, Nono | Independent receipts/audit SDKs (various states of completeness) |

**How we differentiate.** This SDK focuses on the **runtime AI decision receipt** — the cryptographic envelope that binds a single AI event to a tenant, a policy, a model identity, and a hash-chained position. We compose with build-time attestation (Sigstore, in-toto, SLSA), with the OWASP AIBOM, and with OpenTelemetry GenAI semantic conventions. The commercial AskLedger platform layers a verifier model, a regulator portal, evidence packs, and BFSI-MENA-specific framework mappings on top — open-core, Datadog / HashiCorp / Sentry pattern.

---

## Get involved

- **GitHub Discussions** — questions, design proposals, use cases
- **Issues** — bugs, enhancements, integration requests
- **Pull Requests** — see [CONTRIBUTING.md](CONTRIBUTING.md)
- **Security disclosures** — see [SECURITY.md](SECURITY.md) (private channel)

We are particularly interested in feedback from:
- Bank CISOs and Chief Risk Officers preparing for CBUAE / SAMA / EU AI Act inspections
- Auditors building AI evidence-collection methodologies
- Standards body participants (OpenSSF, CNCF, LF AI, IETF)
- Cryptographers reviewing the protocol design

---

## Honest production-readiness checklist · v0.3

| Capability | Status |
|---|---|
| **Substrate** | |
| RFC 8785 canonical JSON | ✅ Shipped, conformance-tested across 5 languages |
| Ed25519 signing | ✅ Shipped (`@noble/ed25519`, `cryptography`, stdlib, `ed25519-dalek`, Bouncy Castle) |
| SHA-256 | ✅ Shipped |
| Per-tenant hash chain | ✅ Shipped, tamper-tested + fuzzed |
| Independent third-party verifier | ✅ Shipped |
| Receipts Protocol Spec v0.1 | ✅ Shipped, IETF-style |
| Input validation + structured errors | ✅ Shipped |
| **Tests** | |
| 120 TypeScript tests | ✅ Passing |
| 12 Python tests | ✅ Passing |
| 3 Go tests | ✅ Passing |
| Rust tests | ✅ Code shipped; cargo runs in CI |
| Java tests | ✅ Code shipped; mvn runs in CI |
| Cross-language conformance vectors | ✅ Shipped — TS ↔ Python ↔ Go pass byte-identical |
| Fuzz harness (200 random mutations) | ✅ Shipped |
| **Crypto hardening** | |
| RFC 3161 timestamping client (FreeTSA + commercial TSA) | ✅ Shipped |
| Merkle batch commitments (RFC 9162 second-preimage safe) | ✅ Shipped, inclusion proofs |
| Key rotation, retirement, revocation, historical verification | ✅ Shipped |
| FIPS-mode crypto path (`FipsSigningProvider`, `requireFipsMode`) | ✅ Shipped |
| **HSM / KMS** | |
| AWS KMS driver | ✅ Shipped (`@askledger/receipts-sdk/hsm/aws-kms`) |
| Azure Key Vault driver | ✅ Shipped |
| GCP KMS driver | ✅ Shipped |
| PKCS#11 driver (Thales, Entrust, CloudHSM, YubiHSM) | ✅ Shipped |
| **Multi-language SDKs (wire-format compatible)** | |
| TypeScript | ✅ Reference |
| Python | ✅ Shipped |
| Go | ✅ Shipped |
| Rust | ✅ Shipped |
| Java | ✅ Shipped |
| **Scale + storage** | |
| Postgres chain backend with CAS + RLS pattern | ✅ Shipped |
| Memory chain store (tests + serverless) | ✅ Shipped |
| Multi-tenant isolation | ✅ Shipped |
| **Auto-capture** | |
| OpenAI + 8 OpenAI-compatible providers | ✅ Shipped |
| Anthropic | ✅ Shipped |
| Generic fetch (11 vendors) | ✅ Shipped |
| LangChain.js | ✅ Shipped |
| **Zero Trust** | |
| ZTA reference architecture document (NIST SP 800-207 aligned) | ✅ Shipped |
| SPIFFE workload identity helpers | ✅ Shipped |
| OPA decision client (decisions-as-receipts) | ✅ Shipped |
| **Workflows** | |
| Receipt pipeline (capture → policy → sign → TSA → persist → notify) | ✅ Shipped |
| Approval workflow (N-of-M, expiry) | ✅ Shipped |
| Evidence pack builder (Merkle batch + integrity hash) | ✅ Shipped |
| **Enterprise UI** | |
| Admin console (Next.js 14, App Router) | ✅ Shipped |
| Design system (WCAG 2.2 AA, RTL, dark mode, design tokens) | ✅ Shipped |
| Dashboard / Receipts Explorer / Policies / Keys / Workflows / Evidence / Tenants / Audit / Settings | ✅ All 9 pages shipped |
| **Audit-ready artifacts** | |
| Threat model (STRIDE + LINDDUN) | ✅ Shipped |
| SOC 2 Trust Services Criteria control map | ✅ Shipped |
| Zero Trust architecture doc | ✅ Shipped |
| Design system spec | ✅ Shipped |
| **Supply chain** | |
| CycloneDX 1.5 SBOM | ✅ Shipped |
| npm provenance publishing | ✅ Wired |
| Sigstore Cosign image signing | ✅ Documented |
| **Third-party gates (require external firms)** | |
| External cryptographic audit (Trail of Bits / NCC Group / Cure53) | 🔴 Code + threat model ready; commissioning ~$80–120K, 4 weeks |
| SOC 2 Type II report | 🔴 Control framework + evidence map ready; commission a CPA firm + 12 months of evidence |
| NIST CMVP FIPS 140-3 validation | 🔴 Provider-delegated via AWS/Azure/GCP/Thales; no SDK-side certification needed |
| **Future** | |
| Quantum-resistant hybrid signatures (Ed25519 + Dilithium) | 🔴 v2.0 protocol revision |
| Transparency log integration (Rekor) | 🟡 Merkle in place; log connector v0.4 |

Rows marked 🔴 require external parties (audit firms, CPA firms). The code and the audit-ready artifacts are shipped — what remains is hiring the firms and running their engagements.

---

## Citing this work

If you reference this protocol or implementation in research or industry writing:

```
AskLedger. (2026). AskLedger Receipts SDK:
Cryptographic AI Decision Receipts for enterprise AI.
https://github.com/askledger/receipts-sdk
```

---

## License

[Apache-2.0](LICENSE).

The open-source license is deliberate: receipts are a moat through adoption, not lock-in. The commercial layer of AskLedger (verifier model, regulator portal, evidence packs, vendor benchmark data) is proprietary. **The protocol substrate is open.**

---

## Maintainers + governance

See [`MAINTAINERS.md`](MAINTAINERS.md) for the current maintainer list
and the technical-steering-committee governance model. The project is
under multi-stakeholder governance preparation; we welcome
contributions from individuals and organisations who want a seat at
the standards table.

**Contact**

- General questions →
  [GitHub Discussions](https://github.com/askledger/receipts-sdk/discussions)
- Bug reports →
  [GitHub Issues](https://github.com/askledger/receipts-sdk/issues)
- Security disclosures →
  [private GitHub Security Advisory](https://github.com/askledger/receipts-sdk/security/advisories/new)
  (see [`SECURITY.md`](SECURITY.md))
