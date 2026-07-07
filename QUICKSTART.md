# Quickstart · See AskLedger in 60 seconds

Three paths. Pick whichever lands fastest for your audience.

---

## Path 1 · I want to see it right now in my browser (zero install)

Open any of these single-file pages in any modern browser. They run entirely client-side — no backend, no install, no login.

| Page | What it shows | Time |
|---|---|---|
| **[site/demo.html](site/demo.html)** | Live animated chain build · tamper detection · evidence pack | 60 s |
| **[site/verify.html](site/verify.html)** | Paste any receipt + public key, get full verification trace | 30 s |
| **[site/index.html](site/index.html)** | The landing page — hero, regulator anchors, stack, standards | scan |

> **Tip for demos:** open `site/demo.html`, click **Run demo**, narrate while it animates. Then click **Tamper receipt #3** — the chain visibly breaks. That single moment sells the product.

---

## Path 2 · I want to run it from the terminal

```bash
git clone https://github.com/askledger/receipts-sdk.git
cd receipts-sdk-ts
npm install
npm run build
node dist/cli.js demo
```

Output (5 seconds, full color):

```
① Generating Ed25519 keypair                ✓
② Signing 5 AI events into a hash chain      ✓
③ Verifying the full chain                   ✓ ALL 5 RECEIPTS VALID
④ Adversarial test — tamper with receipt #3  ✓ TAMPER DETECTED
⑤ Building a regulator-ready evidence pack   ✓ self-verify OK
```

Artifacts land in `.ledger/`. You can verify any of them yourself:

```bash
node dist/cli.js verify .ledger/demo-chain.json --key .ledger/keys/demo.json
```

### End-to-end walkthrough (all three layers, one CLI)

The CLI runs the full lifecycle by hand — keygen → sign → verify → bundle → verify-bundle:

```bash
# 1. Generate an Ed25519 keypair
node dist/cli.js keygen --out keys.json

# 2. Sign an event into a chained, signed receipt.
#    Optionally BIND an external correctness proof at sign time (Layer 3).
#    --evidence-ref is repeatable. If you pass file=, the CLI hashes that file
#    (SHA-256) and records the digest; otherwise pass hash=<hexdigest> directly.
node dist/cli.js sign event.json --key keys.json --out r1.json \
  --evidence-ref "kind=rule-check,file=./rule-report.json,status=pass" \
  --evidence-ref "kind=external-proof,hash=<hexdigest>,alg=sha-256,status=pass"

node dist/cli.js sign event.json --key keys.json --out r2.json

# 3. Verify a single receipt (also reports any attached evidence_refs)
node dist/cli.js verify r1.json --key keys.json

# 4. Bundle many receipts into one verifiable evidence bundle (Merkle root
#    + inclusion proofs + top-level pack_hash). Accepts multiple single-receipt
#    files OR one JSON file that is an array of receipts (e.g. demo-chain.json).
node dist/cli.js bundle r1.json r2.json --out bundle.json --title "Q3 Evidence"

# 5. Verify the whole bundle: pack integrity, receipt inclusion, and — with a
#    key — every receipt's Ed25519 signature. Exits non-zero on any failure.
node dist/cli.js verify-bundle bundle.json --key keys.json
```

**Three layers, one CLI:**

| Layer | Commands | What it proves |
|---|---|---|
| **Integrity** | `sign` / `verify` (hash chain + Ed25519) | The receipt is authentic and untampered, linked to its predecessor. |
| **Traceability** | `bundle` / `verify-bundle` (Merkle evidence bundle) | Many receipts reduce to one verifiable artifact with a single root hash. |
| **Correctness** | `sign --evidence-ref` (binding) | An **external** proof (rule check, attestation) is bound into the signed body. |

> **Honest scope:** the SDK **binds** an external correctness proof into the signed
> receipt — its digest becomes part of the canonical bytes covered by the signature.
> The SDK does **not** perform formal verification itself. The proof is produced by an
> external prover/attestor; the SDK makes it tamper-evident and auditable.

---

## Path 3 · I want to integrate it into my code

### TypeScript / Node

```ts
import OpenAI from "openai";
import { wrapOpenAI, generateKeyPair } from "@askledger/receipts-sdk";

const client = wrapOpenAI(new OpenAI({ apiKey }), {
  tenantId: "acme-corp",
  keypair: generateKeyPair(),       // production: HSM-backed
  onReceipt: async (r) => store.append(r),
});

// Your application code is unchanged
const resp = await client.chat.completions.create({ model: "gpt-5", messages });
console.log(resp.x_ledger_receipt_id);   // cryptographic evidence id
```

That's it. Every `chat.completions.create` now emits a signed receipt.

### Other languages

```bash
# Python
pip install askledger-receipts

# Go
go get github.com/askledger/receipts-sdk-go

# Rust
cargo add askledger-receipts

# Java (Maven)
# <dependency><groupId>io.askledger</groupId><artifactId>receipts-sdk</artifactId><version>0.1.0</version></dependency>
```

All five SDKs produce byte-identical receipts. Cross-verified via shared conformance vectors in [`test/conformance/`](test/conformance/).

---

## Path 4 · I want the full admin console (real UI)

```bash
cd console
npm install
npm run dev
# → open http://localhost:3000
```

You'll be redirected to `/login` (which is intentional — the middleware enforces auth on every protected route).

For demos, set the dev login cookie:

```bash
# In another terminal:
node ../scripts/dev-login.mjs
# → prints a cookie to set; paste into your browser dev tools
```

Then visit `http://localhost:3000` and you'll see all 9 pages with demo data:

- Dashboard · KPIs + recent receipts + pending approvals + key health
- Receipts Explorer · filter + sort + verify + export
- Policies · Rego editor + live decision sandbox
- Keys · roster + rotate / retire / revoke + transition log
- Workflows · end-to-end pipeline visibility
- Evidence Packs · regulator-ready bundle builder
- Tenants · provisioning + plan + region
- Audit Log · every admin action is itself a signed receipt
- Settings · security posture, identity, data residency

---

## Demo cheat sheet

For a 5-minute demo, use this exact sequence:

1. **30 s — show site/demo.html** · click Run demo → narrate the chain → click Tamper → "this is what mathematically tamper-evident means."
2. **30 s — show site/verify.html** · click "Load valid sample" → Verify (all green) → click "Load tampered" → Verify (all red). "This page is what we'd give a regulator."
3. **60 s — show terminal `npm run demo`** · "Every SDK we ship in 5 languages does this. Identical bytes. Anyone can re-implement the spec and our receipts still verify."
4. **60 s — show the console (`/`)** · "And this is what a tenant admin sees. KPI dashboard, receipts explorer, key management, evidence pack builder, audit log. Every admin action is itself a receipt on a meta-chain."
5. **60 s — talk regulators** · CBUAE Sep 16 2026 · EU AI Act Aug 2 2026 · SAMA · ISO 42001. "Five language SDKs, four HSM drivers, full Zero Trust architecture, audit-ready threat model and SOC 2 control framework — all open source today."

Closing: **"Cryptography is open and verifiable by anyone. The moat is the platform — evidence packs, regulator portals, BFSI framework mappings, the production SaaS. Ship the substrate. Sell the platform."**
