# Competitor Synthesis · v0.4

**Purpose:** map every meaningful competitor in the AI trust / governance / security space, identify what each does well, decide what we adopt vs. deliberately reject, and document how our cryptographic substrate composes with (or replaces) their offering.

**Audience:** internal product strategy. Some of this is also surfaced openly in the README's "Ecosystem · related projects" section — the open part is the acknowledgment, this doc is the strategic reasoning.

**Anchoring principle:** we do NOT copy what makes them them. We adopt the *underlying capability the customer asked for*, then implement it cryptographically so it composes with our moat. If a competitor's only differentiator is execution speed, we let them win on that lane; we win on the lane only we can run — verifiable cryptographic receipts.

---

## Competitor map

| Company | Funding / signal | Core thesis | We adopt | We reject |
|---|---|---|---|---|
| **Apiiro** | $135M · BlackRock, TIAA, USAA, Bloomberg, SoFi, Shell | Code-to-cloud AI risk posture | Risk graph idea (which code paths touch which AI models with what data classifications) | Their full SDLC posture management — too broad for our wedge |
| **Credo AI** | $41.3M · Fortune 500 · Fast Company #6 Applied AI 2026 | AI governance platform with policy intelligence library | **Pre-built policy templates** (CBUAE / EU AI Act / SAMA / NIST / ISO 42001) + **use-case registry** | Their human-workflow-heavy stakeholder onboarding (too consulting-flavored) |
| **WitnessAI** | $58M · 500% ARR growth · BFSI + utilities + airlines | Network-level AI activity governance with identity-aware policies | **Identity-aware policy enforcement** + real-time content gates | Network appliance form factor — we are SDK-first |
| **ValidMind** | $11.1M · Experian partnership · BIG Innovation 2026 | Model risk management for regulated finance | **Model registry** + model validation status linkage to receipts | Their MRM workflow tools (banks already have SR 11-7 tooling) |
| **Robust Intelligence** | Acquired by Cisco ($400M est.) | AI red teaming + runtime firewall | **Pre-deployment risk evaluation harness** + jailbreak score | Their full red-team-as-a-service motion — needs custom-tuned LLMs |
| **Protect AI** | Acquired by Palo Alto ($500M+ est.) | AI security platform (NB Defense, ModelScan, Recon) | **Notebook + model artifact scanning** mindset | The full XDR-style product surface |
| **Lakera** | Acquired by Check Point ($300M est.) | Inline prompt-injection guard (Lakera Guard) | **Prompt-injection detector** as part of our safety module | Their licensed model behind a gateway — we run pure heuristics |
| **Acuvity** | Acquired by Proofpoint (2026) | AI access governance for the workforce | **Per-user policy + risk scoring** | Their CASB-style positioning |
| **Portkey** | Acquired by Palo Alto (2026) | AI gateway with observability | **Gateway adapter shape** (we already wrap their pattern in `withReceipts`) | Building our own gateway — we observe, we don't intercept-and-terminate |
| **Galileo** | Acquired by Cisco (2026) | LLM evaluation + observability for hallucinations | **Hallucination + capability-deviation detection** ideas | Their full eval suite — out of v1 scope |
| **Sigstore Model Signing (OMS)** | OSS · Google + Anthropic + IBM backing | Build-time model artifact signing | **Direct integration** — receipts reference OMS-signed models in `subject.ai_model` | Nothing — we compose with it, don't compete |
| **in-toto / SLSA** | OSS · OpenSSF | Build-time supply-chain attestation | **Direct integration** — receipts complement build attestation with runtime | Nothing — composing layer |
| **OpenTelemetry GenAI** | OSS · CNCF | Telemetry semantic conventions for AI | **Field alignment** — our event schema aligns with OTel GenAI conventions | Nothing — we are downstream of OTel |
| **OWASP AIBOM** | OSS · OWASP | AI Bill of Materials schema | **AIBOM population** from our runtime receipts | Nothing — composing layer |
| **AgentMint / OrgKernel / Pipelock / ArkForge / Garl / AEGIS / Nono** | OSS receipt SDKs (various) | Open audit / receipt format | Cross-language conformance vector idea | Their wire format — we want ours to become the standard |

---

## Capabilities we adopted this round

### 1. Pre-built policy templates (from Credo AI)

**What they did right:** they didn't ship a blank "write your own policy" box. They shipped a curated library of regulator-mapped templates so customers could be CBUAE / EU AI Act / NIST-ready on day one.

**Our implementation:** `src/policy-templates/` ships JSON bundles for:
- CBUAE Responsible AI (5 principles · Feb 2026 guidance · Sep 16 2026 transitional deadline)
- EU AI Act (Annex IV technical documentation · Article 50 transparency · Article 9 risk management · Aug 2 2026 high-risk obligations)
- SAMA AI guidance (Saudi BFSI)
- NIST AI RMF (Govern · Map · Measure · Manage)
- ISO/IEC 42001 (AI Management Systems)

Each template lists controls. Each control declares which receipt fields it consumes. When a receipt is signed, the SDK can cite which control articles the receipt satisfies — directly in the receipt's `metadata.regulatory_citations` block.

This is the killer differentiator for our specific go-to-market: a CBUAE bank in Dubai installs our SDK and within five minutes has a CBUAE-mapped policy bundle running. Credo AI takes months of consulting to get to the same place.

