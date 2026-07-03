# The 13 Pillars · Mapping current code to the canonical AskLedger strategy

Source: `uploads/AskLedger.html` — the canonical 13-pillar product
architecture. Bandar Naghi's QAG / QAIS / AI Agency frameworks are
**additive thought-leadership layers**, not the 13 pillars themselves.

This file is the honest read of what we ship today vs what each pillar
requires.

---

## Quick legend

- **SHIPPED** = code exists, tested, runnable now
- **PARTIAL** = scaffolding present, key piece missing
- **PLANNED** = not yet started; design lives in a doc
- **EMPTY** = neither code nor design — open opportunity

---

## P01 · AI Gateway / Control Plane
**Thesis:** Sit at Layer 5 (trust) above any Layer-3 gateway (Portkey, LiteLLM, Cloudflare, Bedrock). Receipts-native, sovereign-deployable, BFSI-tuned.

| Capability | Status | Where |
|---|---|---|
| Fetch interceptor (drop-in over any gateway) | **SHIPPED** | `src/adapters/fetch.ts` |
| OpenAI / Anthropic auto-capture | **SHIPPED** | `src/adapters/openai.ts`, `src/adapters/anthropic.ts` |
| LangChain handler | **SHIPPED** | `src/adapters/langchain.ts` |
| Bedrock + Vertex native adapters | **PLANNED** | `docs/strategy/UNIVERSAL_CAPTURE.md` |
| Sovereign deployment manifests (UAE, KSA, EU residency) | **PARTIAL** | `deploy/helm/values.yaml` region field; per-region keyrings doc'd not wired |
| Gateway-aware throttle (forward to Layer-3 budget) | **PLANNED** | `src/cost/budget.ts` ready to be wired |

## P02 · AI Decision Receipts — THE STRATEGIC MOAT
**Thesis:** Cryptographic primitive turning telemetry into regulator-grade, customer-verifiable, immutable evidence. Empty market vs Sigstore / in-toto / SLSA.

| Capability | Status | Where |
|---|---|---|
| RFC 8785 + Ed25519 + chain | **SHIPPED** | `src/canonicalize.ts`, `src/crypto.ts`, `src/receipt.ts` |
| Cross-language conformance (5 SDKs) | **SHIPPED** | `python/`, `go-sdk/`, `rust-sdk/`, `java-sdk/`, `test/conformance.test.ts` |
| Tamper detection (4 positions proven) | **SHIPPED** | `test/integration/lifecycle.test.ts` |
| Transparency log client (RFC 9162) | **SHIPPED** | `src/transparency-log/trillian-client.ts` |
| Public verifier (regulator can verify alone) | **SHIPPED** | `site/verifier.html` |
| HSM-backed signing (4 drivers + FIPS) | **SHIPPED** | `src/hsm/*`, `src/fips.ts`, `.github/workflows/hsm-nightly.yml` |

This is the strongest pillar. It is genuinely production-grade today.

## P03 · AI Code Provenance
**Thesis:** Prompt → Diff → Commit → PR → Deploy → Incident lineage of every AI-generated code change. Differentiate from Apiiro on provenance, not security scanning.

| Capability | Status | Where |
|---|---|---|
| Receipt schema with `event_type=ide.completion` | **SHIPPED** | `src/types.ts`, `examples/01-ide-completion.ts` |
| Cursor / Claude Code / Continue desktop capture | **PLANNED** | `docs/strategy/UNIVERSAL_CAPTURE.md` Phase 2 |
| Git commit hook that signs commits with the linked receipt-id | **EMPTY** | new: `tools/git-receipt-hook` |
| PR-bot that posts the receipt chain into the GitHub PR | **EMPTY** | new: `tools/pr-bot` |
| Deploy-event ↔ receipt-chain bridge | **PARTIAL** | `src/workflows/` engine ready; deploy adapter missing |
| Incident-to-receipt back-link (Sentry / PagerDuty) | **EMPTY** | new |

**What to add from P03:** a `git-receipt-hook` package + a `gh-pr-bot` that puts an inline cryptographic chain "this PR was authored with Cursor; here are the 14 receipts" comment on every PR.

## P04 · Compliance Evidence Engine
**Thesis:** Telemetry-derived evidence packs for EU AI Act, SR 26-2, PRA SS1/23, ISO 42001, CBUAE, RBI FREE-AI. $492M → $1B by 2030. Compete on signature-derived vs questionnaire-driven.

