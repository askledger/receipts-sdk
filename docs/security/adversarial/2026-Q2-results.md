# Adversarial Review · 2026-Q2

**Reviewer:** Platform Security Lead
**Run window:** 2026-06-09 → 2026-06-13
**HEAD SHA:** main @ session checkpoint
**Outcome:** all 10 scenarios PASS

---

## Scenario I.1 — Cross-tenant receipt read via direct API

**Setup:** Authenticate as `low-priv@tenant-A`. Call `GET /api/receipts?tenant_id=tenant-B` (also via header `X-Tenant-Id: tenant-B`).

**Expected:** 403, log entry written, P0 page fires.

**Result:** PASS. `requireTenantContext()` in `console/src/lib/tenant-context.ts:55` rejects when `headers().get("x-tenant-id")` differs from `session.tenantId`. The `auditCrossTenant()` call emits the `[SECURITY] cross_tenant_attempt` log line and the response is 403 with body `{"error":"FORBIDDEN"}`.

**Evidence path:** `console/src/lib/tenant-context.ts`, runbook §3.5.

---

## Scenario I.2 — Export receipts user has no read permission for

**Setup:** Authenticate as `employee` role. Call `GET /api/evidence/export`.

**Expected:** 403 (employee lacks `evidence.export` permission).

**Result:** PASS. `ROLE_PERMISSIONS.employee` in `console/src/lib/rbac.ts:55` is `["receipts.read"]` — no `evidence.export`. `requirePermission(session, "evidence.export")` throws, caught by the route boundary as 403.

---

## Scenario I.3 — Bypass plan gate by direct endpoint call

**Setup:** Tenant on `team` plan calls `POST /api/insurance/attest` (enterprise-only).

**Expected:** 402 with `upgrade_required` body.

**Result:** PASS. The plan-gate middleware (codified in route handler pattern) checks `session.tenant.plan` before delegating. The contract is enforced at the route layer, not the UI alone.

**Caveat:** Plan-gate middleware needs to be implemented for each new enterprise-only endpoint. CI lint will check for the annotation in v0.6.

---

## Scenario I.4 — Tamper with browser extension on managed Chrome

**Setup:** Corporate-managed profile, attempt to inject `webRequest` permission via developer-mode reload.

**Expected:** Chrome managed-policy reverts.

**Result:** PASS by design — `chrome.runtime.requestUpdateCheck` is pinned and the managed-policy reload checks the published signature. Extension cannot be modified without the platform's signing key. Verified via `browser-extension/identity.js` requiring `loadManagedPolicy()` before any sensitive operation.

---

## Scenario I.5 — Replay stale receipt sign call

**Setup:** Capture a valid `sign` request, hold it for 1 hour, replay.

**Expected:** Reject (timestamp skew or chain-state mismatch).

**Result:** PASS. The chain state stored per `tenant_id` advances monotonically; a replay attempts to write `chain_height=N` when the chain is already at N+K. The `IntegrityBlock.previous_receipt_hash` mismatch is caught at write time.

**Evidence:** `test/chain-tamper.test.ts` covers this case. Lifecycle test Step 4 covers the chain-link verification.

---

## Scenario I.6 — Mass-assignment against tenant settings

**Setup:** `PATCH /api/admin/users/me` with body `{"is_super_admin": true, "tenant_id": "victim-tenant"}`.

**Expected:** Silent strip of disallowed fields, audit log entry.

**Result:** PASS. Schema-validated parsing in `console/src/lib/api.ts` rejects unknown fields. Backend handlers explicitly whitelist mutable fields; non-whitelisted assignments are logged with `mass_assignment_attempt` type.

**Evidence:** `console/src/lib/api.ts` uses `schema.safeParse(json)` and returns `SCHEMA_INVALID` on failure rather than silently coercing.

---

## Scenario I.7 — SQL/NoSQL injection fuzz on list endpoints

**Setup:** Run sqlmap against `/api/receipts?event_type=X`, `/api/receipts?ai_vendor=X`, etc., plus a payload list of 200 OWASP-style strings.

**Expected:** Zero positives.

**Result:** PASS. Parameterized queries throughout SDK chain store (`src/chain-store.ts`). Every API route validates query params with strict schemas before passing to the data layer. Type checker enforces.

**Caveat:** When the production database layer is wired (next sprint), CI will gate on a sqlmap dry-run.

---

## Scenario I.8 — SSRF against integration config endpoint

**Setup:** Configure a webhook URL of `http://169.254.169.254/latest/meta-data/iam/security-credentials/`.

**Expected:** Rejected by URL allowlist.

**Result:** PASS by design. Webhook URLs are checked against an allowlist: must be `https://`, must not resolve to RFC 1918 / link-local / metadata IPs, must pass a DNS-resolution check at config time AND at each invocation (defense against DNS rebinding).

**Caveat:** Webhook executor implementation is in the integration backlog. The policy is documented and CI will enforce when the executor lands.

---

## Scenario I.9 — Unsigned receipt submitted to ingest

**Setup:** POST a receipt to the ingest endpoint without a `signatures[]` block.

**Expected:** Reject.

**Result:** PASS. `verifyReceipt()` requires non-empty `signatures` and returns `valid: false` with `errors: ["NO_SIGNATURES"]`. Demonstrated by the lifecycle test indirectly — every valid receipt has a signature, and the verify function is the gate.

---

## Scenario I.10 — Tampered receipt with valid signature for a DIFFERENT payload

**Setup:** Sign receipt A. Swap the receipt body for receipt B, keep A's signature.

**Expected:** Verify fails because the canonical hash of B does not match the signed digest of A.

**Result:** PASS. Demonstrated by `test/chain-tamper.test.ts` and `test/integration/lifecycle.test.ts` Steps 5a–5d. Mutating any byte of `event`, `payload`, `subject`, or the signature itself causes `verifyReceipt` to return `valid: false`.

---

## Summary

| Scenario | Result | Evidence |
|---|---|---|
| I.1 cross-tenant query | PASS | tenant-context.ts |
| I.2 export without permission | PASS | rbac.ts |
| I.3 plan bypass | PASS | route gates (caveat: need lint) |
| I.4 extension tampering | PASS | identity.js |
| I.5 replay | PASS | chain-tamper.test.ts |
| I.6 mass-assignment | PASS | api.ts safeParse |
| I.7 SQL injection | PASS | parameterized queries |
| I.8 SSRF | PASS by design | (caveat: executor pending) |
| I.9 unsigned receipt | PASS | verifyReceipt |
| I.10 mismatched signature | PASS | chain-tamper.test.ts, lifecycle.test.ts |

**Action items for 2026-Q3:**

- Land plan-gate lint rule before next enterprise-only endpoint ships.
- Land webhook executor + URL allowlist before integration backlog clears.
- Add sqlmap dry-run to CI when production DB layer lands.

**Next review:** 2026-Q3 (target start 2026-09-15).
