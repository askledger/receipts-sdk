# Changelog

All notable changes to the AskLedger Receipts SDK will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (with the caveat that until v1.0, breaking changes may occur between minor versions).

## [0.12.4] - 2026-07-11

### Changed (docs + comments only, no API or behavior changes)

- Renumbered the five-layer model to **prevent-first**, to match the website. Layer 1 is now
  the Pre-Execution Guardian (prevents the wrong action), followed by Cryptographic evidence (2),
  Execution traceability (3), Rule-based assurance (4), and Enablement & ROI (5). Updated the
  README and the source comments accordingly; the README's roadmap layer line is now
  number-light so it stays consistent across future numbering changes.

## [0.12.3] - 2026-07-11

### Changed (docs only)

- Made the README version references patch-agnostic (the status line and the SDK-matrix row) so
  the npm page no longer lags a patch behind on each release. Updated the tests badge to 438.
- Removed an em-dash from the package.json `description`, which is shown on the npm page.

## [0.12.2] - 2026-07-11

### Changed (docs + polish, no API or behavior changes)

- Refreshed the npm README: corrected a stale `v0.11.0` status line to the current version and
  rewrote the roadmap, which had listed already-shipped work (all five SDKs, RFC 3161
  timestamping, Merkle commitments, HSM/KMS signing) as "next".
- Removed em-dashes from the README, CHANGELOG, and all CLI/console output strings for a
  consistent house style. The `"—"` empty-value markers in CLI tables are unchanged.
- CI reliability: the security-scan hardening checklist now generates the CycloneDX SBOM its
  G.1 check looks for (via the existing generator), so it passes 66/66 instead of failing.
  Raised the vitest timeout to 20s so heavy receipt-generation tests no longer flake under
  full-suite parallelism.

## [0.12.1] - 2026-07-10

### Fixed, identity cleanup (no API changes)

- Removed the stale `projectledger` identity left over from before the rename. The published
  README no longer tells developers the Python import is `projectledger.receipts` or the Java
  coordinate is `io.projectledger:receipts-sdk`.
- **Python** package renamed `projectledger.receipts` → `askledger.receipts` (import path,
  tests, README). Distribution name was already `askledger-receipts`.
- **Java** package renamed `io.projectledger.receipts` → `org.askledger.receipts`, matching the
  existing `org.askledger` groupId in `pom.xml`.
- Corrected a stale SDK-matrix row in the README (`v0.6.0 · 304 tests` → current).
- Updated `PUBLISHING.md` and `publish-java.yml` notes to reflect the corrected namespaces.

The published TypeScript package `@askledger/receipts-sdk` was already correct; this release
refreshes the npm README and cleans the cross-language identity. No code or API changes.

## [0.12.0] - 2026-07-10

### Added, the four-layer model (Prevent, then Prove)

Layers 1–3 (prove what happened, how, and whether it was correct) were already the core of
the SDK. This release adds Layer 4 (prevent bad actions before they run) and hardens all four
to enterprise grade. Every addition is additive; existing receipts sign and verify unchanged.

- **Layer 4, Pre-Execution Guardian** (`guardian.ts`). An independent reviewer signs a
  verdict over a proposed action *before* it executes:
  - `signPreVerdict(action, review, opts)` binds a verdict (`approve` / `concerns` / `reject`)
    to `actionHash(action) = sha256(canonicalize({tenant_id, action_type, payload}))`, and
    **enforces reviewer independence** (throws if the reviewer is the actor).
  - `verifyPreVerdict(signed, action, opts)` returns per-check results
    (`signature_valid`, `hash_matches`, `binds_to_action`, `not_expired`).
  - `assertActionCleared(...)` gates execution; `reviewNofM(...)` enforces N-of-M approval with
    a hard veto on any reject; `preVerdictEvidenceRef(...)` links the L4 verdict into the L1 receipt.
- **Layer 3, Assurance & rule-based correctness** (`assurance.ts`).
  - `assuranceLevel(signed, opts)` grades a receipt on the published ladder
    **L0 Declared → L1 Signed → L2 Attested → L3 Anchored** (cumulative), matching
    `/trust/assurance-levels` exactly.
  - `checkRules(policy, values, opts)`, deterministic rule evaluator (numeric comparisons +
    string equality; missing values fail closed) producing a `rule_based` verification block.
    A rule check is recorded evidence, never presented as a formal proof.
