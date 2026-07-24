/**
 * OpenAI Agents SDK adapter (`@openai/agents`).
 *
 * Emits a signed receipt for each agent turn, tool call, and handoff by
 * subscribing to the SDK's lifecycle event emitter (RunHooks / AgentHooks).
 *
 * Verified against `@openai/agents-core` `RunHookEvents` (v0.13.x). The Runner
 * and every Agent extend an EventEmitter (`.on(event, listener)`) that emits:
 *
 *   agent_start       (context, agent, turnInput?)
 *   agent_end         (context, agent, output)
 *   agent_handoff     (context, fromAgent, toAgent)
 *   agent_tool_start  (context, agent, tool, details)
 *   agent_tool_end    (context, agent, tool, result, details)
 *
 * Dependency-free: we duck-type the `.on(...)` surface and the event argument
 * shapes rather than importing the SDK, so the adapter does not couple to a
 * specific version. We receipt the *completion* events (agent_end,
 * agent_tool_end, agent_handoff), which carry the outcome.
 *
 * Usage (run level, recommended):
 *
 *   import { Runner } from "@openai/agents";
 *   import { attachAgentReceipts } from "@askledger/receipts-sdk/adapters/openai-agents";
 *
 *   const runner = new Runner();
 *   attachAgentReceipts(runner, { tenantId: "acme", keypair, onReceipt });
 *   await runner.run(agent, input);
 *
 * You can also attach to a single Agent. The Runner (RunHooks) and Agent
 * (AgentHooks) argument lists differ slightly for agent_end / agent_tool_end,
 * so the listeners below extract fields defensively and work with either.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { RawEvent } from "../types.js";
import { type AdapterContext, captureAndSign, envLabel, newEventId, sha256Hex } from "./common.js";

/** Minimal event-emitter surface we rely on (duck-typed). */
export interface AgentsEmitter {
  on(event: string, listener: (...args: any[]) => void): unknown;
}

function agentName(a: any): string | undefined {
  return a && typeof a === "object" && typeof a.name === "string" ? a.name : undefined;
}

/** Resolve a model name from an Agent, whose `model` may be a string or a Model object. */
function agentModel(a: any): string {
  const m = a?.model;
  if (typeof m === "string" && m.length > 0) return m;
  if (m && typeof m === "object" && typeof m.name === "string") return m.name;
  return "unknown";
}

function toolName(t: any): string {
  return t && typeof t === "object" && typeof t.name === "string" ? t.name : "unknown";
}

function looksLikeAgent(x: any): boolean {
  return !!x && typeof x === "object" && (typeof x.name === "string" || "model" in x || "handoffs" in x);
}

/**
 * Attach receipt capture to an `@openai/agents` Runner or Agent. Returns the
 * same emitter for chaining. Listeners never throw: receipt failures are
 * swallowed by `captureAndSign` so they cannot affect the agent run.
 */
export function attachAgentReceipts(emitter: AgentsEmitter, ctx: AdapterContext): AgentsEmitter {
  const source = ctx.sourceSystem ?? "adapter:openai-agents";
  const env = envLabel(ctx);

  const emit = (event: Partial<RawEvent> & { event_type: string }): void => {
    void captureAndSign(ctx, {
      schema_version: "1.0",
      tenant_id: ctx.tenantId,
      source_system: source,
      event_id: newEventId("oa"),
      captured_at: new Date().toISOString(),
      ...event,
    } as RawEvent);
  };

  // agent_end, RunHooks: (context, agent, output). AgentHooks: (context, output).
  emitter.on("agent_end", (_context: unknown, a: any, b?: unknown) => {
    const hasAgent = looksLikeAgent(a);
    const agent = hasAgent ? a : undefined;
    const output = hasAgent ? b : a;
    emit({
      event_type: "ai.agent_turn",
      subject: { ai_vendor: "openai", ai_model: agentModel(agent), ai_capability: "agent-turn" },
      payload: {
        output_hash: sha256Hex(String(output ?? "")),
        input_classification: "internal",
        output_classification: "internal",
        metadata: { agent: agentName(agent), framework: "openai-agents", environment: env },
      },
    });
  });

  // agent_tool_end, RunHooks: (context, agent, tool, result, details).
  //                   AgentHooks: (context, tool, result, details).
  emitter.on("agent_tool_end", (_context: unknown, ...rest: any[]) => {
    let agent: any, tool: any, result: unknown;
    if (looksLikeAgent(rest[0])) [agent, tool, result] = rest;
    else [tool, result] = rest;
    emit({
      event_type: "ai.tool_call",
      subject: { ai_vendor: "openai", ai_model: agentModel(agent), ai_capability: "tool-call" },
      payload: {
        output_hash: sha256Hex(String(result ?? "")),
        input_classification: "internal",
        output_classification: "internal",
        metadata: { tool: toolName(tool), agent: agentName(agent), framework: "openai-agents", environment: env },
      },
    });
  });

  // agent_handoff, RunHooks: (context, fromAgent, toAgent). AgentHooks: (context, nextAgent).
  emitter.on("agent_handoff", (_context: unknown, a: any, b?: any) => {
    const from = b === undefined ? undefined : a;
    const to = b === undefined ? a : b;
    emit({
      event_type: "ai.handoff",
      subject: { ai_vendor: "openai", ai_capability: "handoff" },
      payload: {
        input_classification: "internal",
        output_classification: "internal",
        metadata: {
          from_agent: agentName(from),
          to_agent: agentName(to),
          framework: "openai-agents",
          environment: env,
        },
      },
    });
  });

  return emitter;
}
