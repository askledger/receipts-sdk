# Linux Foundation AI &amp; Data Foundation — Hosted Project Submission

**Submission target:** LF AI &amp; Data Foundation Technical Advisory Council (TAC)
**Project name:** Project Ledger Receipts Protocol &amp; Reference Implementations
**Submission level:** Sandbox → Incubating → Graduated
**Submitter:** Rashed Ali Khan · Founder & CEO · Project Ledger
**Status:** Draft — ready for TAC outreach Q3 2026
**Owner:** Rashed Ali Khan

---

## Why this matters strategically

Sigstore went from research project to the default build-attestation substrate inside 24 months because LF AI hosted it. The cryptographic primitives weren't novel — the standards-body backing was.

We are at the same inflection point for *runtime* AI attestation. If we land in LF AI before Cisco, Palo Alto, or any other acquirer consolidates the receipt-SDK ecosystem, **we become the wire format the industry standardizes on**.

This is the single highest-leverage move for becoming the global standard.

---

## What we propose to contribute

| Asset | License | Status |
|---|---|---|
| Receipts Protocol Specification v0.1 | CC-BY-4.0 | Draft published |
| TypeScript reference SDK | Apache-2.0 | 176 tests passing |
| Python SDK | Apache-2.0 | 12 tests passing |
| Go SDK | Apache-2.0 | 3 tests passing |
| Rust SDK | Apache-2.0 | Code shipped |
| Java SDK | Apache-2.0 | Code shipped |
| Cross-language conformance vectors | CC-BY-4.0 | Used by all 5 SDKs |
| Transparency log reference implementation | Apache-2.0 | RFC 9162 style |
| Public verifier | Apache-2.0 | Runs in any browser |
| Threat model + ZTA architecture docs | CC-BY-4.0 | Audit-firm ready |
| Receipt Score reference | Apache-2.0 | SSL-Labs pattern |
| 5 pre-built regulator policy templates | CC-BY-4.0 | CBUAE, EU AI Act, SAMA, ISO 42001, NIST RMF |
| Adapters: OpenAI, Anthropic, fetch, LangChain | Apache-2.0 | Auto-capture for 11 vendors |

**No proprietary components are retained.** The substrate is the public good. Project Ledger's commercial value lives entirely in the hosted Cloud + Evidence Engine + Console + customer-success layers, not in the protocol.

---

## Why LF AI is the right home (vs OpenSSF, IETF, CNCF)

| Body | Pros | Cons | Decision |
|---|---|---|---|
| **LF AI &amp; Data** | AI focus aligns; same governance as Sigstore's home (LF Sigstore); existing relationships with major AI vendors (IBM, Microsoft, Google, Meta) | LF AI is younger than CNCF | **Primary target** |
| OpenSSF | Strong on supply-chain security; aligned with Sigstore/in-toto/SLSA already | Less AI-specific; positioning would compete with Sigstore Model Signing | Secondary co-host candidate |
| CNCF | Strong on cloud-native; established sandbox process | Receipts are not specifically cloud-native; would be off-thesis | No |
| IETF | Best for the wire format spec long-term | 18-36 months to RFC | Parallel — submit the canonical format as a future RFC after LF AI hosts the implementation |

---

## The submission package

1. **Project charter** (this doc + governance proposal)
2. **License & IP confirmation** — all contributors sign DCO; no patent encumbrance; Apache-2.0 + CC-BY-4.0 only
3. **Roadmap to graduation** — v0.4 (today) → v1.0 → graduated
4. **Communications plan** — public RFC, conformance test suite, neutral governance
5. **TAC presentation** — 15 slides, 30 minutes
6. **Founding contributors** — Rashed + Mahamed + named external advisors
7. **Sponsoring TAC member** — needs identifying (likely a friendly TAC member from Microsoft / IBM / Hugging Face)

---

## Governance proposal

**Decision-making:** lazy consensus over 72 hours on the project mailing list. Disputed decisions escalate to a steering committee.