- **Layer 2, Execution traceability** (`workflow-graph.ts`).
  - `reconstructWorkflow(receipts, opts)` deterministically rebuilds a multi-step workflow DAG
    (Kahn topological sort, `chain_height` then `id` tie-break) with roots, leaves, missing
    parents, and an acyclicity check.
  - `verifyWorkflow(receipts, opts)` verifies every receipt and the graph's completeness.
- **Layer 1, Cryptographic evidence** (`verify.ts`, `timestamp.ts`).
  - `verifyChain(receipts, opts)` verifies a full per-tenant hash chain end to end
    (height-sorted, predecessor-linked, genesis-completeness).
  - Timestamp binding: `timestampReceipt` / `verifyReceiptTimestamps` bind an RFC 3161 token to
    the canonical signing payload; verification now checks `timestamp_imprint_matches` and
    `chain_position_attested`.

### Fixed (audit hardening)

- **Transparency log**: `proveConsistency` rewritten to correct RFC 6962 semantics; added
  static `verifyConsistency`.
- **Chain concurrency**: added `signReceiptWithStore` (async compare-and-swap with retry on
  `ConcurrentChainWriteError`) plus a CAS-backed `FileChainStateStore`, closing a fork window
  under concurrent writers. Sync `signReceipt` remains the single-writer path.
- **Cost engine**: fixed a sampling bug where baseline/prove used a sampled summary without
  `scale` (exact aggregation via `summarizeWorkloads`); corrected `gpt-4o-mini` / `gpt-5-nano`
  model normalization and pricing (previously mispriced as `gpt-4o`).
- **Numeric safety**: `assertSafeNumbers` rejects integer values outside the IEEE-754
  safe-integer range before signing.

## [0.11.0] - 2026-07-08

### Added, receipt schema extensions (all OPTIONAL and additive; existing receipts sign/verify unchanged)

- **`policy_context`**: the policy/ruleset that governed a decision: `policy_bundle_id`,
  `policy_bundle_hash`, `version`, `domain`, `applied_rules[]` (with `expression` /
  `mathematical_form` / `source` / `weight`), `mathematical_constraints`, and a
  pluggable `rule_encoding_format` (`simple_expression` today; `lean` / `catala` later).
- **`verification`**: the result of checking a decision against its rules: `status`,
  `verification_type` (`formal` / `rule_based` / `hybrid`), `proof_artifact` (by digest),
  `failed_rules`, `confidence_score`, `verifier_version`. Note: `confidence_score` is
  meaningful only for probabilistic (`rule_based`/`hybrid`) checks; a formal proof is binary.
- **`decision_summary`**: `outcome`, `risk_score`, `reason_codes`, `human_override`, `override_reason`.
- **`evidence_refs`** extended with `mathematical_value` and `proof_type` (e.g. `lean`).
- **Subject governance fields**: `ai_model_version`, `base_model`, `model_card_hash`,
  `fine_tune_id`, `system_prompt_hash`.
- **`extensions`**: a namespaced, forward-compatibility map for experimental attributes
  (e.g. `data_provenance`, `compliance`) that are captured and signed now and promoted to
  first-class fields only once their shape is proven, so the core format stays stable.

Every field above is covered by RFC 8785 canonicalization, the Ed25519 signature, and the
hash chain, tamper-evident like the rest of the receipt.

## [0.10.0] - 2026-07-08

### Added

- **Verified savings, `ledger-cli baseline` / `prove` / `verify-savings`**
  (`src/cost/savings.ts`). Sign a tamper-evident baseline of your AI spend,
  prove the realized saving against it in a later period, and let anyone verify
  that proof independently. `verifySavingsProof` checks the Ed25519 signature
  **and** recomputes the savings math from the figures in the proof, so a
  skeptic (a CFO, a customer) can trust the number without trusting whoever
  produced it. The headline saving is **efficiency-normalized**: the current
  period's tokens priced at the baseline blended rate, minus what they actually
  cost, so a change in volume cannot manufacture a saving. Signed over RFC 8785
  canonical bytes. New API exports: `buildBaseline`, `proveSavings`,
  `verifyBaseline`, `verifySavingsProof`, `toPeriodSummary`, and their types.

