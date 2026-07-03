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
npm test                                # 194 tests across 20 files
npm --prefix python test               # 12 tests
go test ./go-sdk/... -race             # 3 tests, race detector on
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

Conformance vectors live at `conformance/vectors/`. Each SDK must produce
identical signatures for identical inputs.

```
npm run conformance:test                # TS
python -m pytest python/tests/test_conformance.py
go test ./go-sdk/conformance/...
cargo test --manifest-path rust-sdk/Cargo.toml conformance
mvn -f java-sdk/pom.xml -Dtest=ConformanceTest test
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
