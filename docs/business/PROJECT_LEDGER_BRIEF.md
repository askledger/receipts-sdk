# Project Ledger

### The open-source runtime trust substrate for enterprise AI

Every AI invocation inside a company produces a cryptographically
signed, hash-chained, transparency-log-backed receipt — independently
verifiable in a browser with the public key alone. No platform
dependency. Apache-2.0. Built to the standard top regulators,
auditors, customers, and insurers will require by 2026.

*A briefing for Solution Architects, CTOs, CISOs, Heads of Risk, Heads
of Compliance, OSS standards reviewers, and infrastructure investors
evaluating runtime-trust infrastructure for the AI era.*

Document v1.2 · June 2026 · Licensed CC-BY-4.0

---

## 1 · Executive snapshot

| | |
|---|---|
| **What it is** | Open-source cryptographic substrate making every AI call independently verifiable end-to-end |
| **What it solves** | Cryptographically verifiable AI accountability for regulators, auditors, customers, insurers, and the buyer's own board |
| **Why now** | EU AI Act enforcement August 2026; SR 11-7, OSFI E-23, PRA SS1/23, CBUAE, SAMA, RBI FREE-AI, GDPR Art. 22 already in force; Cisco and Palo Alto consolidating adjacent categories through acquisition |
| **What is built** | 5 language SDKs, 9 native integrations, browser extension, admin console, public verifier, 10 RFC drafts, 3-tier conformance program, 280+ tests, 66/66 hardening controls verified |
| **Today's users** | Free open-source users (developers, small engineering teams); design-partner program now opening |
| **Tomorrow's buyers** | ~55,000 regulated companies globally; mid-market regulated SaaS, Tier-1 BFSI, insurance carriers, healthcare payers, government |
| **Market sizing** | TAM $5-15B by 2030; SAM $500M-2B today; SOM target $50-150M ARR within 3-5 years |
| **Stage** | Engineering complete; publication, design-partner outreach, and standards-body submission in motion this month |
| **Ask** | Honest expert review · pilot interest · standards-body co-authorship · introductions to anchor customers in BFSI, insurance, healthcare, or government |

---

## 2 · Thesis

The AI infrastructure stack is consolidating from the inside out.
Model identity is being locked down (Sigstore, OpenSSF Model Signing,
Cisco Model Provenance Kit). Build provenance is being locked down
(in-toto, SLSA). Gateway-level guardrails are being locked down
(Portkey-Palo Alto, LiteLLM, Cisco AI Defense). **Runtime
accountability — what the model actually did, when, under what policy,
and what evidence survives the vendor relationship — has no
incumbent.** That is the category Project Ledger occupies, with a
12-18 month window before strategic consolidators arrive.

---

## 3 · Why now · 2025-2026 market signals

**Regulatory pressure is now binding, not theoretical:**

- **EU AI Act** — Article 12 logging and Annex IV technical files
  enforced from August 2026 for high-risk AI systems
- **US Federal Reserve SR 11-7 / SR 26-2** — model validation
  workpapers required for all banking AI
- **UK PRA SS1/23**, **Canadian OSFI E-23**, **UAE CBUAE**, **Saudi
  SAMA**, **India RBI FREE-AI**, **GDPR Article 22** — all currently
  in force
- **NIST CAISI** — US government-led AI evaluation framework setting
  the public benchmark standard

**Strategic acquisitions in 2025-2026 confirm category formation:**

- **Cisco acquired Robust Intelligence** (Q4 2024) → became Cisco AI
  Defense
- **Cisco launched Model Provenance Kit** (April 2026) — open-source
  AI supply-chain provenance
- **Palo Alto acquired Portkey** (April 2026) — anchors agentic
  security at the gateway
- **Entrust acquired Onfido** (2024, ~$650M) — identity verification
  consolidation

**Funded entrants signal investor conviction:**

- **WitnessAI** — $58M (Jan 2026; Sound Ventures-led; 500% ARR growth;
  Fortune 1000 BFSI customers)
- **Apiiro Guardian Agent** — $135M (Jan 2026; Greylock, KP, General
  Catalyst; Fortune 500 customers including BlackRock, TIAA, USAA,
  SoFi, Shell)
