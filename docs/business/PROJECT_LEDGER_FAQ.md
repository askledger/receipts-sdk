# AskLedger · FAQ

Prepared answers to the questions a serious reader will ask after
reading the brief. Use directly in calls, emails, and Q&A.

---

### 1. Who else is using this today?

Honestly: zero paying customers. Pre-launch. Three design-partner
conversations active across BFSI in the UAE/India, AI-vendor SaaS,
and an insurance-technology vendor. The open-source repository
launches publicly this month, after which we expect early adoption
from the developer community and self-hosted evaluations.

### 2. How do you make money?

Standard open-core. The substrate, specification, SDKs, conformance
program, browser extension, and self-hosted console are free
forever under Apache-2.0. Paid hosted enterprise tiers add managed
ingest, hosted transparency log, SOC 2 audit reports,
regulator-specific evidence packs, SLA, named CSM, customer-cloud
deployment, customer-managed HSM keys, and 24×7 support. Plan
pricing ranges from $5-15k (Team) to $25-75k (Business) to
$50-300k+ (Enterprise) annually. Adjacent revenue includes
underwriting-feed contracts with AI-liability insurers and
conformance certification of third-party implementations.

### 3. What stops Microsoft, Cisco, or Palo Alto from doing this?

Two things. First, none of their recent acquisitions target runtime
accountability — Cisco bought Galileo (model provenance) and Robust
Intelligence (AI security); Palo Alto bought Portkey (AI gateway).
The substrate layer above all three is structurally open. Second,
becoming the standard requires open governance, an open
specification, a conformance program, and standards-body
sponsorship — patterns no acquirer can quickly replicate without
forking and rebranding. Our LF AI Sandbox submission and OpenSSF
Model Signing co-authorship work is the structural moat. The
window before a strategic buyer arrives is 12-18 months — long
enough to plant the flag if execution moves now.

### 4. How is this different from Credo AI, ValidMind, or Holistic AI?

They sell questionnaire-driven governance dashboards. We supply the
cryptographic substrate the dashboards currently lack. The dashboard
tells the CCO "we are 87% compliant." The receipt proves it to the
regulator. Both layers will coexist; the substrate becomes a
supplier to the dashboard category, not a competitor.

### 5. Why open source? Why not closed?

Three reasons. First, the buyer profile (CISO, regulator-facing
counsel) trusts open specifications over vendor-controlled formats —
this is the lesson of Sigstore, in-toto, and SLSA. Second, an open
specification can become a standard (LF AI, OpenSSF) which an
acquirer cannot easily replicate. Third, the open-core trajectory
of HashiCorp, GitLab, Snyk, and Chainguard has demonstrated that
free OSS adoption is the most effective funnel for paid enterprise
SaaS in infrastructure.

### 6. What's the team behind this?

The substrate has been built by a small founding engineering team.
For confidentiality reasons we do not list members publicly at this
stage. We will name maintainers as the open-source project launches
and the multi-stakeholder governance model formalises through LF AI.

### 7. When can I deploy this?

Today, in self-hosted mode. `docker compose up` brings up the full
stack — Postgres with row-level security, ingest endpoint, console,
local transparency log — on any machine that can run Docker. Signed
receipts begin flowing within 60 seconds of point a single AI client
at the substrate. The hosted SaaS tier general availability is
targeted for Q4 2026.

### 8. What is your SLA?

Open-source has no SLA (community-supported). The Team tier offers
email support. The Business tier carries a named CSM and a
99.9% uptime SLA. The Enterprise tier carries 24×7 on-call, a
99.95% uptime SLA, and incident response within 30 minutes for P0.
These commitments take effect when the hosted SaaS is in general
availability.

### 9. How do you handle PII?

Prompts and responses are SHA-256 hashed before canonicalization.
Plaintext content never leaves the customer environment in
self-hosted mode. The PII redaction layer applies tenant-configurable
patterns at the capture layer. Multi-tenant isolation is enforced
at the Postgres row-level-security layer; cross-tenant query attempts
are blocked, audit-logged, and trigger a P0 security event.

### 10. What's the customer's lock-in if they adopt this?

None. Every receipt is verifiable independently using the public
key alone. A customer who leaves AskLedger retains their full
evidence permanently and can verify it forever using any
implementation of the open specification. The chain itself is the
record; the substrate provider is replaceable.

### 11. Is this only for AI receipts?

The substrate is cryptographically general. The same primitives
work for verifiable employment documents (salary slips, offer
letters), bank statements, and education credentials — and we
preserve the architectural option in code. We are not pursuing
those markets in 2026 because Microsoft Entra Verified ID,
DigiLocker, and the EU's EUDIW occupy that lane. Document
credentials remain a 2027+ expansion option off the AI receipts
customer base.

### 12. What is your funding situation? Are you raising?

We have built to design-partner stage without external capital.
Conversations with strategic investors are open and welcome,
particularly those with portfolio relationships in BFSI, insurance,
or AI infrastructure. We are not running a competitive process at
this time.

### 13. What happens to my receipts if AskLedger shuts down or is acquired?

The receipts remain valid permanently. Verification requires only
the receipt body, the signature, and the public key — none of which
depend on AskLedger's continued operation. Customers who use
the hosted transparency log can also operate or migrate to an
independent log; the log's signed tree heads are archived to
immutable storage (S3 Object Lock, 10-year retention) and remain
publicly readable.

### 14. What is your single biggest risk?

Honest answer: execution speed. The category window is real but
finite. The most likely failure mode is not technical and not
strategic — it is the gap between engineering completion and
public launch. We are closing that gap this month with the
public repository, npm publication, LF AI Sandbox submission, and
the LiteLLM upstream pull request. If those four artefacts land
and developer adoption begins, the trajectory becomes
self-sustaining.

---

AskLedger Project · FAQ v1.0 · June 2026 · CC-BY-4.0
