# Dual-market optionality · the document-credentials side-bet

**Decision:** AI receipts is the 2026 product. Document credentials —
employment, salary, bank, education — is preserved as a 2027+ option
without GTM impact today.

**Status of this document:** internal only. NOT in the public README.
NOT on the landing. NOT spoken about until v0.6.0 ships and an AI
customer is signed.

---

## Why we preserve the option

The user surfaced a real market signal: companies globally spend
**$25-35B annually** on cross-verification of salary slips, bank
statements, offer letters, education certificates, and KYC documents.
HireRight, Sterling, Checkr, AuthBridge, IDfy, OnGrid, DocuSign,
Adobe Sign, Truework all monetise the absence of a verifiable
substrate. The pain is universal and felt; the technical primitive
that solves it — signed canonical JSON + Merkle + transparency log —
is the **same primitive** we ship for AI receipts.

A 5-second salary-slip verification in a hiring manager's browser
(no AuthBridge call, no fee, no cross-border lag) is a product worth
building. Just not right now.

## Why not now

1. **Two-sided cold start.** Document verification only works when
   issuers AND verifiers are both present. AI receipts has a one-sided
   adoption path (a single company deploys it internally and gets
   value). Easier to ship.
2. **W3C VC owns the formal lane.** Microsoft Entra Verified ID,
   Mastercard, Workday, the EU Digital Identity Wallet, and the
   Indian DigiLocker are all building on W3C Verifiable Credentials.
   Entering this lane requires us to either (a) compete with that
   ecosystem or (b) profile within it. Either move costs time we
   haven't earned yet.
3. **Trust-root distribution is a governance problem.** Signing the
   document is easy. Telling a verifier in Singapore that the public
   key really belongs to TCS Mumbai requires an issuer-key directory
   that does not yet exist. Building that is a year+ effort.
4. **The pivot pattern is dangerous.** This is the third or fourth
   adjacent market we've considered. Each one is real. Each one is a
   reason to delay shipping the AI substrate. The discipline is to
   ship one product, not consider every market.

## What we do in the background (no GTM impact)

These exist NOW so the 2027 expansion is not a rebuild:

- **`spec/drafts/PL-RFC-011-document-credentials.md`** — internal-only
  draft codifying event types, payload shape, verification flow,
  issuer-key directory options, and W3C VC compatibility plan.
- **`src/credentials/`** — minimal shell with one working vertical
  (employment salary slip), proving the substrate is AI-agnostic.
  Sign + verify a salary slip via the existing `signReceipt` /
  `verifyReceipt` with zero substrate changes.
- **`test/credentials.test.ts`** — sanity tests confirming the
  document binding round-trips and that tampering breaks it.

The shell is not exported from `src/index.ts`. It does not appear in
the console. The landing page does not mention it. The public spec
index (`spec/README.md`) does not link to it.

## What we DO NOT do until conditions are met

- Build a credentials dashboard in the console.
- Add a credentials page to `site/index.html`.
- Pitch the substrate as a document-verification platform.
- Talk to any document-verification customer.
- Talk to any W3C VC working group as Project Ledger.
- Position Project Ledger as anything other than "the cryptographic
  substrate for AI receipts" in 2026.

## Graduation conditions

PL-RFC-011 moves from `spec/drafts/` into the public spec index only
after ALL of the following are true:

1. AI-receipt substrate is at ≥ 100,000 receipts/day across ≥ 3 paying
   customers.
2. SOC 2 Type II report is in hand.
3. At least one anchor issuer is named (bank, university, or employer)
   willing to be first in a vertical.
4. An issuer-key directory operator is identified.
5. PL-RFC-011 has passed an independent W3C VC-compatibility review.

Until then, the option exists in code. The product does not.

## The honest meta-warning

We have built a beautiful unshipped AI-receipts product. Adding a
second market before shipping the first is the classic founder
mistake. The credentials shell exists so the 2027 pivot is a
non-rebuild, NOT so we shorten the AI-receipts launch. **Anyone
reading this document who is tempted to start work on credentials in
2026 should stop and ship the AI side first.**

---

## Where the option lives, exactly

- `spec/drafts/PL-RFC-011-document-credentials.md` — the draft RFC.
- `src/credentials/index.ts` — shell module + working salary-slip example.
- `test/credentials.test.ts` — proves substrate compatibility.
- This file (`docs/strategy/DUAL_MARKET_OPTIONALITY.md`) — the discipline.

Nothing else.