- **HiddenLayer** — $50M Series A (M12, Booz Allen, IBM Ventures,
  Capital One Ventures)
- **Armilla AI** — $25M (Jan 2026, Chaucer-distributed) — AI
  liability underwriting

**AI liability insurance is live, not theoretical:**

- **Munich Re aiSure + Mosaic partnership** (Feb 2026) — up to €15M /
  $15M / CAD 15M of AI liability coverage per policy
- Carriers actively seeking signed-receipt data feeds to price risk

**Open-source standards are codifying adjacent layers:**

- **Sigstore** ascending as the de-facto software-supply-chain signing
  standard
- **OpenSSF Model Signing** ratified with Google, NVIDIA NGC, Kaggle
  integration
- **LiteLLM** processing trillions of tokens / month as the de-facto
  open-source AI gateway

---

## 4 · How it works

A receipt is produced and verified in five steps. The substrate is
deliberately simple; complexity lives in the cryptographic guarantees,
not in the code path.

```
   Application
       │
       ▼
   AI call    ────►    Anthropic, OpenAI, Bedrock, Vertex, Cohere,
                       any OpenAI-compatible endpoint, any gateway
       │
       ▼
   ① Capture
       Inputs and outputs are hashed (never stored in plaintext).
       Vendor + model + actor identity + policy bundle are recorded.
       │
       ▼
   ② Canonicalize
       RFC 8785 JSON Canonicalization Scheme produces byte-identical
       bytes across all 5 SDK implementations.
       │
       ▼
   ③ Sign + chain
       Ed25519 signature over the canonical bytes, key held in HSM
       (AWS KMS / Azure Key Vault / GCP KMS / PKCS#11).
       previous_receipt_hash links to the prior receipt for the same
       tenant; tampering is detectable at the first divergence.
       │
       ▼
   ④ Persist + commit
       Receipt stored in customer-controlled storage (local file,
       Postgres with row-level security, S3, or hosted tenant).
       Leaf hash committed to RFC 9162 transparency log; signed tree
       head archived to immutable storage with 10-year retention.
       │
       ▼
   ⑤ Verify (any time, by anyone)
       Public verifier in a browser confirms:
         · canonical hash matches the signed digest
         · Ed25519 signature verifies against the issuer's public key
         · chain linkage is intact
         · transparency-log inclusion proof is valid
       Verification requires only the receipt + the public key. No
       call to Project Ledger. No subscription. No vendor lookup.
```

The substrate does not block, judge, or guardrail the AI call. It
**records what happened, signed, in a format that survives the vendor
relationship.** That separation is intentional and is what makes it
deployable inside regulated enterprises without operational risk.

---

## 5 · What we built

| Capability | Status |
|---|---|
| Cryptographic substrate (RFC 8785 + Ed25519 + RFC 9162 transparency log) | Production-grade |
| Five language SDKs (TypeScript, Python, Go, Rust, Java) | Byte-identical signatures verified by CL1/CL2/CL3 conformance |
| One-import vendor kit | Auto-instruments Anthropic and OpenAI clients in any process |
| OpenAI-compatible proxy | One install covers Aider, Cline, Cursor, Continue, Windsurf, Codeium, Sourcegraph Cody, Zed, Tabnine |
| Native integrations | Cursor, Claude Code, LiteLLM, LangChain, Vercel AI SDK, Mastra, LlamaIndex, AutoGen, CrewAI, Pydantic AI, smolagents, Portkey, Cloudflare Worker, Kong |
| Browser extension | Chrome Manifest V3, corporate-OIDC identity binding, MDM-deployable |
| Admin console | Role dashboards for IT, Compliance, HR, Legal, Finance, Cost-discipline, Model-Risk-Management, Vendor-Benchmark, Insurance-underwriting, Data-lineage |
| Cost-discipline engine | Planner-then-executor model cascade with savings ledger, recommendations engine, dedup cache, model-fit scoring, budget-receipts, carbon attribution |
| Insurance-underwriting bundle | Carrier-format adapters for Munich Re aiSure, Mosaic, Armilla, generic |
| Model Risk Management workpaper | SR 11-7, OSFI E-23, PRA SS1/23, EU AI Act Annex IV-shaped exports |
| Public Vendor Benchmark | Quarterly composite scoring across hallucination proxy, cost-per-outcome, compliance posture, supply-chain risk |
| Public verifier | Static HTML; runs entirely in browser, no server call |
| Open specification | PL-RFC-001 … PL-RFC-010 (Draft v0.1) |
| Conformance program | CL1 / CL2 / CL3 levels, runnable corpus, vendor self-test ready |
| HSM-backed signing | AWS KMS, Azure Key Vault, GCP KMS, PKCS#11; FIPS 140-3 path documented |
| Hardening verifier | 66 mandatory controls, machine-verified in CI on every release |

