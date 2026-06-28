# Contributing to Project Ledger Receipts SDK

Thank you for considering a contribution. The receipts substrate is intended to become an open standard for AI runtime accountability — and that only happens with community participation.

> **Engineering discipline rules** (change-scope blocks, test discipline,
> API stability, receipt-format stability, crypto rules, review policy,
> release gates) are codified in [`docs/QUALITY_GATES.md`](docs/QUALITY_GATES.md)
> and enforced by CI. PRs without a "Change scope" block in the description
> can be closed by any reviewer.

## What we welcome

- **Bug reports** with reproduction steps
- **Protocol improvements** to the receipt envelope (use a GitHub Discussion first)
- **New language SDKs** (Rust, Python, Go, Java, .NET, Kotlin — open an issue first)
- **Standards alignment** (Sigstore, in-toto, SLSA, OpenTelemetry GenAI, SPIFFE, MCP)
- **Cryptographic review** from professional cryptographers
- **Test vectors** in additional formats
- **Documentation improvements** — particularly for first-time users

## What we are cautious about

- Breaking changes to the receipt envelope before v1.0 (open a Discussion first)
- New dependencies in the core SDK (we keep the dependency tree intentionally small)
- Changes to the cryptographic algorithms without prior cryptographic review

## Development setup

```bash
git clone https://github.com/projectledger/receipts-sdk-ts.git
cd receipts-sdk-ts
npm install
npm run build
npm test
```

All 13 tests must pass before opening a PR.

## Pull request guidelines

1. Open an issue first if the change is non-trivial
2. Branch from `main` with a descriptive name (`feat/rust-verifier`, `fix/canonical-edge-case`, etc.)
3. Add tests for any new behavior
4. Run `npm run lint && npm test` before pushing
5. Reference the issue in the PR description
6. Be patient — maintainers review weekly

## Coding style

- TypeScript strict mode (see `tsconfig.json`)
- ES2022 syntax
- No `any` types without explicit comment
- Public APIs documented with JSDoc
- Cryptographic code commented with rationale

## Communication

- **GitHub Discussions** for protocol design conversations
- **GitHub Issues** for bugs and concrete enhancements
- **Email** (`security@projectledger.io`) for vulnerability disclosures
- We aim to respond within 5 business days

## Code of Conduct

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree your contributions will be licensed under Apache-2.0.

---

Built by Rashed Ali Khan & Mahamed Arif · Project Ledger