**Steering committee:** 5 seats. Initial:
1. Rashed Ali Khan (Project Ledger)
2. Mahamed Arif (Project Ledger)
3. Independent BFSI representative (target: Lloyd's of London or Munich Re)
4. Independent regulatory representative (target: CBUAE / SAMA / EU AI Office liaison)
5. Independent cryptography representative (target: Sigstore TAC member or academic)

Project Ledger holds ≤ 40% of seats by design — this is what gives a regulator the confidence to cite the spec.

**Wire-format changes:** require steering committee unanimous vote + 30-day public comment period.

---

## TAC presentation outline (15 slides, 30 minutes)

| # | Slide | Speaker note |
|---|---|---|
| 1 | The problem · every regulator demands cryptographic AI evidence; no standard exists | 90 s |
| 2 | What we built · open spec + 5 SDKs + transparency log | 90 s |
| 3 | Demo · live cryptographic chain in browser | 4 min |
| 4 | The wire format · RFC 8785 + Ed25519 + chain | 2 min |
| 5 | Cross-language conformance vectors | 90 s |
| 6 | The transparency log | 90 s |
| 7 | What's already real · 176 tests passing across 18 files | 60 s |
| 8 | Regulator timing · CBUAE Sep 16 2026 · EU AI Act Aug 2 2026 | 90 s |
| 9 | Open ecosystem · how we compose with Sigstore Model Signing, in-toto, SLSA, OWASP AIBOM, OpenTelemetry GenAI | 90 s |
| 10 | Governance proposal · 5-seat steering committee · LF-aligned | 60 s |
| 11 | What we contribute · licenses, IP, conformance, infrastructure | 60 s |
| 12 | What we ask · hosted-project status, TAC sponsorship, comms support | 60 s |
| 13 | Roadmap · sandbox → incubating → graduated | 60 s |
| 14 | Risks honestly · external audit pending, real BFSI deployments incoming | 60 s |
| 15 | Q&amp;A | 9 min |

---

## What we ask the TAC for

1. **Hosted Project status at Sandbox level**
2. **TAC sponsor** — one named member to champion us through the formal vote
3. **Communications support** — listing on lfaidata.foundation, inclusion in the annual report, talk slot at the next LF AI conference
4. **Neutral governance assistance** — LF legal review of charter; help recruiting non-Project-Ledger steering committee members
5. **Optional:** intro to LF Sigstore for the transparency-log architecture review

---

## What we offer in return

- The spec, all five SDKs, the transparency log reference, the conformance suite — all dedicated under Apache-2.0 + CC-BY-4.0
- A dedicated maintainer (Rashed) committed for 24 months minimum
- The regulator-grade artifacts (threat model, SOC 2 controls, ZTA architecture) that elevate the LF AI portfolio's compliance credibility
- Engaged regulator outreach — we will introduce CBUAE / SAMA / EU AI Office to the LF AI process if they engage us first

---

## Timeline

| Month | Milestone |
|---|---|
| Month 0 | Identify TAC sponsor; finalize submission package |
| Month 1 | Public RFC of the wire format spec on lists |
| Month 2 | TAC presentation; sandbox vote |
| Month 3-6 | Sandbox: community-building, conformance tests, more language SDKs |
| Month 6-12 | Incubating vote |
| Month 12-24 | Graduated vote |
| Parallel month 6-12 | IETF informational draft of wire format |

---

## Risks

| Risk | Mitigation |
|---|---|
| Cisco / Palo Alto / IBM block us with their own standards proposal | Move fast; have the open spec + 5 SDKs + conformance tests + tests; nobody else has this. Counter-proposal would take 12-18 months to match. |
| TAC has a "no more sandbox projects" capacity issue | Position as the "missing AI counterpart to Sigstore" — they have a strategic interest in completing that picture |
| One steering committee seat goes to a competitor | Charter restricts steering committee to non-competing entities for first 12 months |
| Wire format becomes locked in too early | Charter includes a 30-day public comment period on every wire-format change |

---

## Document maintenance

Updated after every conversation with a TAC member, every comment from LF legal, and every public RFC round.
