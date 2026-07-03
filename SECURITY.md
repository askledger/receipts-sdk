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

## Known dev-dependency advisories (do not affect production)

Running `npm audit` on this repository will show advisories against
`vitest` and its transitive dependencies (`vite`, `esbuild`, `vite-node`).
These packages are pinned in `devDependencies` and **do not appear in
the published npm package or the docker image.** A consumer who runs
`npm install @askledger/receipts-sdk` receives **zero** of these
packages.

We pin `vitest@^1.6` deliberately. Later major versions have
unresolved transitive-dependency resolution issues in our environment
that would block clean local builds. The advisories that remain
against vitest 1.x are:

| Advisory | Surface | Reachable in production? |
|---|---|---|
| GHSA-5xrq-8626-4rwp (vitest UI server) | dev-only, requires `vitest --ui` to be running locally | **No** |
| GHSA-fx2h-pf6j-xcff (vite `server.fs.deny` bypass on Windows) | dev-only, requires `vite` dev server to be running on Windows | **No** |
| GHSA-67mh-4wv8-2f99 (esbuild dev-server CORS) | dev-only, requires `esbuild` dev server to be running locally | **No** |
| GHSA-4w7w-66w2-5vf9, GHSA-v6wh-96g9-6wx3 (vite path traversal) | dev-only, requires `vite` dev server to be running | **No** |

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