| Capability | Status | Where |
|---|---|---|
| 9 regulator templates (CBUAE, EU AI Act, SAMA, ISO 42001, NIST AI RMF, HIPAA, FedRAMP, ISO 27001, GDPR) | **SHIPPED** | `src/policy-templates/*` |
| Evidence-pack generator | **SHIPPED** | `src/evidence/` |
| Per-tenant coverage dashboard | **SHIPPED** | `console/src/app/compliance/page.tsx`, `/api/compliance/coverage` |
| SR 11-7 + SR 26-2 (US bank MRM) templates | **EMPTY** | new |
| PRA SS1/23 (UK BFSI) template | **EMPTY** | new |
| RBI FREE-AI (India) template | **EMPTY** | new |
| OSFI E-23 (Canada) template | **EMPTY** | new |
| Auto-generated 10-Q / sustainability-report exhibits | **EMPTY** | new |

**What to add from P04:** 4 more regulator templates (SR 11-7, SR 26-2, PRA SS1/23, RBI FREE-AI, OSFI E-23) and a regulator-format exporter (10-Q exhibit, EU AI Act Article 11 technical file).

## P05 · Cross-Vendor AI Discovery
**Thesis:** Complete enterprise inventory across browser, gateway, SaaS, network, MCP, agent runtime. CIO + CFO buyer with attribution depth.

| Capability | Status | Where |
|---|---|---|
| Browser-extension capture (Chrome MV3) | **SHIPPED** | `browser-extension/` |
| Fetch interceptor (gateway path) | **SHIPPED** | `src/adapters/fetch.ts` |
| MCP server discovery | **EMPTY** | new |
| Network egress fingerprinting (TLS-SNI / SNI-based vendor ID) | **EMPTY** | new |
| Cross-channel attribution rollup ("user-X used GPT-5 in Cursor, Claude in browser, Bedrock in app") | **PARTIAL** | data plane ready, dashboard new |
| Agent runtime discovery (LangGraph, AutoGen, CrewAI hooks) | **EMPTY** | new |

**What to add from P05:** an `mcp-discovery` module that watches the MCP socket directory + a network-egress fingerprinter + a cross-channel attribution dashboard.

## P06 · Shadow AI Discovery & Block
**Thesis:** Real-time detection + attribution + block of unsanctioned AI. 8+ funded competitors — differentiate on receipts-native + sovereign + BFSI + CRO/CCO story.

| Capability | Status | Where |
|---|---|---|
| Browser extension content-script with policy engine | **SHIPPED** | `browser-extension/content.js` |
| Per-tenant policy bundle (`shadow_ai_block`) | **SHIPPED** | `src/safety/` |
| Identity binding (corp-OIDC) so blocks attribute to a human | **SHIPPED** | `browser-extension/identity.js` |
| Real-time PII-block (in-browser) | **PLANNED** | `docs/strategy/UNIVERSAL_CAPTURE.md` |
| Per-team policy rollups (CRO/CCO dashboards) | **SHIPPED** | `console/src/app/hr/page.tsx`, `/api/hr/violators` |
| SaaS-app egress blocking (Notion AI, Slack AI, M365 Copilot) | **EMPTY** | new |

## P07 · Internal Model Risk Operations (MRM)
**Thesis:** Validation workpapers, lifecycle management, ongoing monitoring for internal/fine-tuned models. Telemetry-receipt-driven vs SAS/IBM/Moody's workpaper-driven.

| Capability | Status | Where |
|---|---|---|
| Use-case + model registry | **SHIPPED** | `src/registries/` |
| Receipt-derived validation workpaper template | **EMPTY** | new |
| Drift detection from receipt stream | **EMPTY** | new (needs Verifier Model from P13) |
| Challenger-model comparison engine | **EMPTY** | new |
| SR 11-7 / SR 26-2 / OSFI E-23 workpaper exporter | **EMPTY** | new |
| ValidMind-shaped agentic workpaper UI | **EMPTY** | new (P04 evidence engine is the substrate) |

**What to add from P07:** a `src/mrm/` module with workpaper generator + drift watcher driven by the receipt stream.

## P08 · AI Supply Chain & Third-Party Risk
**Thesis:** SBOM-for-AI, provenance attestation, malicious package detection. Cisco MPK + Palo Alto Protect AI signal incumbent moves.

