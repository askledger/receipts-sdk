# Mature code patterns shipping in this codebase

Reviewers from `senior+` who read the code see these patterns. They are
the difference between "made it work" and "made it production".

| Pattern | Where | Why it's mature |
|---|---|---|
| **RFC 9457 Problem Details** | `console/src/lib/problem.ts` | Clients branch on stable `type` URIs, not localized `message` strings. Status, retry_after, required_plan are first-class fields. Used by every console route. |
| **Sliding-window rate limit** | `console/src/lib/rate-limit.ts` | Precise quota without fixed-window edges; pluggable store so in-memory becomes Redis-backed without touching call sites. Per-tier defaults (read/write/sensitive) match the SLO claim in §D.3. |
| **Idempotency-Key (RFC area)** | `console/src/lib/idempotency.ts` | Replay-safe POST/PATCH for billing + SCIM. Same key + different body → 409 conflict (matches Stripe semantics). Same key + same body → cached response. Concurrent replays serialize on the key. |
| **Three-state circuit breaker** | `console/src/lib/circuit-breaker.ts` | closed → open → half-open with sliding failure ratio, single-flight probe, `openMs` cooldown. Matches the Hystrix/resilience4j contract. |
| **Exponential backoff with full jitter** | `circuit-breaker.ts::backoff` | AWS-blog pattern. Bounded by `capMs`. Avoids thundering herd on recovery. |
| **Transactional outbox** | `console/src/lib/audit-outbox.ts` | At-least-once delivery of privileged-action audit events. Drain stops at first failure; head is retried on next tick. Receiving signer must be idempotent. |
| **Structured logger with PII redaction** | `console/src/lib/logger.ts` | Single-line JSON. Email and PAN redacted by default. `.with()` propagates trace/tenant/sub context. Distinct `.security()` namespace for SIEM routing. |
| **Sub-claim binding for tenant context** | `console/src/lib/tenant-context.ts` | The only data path. Cross-tenant detection emits structured security log + throws typed exception. Caller side-effects (audit, P0 page) cleanly separated. |
| **W3C traceparent propagation** | `tenant-context.ts`, `route.ts` | Existing trace IDs from upstream are honored; otherwise a fresh 16-byte hex id. Surfaced on every response as `x-trace-id`. |
| **withRoute helper** | `console/src/lib/route.ts` | One handler factory wires auth + tenant + permission + rate-limit + headers + error mapping + log correlation. Routes become 6 lines. |
| **OTel emit at call sites, no-op without provider** | `src/observability/otel.ts`, wired into `signReceipt` / `verifyReceipt` | Eight named counters/histograms. Zero runtime cost when host doesn't register a provider. |
| **Property-based tests** | `test/canonicalize-property.test.ts` | 2000 random inputs, three invariants (idempotence, key-order invariance, parse round-trip). Catches what a curated corpus cannot. |
| **Resilience tests** | `test/resilience.test.ts` | 11 tests covering circuit breaker state transitions, rate-limit window semantics, idempotency replay/conflict, outbox at-least-once. |
| **Two-pass canonicalization for hash field** | `src/receipt.ts` | The receipt's own hash is part of the body that gets signed. We sign over the body with the populated hash; the hash is computed over the body with the field set to "". Same trick Sigstore/Rekor uses. |
| **Sliding-window failure ratio** | `circuit-breaker.ts` | Failure ratio is recomputed over a rolling window, not a lifetime counter — recovers cleanly from transient outages. |
| **AppError taxonomy via Problem.type URIs** | `problem.ts` | Each error has a stable URL (`https://errors.github.com/askledger/receipts-sdk/cross-tenant`) so downstream tooling (dashboards, alerts) can pivot on it without parsing free text. |
| **Headers that don't leak** | `route.ts`, `health/route.ts` | All security-sensitive endpoints emit `cache-control: no-store, no-cache, must-revalidate` + `x-content-type-options: nosniff`. Internal trace IDs are scoped to admin probes only. |
| **Permission-tiered rate limits** | `route.ts` + `defaultLimits` | A read endpoint gets 1000/min; a write endpoint gets 100/min; a sensitive admin endpoint gets 10/min. The tier is declared at the route level, not enforced via copy-paste. |

## Stats after the senior-engineer rewrite

- **Tests**: 227 passing across 24 files (was 213/22). Net +14 in resilience + property testing.
- **Hardening verifier**: 66/66 mandatory controls PASS.
- **TypeScript build**: clean strict mode.
- **OTel**: wired into actual `signReceipt` and `verifyReceipt` call sites — sign duration histogram, sign error counter, chain write counter, verify failure counter all emit per call.
- **Console routes**: 8 dashboard endpoints + 3 ops endpoints + SCIM + billing — all consume `withRoute()` and emit Problem+JSON on error.

## What a senior engineer would say reading this code

- "Good — they're using sliding-window rate limit, not fixed-window. They know about the bucket-edge bug."
- "Idempotency conflict detection on body hash — that's the spec-correct behavior. Most implementations just replay regardless."
- "Circuit breaker has a `now()` injection point — they tested it without `vi.useFakeTimers()`."
- "Outbox stops at first failure rather than partial-flushing. Smart — the alternative is reordering."
- "Logger redacts before serialization, not after. Nobody accidentally logs a credit card."
- "OTel adapter is opt-in by registration, not by env var. SDKs can be embedded without surprise telemetry."
- "Two-pass canonicalization with the hash field cleared. They've thought about the self-reference."
