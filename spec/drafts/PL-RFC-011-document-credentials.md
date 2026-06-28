# PL-RFC-011 · Document Credentials (Draft · Internal)

**Status:** Internal draft. NOT in the public spec index. NOT published.
**Owner:** Project Ledger TSC
**Last reviewed:** 2026-06-13

## Purpose

Codify how the Project Ledger receipt protocol extends to non-AI signed
records — employment letters, salary slips, bank statements, KYC
attestations, education credentials — without changing the existing
spec stack (PL-RFC-001 … 010).

The intent of this RFC is to keep the public narrative focused on AI
receipts in 2026 while preserving zero-rebuild optionality for a
document-credentials product in 2027+.

## Non-goals

- Compete with W3C Verifiable Credentials. If this RFC graduates, it
  ships as a VC profile, not a competing format.
- Replace national e-signing standards (Aadhaar eSign, EU eIDAS, US
  eSign Act). PL-RFC-011 layers ON those, not under them.
- Define identity. Identity binding is PL-RFC-006; this RFC adopts it.

## Why this works on the existing substrate

The substrate is already AI-agnostic. The `RawEvent.event_type` field
is an opaque string. The `subject` field is optional. The `payload` is
free-form. Nothing in PL-RFC-001 names "AI" as a structural concept.

A document credential is a Receipt with:
- `event_type` in the `credential.*` namespace
- `subject` describing the credential holder (the data subject)
- `payload` carrying the credential statement (hash of the document)
- `decision` optionally carrying the issuer's policy_bundle_hash

## Credential event types

```
credential.employment.salary_slip       — monthly salary record
credential.employment.offer_letter      — signed job offer
credential.employment.verification      — current-employment confirmation
credential.employment.relieving         — final-settlement / exit letter
credential.finance.bank_statement       — account statement
credential.finance.account_balance      — point-in-time balance
credential.finance.income_tax_return    — tax filing reference
credential.education.degree             — degree certificate
credential.education.transcript         — academic record
credential.kyc.identity_attestation     — KYC outcome
credential.regulatory.attestation       — regulator-issued statement
```

## Required fields per credential

```
event.subject = {
  data_subject_id : <hashed national id or stable identifier>,
  data_subject_name_hash : <hash of canonical name>,
  jurisdiction : <ISO 3166-1 alpha-2 country code>
}

event.payload = {
  document_hash : <SHA-256 of canonical document bytes>,
  document_type : <MIME or schema id>,
  effective_from : <RFC 3339>,
  effective_to   : <RFC 3339 | null>,
  statement      : <map of field → value>,    // e.g. salary, designation
  schema_id      : <pkg:projectledger/credential-schema/...>
}

event.context = {
  issuer_id          : <opaque, points at issuer's published key>,
  issuer_role        : <"employer" | "bank" | "university" | "regulator">,
  identity_provider  : <issuer's IdP for PL-RFC-006>
}
```

## Verification flow

A verifier presented with a credential receipt:

1. Verifies the receipt per PL-RFC-001 §8.
2. Resolves `event.context.issuer_id` to a public key via the issuer-key
   directory (see §6 below).
3. Confirms the receipt's `kid` is among the active keys for that issuer.
4. Verifies the document hash matches the document the data subject
   has presented.
5. Confirms `effective_from <= today <= effective_to` (or `effective_to`
   is null).

If all five hold, the credential is accepted. **No call to the issuer.
No third-party verifier API. No subscription fee.**

## Issuer-key directory (the real hard problem)

The substrate solves signing. It does NOT solve trust-root
distribution. Three federation models, ranked:

1. **Industry-vertical directories** — banks pool keys in the Indian
   Banks' Association (IBA) directory; universities pool in UGC;
   employers self-host on their own DNS via `did:web` style records.
2. **Regulator-backed directory** — RBI for finance, SEBI for capital
   markets, UGC for education, MeitY for KYC. Required for the
   regulated verticals; voluntary elsewhere.
3. **Federated CT log** — anyone publishes their key into the
   transparency log; verifiers maintain their own trust list. Closest
   to the W3C `did:web` pattern.

Recommend (3) ships first because it requires zero coordination, then
upgrade to (1) and (2) as adoption demands.

## Relationship to W3C VC

A PL-RFC-011 credential **IS** a W3C VC if we set:
- `@context` to the VC + PL contexts
- `type` to `["VerifiableCredential", "ProjectLedgerCredential", <vertical type>]`
- `proof.type` to `"Ed25519Signature2020"`
- `proof.proofValue` to the receipt's base64 signature

We ship both shapes from the same canonical bytes. VC consumers see a
standard VC; PL consumers see a chained, transparency-logged Receipt.
**This is the unlock.** It lets us join the VC ecosystem and own a
high-performance, transparency-log-backed profile within it.

## Privacy + GDPR / DPDP / etc.

- The data subject's name is hashed; the canonical bytes contain only
  hashes, not plaintext PII.
- The credential receipt MAY be issued to the data subject's wallet
  rather than published broadly. The transparency log carries only the
  receipt hash; the body lives with the subject.
- Selective disclosure (showing only one field of a salary slip) uses
  Merkle-tree commitment over the payload's leaves — same mechanism as
  PL-RFC-004 §3. To be specified in PL-RFC-012 when needed.
- Right-to-erasure: a credential receipt cannot be deleted from the log
  but the body need not exist anywhere. Cryptographic deletion =
  destroying the body. The receipt remains as a tombstone.

## Status

This RFC is intentionally OUT OF THE PUBLIC SPEC INDEX. It exists so
that if the AI-receipts launch succeeds and we decide in 2027 to
extend, the architectural design has been thought through, the existing
substrate is verified to support it, and the spec graduation is a
matter of editorial polish — not invention.

## Roadmap conditions for graduation

PL-RFC-011 leaves draft and joins the public spec stack only after ALL
the following are true:

1. AI-receipt substrate has ≥ 100,000 receipts/day across ≥ 3 customers.
2. SOC 2 Type II report is in hand.
3. At least one vertical (banking OR education OR employment) has
   identified an anchor issuer willing to be first.
4. An issuer-key directory operator is named.
5. PL-RFC-011 has passed an independent VC-compatibility review.

Until all five, this stays a `.md` file in `spec/drafts/`.