| Capability | Status | Where |
|---|---|---|
| SBOM (CycloneDX) at SDK level | **SHIPPED** | `sbom.cyclonedx.json` |
| SLSA L3 build provenance | **SHIPPED** | `.github/workflows/release.yml` |
| Model attestation (vendor identity + version + signature) | **PARTIAL** | receipt carries vendor+model+kid; vendor-cert attestation missing |
| MCP-server SBOM | **EMPTY** | new |
| Skill / plugin / agent SBOM | **EMPTY** | new |
| Malicious-package detection (typosquat / lockfile drift) | **EMPTY** | new |
| Vendor-supplied model-card signature verification | **EMPTY** | new |

**What to add from P08:** an `ai-sbom` module that walks MCP + skill + plugin manifests and produces a signed CycloneDX-compatible "AI SBOM".

## P09 · Data Readiness & Lineage for AI
**Thesis:** AI-specific data lineage + training data provenance + PII detection + dataset attestation. $5B+ data lineage market — differentiate on signed receipts.

| Capability | Status | Where |
|---|---|---|
| PII detection in safety module | **SHIPPED** | `src/safety/pii.ts` |
| Dataset attestation receipts (sign a dataset, chain it) | **EMPTY** | new |
| Training-data provenance attestation | **EMPTY** | new |
| Feature-store ↔ receipt lineage | **EMPTY** | new |
| Cleanlab-shaped data-quality scoring with receipts | **EMPTY** | new |

**What to add from P09:** a `src/data-lineage/` module that signs dataset snapshots + emits training-data-provenance receipts.

## P10 · Vendor Decision Intelligence — "Gartner for AI Vendors" — ★ EMPTY SLOT ★
**Thesis:** Independent benchmark-driven cross-vendor scoring. Genuinely uncontested globally.

| Capability | Status | Where |
|---|---|---|
| Receipt Score (per-vendor + per-receipt) | **SHIPPED** | `src/receipt-score/` |
| Cross-tenant aggregate benchmark dataset | **PARTIAL** | data model ready; aggregation not yet run |
| Hallucination-rate scoring from receipt outcomes | **EMPTY** | new |
| Cost-per-outcome scoring | **SHIPPED** (foundation) | `src/cost/pricing.ts`, just landed |
| Compliance posture per vendor | **EMPTY** | new |
| Supply-chain risk per vendor | **EMPTY** | new |
| Public benchmark page (the "Gartner moment") | **EMPTY** | new |

**What to add from P10:** the public benchmark page that uses anonymised aggregate receipt data to produce a quarterly Magic-Quadrant-style chart with hallucination, cost, compliance, and supply-chain risk as axes.

## P11 · AI Insurance Data Substrate
**Thesis:** Signed receipts as the underwriting data feed for AI liability insurers. Munich Re aiSure / Mosaic / Armilla actively underwriting.

| Capability | Status | Where |
|---|---|---|
| Receipt → underwriter data shape design | **SHIPPED** | `docs/INSURANCE_PLAYBOOK.md` |
| Risk-score export per tenant | **EMPTY** | new |
| Loss-attribution receipt chains (incident → receipts → model → policy) | **EMPTY** | new |
| Premium-calculation input feed (signed monthly bundle) | **EMPTY** | new |
| Munich Re / Armilla / Mosaic format mappers | **EMPTY** | new |

**What to add from P11:** an `src/insurance/` module that produces the signed monthly bundle insurers need + carrier-specific format adapters.

## P12 · Managed AI-SOC
**Thesis:** 24x7 monitoring of AI traffic with AI-specific playbooks. Cyber MSSPs extending but lack the receipts substrate. Services-revenue layer that compounds product sales.

| Capability | Status | Where |
|---|---|---|
| Prompt-injection detector | **SHIPPED** | `src/safety/prompt-injection.ts` |
| Shadow-AI detector + blocker | **SHIPPED** | `src/safety/` + browser ext |
| Cross-tenant attempt detector (P0 alerts) | **SHIPPED** | `console/src/lib/tenant-context.ts`, `monitoring/alerts.yml` |
| SOC playbook library (incident → response steps) | **EMPTY** | new |
| Channel-partner enablement kit (MENA MSSPs in P12 list) | **EMPTY** | new |
| 24x7 ticketing / on-call workflow | **EMPTY** | new |

**What to add from P12:** a `playbooks/` directory of receipt-driven AI-incident response playbooks + a channel-partner enablement package.

