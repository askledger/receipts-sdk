// LlamaIndex (TypeScript) callback. Wires into the BaseCallbackManager
// to receive `llm-start` / `llm-end` events, emitting a signed receipt on
// each LLM completion and delivering it through `ctx.onReceipt`.

import { sha256String } from "../crypto.js";
import { type AdapterContext, captureAndSign } from "./common.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function plLlamaIndexHandler(ctx: AdapterContext) {
  return {
    handleLLMEnd(payload: {
      input?: unknown;
      output?: unknown;
      metadata?: { model?: string; vendor?: string; usage?: { input_tokens?: number; output_tokens?: number } };
      durationMs?: number;
    }): void {
      const input = JSON.stringify(payload.input ?? "");
      const output = JSON.stringify(payload.output ?? "");
      // captureAndSign signs, fires ctx.onReceipt, and swallows all errors so
      // it can never take down the index/query it instruments.
      void captureAndSign(ctx, {
        schema_version: "1.0",
        tenant_id: ctx.tenantId,
        event_type: "ai.model_invocation",
        source_system: ctx.sourceSystem ?? "adapter:llamaindex",
        event_id: `lix-${Date.now()}-${sha256String(input).slice(0, 12)}`,
        captured_at: new Date().toISOString(),
        subject: {
          ai_vendor: String(payload.metadata?.vendor ?? "unknown"),
          ai_model: String(payload.metadata?.model ?? "unknown"),
        },
        payload: {
          input_hash: sha256String(input),
          output_hash: sha256String(output),
          input_token_count: Number(payload.metadata?.usage?.input_tokens ?? 0),
          output_token_count: Number(payload.metadata?.usage?.output_tokens ?? 0),
          metadata: { latency_ms: Number(payload.durationMs ?? 0) },
        },
      });
    },
  };
}
