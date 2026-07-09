import { describe, it, expect } from "vitest";
import { signReceiptWithStore, reconstructWorkflow, verifyWorkflow, generateKeyPair } from "../src/index.js";
import { MemoryChainStateStore } from "../src/chain-store.js";
import type { RawEvent } from "../src/types.js";

const kp = generateKeyPair();
const keys = { [kp.kid]: kp.public_key };
const store = new MemoryChainStateStore();

const evt = (type: string): RawEvent => ({
  schema_version: "1.0",
  tenant_id: "acme",
  event_type: type, // dotted identifier, e.g. "agent.plan"
  source_system: "agent",
  event_id: type,
  captured_at: "2026-06-01T00:00:00.000Z",
  subject: { ai_vendor: "openai", ai_model: "gpt-5" },
});

const step = (type: string, parents: string[]) =>
  signReceiptWithStore(
    { event: evt(type), keypair: kp, provenance: { workflow_id: "wf1", parent_receipt_ids: parents } },
    store
  );

describe("Layer 2 — deterministic workflow reconstruction", () => {
  it("rebuilds a linear run in order and verifies it", async () => {
    const r1 = await step("agent.plan", []);
    const r2 = await step("agent.retrieve", [r1.receipt.receipt_id]);
    const r3 = await step("agent.answer", [r2.receipt.receipt_id]);

    const g = reconstructWorkflow([r3, r1, r2]); // any order in
    expect(g.workflowId).toBe("wf1");
    expect(g.order).toEqual([r1, r2, r3].map((r) => r.receipt.receipt_id));
    expect(g.roots).toEqual([r1.receipt.receipt_id]);
    expect(g.leaves).toEqual([r3.receipt.receipt_id]);
    expect(g.acyclic).toBe(true);
    expect(g.missingParents).toEqual([]);

    const v = verifyWorkflow([r1, r2, r3], { publicKeys: keys });
    expect(v.valid).toBe(true);
    expect(v.stepCount).toBe(3);
    expect(v.checks).toMatchObject({ all_receipts_verified: true, graph_complete: true, acyclic: true, single_workflow: true });
  });

  it("orders a DAG (two parents merge into one step)", async () => {
    const a = await step("agent.branch_a", []);
    const b = await step("agent.branch_b", []);
    const merge = await step("agent.merge", [a.receipt.receipt_id, b.receipt.receipt_id]);
    const g = reconstructWorkflow([merge, a, b]);
    const pos = (id: string) => g.order.indexOf(id);
    expect(pos(merge.receipt.receipt_id)).toBeGreaterThan(pos(a.receipt.receipt_id));
    expect(pos(merge.receipt.receipt_id)).toBeGreaterThan(pos(b.receipt.receipt_id));
    expect(g.leaves).toEqual([merge.receipt.receipt_id]);
    expect(new Set(g.roots)).toEqual(new Set([a.receipt.receipt_id, b.receipt.receipt_id]));
  });

  it("flags a dropped step as a dangling parent", async () => {
    const r1 = await step("agent.plan", []);
    const r2 = await step("agent.retrieve", [r1.receipt.receipt_id]);
    const r3 = await step("agent.answer", [r2.receipt.receipt_id]);
    const v = verifyWorkflow([r1, r3], { publicKeys: keys }); // r2 removed
    expect(v.checks.graph_complete).toBe(false);
    expect(v.missingParents).toContain(r2.receipt.receipt_id);
    expect(v.valid).toBe(false);
  });

  it("fails when a step receipt is tampered", async () => {
    const r1 = await step("agent.plan", []);
    const r2 = await step("agent.act", [r1.receipt.receipt_id]);
    (r2.receipt.event as Record<string, unknown>).event_type = "agent.tampered";
    const v = verifyWorkflow([r1, r2], { publicKeys: keys });
    expect(v.checks.all_receipts_verified).toBe(false);
    expect(v.valid).toBe(false);
  });
});
