# Demo Script · 5-minute walkthrough

For Rashed (founder demo) and anyone showing Project Ledger to a customer, partner, regulator, or investor. Use the exact sequence and the exact talking points below. Each block has been timed.

---

## Setup (before the meeting)

Open these tabs in this order so you can swipe through:

1. `site/index.html` — landing page
2. `site/demo.html` — visual demo
3. `site/verify.html` — public verifier
4. Terminal in the receipts-sdk repo (font size ≥ 14pt, dark theme)
5. `http://localhost:3000` — admin console (with dev login cookie set)

Optional: open the receipt JSON file in a side panel so you can show what's actually being verified.

---

## Block 1 · The problem (30 seconds)

**Open:** `site/index.html`

> "Every regulator on earth right now is telling banks the same thing: prove what your AI did. CBUAE in the UAE — September 16 deadline, fines up to AED 1 billion. EU AI Act — August 2 deadline. SAMA. ISO 42001.
>
> Every enterprise asks the same question back: how? They fall back to spreadsheets, screenshots, self-attestation. Then the regulator asks for cryptographic proof and they can't produce it.
>
> Project Ledger is the substrate that closes that gap."

Point at the three regulator cards. Don't dwell — move on.

---

## Block 2 · See it work (60 seconds)

**Open:** `site/demo.html`

> "This runs entirely in your browser. No backend. The cryptography is the real published spec."

Click **Run demo**.

Narrate as it animates:

> "We're generating an Ed25519 keypair. Then signing five AI events — different vendors, different models. Each one is canonicalized per RFC 8785, hashed with SHA-256, signed with Ed25519, and linked to the previous receipt by hash."

When the chain finishes:

> "All five receipts verify independently. The verifier needs only the public key — no call to Project Ledger, no platform dependency."

Click **Tamper receipt #3**.

> "Now I modify receipt three. Change one field. Watch."

Pause on the red banner.

> "The chain broke. This is what mathematically tamper-evident means. Receipt three fails its own hash; any auditor walking the chain hits the failure and cannot trust anything after it. The cryptography is the guarantee."

---

## Block 3 · The openly-verifiable promise (30 seconds)

**Open:** `site/verify.html`

> "And this is what we'd give a regulator. Same SDK, same primitives, runs in their browser, no Project Ledger account."

Click **Load valid sample**, then **Verify**.

> "Green across the board. Canonical hash matches, Ed25519 signature verifies, chain link is correct."

Click **Load tampered sample**, then **Verify**.

> "Red — every check the inspector cares about is shown with the actual hashes. No black box. This is what we mean by 'openly verifiable.'"

---

## Block 4 · The substrate is real (60 seconds)

**Switch to terminal**

```bash
node dist/cli.js demo
```

Let it run end-to-end (5 seconds with `--fast`, 10 without).

> "Same primitives in the terminal — colored output for a reason: every one of these blocks is a step a real production deployment runs.
>
> Generate keypair. Sign five receipts into a chain. Verify all of them. Tamper with one — detected. Build a regulator-ready evidence pack with a Merkle root, inclusion proofs, and pack integrity hash.
>
> This is the spine. Every customer downloads exactly this."

If they ask about other languages:

> "We ship five SDKs — TypeScript, Python, Go, Rust, Java. All wire-format compatible. We have shared cross-language conformance vectors so any new implementation has to pass byte-identical tests. The cryptography is the public good. We don't own it; we own the platform around it."

---

## Block 5 · The platform (90 seconds)

**Switch to:** `http://localhost:3000` (the admin console)

Land on Dashboard:

> "This is what a tenant admin sees. KPIs at the top — receipts signed today, policy blocks, chain breaks in the last 24 hours, pending approvals. System posture on the right — FIPS mode, which HSM, which TSA, transparency log status, Postgres row-level security, SPIRE workload identity rotation."

Click **Receipts Explorer**.

> "Every receipt is queryable, filterable, verifiable inline. Click any hash to copy it. Tampering anywhere in the chain shows up here immediately."

Click **Keys**.

