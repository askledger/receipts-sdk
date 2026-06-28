# Changelog

All notable changes to the Project Ledger Receipts SDK will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (with the caveat that until v1.0, breaking changes may occur between minor versions).

## [0.6.0] — 2026-06-13

### Become-the-default release

This release lowers the install friction to zero so any developer or
company can adopt Project Ledger receipts without thinking.

#### Added
- **`@askledger/receipts-sdk/vendor-kit`** — one-call auto-
  instrumentation. `installReceipts({ tenantId: "acme" })` hooks every
  Anthropic and OpenAI client constructor in the process; every AI
  call from that point on emits a signed receipt. Lazy-loads vendor
  SDKs so missing optional deps don't break the install.
- **`pl quickstart`** — interactive 60-second flow: keygen → sign a
  sample receipt → verify → emit badge URL.
- **`scripts/install.sh`** — `curl -sSL github.com/askledger/receipts-sdk | bash`
  installs the CLI globally and runs quickstart.
- **`POST /api/ingest`** — vendor-kit-instrumented processes POST
  signed receipts here; the handler verifies signature + tenant
  binding + chain monotonicity.
- **10 RFC spec drafts** — `spec/PL-RFC-001` through `PL-RFC-010` —
  receipt schema, canonical bytes, chain semantics, transparency log,
  evidence pack, identity binding, capture semantics, policy + decision
  block, cost ledger, carbon ledger.
- **`@askledger/conformance`** package — CL1/CL2/CL3 levels for
  external SDKs to self-test and earn the conformance badge.
- **Integrations** — LiteLLM Python callback (upstream-PR-ready),
  Cursor MCP server, Claude Code skill.
- **Subpath exports** — `@askledger/receipts-sdk/vendor-kit`,
  `/adapters/openai`, `/adapters/anthropic`, `/adapters/fetch`,
  `/adapters/langchain`.
- **CLI rename** — primary `pl` binary; `ledger-cli` preserved as alias.

#### Changed
- Package version bumped from 0.1.0 to 0.6.0 to reflect five rounds
  of foundational work landed under "Unreleased" in prior changelog
  versions.

#### Security
- Hardening verifier remains 66/66 PASS on this checkout.
- Adversarial review record 2026-Q2: 10/10 scenarios PASS.

#### Tests
- 257+ tests across 27 files, all green.
- Added: 17 cost-module tests · 11 resilience tests · 3 canonicalize
  property tests · 9 tenant-context predicate tests.

## [Unreleased]

### Planned for v0.7
- Postgres data plane wired live (replace `console/src/lib/fixtures.ts`)
- Public transparency log at `log.github.com/askledger/receipts-sdk`
- Browser extension published to Chrome Web Store
- LiteLLM upstream PR merged
- Cursor + Claude Code adapters packaged on npm

### Planned for v0.2
- Rust reference verifier
- Python SDK
- RFC 3161 timestamping integration (FreeTSA + DigiCert)
- Merkle commitments + transparency log integration
- HSM signing reference (PKCS#11)
- More capture adapter examples (Chrome extension, VS Code, Express middleware)

### Planned for v0.3
- Reference implementations in 5 more languages
- Customer-managed-key reference design
- Bridge to OpenTelemetry GenAI conventions
- Conformance test suite

## [0.1.0] — 2026-05-13

### Added
- Initial reference TypeScript implementation of the Project Ledger Receipts protocol
- RFC 8785 canonical JSON via `canonicalize` library
- JWS Ed25519 signing via `@noble/ed25519`
- SHA-256 hashing via `@noble/hashes`
- Per-tenant append-only hash chain with local file-based state
- Independent receipt verifier (works with only the public key)
- CLI commands: `keygen`, `sign`, `verify`, `demo`
- Sample event in `examples/event.json`
- 13 unit tests including tamper-detection (body, signature, chain) and chain-link verification
- Apache-2.0 license
- Documentation: README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT
- GitHub Actions CI pipeline (Node 18, 20, 22 on Ubuntu and macOS)
- Issue templates and PR template

### Known limitations
- Local file-based key storage (HSM integration planned for v0.2)
- No RFC 3161 timestamping (planned for v0.2)
- No Merkle commitments or transparency log integration (planned for v0.2)
- TypeScript only (Python, Rust, Go SDKs planned for v0.2)
- Single-tenant local development model (production multi-tenant isolation in v0.3)

---

[Unreleased]: https://github.com/askledger/receipts-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/askledger/receipts-sdk/releases/tag/v0.1.0
