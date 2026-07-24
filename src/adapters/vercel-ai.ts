// Vercel AI SDK middleware. Drop into `streamText` / `generateText`
// via the `middleware` option (ai@4+). Emits a signed receipt per
// generation and delivers it through ctx.onReceipt.

import { sha256String } from "../crypto.js";
import { type AdapterContext, captureAndSign } from "./common.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Vercel AI SDK types intentionally loose at the boundary.

export function plReceiptsMiddleware(ctx: AdapterContext) {
  return {
    async wrapGenerate(opts: { doGenerate: () => Promise<any>; params: any; model: any }) {
      const t0 = performance.now();
      const result = await opts.doGenerate();
      const promptText = JSON.stringify(opts.params?.prompt ?? opts.params?.messages ?? "");
      const completion = String(result?.text ?? "");
      // Awaited so onReceipt runs before we return; captureAndSign never throws.
      await captureAndSign(ctx, {
        schema_version: "1.0",
        tenant_id: ctx.tenantId,
        event_type: "ai.model_invocation",
        source_system: ctx.sourceSystem ?? "adapter:vercel-ai",
        event_id: `vai-${Date.now()}-${sha256String(promptText).slice(0, 12)}`,
        captured_at: new Date().toISOString(),
        subject: {
          ai_vendor: String(opts.model?.provider ?? "unknown"),
          ai_model: String(opts.model?.modelId ?? "unknown"),
        },
        payload: {
          input_hash: sha256String(promptText),
          output_hash: sha256String(completion),
          input_token_count: Number(result?.usage?.promptTokens ?? 0),
          output_token_count: Number(result?.usage?.completionTokens ?? 0),
          metadata: { latency_ms: Math.round(performance.now() - t0) },
        },
      });
      return result;
    },
  };
}
