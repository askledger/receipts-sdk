# Honest end-to-end enterprise-grade audit

**Date:** 2026-06-13
**Method:** read every file, separate genuine implementation from stub from doc.
**Output:** what we can sell today, what needs more work, what would be flagged in a real third-party code review.

This is the file to read before any sales conversation. It is deliberately
the opposite of marketing.

---

## What is genuinely shippable today

These pieces would survive a third-party code review and an enterprise
buyer's POC.

### Cryptographic substrate
- **RFC 8785 canonicalization** (`src/canonicalize.ts`) — real implementation,
  byte-exact across 5 languages, 11 conformance tests.
- **Ed25519 signing + verify** (`src/crypto.ts`, `src/verify.ts`) — real
  `@noble/ed25519`. 213 tests including tamper at head/middle/tail/sig-flip.
- **Hash chain** (`src/chain.ts`, `src/chain-store.ts`) — real per-tenant
  state, persisted to disk, monotonic height, prev-hash linkage proven by
  the lifecycle E2E test.
- **Cross-language conformance vectors** — real shared corpus; each SDK
  must produce identical signatures.

### Test surface
- **213 tests across 22 files**, all green. Coverage includes adversarial
  scenarios (chain tamper, key isolation, canonical-form mutation), not
  just happy path.
- **Lifecycle E2E** — keygen → 50 chained signs → verify all → tamper
  detection at 4 positions → cross-key isolation → determinism.
- **Tenant-context predicate** — 9 tests including NFC vs NFD unicode
  edge case.

### Operational discipline (documents, but real ones)
- **Runbook** with 5 named alerts, each pointing at runbook anchors.
- **Hardening checklist** with 66 mandatory controls — and an **executable
  verifier** that actually checks each one against the repo state. 66/66
  PASS on the current SHA.
- **2026-Q2 adversarial review** with 10 scenarios run and evidence pinned
  to specific files. Two honest "caveat" rows where the protection is
  by-design but the implementing code is in the backlog.
- **2026-Q2 failover-drill record** — 47-minute dry-run, 4 actionable
  findings with owners and due dates.

### Code-quality hygiene
- TypeScript strict mode across SDK and console.
- ESLint config: `no-explicit-any: error`, `no-floating-promises: error`,
  `eqeqeq: error`, plus documented overrides for test files and the OTel
  boundary.
- CODEOWNERS enforces 2-reviewer rule on every crypto file.
- CHANGELOG, SECURITY.md, MAINTAINERS.md, CONTRIBUTING.md all real.

---

## What looks more polished than it actually is

These are the rows where a sharp reviewer would push back. None of them
block a sales POC, but a CTO due-diligence review would catch them.

| Item | What we have | What we don't have |
|---|---|---|
| **Console API routes** | Auth + tenant binding + permission check + trace propagation + schema-validated client. Real contracts. | Persistence layer. The 8 dashboard endpoints return fixture data from `console/src/lib/fixtures.ts`. The contract is real; the data plane is not yet wired to Postgres. |
| **SCIM 2.0 provisioning** | RFC 7644-shaped endpoint with bearer auth, pagination, idempotency markers, location header on POST. | No actual user table writes — the POST handler returns the created representation but does not persist. Three days of work to wire to the real users table. |
| **Billing webhooks** | Real HMAC verification with constant-time compare, 5-min skew window, idempotency set, event-type dispatch. | The dispatched handlers comment "Update tenant plan + entitlements" but don't actually mutate state because the plan/entitlement table isn't built. Two weeks. |
| **OTel adapter** | Real shape — 8 named counters/histograms, no-op when no provider registered. | Not wired into the existing `signReceipt` / `verifyReceipt` call sites yet. The instrumentation is opt-in via the adapter; the call sites need updating. One day's work. |
| **HSM drivers (AWS KMS, Azure KV, GCP KMS, PKCS#11)** | Real driver shapes that follow each vendor's SDK. Tests cover the adapter contract. | They have not been run against real cloud HSMs in CI. The AWS one likely works; PKCS#11 needs a hardware key in test infra to fully prove. |
| **Transparency log** | Real RFC 9162-shaped append + STH publish in `src/transparency-log/`. | Not running against a production Trillian deployment. The protocol is implemented; the operations side requires deploying Trillian. |
| **OPA policy bridge** | Real policy-evaluation hook. | The OPA bundles in `policy/` are illustrative; a customer would need to author their own. |
| **Browser extension identity binding** | Real Chrome managed-policy detection + OIDC PKCE flow. | Not signed by an extension key + not published to the Chrome Web Store. Until that happens, customers can't actually deploy it via Google Admin. |
| **Console accessibility audit** | WCAG 2.1 AA criteria walked through in the audit doc. | We did not actually run axe-core against a deployed build in this session — the audit is based on inspection. A real axe-core CI run is a 30-minute task once the console is deployed. |

---

## What is documentation, not implementation

These are deliberate. They describe how something WOULD work when
implemented. The buyer needs to understand the difference.

- `docs/operations/RUNBOOK.md` §6.4 — the restore drill is described
  procedurally. We have not yet executed a full restore-from-cold drill
  against a production deployment.
- `docs/security/HARDENING_CHECKLIST.md` §A.4 — `pl-jit elevate` is named
  as the JIT elevation tool. The tool's CLI exists in design; it has not
  been built.
- The "tenant deletion → 30-day soft-delete → cryptoshredding" policy
  in `HARDENING_CHECKLIST.md` §J.2 — the policy is correct. The
  implementing job has not been written.
- The "weekly automated test attempts cross-tenant access from every API
  endpoint" claim (§B.7) — covered partially by `test/integration/lifecycle.test.ts`
  and `test/tenant-context.test.ts` but not yet a full surface sweep.

---

## What a third-party code reviewer would flag

I am being deliberate here. These are the things I would write up as
findings if I were paid to review this repo for a buyer.

1. **Fixture data behind real API contracts.** The 8 dashboard endpoints
   look real (auth + tenant + permission + trace) but return constants.
   A code reviewer with a junior eye will assume they query a database;
   a senior reviewer will spot the imports from `fixtures.ts` and ask
   "when is the data plane wired?". Honest answer: 2-3 weeks for an MVP
   Postgres layer.

2. **Test coverage is breadth-first, not depth-first.** 213 tests is a
   lot, but most modules have 5-10 tests. Critical modules
   (canonicalize, signReceipt, verifyReceipt, chain) deserve property-
   based fuzz tests beyond what `test/fuzz.test.ts` has. A reviewer
   would ask for jsfuzz / fast-check coverage to be doubled.

3. **No integration test that actually starts the console + signs a
   receipt + sees it in a dashboard.** The lifecycle test exercises the
   SDK; the console tests would exercise rendering. There is no
   playwright E2E test that proves they connect.

4. **The console "production" code paths are commented placeholders.**
   `console/src/app/api/receipts/route.ts` still has the
   "Production: const rows = await db.query(...)" comment with demo data.
   That's the smell of "API contract is set; implementation is pending"
   which is honest but a reviewer will flag it as undelivered scope.

5. **No load test results.** We've named the SLOs (signer p95 < 50ms,
   chain write p99 < 100ms). We have not benchmarked them under realistic
   load. The benchmark script in `benchmarks/` runs but has not been
   parameterized for the SLOs.

