# PL-RFC-007 · Cross-Vendor Capture Semantics

**Status:** Draft v0.1
**Date:** 2026-06-13

## 1 · Purpose

Specify how an implementation captures an AI call from a third-party
vendor SDK (Anthropic, OpenAI, Google, AWS Bedrock, Azure OpenAI) into
a normalized Receipt. Without normalization, downstream evidence packs
would be vendor-specific.

## 2 · Event-type taxonomy

Every captured event maps to one of the canonical types:

| `event_type` | Vendor surface |
|---|---|
| `ai.model_invocation` | Direct chat/completion call |
| `ai.streaming_invocation` | Streaming SSE/WebSocket call (capture final aggregated content) |
| `ai.tool_call` | Model-initiated tool invocation |
| `ai.embedding` | Vector embedding call |
| `ai.image_generation` | Multimodal output (image) |
| `ai.audio_generation` | TTS / audio synthesis |
| `ai.fine_tune_request` | Fine-tuning job submitted |
| `ai.guardrail_block` | Vendor or first-party guardrail blocked the call |
| `ai.model_invocation_blocked` | AskLedger policy blocked the call |

Implementations **MAY** add vendor-specific subtype identifiers but
**MUST** carry one of the canonical `event_type` values.

## 3 · Subject mapping

`event.subject.ai_vendor` and `event.subject.ai_model` are normalized.
Reference mappings:

| Vendor SDK call | `ai_vendor` | `ai_model` |
|---|---|---|
| `anthropic.messages.create(model="claude-opus-4-6")` | `anthropic` | `claude-opus-4-6` |
| `openai.chat.completions.create(model="gpt-5")` | `openai` | `gpt-5` |
| `bedrock.invoke_model(modelId="anthropic.claude-...")` | `aws-bedrock` | upstream model name |
| `vertex.GenerativeModel("gemini-2-5-pro").generate_content` | `google` | `gemini-2-5-pro` |
| Azure OpenAI deployment | `azure-openai` | deployment-name + upstream model name |

Implementations **MUST** preserve the upstream model identifier when the
gateway repackages it.

## 4 · Payload hashing

The plaintext prompt and response are **NEVER** included in the
Receipt. Instead:

```
event.payload.input_hash        = SHA-256(canonical(prompt))
event.payload.output_hash       = SHA-256(canonical(response))
event.payload.input_token_count = <int>
event.payload.output_token_count= <int>
event.payload.input_classification = "internal" | "external" | "sensitive"
```

`input_classification` is derived by the safety module (PL-RFC-008).
PII-bearing prompts **MUST** be redacted before hashing so the hash is
stable across regions where the PII surface differs.

## 5 · Gateway interceptors

For gateway-mediated traffic (Portkey, LiteLLM, Cloudflare AI Gateway,
Kong, Bedrock, Vertex), interception **MUST** occur after gateway
guardrails apply, so the Receipt reflects the actual model output
delivered to the caller.

## 6 · Idempotency of capture

If the same vendor call is captured by both an SDK-level adapter and a
gateway interceptor, deduplication **MUST** occur. The recommended
discriminator is the upstream `request_id` header (Anthropic
`anthropic-request-id`, OpenAI `x-request-id`, Bedrock
`x-amzn-RequestId`).

## 7 · References

- PL-RFC-001 — Receipt Schema.
- PL-RFC-008 — Policy Bundle and Decision Block.
