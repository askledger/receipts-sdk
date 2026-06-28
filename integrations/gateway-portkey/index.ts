// Portkey guardrail provider. Portkey supports custom guardrails as
// Node callbacks; this one emits a Project Ledger receipt per call.
//
//   import { plPortkeyGuardrail } from "@askledger/portkey-guardrail";
//   portkey.use(plPortkeyGuardrail({ tenantId: "acme", keypair }));

import { signReceipt } from "../../src/receipt.js";
import { sha256String } from "../../src/crypto.js";
import type { AdapterContext } from "../../src/adapters/common.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function plPortkeyGuardrail(ctx: AdapterContext) {
  return async (req: { body?: any; route?: string }, res: { body?: any; status?: number; headers?: Record<string, string> }) => {
    try {
      const promptText = JSON.stringify(req.body?.messages ?? req.body?.prompt ?? "");
      const completion = JSON.stringify(res.body?.choices?.[0] ?? "");
      signReceipt({
        event: {
          schema_version: "1.0",
          tenant_id: ctx.tenantId,
          event_type: "gateway.request",
          source_system: ctx.sourceSystem ?? "adapter:portkey",
          event_id: `pk-${Date.now()}-${sha256String(promptText).slice(0, 12)}`,
          captured_at: new Date().toISOString(),
          subject: { ai_vendor: String(req.body?.provider ?? "openai-compatible"), ai_model: String(req.body?.model ?? "unknown") },
          payload: {
            input_hash: sha256String(promptText),
            output_hash: sha256String(completion),
            input_token_count: Number(res.body?.usage?.prompt_tokens ?? 0),
            output_token_count: Number(res.body?.usage?.completion_tokens ?? 0),
            http_status: Number(res.status ?? 0),
            input_classification: "internal",
          },
        },
        keypair: ctx.keypair,
      });
    } catch { /* never break gateway flow */ }
    return { verdict: "PASS" as const };
  };
}