6. **The OTel adapter is opt-in and uncalled.** I built the shape; I did
   not modify `signReceipt`/`verifyReceipt` to call `recordSign`/
   `recordVerify`. So even if a customer wires OTel, they won't get
   metrics today. Honest one-day fix.

7. **The release workflow has never run.** The `.github/workflows/release.yml`
   will sign with cosign keyless and attest SLSA L3. We have not actually
   tagged `v0.5.0` or `v1.0.0`. Until we do, the supply-chain story is
   theoretical.

8. **No third-party security audit.** Adversarial review is internal.
   Real enterprise buyers require an external pentest report (Bishop Fox,
   NCC, Trail of Bits, etc.). That's a $40-80k engagement and 4-6 weeks.

---

## Are we REALLY enterprise grade end-to-end?

Honest answer, broken into the audiences who will ask:

### To a developer evaluating the SDK
**Yes.** The substrate is real, the tests are real, the cross-language
parity is real. They can `npm install @askledger/receipts-sdk` (once
published), call `signReceipt`, get a real signed receipt, and verify it
with the bundled `verifyReceipt`. The docs are accurate.

### To a CISO evaluating for adoption
**Mostly yes, with two caveats.**
- The cryptographic claims are real. The tenant-isolation contract is
  real. The hardening checklist is auditable.
- BUT they will ask for the third-party pen-test report (we don't have
  one), the SOC 2 report (we have the control framework, not the audit),
  and proof of restore-drill execution (we have the procedure, not the
  execution record).

### To a CFO/buyer wanting to deploy in production
**No, not yet.** The console is single-tenant per pod, the data plane
behind the dashboards is fixtures, the SCIM endpoint doesn't persist,
the billing webhooks don't mutate state. To stand up a hosted SaaS that
a paying customer can use, the gap is roughly 6-10 weeks of focused
backend work plus a third-party pen-test.

### To an open-source community / CNCF reviewer
**Yes.** Apache-2.0, real CHANGELOG, real SECURITY.md, real
CONTRIBUTING + CODEOWNERS + MAINTAINERS, real CI workflow, real
hardening checklist with executable verification. This passes a CNCF
Sandbox readiness review today.

---

## What to do next, in priority order

If we get one engineering week:
1. Wire the data plane behind the 8 dashboard endpoints to a real Postgres
   layer with row-level security policies. The contract doesn't change.
2. Wire `recordSign`/`recordVerify` into the actual SDK call sites so
   OTel-enabled deployments emit metrics.
3. Tag `v0.5.0` so the release workflow runs and we get the first
   cosign+SLSA artifact.

If we get one engineering month:
4. Stand up Trillian + connect the transparency-log module to it.
5. Persist SCIM users + plan/entitlement state for billing.
6. Run axe-core in CI against a deployed console.

If we get one engineering quarter:
7. Hire Bishop Fox or NCC for a pen-test of the substrate + console.
8. Engage a SOC 2 Type II auditor with our existing control framework.
9. Publish the browser extension to the Chrome Web Store with a real
   signing key.

---

## Bottom line

We do not yet have everything an enterprise buyer would need on the day
they hand us a check. We have substantially more than a typical
"v0.1 open-source project" would have: cryptography that is real and
proven, a tenancy contract that is enforced and tested, an operational
discipline (runbook + checklist + verifier + drills + adversarial review)
that resembles a mature platform team, and a CI/release surface that
matches the SLSA L3 / cosign-keyless baseline a security-aware enterprise
will expect.

The honest one-line summary: **the substrate is production-grade; the
hosted-SaaS console is mid-build with the contracts set; the operational
hygiene is real but a few claims describe future state.** A buyer who
reads this audit and the scorecard side-by-side will trust us more, not
less.
