/**
 * Tests for end-to-end pipeline + approval workflows.
 */

import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  runPipeline,
  ApprovalWorkflow,
  StateMachine,
  WorkflowError,
  StubTSAClient,
  verifyReceipt,
  type SignedReceipt,
} from "../src/index.js";
import type { RawEvent } from "../src/types.js";

function evt(tenant: string): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: tenant,
    event_type: "gateway.request",
    source_system: "wf-test",
    event_id: `${tenant}-evt-${Date.now()}`,
    captured_at: "2026-05-13T10:00:00.000Z",
    context: { environment: "production" },
    subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
    payload: { input_classification: "internal", output_classification: "internal" },
  };
}

describe("StateMachine", () => {
  it("permits valid transitions, rejects invalid ones", async () => {
    const sm = new StateMachine<"a" | "b" | "c">("a", [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);
    expect(sm.state).toBe("a");
    await sm.transition("b");
    expect(sm.state).toBe("b");
    await expect(sm.transition("a")).rejects.toThrow(WorkflowError);
    await sm.transition("c");
    expect(sm.state).toBe("c");
  });

  it("records transition history", async () => {
    const sm = new StateMachine<"a" | "b">("a", [{ from: "a", to: "b" }]);
    await sm.transition("b", { actor: "alice" });
    expect(sm.log.length).toBe(1);
    expect(sm.log[0].actor).toBe("alice");
  });
});

describe("runPipeline end-to-end", () => {
  it("captures → signs → timestamps → persists → notifies → done", async () => {
    const kp = generateKeyPair();
    const persisted: SignedReceipt[] = [];
    const notified: SignedReceipt[] = [];
    const result = await runPipeline(evt("pipe-" + Math.random().toString(36).slice(2)), {
      signingKey: kp,
      tsa: new StubTSAClient(),
      store: async (r) => {
        persisted.push(r);
      },
      notify: async (r) => {
        notified.push(r);
      },
    });
    expect(result.state).toBe("done");
    expect(result.receipt).toBeDefined();
    expect(result.timestamps?.length).toBe(1);
    expect(persisted.length).toBe(1);
    expect(notified.length).toBe(1);
    const verified = verifyReceipt(result.receipt!, {
      publicKeys: { [kp.kid]: kp.public_key },
    });
    expect(verified.valid).toBe(true);
  });

  it("skips optional steps when not configured", async () => {
    const kp = generateKeyPair();
    const result = await runPipeline(evt("pipe-min-" + Math.random().toString(36).slice(2)), {
      signingKey: kp,
    });
    expect(result.state).toBe("done");
    expect(result.timestamps).toBeUndefined();
  });
});

describe("ApprovalWorkflow", () => {
  it("approves when threshold met", async () => {
    const wf = new ApprovalWorkflow({
      id: "approval-001",
      tenantId: "acme",
      requestedBy: "alice",
      requestedAt: new Date().toISOString(),
      context: { action: "rotate-key" },
      approvers: ["bob", "carol", "dave"],
      threshold: 2,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await wf.submit({ approver: "bob", decision: "approve", at: new Date().toISOString() });
    expect(wf.state).toBe("pending");
    await wf.submit({ approver: "carol", decision: "approve", at: new Date().toISOString() });
    expect(wf.state).toBe("done");
  });

  it("rejects on first rejection", async () => {
    const wf = new ApprovalWorkflow({
      id: "approval-002",
      tenantId: "acme",
      requestedBy: "alice",
      requestedAt: new Date().toISOString(),
      context: {},
      approvers: ["bob", "carol"],
      threshold: 2,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await wf.submit({ approver: "bob", decision: "reject", at: new Date().toISOString(), comment: "no" });
    expect(wf.state).toBe("done");
  });

  it("expires when called past deadline", async () => {
    const wf = new ApprovalWorkflow({
      id: "approval-003",
      tenantId: "acme",
      requestedBy: "alice",
      requestedAt: new Date().toISOString(),
      context: {},
      approvers: ["bob"],
      threshold: 1,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await wf.expire();
    expect(wf.state).toBe("done");
  });

  it("rejects unknown approvers", async () => {
    const wf = new ApprovalWorkflow({
      id: "approval-004",
      tenantId: "acme",
      requestedBy: "alice",
      requestedAt: new Date().toISOString(),
      context: {},
      approvers: ["bob"],
      threshold: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await expect(
      wf.submit({ approver: "eve", decision: "approve", at: new Date().toISOString() })
    ).rejects.toThrow();
  });
});
