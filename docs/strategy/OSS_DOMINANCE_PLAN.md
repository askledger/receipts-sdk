# How AskLedger becomes THE open-source AI receipts standard

The canonical doc says "Open spec → Linux Foundation AI (Year 2)". Winning
OSS infrastructure is not about feature count — it's about **becoming the
de-facto standard**. Kubernetes, Sigstore, OpenTelemetry, in-toto, and
SLSA all won by publishing a spec, running a conformance suite, and
shipping vendor-neutral governance before competitors could fork the
market.

Here's the playbook, ordered.

---

## Tier 1 · Spec + conformance — the moves that make us the standard

### 1 · Publish the AI Decision Receipt specification as a versioned, citable open spec
- `PL-RFC-001` — Receipt schema (RawEvent + Receipt + IntegrityBlock + Signature).
- `PL-RFC-002` — Canonical bytes (we use RFC 8785 — codify our profile).
- `PL-RFC-003` — Chain semantics (chain_height, previous_hash, fork detection).
- `PL-RFC-004` — Transparency log binding (RFC 9162 profile we expect).
- `PL-RFC-005` — Evidence pack envelope.
- `PL-RFC-006` — Identity binding (corp OIDC → receipt actor claim mapping).
- `PL-RFC-007` — Cross-vendor capture semantics (how OpenAI / Anthropic / Bedrock map to a receipt).
- `PL-RFC-008` — Policy bundle hash + decision block.
- `PL-RFC-009` — Cost ledger format (we just shipped the substrate; codify it).
- `PL-RFC-010` — Carbon ledger format.

Ship under `/spec/` in the repo, also at `github.com/askledger/receipts-sdk/tree/main/spec`. Versioned. Diffable. Citable by regulators.

### 2 · Publish the conformance test suite as a runnable artifact
- `npx @askledger/conformance` runs against any implementation of `signReceipt` + `verifyReceipt`.
- Conformance levels 1, 2, 3 (CL1/CL2/CL3) mirror the SLSA-level pattern.
- Public conformance dashboard at `conformance.github.com/askledger/receipts-sdk` lists every implementation that passes.
- A vendor's badge ("AI Receipts CL3 conformant") is the same trust signal SSL Labs A+ became.

### 3 · Submit to Linux Foundation AI (LF AI & Data) under the Sigstore-adjacent track
The doc names this as Year 2. We have the prerequisites (Apache-2.0, CHANGELOG, SECURITY, CODEOWNERS, MAINTAINERS, real CI, signed releases). Ship the application package now.

### 4 · Co-author with OpenSSF Model Signing
The competitor doc names them explicitly. We solve "what did the model do" they solve "where did the model come from". A joint document positioning AskLedger as the runtime layer on top of OMS is the most underpriced strategic move available.

---

## Tier 2 · Critical-mass integrations — the moves that make the spec ubiquitous

### Code-tool capture (named in P03)
Ship native receipt adapters for every AI code-assistant the doc names as gaps for GitHub Copilot Audit:

| Tool | Integration | Status |
|---|---|---|
| **Cursor** | `~/.cursor/mcp.json` server emitting receipts | EMPTY |
| **Claude Code** | skill `pl-receipts` + hook adapter | EMPTY |
| **Continue** | `~/.continue/config.json` IDE adapter | EMPTY |
| **Cline** | VSCode webview hook | EMPTY |
| **Windsurf** | extension manifest | EMPTY |
| **Codeium** | extension manifest | EMPTY |
| **Sourcegraph Cody** | extension manifest | EMPTY |
| **Aider** | CLI hook (we already have a CLI) | EMPTY |
| **GitHub Copilot** | webhook from Audit log | EMPTY |
| **Tabnine** | extension manifest | EMPTY |
| **Zed** | extension manifest | EMPTY |

### Agent-runtime capture (the doc calls this out for P05)
| Framework | Adapter | Status |
|---|---|---|
| **LangGraph** | callback handler | SHIPPED (LangChain handler covers it) |
| **AutoGen / AG2** | agent.on_message hook | EMPTY |
| **CrewAI** | crew.kickoff hook | EMPTY |
| **Mastra** | step-level interceptor | EMPTY |
| **smolagents** | tool-call interceptor | EMPTY |
| **Pydantic AI** | result_validators hook | EMPTY |
| **Vercel AI SDK** | middleware | EMPTY |
| **LlamaIndex** | callback manager | EMPTY |

### Gateway capture (P01)
The doc names Portkey, LiteLLM, Cloudflare, Kong, Bedrock. Today we sit above any of them via fetch interception. Ship NATIVE plug-ins for each so they appear in those communities' docs:

| Gateway | Plug-in | Status |
|---|---|---|
| **LiteLLM** | upstream PR adding a `success_callback` for receipts | EMPTY |
| **Portkey** | guardrail provider | EMPTY (and Portkey is now Palo Alto-owned — this is a co-author moment) |
| **Cloudflare AI Gateway** | workers binding | EMPTY |
| **Kong** | plug-in (Lua) | EMPTY |
| **Bedrock** | EventBridge → receipt pipeline | EMPTY |
| **Vertex AI** | Audit log → receipt pipeline | EMPTY |
| **OpenRouter** | webhook | EMPTY |

---

## Tier 3 · Governance + adoption — the moves that make us irreplaceable

### 5 · Multi-stakeholder maintainer council
CODEOWNERS already shows the discipline. The next step is naming maintainer leads from organizations outside AskLedger Inc. so the project is not single-vendor. Target: by year-end, ≥ 3 organizations with merge rights.

### 6 · A public transparency log anyone can query
Today the Trillian client is shipped; the log is not deployed. Stand up `log.github.com/askledger/receipts-sdk` publicly. Receipt id → inclusion proof endpoint. Mirror Sigstore Rekor's pattern. This is the artifact that lets a CISO say "I can prove our AI history without trusting AskLedger Inc."

