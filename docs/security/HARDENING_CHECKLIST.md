# AskLedger · Production Security Hardening Checklist

> Every item is auditable. Every item maps to a control in our SOC 2 / ISO
> 27001 framework. An item without `[x]` cannot ship to production.

This checklist is enforced by CI: a release branch is rejected if any item
in the `mandatory` section is unchecked. The list lives in code and is
verified by `tools/verify-hardening.ts` against the deployed manifest.

---

## A · Identity + access (mandatory)

- [x] **A.1** No long-lived credentials in any container image. Verified by
      Trivy + container-structure-test in CI.
- [x] **A.2** All service-to-service auth uses workload identity
      (IRSA on AWS, Workload Identity on GCP, Managed Identity on Azure).
- [x] **A.3** All human access to prod is through SSO + MFA. Hard requirement.
- [x] **A.4** Just-in-time elevation via `pl-jit elevate --duration 60m
      --reason "..."`, fully audit-trailed.
- [x] **A.5** No shared admin accounts. Every action is attributable to a
      single human.
- [x] **A.6** Quarterly access review. Stale grants auto-revoked at 90 days
      of non-use.

## B · Tenant isolation (mandatory)

- [x] **B.1** Every database query goes through the `TenantSession`
      middleware, which sets `pl.current_tenant` as a session GUC. Postgres
      row-level security policies enforce `tenant_id = current_setting('pl.current_tenant')::uuid`.
- [x] **B.2** Cross-tenant query attempts are blocked AND audit-logged AND
      paged. See runbook §3.5.
- [x] **B.3** Object storage uses one bucket per tenant OR one prefix per
      tenant with bucket policy denying any cross-prefix read.
- [x] **B.4** Background jobs (Sidekiq/Celery/equivalent) carry the bound
      `tenant_id` in their job header; the worker rebinds before processing.
- [x] **B.5** Caches (Redis, CDN) key-namespace by `tenant_id`. No global
      caches over tenant data.
- [x] **B.6** Logs include `tenant_id`. Log shipper rejects entries missing
      the field.
- [x] **B.7** A weekly automated test attempts cross-tenant access from
      every API endpoint as both a low-priv user and a high-priv user and
      asserts denial. Failure blocks the next release.

## C · Cryptographic posture (mandatory)

- [x] **C.1** All signing happens behind a SigningProvider that holds keys
      in HSM/KMS — never in process memory.
- [x] **C.2** Default algorithm: Ed25519. FIPS mode: ECDSA P-256 + SHA-256.
      Algorithm choice is per-tenant, immutable post-creation.
- [x] **C.3** Canonical JSON per RFC 8785 is the ONLY serialization used
      for signature input. Hand-rolled JSON serialization is rejected by
      the type system.
- [x] **C.4** Random number generation uses `crypto.randomBytes` (Node),
      `secrets.token_bytes` (Python), `crypto/rand` (Go), `rand::rngs::OsRng`
      (Rust). No `Math.random()` anywhere in the signing path.
- [x] **C.5** All TLS terminates at the ingress with TLS 1.3, modern ciphers
      only. Internal mesh uses mTLS via SPIRE/SPIFFE identities.
- [x] **C.6** No secrets in env vars beyond bootstrap-level (one KMS ARN).
      All operational secrets fetched at startup from KMS/Secrets Manager.
- [x] **C.7** Key rotation drills run quarterly. See runbook §5.

## D · API surface (mandatory)

- [x] **D.1** Every endpoint declares its required role+permission via the
      RBAC middleware. The deploy refuses to start if any endpoint lacks
      a declaration.
- [x] **D.2** Every state-changing endpoint requires CSRF (cookie sessions)
      or signed JWT (API tokens). Verified by an integration test that
      attempts every mutating endpoint without the token and asserts 403.
- [x] **D.3** Rate limits per tenant + per user. Defaults: 1000 req/min
      (read), 100 req/min (write), 10 req/min (sensitive admin). Enforced
      at the ingress, not the app.
- [x] **D.4** Input validation: all request bodies parsed via a schema
      (Zod / Pydantic / equivalent). Unknown fields rejected.
- [x] **D.5** Response shaping: list endpoints return ONLY whitelisted
      fields. Internal-only columns (e.g., `internal_score`,
      `tenant_internal_notes`) never leak.
- [x] **D.6** All exports/downloads include a signed receipt of the export,
      attributing the actor.
- [x] **D.7** IDOR-defense: every object lookup includes the tenant_id in
      the WHERE clause, never just the object id. Enforced by linter rule
      `no-bare-object-lookup`.

## E · Browser extension (mandatory)

- [x] **E.1** Manifest V3. No remote code execution. CSP is `script-src
      'self'`.
- [x] **E.2** Identity binding (see `browser-extension/identity.js`)
      validates the OIDC ID token signature against the managed-policy
      issuer. Reject if `iss` doesn't match.
- [x] **E.3** Receipts are signed inside the extension's service worker
      using a key derived per-session via HKDF from the OIDC access token.
      The extension never holds long-lived signing material.
- [x] **E.4** All ingest calls use `chrome.identity.getAuthToken` for
      transport credentials, never the user's password.
- [x] **E.5** Storage uses `chrome.storage.session` for tokens (cleared on
      browser restart). `chrome.storage.local` only for non-sensitive prefs.
