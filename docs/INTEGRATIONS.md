# Integrations

Everything AskLedger connects to today. This list is deliberately limited to what
actually ships in this repository — each row maps to real, exported code or a
documented connector. Where something is planned rather than shipping, it says so.

## AI model vendors and gateways

Captured either by a typed client wrapper (`wrapOpenAI`, `wrapAnthropic`) or the
network-level interceptor (`withReceipts(fetch)`), which detects the vendor from
the outbound request.

| Vendor / gateway | How | Status |
|---|---|---|
| OpenAI | `wrapOpenAI` + fetch detection | ✅ Shipping |
| Anthropic | `wrapAnthropic` + fetch detection | ✅ Shipping |
| Azure OpenAI | fetch detection | ✅ Shipping |
| Google Gemini | fetch detection | ✅ Shipping |
| AWS Bedrock | fetch detection | ✅ Shipping |
| Cohere | fetch detection | ✅ Shipping |
| Mistral | fetch detection | ✅ Shipping |
| Groq | fetch detection | ✅ Shipping |
| Together | fetch detection | ✅ Shipping |
| Hugging Face | fetch detection | ✅ Shipping |
| Vercel AI Gateway | fetch detection | ✅ Shipping |
| OpenAI-compatible (LiteLLM, DeepSeek, Anyscale, …) | `wrapOpenAI` | ✅ Shipping |
| Any other HTTP vendor | `withReceipts({ extraPatterns })` | ✅ Shipping |

## AI frameworks and agent runtimes

| Framework | Adapter | Status |
|---|---|---|
| LangChain.js | `ReceiptsCallbackHandler` | ✅ Shipping |
| LangGraph | `ReceiptsCallbackHandler` (LangChain callbacks propagate through graph nodes) | ✅ Shipping |
| OpenAI Agents SDK (`@openai/agents`) | `attachAgentReceipts` (RunHooks: agent turn, tool call, handoff) | ✅ Shipping · integration-tested against the live package |
| LlamaIndex (TS) | `plLlamaIndexHandler` | ✅ Shipping |
| Mastra | `plMastraListener` | ✅ Shipping |
| Vercel AI SDK (`ai@4+`) | `plReceiptsMiddleware` (`wrapGenerate`) | ✅ Shipping |
| Python agent frameworks | via the Python SDK | ⏳ Planned |

## Language SDKs

| Language | Package | Status |
|---|---|---|
| TypeScript / Node | `@askledger/receipts-sdk` (npm) | ✅ Shipping on npm |
| Python | `python-sdk/` | ✅ Conformant · install from source (not yet on PyPI) |
| Go | `go-sdk/` | ✅ Conformant · from source |
| Rust | `rust-sdk/` | ✅ Conformant · from source |
| Java | `java-sdk/` | ✅ Conformant · from source |

All five pass the shared RFC 8785 / SHA-256 conformance vectors, so a receipt
signed in one language verifies in every other.

## Signing backends (keys never leave your control)

| Backend | Module | Status |
|---|---|---|
| AWS KMS | `hsm/aws-kms` | ✅ Shipping |
| Azure Key Vault | `hsm/azure-key-vault` | ✅ Shipping |
| GCP KMS | `hsm/gcp-kms` | ✅ Shipping |
| PKCS#11 HSM (Luna, CloudHSM, YubiHSM, …) | `hsm/pkcs11` | ✅ Shipping |
| In-process Ed25519 (dev / low-assurance) | core | ✅ Shipping |

## Evidence export and SIEM

Ship receipts to the systems your security and audit teams already run.

| Destination | Status |
|---|---|
| Splunk (HEC) | ✅ Shipping |
| IBM QRadar | ✅ Shipping |
| Microsoft Sentinel | ✅ Shipping |
| Elastic | ✅ Shipping |
| Generic Syslog / CEF | ✅ Shipping |
| Webhook (any endpoint) | ✅ Shipping |

## Storage and verification

| Capability | Status |
|---|---|
| Per-tenant hash-chain store on PostgreSQL | ✅ Shipping |
| Public verifier (verify with only the public key) | ✅ Shipping |
| CLI (`sign`, `verify`, `scan`) | ✅ Shipping |
| Browser playground / verifier (no install) | ✅ Shipping |

## Standards

RFC 8785 (JCS canonicalization) · Ed25519 · RFC 3161 (trusted timestamps) ·
RFC 9162 (Merkle tree / transparency log). Maps to EU AI Act (Article 12),
NIST AI RMF, ISO/IEC 42001, India RBI, UAE CBUAE — see
[docs/POLICY_MAPPING.md](POLICY_MAPPING.md).

---

*Planned* (not yet shipping): PyPI / crates.io / Maven Central publishing of the
non-TypeScript SDKs, a first-class Python agent-framework adapter, and cloud
marketplace listings (AWS / Azure). We list these as planned rather than implying
they exist.