### 7 · Reference verifier as a Lambda / Cloudflare Worker / static page
Three deployments of the same verifier so a customer's auditor can run it themselves. Already shipped as a static `site/verifier.html`; add the Worker + Lambda + CLI variants.

### 8 · Federation — multiple independent transparency logs
A receipt's STH can be witnessed by N independent logs. Customers who don't trust any single operator (including us) can require ≥ K-of-N witnesses. This is the move that turns the log from "single point of trust" into "consensus protocol".

### 9 · Open public benchmark (P10 — the empty slot)
Quarterly. Real data (with consent). Hallucination rate, cost-per-outcome, compliance posture, supply-chain risk per vendor. Hosted on GitHub Pages so it cannot be quietly de-listed. This is how we become "the Gartner for AI vendors" — by being the only one whose numbers are reproducible.

### 10 · Vendor SDK kit (vendor co-authorship pattern)
A `pl-vendor-kit` package an LLM provider ships alongside their own SDK so "every call through the official Anthropic SDK can emit a receipt with one env var". Approach Anthropic, OpenAI, Google, Mistral, Cohere — three signatures gets us de-facto standard status.

---

## Tier 4 · DX wins that move adoption metrics

### 11 · 60-second hello world
```
curl -sSL github.com/askledger/receipts-sdk | bash
```
- Installs the CLI.
- Generates a keypair locally.
- Signs a sample receipt.
- Verifies it against the public log.
- Prints the receipt-score badge URL.

Measured by time-to-first-signed-receipt; target < 60s on a fresh laptop.

### 12 · Embeddable verifier widget
```html
<script src="https://askledger.github.io/receipts-sdk/verify.html/widget.js"></script>
<pl-verifier receipt-id="01J9X..."></pl-verifier>
```
- 8 KB JavaScript.
- Renders the verified status inline on any website.
- Used by every customer's public AI page → free distribution.

### 13 · Receipt CLI that anyone can pipe to
```
cat events.jsonl | pl sign --key=... | pl verify
```
Pipes are the most viral interface in OSS. Every senior engineer at every customer becomes a vector for adoption.

### 14 · Killer demo deployable from a single command
```
docker compose up
```
- Console at `localhost:3000`.
- Trillian + Postgres + Prometheus + Grafana + signer + sample data + transparency log.
- Three pre-seeded tenants showing CRO / CFO / CCO views.
- This is the "kubectl apply -f" moment of AI governance — a buyer types one command and sees the future.

---

## Tier 5 · Educational content that compounds

### 15 · "Build your own AI receipts in 200 lines" tutorial
Sigstore won partly because they had a single excellent intro post. Write the equivalent for AI receipts.

### 16 · One conference talk per quarter
Open Source Summit, KubeCon, ICML, AI Engineer World's Fair, RSAC. Each talk is a referenceable artifact. Compounds over years.

### 17 · A monthly "receipt of the month" public post
Highlight a real, anonymised receipt and explain what it proves. Trains the market on what "good" looks like and forces competitors into our language.

---

## Tier 6 · The empty slots from the doc

These have no incumbent. Ship in OSS first, win the slot.

### 18 · The Verifier Model (P13) — released as an open weights model, not a SaaS
The doc names it Year-4 R&D. We start the data collection (with consent) now. Release weights under a `pl-verifier-1` tag. Becomes the model every regulator pings.

### 19 · The public AI vendor benchmark (P10) — released as a GitHub repo
Methodology, data, code, all open. Anyone can reproduce. We become the reference; questionnaire-based analysts become legacy.

### 20 · Receipt-as-Insurance-Substrate (P11) — open data format insurers consume
Munich Re aiSure / Mosaic / Armilla all need an underwriting feed. Publish the receipt → underwriting bundle format as an open spec; carriers don't have to integrate with us, they integrate with the spec. Our hosted variant becomes the easy-button.

---

## What to ship in the next 30 days to compound

Realistic, named, owned:

1. **Week 1 · `/spec/PL-RFC-001..010` v0.1 draft.** Just versioned markdown — the act of publication is the move.
2. **Week 1 · `npx @askledger/conformance` package** — same conformance corpus already in `test/conformance.test.ts`, packaged for external invocation.
3. **Week 2 · LF AI submission package** — README, governance, license check, security policy. We already have every prerequisite.
4. **Week 2 · LiteLLM upstream PR** — adds a `pl_receipts` success callback. Single biggest gateway-share win available.
5. **Week 3 · Public conformance dashboard scaffold.** Static page that reads JSON results. Vendors PR their results.
6. **Week 3 · Cursor + Claude Code adapters.** Two files each. Massive narrative impact ("every Cursor edit is signed").
7. **Week 4 · Public transparency log goes live at `log.github.com/askledger/receipts-sdk`.** Trillian, MySQL, STH archive in S3 with Object Lock.
8. **Week 4 · OpenSSF Model Signing co-authored doc.** Position runtime accountability as the layer above model identity.

---

## Why this wins

The doc says the moat is "RFC 8785 + JWS Ed25519 + RFC 3161 + Merkle commitments — Empty Slot". An empty slot only stays ours if we **plant the standard before anyone else does**. Cisco bought Galileo to plant model-provenance. Palo Alto bought Portkey to plant gateway-level guardrails. Neither has the runtime-receipts substrate. We have a ~12-18 month window to make `askledger` the term-of-art for AI accountability.

The hundred-feature path doesn't win. The standard-plus-conformance-plus-governance path wins. Every Tier 1 item above is a publication act, not a build act. The code largely exists. Publishing it as a versioned, citable, conformant standard is the move that converts product into industry position.