---

## 6 · Cost discipline as a buyer attractant

For Heads of Engineering and CFOs concerned about AI spend, the
substrate ships a second-order benefit beyond accountability: a
built-in **cost-discipline engine** that operates on the receipt
stream.

| Module | What it does |
|---|---|
| **Planning cascade** | Uses a cheap planner model to draft, then an expensive executor model to commit — only on approval. 60-80% cost reduction on multi-turn workflows |
| **Savings ledger** | Append-only record of every cascade run with planner cost, executor cost, baseline cost, savings, approval status |
| **Recommendations engine** | Surfaces concrete patterns: "Opus invocations on this use case approved 87% of the time after Haiku preview — switching saves $1,842/month" |
| **Dedup cache** | Content-addressed cache by canonical prompt hash; cache hits are audit-visible |
| **Model-fit score** | Per-prompt 0-1 score of cheap-model fit; surfaces over-spend per use case |
| **Budget receipts** | When a budget guard throttles or denies a call, a signed receipt records the policy decision — proof for the developer that the policy did it, not them |
| **Carbon attribution** | Per-receipt CO₂e estimate by vendor + model + token count; feeds ESG reporting |

This addresses a separate buyer (the CFO) with a measurable ROI
metric (AI spend down 30-60% within one quarter) — a fast lane to a
paid contract independent of compliance pressure.

---

## 7 · Engineering maturity

Concrete artefacts inspectable in the repository today:

| Indicator | Value |
|---|---|
| Tests passing | 280+ across 30 test files |
| Hardening verifier | 66 / 66 mandatory controls PASS |
| Property-based fuzz tests on canonicalization | 2,000 random inputs, 3 invariants |
| Cross-language conformance | Byte-identical signatures across 5 SDKs |
| Lifecycle integration test | 50-receipt chain with tamper detection proven at 4 positions |
| TODOs / FIXMEs / HACKs in production code | 0 |
| Leaked credentials in committed code | 0 |
| Supply-chain artefacts | CycloneDX SBOM, SLSA Level 3 provenance, Sigstore cosign keyless signatures |
| Operational artefacts | Runbook with 5 named alerts; 2026-Q2 internal adversarial review (10/10 scenarios PASS); 2026-Q2 multi-region failover drill (47-min dry-run) |

---

## 8 · Security and privacy posture

For CISO and Head of Risk audiences:

- **Multi-tenant isolation** at the database layer. Postgres
  row-level security policies enforce tenant equality on every query.
  Cross-tenant query attempts are blocked, audit-logged, and trigger
  a P0 security event with named runbook procedure.
- **Privacy by default.** Prompts and responses are SHA-256 hashed
  before canonicalization. PII redaction is applied at the capture
  layer. Plaintext content never leaves the customer environment.
- **HSM-backed signing.** Private keys never leave the HSM. Four
  drivers shipped: AWS KMS, Azure Key Vault, GCP KMS, PKCS#11. FIPS
  140-3 path documented for federal customers.
- **Strict transport security.** HSTS 2-year preload-eligible. CSP
  with per-request nonce. X-Frame-Options DENY. Cross-Origin policies
  pinned to same-origin.
- **Auditable platform.** Every privileged action — key rotation, role
  change, plan change, support impersonation, deployment — produces a
  signed receipt on the platform's own audit chain.
- **No lock-in.** Every receipt is verifiable independently with the
  public key alone. A customer leaving Project Ledger retains their
  evidence permanently.

---

## 9 · Customers, segmented by readiness