> "Key lifecycle — rotate, retire, revoke. Every transition is itself a receipt on a meta-chain signed by a different key. Auditors love this — the audit log can't be tampered with by an SRE because the SRE doesn't have the signing key."

Click **Policies**.

> "OPA policy editor with a live decision sandbox. Every policy bundle is content-addressed — sha256 of the canonical bytes ends up inside every decision receipt. Auditors can replay any historical decision against the bundle that was in force."

Click **Evidence Packs**.

> "Regulator-ready bundles. Picks a tenant, a time range, filters. Builds a Merkle batch with inclusion proofs and a pack integrity hash. Hand it to CBUAE, SAMA, the FCA — they verify it offline with no dependency on us."

Click **Audit Log**.

> "Every admin action — key rotation, policy publish, evidence export, support impersonation — is itself a signed receipt. The audit trail is the same primitive as the product."

---

## Block 6 · Why us (60 seconds)

> "Three things hold the moat together.
>
> One — we're publishing the protocol as an open standard. Five language SDKs, shared conformance vectors, Apache-2.0. We're the reference implementation and we want to be the substrate the industry standardizes on.
>
> Two — the platform around the substrate is the commercial layer. Evidence packs, regulator portals, BFSI framework mappings (CBUAE, SAMA, EU AI Act, ISO 42001), workflows, the Zero Trust architecture, the audit-ready threat model and SOC 2 control framework. That's what enterprises pay for.
>
> Three — we're built for the MENA + EU BFSI moment. September 16, 2026 — CBUAE. August 2, 2026 — EU AI Act. Saudi 2026 Year of AI — 9.1 billion in AI investment, 20 billion committed. We've focused our enterprise sales motion on the customers who must buy something like this in the next 12 weeks.
>
> The cryptography is the public good. Sell the platform."

---

## Closing options

For an investor:

> "We have a working spec, five SDKs, four HSM drivers, an admin console, public landing and verifier, threat model, SOC 2 control framework, and Zero Trust architecture all shipped today. The remaining gates — external audit, SOC 2 Type II report, NIST FIPS validation — require hiring firms, not writing code. With a seed round we hire the firms, ship the production cloud tier, sign the first three design-partner customers, and stand at the front of the CBUAE compliance line."

For a customer:

> "We can do a 30-day design-partner engagement. You bring an AI use case, a small team, and access to one HSM. We deliver receipts flowing in production, a custom CBUAE-mapped evidence pack template, an SI-style integration, and we publish the deployment as a case study with your permission. Want to start with one workflow?"

For a regulator:

> "The verifier you just used is the same one we'd give your inspection team. Every receipt your supervised entities produce is independently verifiable with no Project Ledger dependency. Our protocol is open. Our cryptography is auditable. We've structured the platform so you can demand evidence packs from regulated firms and verify them offline. Would you like a copy of our threat model and Zero Trust architecture documents?"

---

## Things to NOT say

- "Unhackable" — say "cryptographically tamper-evident under current Ed25519 / SHA-256 assumptions."
- "100% production-ready" — say "production-grade SDK substrate today; external audit and SOC 2 Type II in flight."
- "We solved AI governance" — say "we ship the cryptographic substrate underneath every AI governance framework that exists."
- "We replace [vendor]" — say "we compose with Sigstore Model Signing, in-toto, SLSA, OWASP AIBOM, OpenTelemetry GenAI. We are runtime evidence; they are other layers."

---

## What to have memorized

| Fact | Number |
|---|---|
| Languages | 5 (TS, Python, Go, Rust, Java) |
| Tests passing | 135 across 3 languages |
| AI vendors auto-captured | 11 |
| HSM drivers | 4 (AWS KMS, Azure KV, GCP KMS, PKCS#11) |
| Standards composed | 12 |
| Sign latency p50 | < 2 ms (in-browser), ~5 ms (in-process Node) |
| Verify latency p50 | < 2 ms |
| CBUAE deadline | September 16, 2026 |
| EU AI Act high-risk obligations | August 2, 2026 |
| Saudi AI investment 2025 | $9.1 B raised, $20 B+ committed |
| IBM 2026 finding | 97% of AI-breached orgs lacked proper access controls |
