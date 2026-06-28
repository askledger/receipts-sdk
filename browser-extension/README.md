# Project Ledger · Chrome Extension

> Captures every AI prompt you send to ChatGPT, Claude, Gemini, Bedrock, Copilot, Perplexity, Hugging Face — signs a cryptographic receipt locally — keeps the audit trail under your control.

## Why this exists

Every developer uses consumer AI for work. Every CISO worries about shadow AI. The standard answer is to install a network DLP appliance, terminate TLS, and inspect everything. That's an ugly compromise.

Project Ledger's extension takes the opposite stance:

- **Default mode is private.** Every receipt stays on your machine. The private key is generated locally and never leaves.
- **Corporate visibility is opt-in.** With your explicit consent, the extension can ship signed receipts to your corporate ingest URL. Metadata only — your prompt text never leaves the browser.
- **Cryptographic credibility.** Every receipt is signed Ed25519, hash-chained, RFC 8785 canonical. Anyone can independently verify a receipt with just your public key.

## Install (developer mode)

1. Clone the repo: `git clone https://github.com/askledger/receipts-sdk.git`
2. Chrome → `chrome://extensions` → enable Developer mode
3. Click **Load unpacked** → select `browser-extension/`
4. Open ChatGPT, Claude, or Gemini. Ask anything.
5. Click the extension icon — see your receipts appear in real time.

## What gets signed

For every prompt you send:

| Field | What's in it |
|---|---|
| `event_type` | `consumer.prompt` |
| `source_system` | `browser-extension` |
| `subject.ai_vendor` | `openai` / `anthropic` / `google` / `microsoft` / `perplexity` |
| `payload.input_hash` | SHA-256 of your prompt — **not the prompt text** |
| `payload.input_size_bytes` | Length of your prompt |
| `payload.metadata.host` | The host (e.g. `chatgpt.com`) |
| `payload.metadata.url_path` | The conversation URL path |
| `context.environment` | `personal` |
| `integrity.chain_height` | Your monotonically increasing chain position |
| `integrity.previous_receipt_hash` | Links to the previous receipt |
| `integrity.receipt_hash` | SHA-256 of the canonical receipt body |
| `signatures[0]` | Ed25519 signature with your local key |

The prompt text itself is never recorded. The receipt records *that* the prompt happened, *what model* answered, and a tamper-evident link to every previous prompt — without exposing the content.

## Architecture

```
browser-extension/
  manifest.json     · Chrome MV3 manifest
  background.js     · service worker · keypair + signing + storage
  content.js        · injected into AI sites · captures submit events
  popup.html/js     · the receipts viewer
  options.html      · corporate ingest + consent settings
  vendor/           · @noble/ed25519 + @noble/hashes + canonicalize (bundled, no remote scripts per MV3)
```

## Security

- Manifest V3 strict CSP — no remote scripts, no eval
- Private key generated via `ed.utils.randomPrivateKey()` (CSPRNG)
- Stored in `chrome.storage.local`, encrypted at rest by Chrome
- Receipts cap at 1000 entries locally (FIFO)
- Optional corporate ingest is HTTPS only

## Roadmap

- Firefox + Safari + Edge ports (Manifest V3)
- Local index for "show me every receipt that mentions FY26 budget"
- Plug into the public Transparency Log so your receipts are anchored in the global STH chain
- Hardware-key signing (WebAuthn / YubiKey) for higher assurance tiers

License: Apache-2.0. The substrate is the public good. Use freely.