| Profile | Ready when | Annual price | Wedge |
|---|---|---|---|
| Developers, small engineering teams | Today | Free (OSS) | Free install, real value in 60 seconds |
| AI-vendor SaaS attesting AI behaviour to customers | 1-3 months | $5-15k | Customer requests + reduced AI spend |
| Mid-market regulated (fintech, healthtech, insurtech) | 3-6 months | $25-75k | Regulator pressure + audit-prep |
| Tier-1 BFSI, insurance, healthcare, government | 12-18 months | $50-300k+ | EU AI Act enforcement + reference customer |
| Insurance carriers consuming underwriting feed | 6-12 months | Channel revenue | Risk pricing + loss attribution |
| Standards bodies (LF AI, OpenSSF, CNCF) | Today | Free, partnership | Specification adoption |

Honest position today: zero paying customers, pre-launch. Three
design-partner conversations now opening.

---

## 10 · Market sizing

| Tier | Definition | Size |
|---|---|---|
| **TAM** | AI governance + accountability infrastructure spend globally | **$5-15B by 2030** (Gartner-adjacent estimate; up from $200-500M today) |
| **SAM** | Regulated companies globally with binding AI compliance pressure today | **$500M-2B annually** (≈ 55,000 companies × $10-40k average annual spend on AI assurance tooling) |
| **SOM** | Achievable ARR in years 3-5 with the proposed open-core motion | **$50-150M ARR** (≈ 500-1,500 paying customers across Team / Business / Enterprise tiers) |

Comparable open-core trajectories: HashiCorp (~$5.1B at IPO),
GitLab (~$7B at IPO), Snyk (~$7.4B last valuation), Chainguard
(~$40M ARR within 24 months of launch, Sigstore-based).

---

## 11 · Open-core commercial model

**Free forever:** all five SDKs · full specification · conformance
suite · browser extension · self-hosted console · public verifier ·
embeddable widget · single-tenant production use.

**Paid hosted enterprise tier:**

| Plan | Audience | What it adds | ACV |
|---|---|---|---|
| Team | Engineering teams 20-100 | Hosted ingest + transparency log, identity binding, email support | $5-15k |
| Business | Mid-market regulated | + SOC 2 audit reports, regulator-specific evidence packs, SLA, named CSM | $25-75k |
| Enterprise | Tier-1 regulated, government | + deployment in customer cloud, customer-managed HSM, 24×7, custom regulator templates, on-site quarterly review | $50-300k+ |

**Adjacent revenue streams:** insurance underwriting feed (carrier
contracts) · evidence-pack-on-demand · conformance certification of
third-party implementations · hosted transparency-log service.

---

## 12 · Category landscape

| Category | Examples | Relationship |
|---|---|---|
| AI governance dashboards | Credo AI ($41M), ValidMind ($11M), Holistic AI ($9M) | They sell questionnaire-driven dashboards. We supply the cryptographic substrate they lack. Coexisting. |
| AI gateways | Portkey (Palo Alto), LiteLLM, Cloudflare AI Gateway, Kong | Layer 3 traffic management. We sit at Layer 5 (trust) via native plug-ins. |
| AI security / red-team | Lakera, Robust Intelligence (Cisco), Protect AI (Palo Alto), HiddenLayer ($50M), WitnessAI ($58M) | Pre-invocation safety. We attest post-invocation. Complementary. |
| Model identity / signing | Sigstore, OpenSSF Model Signing, Cisco Model Provenance Kit | Where the model came from. We attest what it did. Co-authorship proposed with OpenSSF. |
| Build provenance | in-toto, SLSA | Build-time. We are runtime-time. |
| AI liability insurance | Munich Re aiSure, Mosaic, Armilla ($25M) | We supply the underwriting data feed. Channel partnership target. |

**Strategic position:** the runtime accountability substrate above
model identity and below the governance dashboard — an empty category
the recent consolidation moves (Cisco, Palo Alto) confirm is forming.

---

## 13 · Roadmap · 12 months

