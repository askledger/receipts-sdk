# Maintainers

This file lists the current maintainers of Project Ledger. Maintainers are
responsible for code review, releases, security incident response, and
governance.

## Governance model

Project Ledger follows a **lightweight technical-steering committee (TSC)
model**:

- **Maintainers** — merge access. Each is the named owner of one or more
  areas listed in `.github/CODEOWNERS`.
- **TSC** — quarterly meeting, simple-majority decisions on roadmap,
  governance changes, and security-policy updates. Membership is the
  union of maintainer leads of each area.
- **Sustaining sponsors** — organizations that fund development. They have
  no vote but get advance notice of major architectural changes.

## Current maintainer leads

| Area | Lead | Backup |
|---|---|---|
| Cryptographic core | TBD | TBD |
| TypeScript SDK | TBD | TBD |
| Python SDK | TBD | TBD |
| Go SDK | TBD | TBD |
| Rust SDK | TBD | TBD |
| Java SDK | TBD | TBD |
| Policy templates | TBD | TBD |
| Console | TBD | TBD |
| Browser extension | TBD | TBD |
| SRE / CI | TBD | TBD |
| Security | TBD | TBD |
| Compliance content | TBD | TBD |

(Maintainer names will be filled in by founding-team members on each
team's confirmation, then this file will be PR'd by each.)

## Becoming a maintainer

A contributor becomes a maintainer by:

1. Sustained quality contributions to the area for >= 3 months.
2. Demonstrated alignment with the project's values (security,
   correctness, openness).
3. Nomination by an existing maintainer of the area + approval by the TSC.

There is no minimum contribution count; we look for judgment, not
volume.

## Removing a maintainer

A maintainer who is inactive for 6 months is moved to emeritus status
automatically. A maintainer may resign at any time. Removal for cause
(code-of-conduct violation, security-policy breach) is decided by TSC
majority.

## Releases

Releases are tagged on `main` by any maintainer with release-signing
authority. Tag → CI → all gates green → automated publish to npm, PyPI,
crates.io, Maven Central, ghcr.io image.

Release-signing authority requires a hardware key (YubiKey or equivalent)
registered with Sigstore. Maintainers must rotate their key annually.

## Communication

- `#projectledger` on the CNCF Slack — community + maintainer chat.
- `maintainers@projectledger.io` — maintainer-only mailing list.
- `security@projectledger.io` — security reports (see SECURITY.md).
- GitHub Discussions — feature proposals, RFC-style design discussions.

## Code of Conduct

We follow the [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
Violations: `conduct@projectledger.io`. Handled by the TSC chair or a
designated alternate, never by anyone named in the report.
