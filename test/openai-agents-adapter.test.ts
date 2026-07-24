/**
 * Tests for the OpenAI Agents SDK adapter.
 *
 * The first suite is dependency-free: it drives a stand-in emitter with the
 * SAME `.on()/.emit()` contract and the SAME event argument shapes as
 * `@openai/agents` RunHooks (verified against v0.13.5), so the adapter's logic
 * is always covered in CI without pulling the SDK (and its transitive
 * advisories) into the dependency graph.
 *
 * The second suite runs the adapter against the REAL package IF it is
 * installed locally (`npm i -D @openai/agents`); otherwise it is skipped. It
 * was verified passing against @openai/agents@0.13.5.
 */
import { describe, it, expect } from "vitest";
import { attachAgentReceipts, type AgentsEmitter } from "../src/adapters/openai-agents.js";
import { generateKeyPair, verifyReceipt } from "../src/index.js";
import type { SignedReceipt } from "../src/types.js";

const meta = (r: SignedReceipt) =>
  (r.receipt.event.payload?.metadata ?? {}) as Record<string, unknown>;
const verifies = (r: SignedReceipt, kid: string, pub: string) =>
  verifyReceipt(r, { publicKeys: { [kid]: pub } }).valid;

/** Stand-in for the RunHooks EventEmitter (same contract the adapter relies on). */
class FakeEmitter implements AgentsEmitter {
  private readonly listeners = new Map<string, ((...a: unknown[]) => void)[]>();
  on(event: string, listener: (...a: unknown[]) => void): this {
    const arr = this.listeners.get(event) ?? [];
    arr.push(listener);
    this.listeners.set(event, arr);
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    (this.listeners.get(event) ?? []).forEach((l) => l(...args));
  }
}

describe("openai-agents adapter · logic (dependency-free)", () => {
  it("receipts agent_end, agent_tool_end and agent_handoff — all verifiable", async () => {
    const keypair = generateKeyPair();
    const receipts: SignedReceipt[] = [];
    const em = new FakeEmitter();
    attachAgentReceipts(em, { tenantId: "acme", keypair, onReceipt: (r) => { receipts.push(r); } });

    const agent = { name: "triage", model: "gpt-5" };
    const specialist = { name: "specialist", model: "gpt-5" };
    em.emit("agent_end", {}, agent, "final answer");
    em.emit("agent_tool_end", {}, agent, { name: "web_search" }, "tool result", { toolCall: {} });
    em.emit("agent_handoff", {}, agent, specialist);
    await new Promise((r) => setTimeout(r, 25));

    expect(receipts.length).toBe(3);
    const byType = Object.fromEntries(
      receipts.map((r) => [r.receipt.event.event_type, r]),
    ) as Record<string, SignedReceipt>;
    expect(byType["ai.agent_turn"].receipt.event.subject?.ai_model).toBe("gpt-5");
    expect(meta(byType["ai.agent_turn"]).agent).toBe("triage");
    expect(meta(byType["ai.tool_call"]).tool).toBe("web_search");
    expect(meta(byType["ai.handoff"]).to_agent).toBe("specialist");
    for (const r of receipts) expect(verifies(r, keypair.kid, keypair.public_key)).toBe(true);
  });

  it("never throws from a listener (a receipt must not break the run)", () => {
    const em = new FakeEmitter();
    attachAgentReceipts(em, { tenantId: "acme", keypair: generateKeyPair() });
    expect(() => em.emit("agent_end", {}, { name: "a", model: "gpt-5" }, "out")).not.toThrow();
  });
});

// Optional live integration — only when @openai/agents is installed locally.
let agents: { Runner: new () => AgentsEmitter & { emit: (e: string, ...a: unknown[]) => void }; Agent: new (o: unknown) => unknown } | null = null;
try {
  agents = (await import("@openai/agents")) as unknown as typeof agents;
} catch {
  /* package not installed — suite skipped */
}
const liveDescribe = agents ? describe : describe.skip;
liveDescribe("openai-agents adapter · live @openai/agents RunHooks", () => {
  it("a real Runner emits events the adapter receipts", async () => {
    const { Runner, Agent } = agents!;
    const keypair = generateKeyPair();
    const receipts: SignedReceipt[] = [];
    const runner = new Runner();
    attachAgentReceipts(runner, { tenantId: "acme", keypair, onReceipt: (r) => { receipts.push(r); } });
    const agent = new Agent({ name: "triage", instructions: "route", model: "gpt-5" });
    runner.emit("agent_end", {}, agent, "final answer");
    await new Promise((r) => setTimeout(r, 25));
    const turn = receipts.find((r) => r.receipt.event.event_type === "ai.agent_turn");
    expect(turn).toBeTruthy();
    expect(verifies(turn!, keypair.kid, keypair.public_key)).toBe(true);
  });
});
