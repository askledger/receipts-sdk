# AskLedger · Quality gates

A change cannot ship to `main` unless every gate is green. CI enforces this.
This document tells you what the gates are and how to debug them locally.

---

## Gate 1 · TypeScript builds clean

```
npm --prefix . run build
npm --prefix console run typecheck
```
Strict mode, no `any`, no implicit `any`, no unused imports.

## Gate 2 · All tests pass

```
npm test                                          # TypeScript suite
PYTHONPATH=python-sdk/src python3 -m pytest python-sdk/tests -q   # 48 tests
go test ./go-sdk/... -race                        # 3 tests, race detector on
```

Required: 100% pass rate. Flaky tests are quarantined within 24 h and
fixed within one sprint.

## Gate 3 · End-to-end lifecycle

```
npm test -- test/integration/lifecycle.test.ts
```

This single test is the answer to "does it actually work?" — keygen → sign
50 → verify → tamper detection at three positions → cross-key isolation.
If this test red, no release.

## Gate 4 · Cross-language conformance

Shared vectors live at `test/conformance/` (`canonicalize.json`, 43 vectors;
`sha256.json`, 4). Every SDK must reproduce them byte for byte.

SCOPE, stated plainly: what is cross-verified today is RFC 8785
canonicalization and SHA-256, NOT signed receipts. `SIGNED_VECTORS` and
`CHAINED_VECTORS` in `conformance/src/vectors.ts` are still empty, so each
non-TS SDK's signing test is a self-consistent round-trip against its own
verifier. Freezing receipt vectors from the reference implementation is the
open work that would make CL2/CL3 meaningful.

```
npx vitest run test/conformance.test.ts           # TS
PYTHONPATH=python-sdk/src python3 -m pytest python-sdk/tests -q
go test ./go-sdk/...
cargo test --manifest-path rust-sdk/Cargo.toml
mvn -f java-sdk/pom.xml test
```

## Gate 5 · Linting + style

```
npm run lint                           # ESLint strict
npm run lint:console                   # Next.js lint
ruff check python/
cargo clippy --manifest-path rust-sdk/Cargo.toml -- -D warnings
```

## Gate 6 · Security scans

```
npm audit --audit-level=high
pip-audit -r python/requirements.txt
govulncheck ./go-sdk/...
cargo audit --manifest-path rust-sdk/Cargo.toml
```

Zero `high` or `critical` vulnerabilities. Period.

## Gate 7 · SBOM + provenance

```
syft . -o cyclonedx-json=sbom.json
cosign attest --predicate sbom.json $IMAGE
```

SBOM attached to every release image. SLSA Level 3 provenance attested.

## Gate 8 · Hardening checklist

```
npm run verify:hardening
```

See `docs/security/HARDENING_CHECKLIST.md`. Any unchecked mandatory item
blocks release.

## Gate 9 · Adversarial scenarios

Each of the 10 scenarios in `HARDENING_CHECKLIST.md` §I must have a recent
pass on the current release SHA. Older than 90 days → blocks release.

## Gate 10 · Operational readiness

- Runbook entry exists for every alert defined in `monitoring/alerts.yml`.
- Every new public endpoint has rate-limit rules in `ingress/rate-limits.yml`.
- Every new background job has retention + dead-letter config.

---

## Definition of done

A change is done when:

1. Gates 1–7 are green in CI.
2. Gates 8–10 are green for the release branch.
3. PR description references the affected module/dashboard/role/plan matrix
   (see CONTRIBUTING.md § "Change scope").
4. A reviewer with relevant ownership has approved.
5. Migration notes added if schema changed.
6. Customer-facing release notes drafted if behavior changed.

Until all six are true, the work is not done. We don't ship 80%.
