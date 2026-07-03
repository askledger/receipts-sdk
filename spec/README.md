# AskLedger Specifications

This directory contains the normative specifications for the Project
Ledger AI Decision Receipts protocol. Each document is versioned,
citable, and intended to remain stable across implementations and
languages.

## Document index

| ID | Title | Status |
|---|---|---|
| [PL-RFC-001](./PL-RFC-001-receipt-schema.md) | Receipt Schema | Draft v0.1 |
| [PL-RFC-002](./PL-RFC-002-canonical-bytes.md) | Canonical Bytes Profile | Draft v0.1 |
| [PL-RFC-003](./PL-RFC-003-chain-semantics.md) | Chain Semantics | Draft v0.1 |
| [PL-RFC-004](./PL-RFC-004-transparency-log.md) | Transparency Log Binding | Draft v0.1 |
| [PL-RFC-005](./PL-RFC-005-evidence-pack.md) | Evidence Pack Envelope | Draft v0.1 |
| [PL-RFC-006](./PL-RFC-006-identity-binding.md) | Identity Binding | Draft v0.1 |
| [PL-RFC-007](./PL-RFC-007-capture-semantics.md) | Cross-Vendor Capture Semantics | Draft v0.1 |
| [PL-RFC-008](./PL-RFC-008-policy-decision.md) | Policy Bundle and Decision Block | Draft v0.1 |
| [PL-RFC-009](./PL-RFC-009-cost-ledger.md) | Cost Ledger Format | Draft v0.1 |
| [PL-RFC-010](./PL-RFC-010-carbon-ledger.md) | Carbon Ledger Format | Draft v0.1 |

## Status terminology

This is an evolving public spec following the IETF tradition.

- **Draft** — under active revision; backwards compatibility not yet guaranteed.
- **Proposed** — feature-frozen; awaiting two independent implementations.
- **Standard** — at least two interoperable implementations exist and pass conformance.

## Conformance

The [`@askledger/conformance`](../conformance/) package implements the
test corpus against which an implementation is verified. Three levels:

- **CL1 — Canonical** · Implementation produces byte-identical canonical bytes for every fixture in the corpus.
- **CL2 — Signed** · Implementation produces byte-identical signed receipts for every fixture (deterministic over a known key).
- **CL3 — Chained** · Implementation produces byte-identical chain state across 100 sequential events.

An implementation that passes all three earns the right to display the
**AI Receipts CL3** badge. Results are published at `conformance.github.com/askledger/receipts-sdk`.

## Governance

These specifications are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Implementations are licensed under Apache-2.0 (see `LICENSE`).

The specification is governed by the AskLedger Technical Steering
Committee (see `MAINTAINERS.md`) with the explicit intent to transfer
stewardship to the Linux Foundation AI & Data project upon acceptance.

## Citation

Cite a specific draft as:

> AskLedger Working Group. *AskLedger Receipt Schema*. PL-RFC-001, Draft v0.1. 2026. https://github.com/askledger/receipts-sdk/tree/main/spec/PL-RFC-001

A bibliographic export (BibTeX, RIS) is provided in the rendered site.

## Interoperability with existing standards

| Standard | AskLedger relationship |
|---|---|
| RFC 8785 (JSON Canonicalization Scheme) | Adopted as the canonical-bytes algorithm (PL-RFC-002) |
| RFC 3161 (TSA) | Optional countersignature (PL-RFC-005) |
| RFC 9162 (Certificate Transparency 2.0) | Adopted as the transparency-log binding (PL-RFC-004) |
| RFC 7515 (JWS) | Signature envelope convention (PL-RFC-001 §5) |
| RFC 8037 (Ed25519 JWA) | Default signing algorithm (PL-RFC-001 §5) |
| RFC 7644 (SCIM 2.0) | Identity binding source for the actor block (PL-RFC-006) |
| RFC 9457 (Problem Details) | Error envelope for verification failure responses |
| W3C Trace Context | Trace propagation in receipt context block |
| Sigstore / OpenSSF Model Signing | AskLedger sits ABOVE OMS at the runtime layer |
| in-toto / SLSA | AskLedger sits ABOVE SLSA at the AI-runtime layer |

AskLedger explicitly does NOT duplicate these standards — it
composes them for the runtime-AI-accountability layer that none of them
target.