### 2. Use-case registry (from Credo AI + ValidMind)

**What they did right:** every AI use case has a business owner, a risk tier, a regulatory scope, and an approved-models list. The platform enforces that production AI traffic flows only through registered use cases.

**Our implementation:** `src/registries/use-case-registry.ts`. Receipts carry an optional `use_case_id`. Use cases are themselves signed objects with their own hash chain so the registry is tamper-evident.

### 3. Model registry (from ValidMind)

**What they did right:** every model in production has a version, a validation status, a model owner, and a defined fallback. The bank can prove which model was active at the time of any decision.

**Our implementation:** `src/registries/model-registry.ts`. Receipts carry an optional `model_id`. Model entries record validation status (`development | validation | approved | retired | revoked`). When a receipt is signed, the model status is checked — a `retired` or `revoked` model triggers a deviation finding.

### 4. Prompt-injection detector (from Lakera + Robust Intelligence)

**What they did right:** detected the most common jailbreak / injection patterns inline before the prompt hit the model.

**Our implementation:** `src/safety/prompt-injection.ts`. Pure heuristic — regex + scoring. No LLM dependency (LLM-based detectors are themselves a privacy + shadow-AI risk). Catches "ignore previous instructions", role-override, base64-encoded instructions, system-prompt-leak attempts, DAN-style jailbreaks, language-switch attacks. The score flows into the receipt's safety findings.

### 5. Identity-aware policy enforcement (from WitnessAI)

**What they did right:** the policy didn't just say "block PII to ChatGPT"; it said "block PII to ChatGPT *for non-finance users*". Identity + content + context.

**Our implementation:** the OPA decision client already takes user roles + content classification + endpoint as input. The new policy templates demonstrate identity-aware rules — e.g., "AML team can ingest customer PII; everyone else cannot."

---

## What we deliberately did NOT copy

| Idea | Why we rejected it |
|---|---|
| Network-appliance form factor (WitnessAI) | We are SDK-first. A network appliance is operationally heavy for the customer and easy to bypass via SaaS endpoints. The SDK + adapter combo gives us coverage without a man-in-the-middle box. |
| Building our own AI gateway | Portkey, LiteLLM, Helicone already exist. We observe whatever gateway the customer has. |
| LLM-based safety detector | A second LLM inspecting the first is itself a privacy and shadow-AI risk. Regex + heuristics are deterministic, auditable, and don't introduce new vendor exposure. |
| Full XDR / SOC platform (Protect AI) | Splunk, Datadog Security, Wiz already own that surface. We feed them receipts. |
| Consultative onboarding workflow (Credo AI) | Too services-heavy. Our model is open-source-first + self-serve, with paid platform + paid framework mappings. |
| Acquisition-bait positioning | We are deliberately building the open standard, not a feature that gets bought. The substrate is the moat. |

---

## How our differentiation holds after this round

| Capability | Us | Apiiro | Credo AI | WitnessAI | ValidMind | Lakera | Protect AI |
|---|---|---|---|---|---|---|---|
| Cryptographic receipts (independent verification) | **✓ Only us** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Hash chain integrity | **✓ Only us** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| RFC 3161 timestamping | **✓ Only us** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Merkle batch + inclusion proofs | **✓ Only us** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Cross-language conformance (5 SDKs) | **✓ Only us** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| FIPS-mode HSM delegation | **✓** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Policy template library (CBUAE / EU AI Act / etc.) | **✓** (open) | ✗ | ✓ (closed) | partial | ✗ | ✗ | ✗ |
| Use-case + model registry | **✓** (linked to receipts) | partial | ✓ | partial | ✓ | ✗ | ✗ |
| PII + shadow-AI inline detection | **✓** | partial | ✗ | ✓ | ✗ | partial | ✓ |
| Prompt-injection detection | **✓** (heuristic) | ✗ | ✗ | ✓ | ✗ | ✓ (LLM) | ✓ |
| Vendor-neutral AI capture (11 vendors) | **✓** | partial | ✗ | ✓ | ✗ | ✗ | ✗ |
| OSS + open spec | **✓** Apache-2.0 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

**The summary:** Apiiro / Credo AI / WitnessAI / ValidMind have real customers and real revenue. We do not yet. What we have that none of them have is the **cryptographic substrate that makes every audit log a regulator-verifiable artifact**. Without that, their systems are still self-attestation; with it, ours is the only one that satisfies the CBUAE-grade question *"prove it."*

By adopting their best ideas at the *capability* level (policy templates, registries, prompt-injection) we close the feature gap. By NOT copying their architecture, we keep the moat the same shape.

---

## Open questions for v0.5

- Should we publish our policy templates as a community contribution to CompliantAI or OpenSSF?
- Do we want to acquire / partner with one of the OSS receipt projects (AgentMint, OrgKernel, Garl) to consolidate the standard before Cisco / Palo Alto do the consolidation through M&A?
- Is there a Linux-Foundation-AI hosted-project path for our wire format that we should be lobbying for now?
- Does the prompt-injection module need to become a paid premium pack (with a curated, monthly-updated pattern library) or stay open-source?

These get answered after the first three design-partner customer conversations.
