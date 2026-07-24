/**
 * Integration test for the OpenAI Agents SDK adapter.
 *
 * This runs against the REAL `@openai/agents` package (a devDependency): it
 * constructs an actual Runner + Agent, subscribes the adapter, and emits the
 * SDK's real lifecycle events. No API key or network is needed — we drive the
 * emitter directly, which is exactly the contract the adapter depends on.
 */
import { describe, it, expect } from "vitest";
import { Runner, Agent } from "@openai/agents";
import { attachAgentReceipts } from "../src/adapters/openai-agents.js";
import { generateKeyPair, verifyReceipt } from "../src/index.js";
import type { SignedReceipt } from "../src/types.js";

const meta = (r: SignedReceipt) =>
  (r.receipt.event.payload?.metadata ?? {}) as Record<string, unknown>;

describe("openai-agents adapter · live @openai/agents RunHooks", () => {
  it("emits a verifiable receipt for agent_end, agent_tool_end and agent_handoff", async () => {
    const keypair = generateKeyPair();
    const receipts: SignedReceipt[] = [];
    const runner = new Runner();

    attachAgentReceipts(runner, {
      tenantId: "acme",
      keypair,
      onReceipt: (r) => { receipts.push(r); },
    });

    const agent = new Agent({ name: "triage", instructions: "route the request", model: "gpt-5" });
    const specialist = new Agent({ name: "specialist", instructions: "answer", model: "gpt-5" });
    const ctx = {}; // RunContext placeholder; the adapter does not read it

    // Emit the SDK's real RunHooks events (verified arg order for v0.13.x).
    runner.emit("agent_end", ctx, agent, "final answer");
    runner.emit("agent_tool_end", ctx, agent, { name: "web_search" }, "tool result", { toolCall: {} });
    runner.emit("agent_handoff", ctx, agent, specialist);

    // captureAndSign runs onReceipt on a microtask; let it flush.
    await new Promise((r) => setTimeout(r, 25));

    expect(receipts.length).toBe(3);

    const byType = Object.fromEntries(
      receipts.map((r) => [r.receipt.event.event_type, r]),
    ) as Record<string, SignedReceipt>;

    expect(byType["ai.agent_turn"]).toBeTruthy();
    expect(byType["ai.tool_call"]).toBeTruthy();
    expect(byType["ai.handoff"]).toBeTruthy();

    expect(byType["ai.agent_turn"].receipt.event.subject?.ai_model).toBe("gpt-5");
    expect(meta(byType["ai.agent_turn"]).agent).toBe("triage");
    expect(meta(byType["ai.tool_call"]).tool).toBe("web_search");
    expect(meta(byType["ai.handoff"]).from_agent).toBe("triage");
    expect(meta(byType["ai.handoff"]).to_agent).toBe("specialist");

    // Every emitted receipt verifies independently with only the public key.
    for (const r of receipts) {
      const v = verifyReceipt(r, { publicKeys: { [keypair.kid]: keypair.public_key } });
      expect(v.valid).toBe(true);
    }
  });

  it("never throws from the lifecycle listeners (receipts must not break the run)", () => {
    const runner = new Runner();
    attachAgentReceipts(runner, { tenantId: "acme", keypair: generateKeyPair() });
    const agent = new Agent({ name: "a", instructions: "x", model: "gpt-5" });
    expect(() => runner.emit("agent_end", {}, agent, "out")).not.toThrow();
  });
});
