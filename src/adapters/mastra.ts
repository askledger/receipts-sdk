// Mastra agent framework adapter. Registers as an agent telemetry
// listener and emits a receipt per step.

import { signReceipt } from "../receipt.js";
import { sha256String } from "../crypto.js";
import type { AdapterContext } from "./common.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function plMastraListener(ctx: AdapterContext) {
  return {
    onAgentStepComplete(evt: { agentId: string; stepName: string; input?: unknown; output?: unknown; model?: { provider?: string; modelId?: string }; usage?: { promptTokens?: number; completionTokens?: number }; latencyMs?: number }): void {
      try {
        const input = JSON.stringify(evt.input ?? "");
        const output = JSON.stringify(evt.output ?? "");
        signReceipt({
          event: {
            schema_version: "1.0",
            tenant_id: ctx.tenantId,
            event_type: "agent.step",
            source_system: ctx.sourceSystem ?? "adapter:mastra",
            event_id: `mastra-${Date.now()}-${sha256String(input).slice(0, 12)}`,
            captured_at: new Date().toISOString(),
            context: { service_id: evt.agentId, correlation_id: evt.stepName },
            subject: { ai_vendor: String(evt.model?.provider ?? "unknown"), ai_model: String(evt.model?.modelId ?? "unknown") },
            payload: {
              input_hash: sha256String(input),
              output_hash: sha256String(output),
              input_token_count: Number(evt.usage?.promptTokens ?? 0),
              output_token_count: Number(evt.usage?.completionTokens ?? 0),
              metadata: { latency_ms: Number(evt.latencyMs ?? 0) },
            },
          },
          keypair: ctx.keypair,
        });
      } catch { /* never block agent execution */ }
    },
  };
}