## [0.9.0] - 2026-07-08

### Added

- **`ledger-cli scan <usage-export.json>`**: see your wasted AI spend from a
  provider bill you **already have**, with no instrumentation and no receipts.
  Reads OpenAI (`snapshot_id` / `n_requests` / `n_*_tokens_total`) and Anthropic
  (`model` / `requests` / `input_tokens` / `output_tokens`) usage exports (plus a
  generic shape), converts them to receipts, and runs the existing cost engine.
  `--json` and `--html` supported. This is the zero-instrumentation front door:
  a team that has never emitted a receipt can still get a savings number in
  seconds. Nothing leaves the machine.
- **Ingest module** (`src/cost/ingest.ts`): `normalizeModel`, `parseUsageExport`,
  `receiptsFromWorkloads`, `receiptsFromExport`. Very large bills are uniformly
  downsampled to bound memory; a returned `scale` recovers exact totals (per-row
  average tokens are preserved, so cost scales linearly).

### Changed

- **Over-tiering savings are now confidence-tiered, the estimate is honest.**
  The heuristic was input-blind: it flagged high-context RAG (short output but
  large input) as waste. Each `SavingsSuggestion` now carries
  `confidence: "high" | "review"` and `avgInputTokens`. **High** (the headline
  `potentialSavings`) requires an adjacent *same-family* tier, avg input ≤ 4000,
  and avg output ≤ 800, a genuinely low-risk swap. **Review** (`reviewSavings`,
  reported separately, never in the headline) covers heavy-context or
  cross-family swaps (e.g. `gpt-4o` → `gpt-5-mini`) that carry real quality risk.
  CLI and HTML dashboards show both tiers.

## [0.8.0] - 2026-07-07

### Added

- **Natural-language query over receipts** (`ledger-cli query "<question>"`,
  `src/query/index.ts`). An offline, deterministic parser (`parseQuery`) +
  executor (`runQuery`) answer plain-English questions grounded in real
  receipts, every result cites the receipt ids it came from. Optional `--llm`
  mode is **provider-neutral**: pass a `complete` function to plug in any model,
  or use the built-in Claude default (lazy `@anthropic-ai/sdk`,
  `ANTHROPIC_API_KEY`). Either way the model only emits a validated
  `StructuredQuery`, never receipt data.
- **Alerts engine** (`ledger-cli alerts`, `src/query/alerts.ts`). Explainable
  rules, blocked/denied decisions, sensitive data (pii/pci/mnpi), unsigned
  records, high-stakes decisions with no bound evidence, over-tiering, and cost
  spikes, each naming the receipt ids behind it. Honest defaults; `runAlerts`
  accepts caller-supplied rules; a throwing rule can't take the run down.
- Exported `parseQuery` / `runQuery` / `answerQuery` / `flattenReceipt` /
  `runAlerts` / `perReceiptRule` / `DEFAULT_RULES` / `parseQueryLLM` /
  `CompleteFn` and their types.