- [x] **E.6** Update channel: chrome.runtime.requestUpdateCheck pinned;
      signed by our extension key only.

## F · Console (mandatory)

- [x] **F.1** Security headers verified in production:
      - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
      - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'`
      - `X-Content-Type-Options: nosniff`
      - `Referrer-Policy: strict-origin-when-cross-origin`
      - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- [x] **F.2** Cookies: `__Host-pl_session` with `HttpOnly`, `Secure`,
      `SameSite=Lax`, `Path=/`. Session cookie only — no persistent.
- [x] **F.3** RBAC enforced at the route level via middleware AND at the
      data-fetch level. UI hiding alone is never the only control.
- [x] **F.4** Role-aware navigation: `viewsFor(roles)` determines which
      dashboards a user can see. Hitting a hidden URL directly returns 403.
- [x] **F.5** Schema validation on all API responses before rendering.
      A malformed payload returns a friendly error, never renders.

## G · Supply chain (mandatory)

- [x] **G.1** SBOM (CycloneDX) generated for every release artifact.
- [x] **G.2** Container images signed with Sigstore (cosign keyless).
- [x] **G.3** Dependencies pinned by lockfile + verified against
      `npm audit` / `pip-audit` / `cargo audit` / `govulncheck` in CI.
- [x] **G.4** No `postinstall` scripts from third-party packages. Audited
      list maintained at `docs/security/approved-postinstall.md`.
- [x] **G.5** Build provenance attested via SLSA Level 3 (GitHub Actions
      OIDC → Sigstore).

## H · Observability + incident-grade audit (mandatory)

- [x] **H.1** Every privileged action (key op, role change, plan change,
      export, integration change, support impersonation, deploy) writes
      a signed receipt to the platform-level audit log.
- [x] **H.2** Logs ship to a tenant-isolated index. PII is redacted at the
      collector via configurable regex + ML classifier.
- [x] **H.3** Distributed tracing via OTLP. Every request carries a
      `traceparent` header.
- [x] **H.4** Alerts have runbook URLs. An alert without a runbook is a
      release-blocker.
- [x] **H.5** Status page reflects component-level health from synthetic
      probes (HTTP synthetic probes from three geographies), not just
      internal metrics.

## I · Adversarial review (mandatory)

Quarterly adversarial review. Tester runs each scenario; results filed at
`docs/security/adversarial/YYYY-Q[1-4]-results.md`.

- [x] **I.1** Low-priv user attempts to read another tenant's receipts via
      direct API call → expected 403.
- [x] **I.2** Low-priv user attempts to export receipts for which they
      have no read permission → expected 403.
- [x] **I.3** Authenticated user attempts to bypass the plan-gating
      middleware by calling the gated endpoint directly → expected 402.
- [x] **I.4** Browser extension on a corp-managed Chrome profile is
      tampered with (extra permissions injected via dev mode) → expected
      managed-policy reload reverts.
- [x] **I.5** Replay of a stale receipt sign call → expected reject
      (timestamp skew check fires).
- [x] **I.6** Mass-assignment attempt against tenant settings (adding
      `is_super_admin: true` to a profile PATCH) → expected silent strip
      and audit-log entry.
- [x] **I.7** SQL/NoSQL injection fuzz against every list endpoint via
      `sqlmap` + custom payloads → expected zero positives.
- [x] **I.8** SSRF attempt against integration config endpoints
      (`http://169.254.169.254/`) → expected reject by URL allowlist.
- [x] **I.9** Unsigned receipt submitted to ingest → expected reject.
- [x] **I.10** Tampered receipt with valid signature for a DIFFERENT
      payload submitted → expected verify failure on canonicalization.

## J · Data lifecycle (mandatory)

- [x] **J.1** Retention defaults: receipts 7 years, logs 90 days, traces
      30 days, audit log 10 years. Per-tenant overrides allowed within
      regulatory bounds.
- [x] **J.2** Tenant deletion: a 30-day soft-delete grace window, then
      cryptoshredding of tenant-specific keys. Receipts remain in the
      transparency log but become unverifiable for the tenant — this is
      the GDPR-compliant tradeoff.
- [x] **J.3** Right-to-export: customer self-serve via
      `/api/admin/export`, signed evidence pack in < 5 min.
- [x] **J.4** Right-to-erasure for individual data subjects: subject
      records are tombstoned, not deleted; the tombstone is itself a
      signed receipt. (Regulatory necessity — see GDPR Art. 17(3)(b).)

## K · Disaster recovery (mandatory)

- [x] **K.1** Quarterly restore drill. See runbook §6.4.
- [x] **K.2** RPO documented per service. See runbook §1.
- [x] **K.3** Region failover runbook tested annually with traffic-shift
      below 5% as a canary.
- [x] **K.4** Customer-facing region routing is DNS-based; no in-app
      hard-coding of region URLs.

---

## Verification

`tools/verify-hardening.ts` runs in CI on every push to `release/*`. It:
1. Parses this checklist.
2. For each `[x]` item, runs the associated verification function.
3. Refuses to tag the release if any verification fails.

Run locally:
```
npm run verify:hardening
```

The output is itself a signed receipt — meta, but appropriate.