## P13 · Verifier Model — ★ R&D PILLAR ★
**Thesis:** Proprietary AI model trained on aggregated cross-tenant receipts to independently score AI decisions, detect drift, flag anomalies. Year-4 R&D. Empty competitive space.

| Capability | Status | Where |
|---|---|---|
| Cross-tenant receipt corpus (with privacy boundary) | **EMPTY** | new — requires explicit customer opt-in |
| Verifier-model training pipeline | **EMPTY** | new |
| Quality scoring API (input: receipt → output: verifier score) | **EMPTY** | new |
| Drift detection per use-case | **EMPTY** | new |
| Anomaly flagging fed into MRM (P07) | **EMPTY** | new |

**Honest read:** this is intentionally Year-4 R&D. The substrate work we've done is the prerequisite. We do not build P13 in 2026.

---

## Summary scorecard

| # | Pillar | Status |
|---|---|---|
| P01 | AI Gateway / Control Plane | **PARTIAL** — capture done, native cloud adapters pending |
| P02 | **Receipts Moat** | **SHIPPED** — production-grade |
| P03 | AI Code Provenance | **PARTIAL** — schema ready, git/PR/deploy hooks missing |
| P04 | Compliance Evidence Engine | **SHIPPED** for 9 regulators; 4 more named in pillar |
| P05 | Cross-Vendor AI Discovery | **PARTIAL** — browser + gateway done; MCP/network/agent missing |
| P06 | Shadow AI Discovery & Block | **PARTIAL** — capture + identity done; real-time PII block pending |
| P07 | Internal MRM | **EMPTY** — registry done; workpaper engine missing |
| P08 | AI Supply Chain | **PARTIAL** — SDK SBOM done; AI SBOM (MCP/skill/agent) missing |
| P09 | Data Lineage | **EMPTY** — PII done; dataset signing missing |
| P10 | Vendor Decision Intelligence | **PARTIAL** — Receipt Score done; benchmark page missing |
| P11 | AI Insurance Substrate | **EMPTY** — playbook doc only |
| P12 | Managed AI-SOC | **PARTIAL** — detectors done; playbook library missing |
| P13 | Verifier Model | **EMPTY** — intentionally Year-4 |

**Counts:** 1 SHIPPED · 1 SHIPPED-mostly (P04) · 6 PARTIAL · 5 EMPTY.

---

## What to add NEXT, ordered by leverage

The highest-leverage adds against the canonical 13-pillar strategy:

1. **P03 git-receipt-hook + gh-pr-bot** — every PR shows its receipt chain. Small build, huge sales narrative ("see this PR? signed by Cursor at line 47.").
2. **P04 four more regulator templates** — SR 11-7, PRA SS1/23, RBI FREE-AI, OSFI E-23. The market we're competing in is regulated, and ValidMind/Credo lead on this.
3. **P07 MRM workpaper engine** — turns receipt stream into SR-11-7-shaped validation workpapers. Cuts directly into ValidMind, CRISIL, Solytics.
4. **P11 insurance bundle exporter** — Munich Re aiSure / Mosaic / Armilla need this. Distribution leverage through carriers.
5. **P10 public benchmark page** — the Gartner-moment that establishes the "Gartner for AI Vendors" position.
6. **P05 MCP + agent-runtime discovery** — the "shadow AI in MCP/agent" angle is uncontested today.
7. **P08 AI SBOM** — MCP/skill/agent SBOM. Cisco MPK signals incumbents are moving; we want to ship first in the open.
8. **P09 dataset attestation receipts** — bridges the receipts moat into the $5B data-lineage market.
9. **P12 SOC playbook library** — packages the substrate as a services offering MENA MSSPs can sell.
10. **P01 Bedrock + Vertex native adapters** — closes the last cloud-native capture gap.

P13 stays Year-4. P02 (the moat) stays the centre of gravity.

---

## How Bandar's frameworks layer on top of this 13

Bandar Naghi's QAG (5) / QAIS (3) / AI Agency (7) / Executive Philosophy (6) frameworks are **thought-leadership wrappers around the 13 pillars**, not replacements. We integrate via:

- **`frameworkAlignment()`** in `src/frameworks/index.ts` — every receipt produced under any pillar auto-cites which Bandar pillar it contributes evidence toward.
- **`applyAuthorContribution()`** — when Bandar supplies his pillar text, his contribution is signed and published as the verified mapping.

So the relationship is: **AskLedger 13 pillars = what we build.** **Bandar frameworks = the executive language we use to describe it to BFSI buyers.**
