# Penetration Test · Scope of Work (SOW)

**Engaging party:** Project Ledger, Inc. (or successor entity)
**Target firms:** Bishop Fox · NCC Group · Trail of Bits · Cure53 · Doyensec
**Engagement type:** Full-stack penetration test + secure-code review
**Estimated duration:** 4-6 weeks
**Estimated cost:** USD 40,000 - 80,000 (varies by firm and scope depth)

---

## 1 · Objective

Independent attestation that the Project Ledger receipts substrate +
hosted console + browser extension are free of high-impact vulnerabilities
that would block enterprise customer adoption.

## 2 · In-scope assets

1. **Receipts SDK (`receipts-sdk` repo, tag `v0.6.0`).**
   - Cryptographic primitives (`src/canonicalize.ts`, `src/crypto.ts`, `src/receipt.ts`, `src/verify.ts`).
   - HSM drivers (`src/hsm/*`).
   - SigningProvider abstraction.
   - Chain store (`src/chain.ts`, `src/chain-store.ts`).
   - Merkle batch (`src/merkle.ts`).
   - Transparency-log client (`src/transparency-log/`).
   - Cross-language SDKs (Python, Go, Rust, Java) — substrate-level only.

2. **Admin console** (`console/`)
   - Authentication and session handling (`lib/auth.ts`, `lib/csrf.ts`).
   - RBAC (`lib/rbac.ts`) and tenant isolation (`lib/tenant-context.ts`).
   - Postgres data layer with row-level security (`lib/db.ts`, `lib/repos.ts`, `migrations/`).
   - REST endpoints under `app/api/`, including SCIM 2.0 and billing webhooks.
   - Security headers middleware (`src/middleware.ts`).

3. **Browser extension** (`browser-extension/`)
   - Manifest V3 background + content scripts.
   - Identity binding (`identity.js`) and OIDC PKCE flow.
   - Receipt ingest to the relay endpoint.

4. **Deployed staging environment** (`staging.github.com/askledger/receipts-sdk`)
   - Same image + Helm chart as production.
   - Postgres with RLS active, Trillian log, OTel collector.
   - Synthetic tenants seeded with realistic data.

## 3 · Out of scope

- Customer-modified forks of the OSS substrate.
- Third-party services we depend on (Stripe, Okta, Auth0, Entra ID, etc.).
  Findings about their default configuration should be reported but not
  exploited.
- DoS via overwhelming volume from a single source.
- Social engineering of Project Ledger staff or customers.

## 4 · Test categories (minimum coverage required)

### 4.1 Cryptographic substrate
- Differential test of canonicalize against RFC 8785 reference suite.
- Signature malleability against Ed25519 verify.
- Chain-tamper detection at boundary positions (first, last, randomly chosen middle).
- Two-pass canonicalization correctness with `receipt_hash` reset.
- Key-confusion attacks (different kid, same key material; same kid, different material).
- Replay of stale sign calls; chain-state race conditions.

### 4.2 Tenant isolation
- All ten scenarios in `docs/security/adversarial/2026-Q2-results.md` re-run independently.
- Postgres row-level-security policy bypass attempts:
  - Manipulating `pl.current_tenant` GUC from the application.
  - Connection pooling state leakage between requests.
  - Bypass via DEFERRED constraint timing.
- Background job + queue worker isolation.
- Object-storage prefix isolation (when wired).

### 4.3 Web application (admin console)
- Full OWASP ASVS L2 coverage.
- AuthN/AuthZ (cookie + JWT paths).
- IDOR on every list and detail endpoint.
- Mass assignment via SCIM and admin endpoints.
- CSRF on every mutating endpoint.
- SSRF on the webhook configuration endpoint.
- Open redirects.
- File upload paths (none in v0.6, confirm absence).
- Stored / reflected XSS.

### 4.4 Browser extension
- Permission abuse (extra hosts, web requests).
- Identity-binding bypass on a managed-policy profile.
- Content-script isolation against hostile pages.
- Storage isolation (`chrome.storage.session` vs `local`).

### 4.5 Supply chain
- SBOM completeness and accuracy.
- Reproducible build from a clean checkout.
- Cosign signature verification on shipped image.
- SLSA L3 provenance attestation chain.

### 4.6 Operations / infrastructure
- Container hardening (distroless, non-root, read-only FS).
- Helm chart NetworkPolicy correctness.
- Secrets management — no secret in env, image layer, or git history.
- TLS configuration of the deployed staging endpoint.

## 5 · Deliverables

1. Executive summary (2-3 pages) addressed to CISO-level audience.
2. Technical findings report — every finding has:
   - Severity (CVSS 3.1).
   - Reproduction steps.
   - Recommended remediation.
   - References (CWE, ASVS).
3. Re-test report after remediation (one round included).
4. A signed attestation letter we can show to customers and regulators.

## 6 · Severity targets at handoff

- **Zero Critical** open at sign-off (or accepted by Project Ledger CTO with documented compensating control).
- **Zero High** open at sign-off.
- All Medium findings either fixed or scheduled with named owner + due date.

## 7 · Conduct

- Rules of engagement signed before kickoff.
- All testing against staging, not production.
- Researcher attestation that any data accessed is destroyed after report.
- Daily standup during active testing weeks.

## 8 · Vendor evaluation matrix

| Factor | Weight |
|---|---|
| Cryptography depth on team | 30% |
| Prior work on regulated SaaS | 20% |
| Code-review hours included | 15% |
| Re-test included in fixed price | 10% |
| Reference customers in our segment | 10% |
| Insurance + safe-harbor language | 10% |
| Speed of kickoff | 5% |

## 9 · Decision deadline

Engage vendor by **2026-09-30** so the report is in hand for the
**2026-Q4 sales motion**.
