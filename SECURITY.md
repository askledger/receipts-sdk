# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in this SDK or the receipts protocol, please report it privately.

**How to report:** Open a private advisory at
[github.com/askledger/receipts-sdk/security/advisories/new](https://github.com/askledger/receipts-sdk/security/advisories/new).
GitHub Security Advisories give us a private channel to collaborate on
remediation before public disclosure.

Please include:
- Description of the issue
- Reproduction steps (if applicable)
- Affected versions
- Suggested mitigation (if you have one)

We will acknowledge receipt within 48 hours and aim to provide an initial assessment within 5 business days.

## Scope

In scope:
- Cryptographic flaws in the receipts protocol (canonicalization, signing, chain construction)
- Tamper-detection bypass scenarios
- Key handling errors in the reference implementation
- Replay or reordering attacks against the hash chain

Out of scope:
- The example `examples/event.json` (intended to be replaced)
- Local file storage permissions (production should use HSM)
- Social engineering against maintainers

## Signature algorithm binding

Receipts are signed with Ed25519 (`alg: "EdDSA"`). Each signature entry carries
`alg` and `kid`, but these header fields are **not yet cryptographically bound
into the signed bytes** (the signature covers the canonical receipt, not the
signature header). This is mitigated today, and hardened further on the roadmap:

- **Current mitigation (shipped):** every verifier (TypeScript, Python, Go, Rust,
  Java) rejects any signature whose `alg` is not exactly `"EdDSA"` before
  verification, and a signature only counts as valid if its `kid` maps to a
  supplied public key and the Ed25519 signature verifies against that key.
  Because only one algorithm is supported and the signature is over fixed bytes
  produced by a specific key, an attacker cannot rewrite `alg`/`kid` to obtain a
  different valid interpretation (a swapped `kid` fails signature verification; a
  swapped `alg` is rejected outright). Algorithm-confusion is therefore closed in
  practice for the current single-algorithm design.
- **Planned (protocol v0.7):** when multiple signature algorithms are introduced,
  the protected header (`alg`, `kid`) will be bound into the signed input
  (JWS/COSE style). This is a deliberate, versioned format change — it alters the
  signed bytes, so it is scheduled for a protocol version bump rather than a
  silent update.

## Known dev-dependency advisories (do not affect production)

Test/build tooling (`vitest` and its transitive `vite`/`esbuild`) lives in
`devDependencies` and **does not appear in the published npm package or the
docker image** — a consumer who runs `npm install @askledger/receipts-sdk`
receives **zero** of these packages.

As of this release the toolchain is on `vitest@^3.2`, and
`npm audit --audit-level=high` runs clean in CI (the `security-scan`
workflow). The earlier `vitest` 1.x / `vite` / `esbuild` dev-server advisories
are resolved. Any dev-only advisory that surfaces in future remains, by the
above, unreachable from what ships to consumers.

Production runtime dependencies have zero known vulnerabilities at
the version pins shipped in this release. The shipped npm package
contains only the compiled `dist/` directory and the production
dependencies declared in `package.json`.

## Coordinated disclosure

We follow a standard 90-day coordinated disclosure window. After fixes are released, we will credit the reporter in the release notes unless anonymity is requested.

## Bug bounty

We do not currently run a formal bug bounty program. We will offer recognition and, where appropriate, swag and consulting/advisory access to material findings.

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes (preview) |
| < 0.1   | No |

---

Built by the AskLedger team