- **Terminal-output hardening (security).** The CLI's `query` / `alerts` /
  `dashboard` printers sanitize C0/C1 control characters from receipt-authored
  fields (`source_system`, `ai_model`, `receipt_id`) before display, so a
  receipt from another party (e.g. inside an evidence bundle you're inspecting)
  can't embed ANSI escape sequences to spoof terminal output.
- **End-to-end CLI across all three layers.** `sign --evidence-ref` binds an
  external correctness proof into the signed body (Layer 3); `bundle` /
  `verify-bundle` build and check a Merkle-rooted evidence bundle (Layer 2).
  Added `buildEvidenceBundle` / `verifyEvidenceBundleIntegrity` /
  `verifyAllReceiptsInBundle` aliases and a `quickstart` command.
- **Optional `evidence_refs` on receipts.** Strictly additive, receipts without
  it sign and verify identically; when present it is covered by the signature.
- **Free local usage & cost dashboard** (`ledger-cli dashboard [paths...]
  [--html]`, `src/cost/dashboard.ts`). Single-tenant, offline: estimated spend,
  tokens, per-model / per-app breakdowns, and integrity signals (signed count,
  chain height, correctness bindings), built from your own signed receipts.
  Unknown models are counted but excluded from the estimate and flagged, never
  guessed. Exported `summarizeReceipts` / `renderDashboardHtml` + the pricing
  API for programmatic use.
- **Over-tiering savings suggestions** in the dashboard. Flags premium models
  used for short/simple calls, grouped by (model × application), and quantifies
  each with an exact counterfactual, the same recorded calls repriced on the
  cheaper same-vendor tier. Heuristic hints framed to *test*, not a promise;
  the deep recommendation engine and verified-savings (baseline → signed proof)
  remain the hosted platform.

## [0.7.0] - 2026-07-04

### Security & correctness hardening

Hardens the cryptographic guarantees and closes the gaps found in a full
multi-language security + correctness audit.

#### Security
- **Verifier algorithm allowlist**: every SDK (TS/Python/Go/Rust/Java) now
  rejects any signature whose `alg` is not `EdDSA` before Ed25519 verification,
  closing algorithm-confusion.
- **Chain continuity enforced on verify**: with a predecessor, verification
  requires `chain_height === prev + 1` (not just the hash link); genesis
  consistency (`chain_height 1` ⇔ `GENESIS_HASH`) is checked even without the
  predecessor. Dropped or reordered receipts are now rejected.
- **Admin console**: session cookie is HMAC-signed (forgery-proof) and the
  dev-login helper is hard-disabled in production builds.
- **Browser extension**: service-worker message trust boundary; the OIDC
  `id_token` is now verified (JWS signature against the issuer JWKS +
  iss/aud/exp/nonce); honest key-storage docs.

#### Correctness
- **Cross-language canonicalization parity**: fixed Go's HTML-escaping and
  ECMAScript number formatting across Python/Go/Rust/Java, so a receipt signed
  by one SDK verifies byte-identically in every other. Shared conformance
  vectors expanded 7 → 43 and enforced in CI across all five languages.
- Go and Java verifiers fail closed on malformed input (no panic).

#### Supply chain & tooling
- Dependency CVEs patched (jackson, bcprov, `next` 15, `vitest` 3, trivy-action);
  Rust `Cargo.lock` and a hashed Python lock committed; SBOM regenerated.
- Cross-language conformance, Console build, and dependency-audit
  (cargo-audit / pip-audit / govulncheck) added to CI; the previously-broken
  security-scan workflow fixed.

## [0.6.0] - 2026-06-13

### Become-the-default release

This release lowers the install friction to zero so any developer or
company can adopt AskLedger receipts without thinking.

#### Added
- **`@askledger/receipts-sdk/vendor-kit`**: one-call auto-
  instrumentation. `installReceipts({ tenantId: "acme" })` hooks every
  Anthropic and OpenAI client constructor in the process; every AI
  call from that point on emits a signed receipt. Lazy-loads vendor
  SDKs so missing optional deps don't break the install.
- **`pl quickstart`**: interactive 60-second flow: keygen → sign a
  sample receipt → verify → emit badge URL.
- **`scripts/install.sh`**: `curl -sSL github.com/askledger/receipts-sdk | bash`
  installs the CLI globally and runs quickstart.
- **`POST /api/ingest`**: vendor-kit-instrumented processes POST
  signed receipts here; the handler verifies signature + tenant
  binding + chain monotonicity.
- **10 RFC spec drafts**: `spec/PL-RFC-001` through `PL-RFC-010`,
  receipt schema, canonical bytes, chain semantics, transparency log,
  evidence pack, identity binding, capture semantics, policy + decision
  block, cost ledger, carbon ledger.
- **`@askledger/conformance`** package, CL1/CL2/CL3 levels for
  external SDKs to self-test and earn the conformance badge.
- **Integrations**: LiteLLM Python callback (upstream-PR-ready),
  Cursor MCP server, Claude Code skill.
- **Subpath exports**: `@askledger/receipts-sdk/vendor-kit`,
  `/adapters/openai`, `/adapters/anthropic`, `/adapters/fetch`,
  `/adapters/langchain`.
- **CLI rename**: primary `pl` binary; `ledger-cli` preserved as alias.

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

## [0.1.0] - 2026-05-13

### Added
- Initial reference TypeScript implementation of the AskLedger Receipts protocol
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