| Quarter | Milestones |
|---|---|
| **Q3 2026** | Public GitHub launch · npm publication of `@projectledger/receipts-sdk` v0.6.0 with Sigstore provenance · spec site at `spec.projectledger.io` · LF AI Sandbox submission · LiteLLM upstream callback PR · Chrome Web Store extension · public transparency log live · first 3 design partners |
| **Q4 2026** | Hosted SaaS GA (Team and Business tiers) · SOC 2 Type I · third-party penetration test · first 5 paying customers · Public Vendor Benchmark v1 |
| **Q1 2027** | SOC 2 Type II observation window complete · first Tier-1 regulated reference customer · customer-managed HSM support · multi-region tenant deployment · first insurance-carrier underwriting feed live |
| **Q2 2027** | SR 11-7, OSFI E-23, PRA SS1/23, RBI FREE-AI regulator-template packs GA · Verifier Model R&D begins (cross-tenant trained quality model) |

---

## 14 · Risks we are watching

| Risk | Mitigation |
|---|---|
| Cisco (post-Galileo / MPK) or Palo Alto (post-Portkey) extending into runtime accountability before our standard takes hold | Spec publication this quarter + LF AI Sandbox submission + OpenSSF co-authorship outreach; standards-body alignment is the structural defense |
| Regulated enterprises accepting "dashboards + audit-firm sign-off" as sufficient before our cryptographic differentiation matters | Lead with AI-vendor SaaS layer first (faster pressure cycle) and build proof through Q4 design partners; reach BFSI when reference exists |
| Sigstore or OpenSSF expanding into runtime accountability before us | Position PL-RFC-001 as a VC profile compatible with OpenSSF; co-author rather than compete |
| Solo founder execution cannot scale to enterprise sales motion | Design-partner-only engagement until first paying customer; co-founder / first sales hire on second customer |
| Two-sided cold start (issuer + verifier) for adjacent document-credentials use cases | Out of scope for 2026; architectural option preserved in code for 2027 expansion off the AI receipts customer base |

---

## 15 · Current activity · this month

- Public repository launch in flight (`github.com/projectledger/receipts-sdk`, Apache-2.0)
- npm publication of `@projectledger/receipts-sdk@0.6.0` with
  Sigstore keyless provenance
- Specification site going live at `spec.projectledger.io` (GitHub
  Pages, PL-RFC-001 through PL-RFC-010)
- LF AI Sandbox application in submission
- LiteLLM upstream callback PR drafted and review-ready
- Three design-partner conversations active across BFSI (UAE/India),
  AI-vendor SaaS, and insurance-tech
- OpenSSF Model Signing co-authorship outreach initiated
- Public verifier and embeddable widget going live alongside the spec
  site

---

## 16 · Engagement options

| Mode | Investment | Use when |
|---|---|---|
| **Self-hosted evaluation** | Zero cost, today | Architecture and code review |
| **Guided design partner** | Free 12-week pilot | Real AI traffic, reference rights subject to your approval, path to paid renewal |
| **Architectural advisory** | Two-hour technical review with written summary | No further commitment intended |
| **Investor / advisor conversation** | Confidential briefing on roadmap, ARR plan, capital needs | When pattern matching to comparable open-core trajectories |

To engage on any mode, reply to this brief.

---

## 17 · What we are *not*

- **Not** an AI vendor. We attest to other vendors' behaviour.
- **Not** an AI governance dashboard. We supply the substrate they lack.
- **Not** an AI safety guardrail. We attest after the fact, not block before.
- **Not** competing with W3C Verifiable Credentials, DigiLocker, or
  Microsoft Entra Verified ID. Different market (documents). Not
  pursued today.
- **Not** at first-customer stage. We are at design-partner stage. We
  will not pretend otherwise.

---

## 18 · Closing

The runtime-trust category is forming in real time. The substrate is
production-grade today. Publication, deployment, and external
validation steps (SOC 2 Type II, third-party penetration test, first
paying reference) are scoped, dated, and in motion.

We are looking for honest expert review, design-partner pilots,
standards-body co-authorship, and introductions to anchor customers
in BFSI, insurance, healthcare, or government. We are not asking for
a sale today. Where the conversation leads to one in 6-12 months, we
will move toward it carefully and transparently.

---

**Repository** · github.com/projectledger/receipts-sdk (Apache-2.0)
**Specification** · spec.projectledger.io (PL-RFC-001 through PL-RFC-010)
**General enquiries** · hello@projectledger.io
**Security disclosures** · security@projectledger.io

Project Ledger Project · Document v1.2 · June 2026 · CC-BY-4.0
