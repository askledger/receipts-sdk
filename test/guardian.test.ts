import { describe, it, expect } from "vitest";
import {
  signPreVerdict,
  verifyPreVerdict,
  assertActionCleared,
  preVerdictEvidenceRef,
  actionHash,
  signReceiptWithStore,
  verifyReceipt,
  generateKeyPair,
  type ProposedAction,
} from "../src/index.js";
import { MemoryChainStateStore } from "../src/chain-store.js";
import type { RawEvent } from "../src/types.js";

const reviewerKp = generateKeyPair();
const keys = { [reviewerKp.kid]: reviewerKp.public_key };
const at = "2026-06-01T00:00:00.000Z";

const wire = (): ProposedAction => ({
  tenant_id: "acme",
  action_type: "wire.transfer",
  payload: { to: "IBAN123", amount: 50000, currency: "USD" },
  actor: "agent-treasury",
});

describe("Layer 4 — pre-execution guardian", () => {
  it("approves and verifies an action that binds to the exact verdict", () => {
    const action = wire();
    const signed = signPreVerdict(action, { verdict: "approve", reviewer: "risk-engine" }, { keypair: reviewerKp, reviewedAt: at });
    const v = verifyPreVerdict(signed, action, { publicKeys: keys });
    expect(v.valid).toBe(true);
    expect(v.verdict).toBe("approve");
    expect(v.checks.binds_to_action).toBe(true);
    // does not throw
    assertActionCleared(signed, action, { publicKeys: keys });
  });

  it("refuses when the reviewer is the actor proposing the action", () => {
    const action = wire();
    expect(() =>
      signPreVerdict(action, { verdict: "approve", reviewer: "agent-treasury" }, { keypair: reviewerKp, reviewedAt: at })
    ).toThrow(/independent/);
  });

  it("blocks a reject verdict", () => {
    const action = wire();
    const signed = signPreVerdict(action, { verdict: "reject", reviewer: "risk-engine", reasons: ["over limit"] }, { keypair: reviewerKp, reviewedAt: at });
    expect(verifyPreVerdict(signed, action, { publicKeys: keys }).verdict).toBe("reject");
    expect(() => assertActionCleared(signed, action, { publicKeys: keys })).toThrow(/blocked.*reject/);
  });

  it("blocks 'concerns' unless allowConcerns is set", () => {
    const action = wire();
    const signed = signPreVerdict(action, { verdict: "concerns", reviewer: "risk-engine" }, { keypair: reviewerKp, reviewedAt: at });
    expect(() => assertActionCleared(signed, action, { publicKeys: keys })).toThrow(/concerns/);
    // permitted when explicitly allowed
    assertActionCleared(signed, action, { publicKeys: keys, allowConcerns: true });
  });

  it("does not clear a DIFFERENT action (approve A, run B)", () => {
    const approved = wire(); // amount 50000
    const swapped: ProposedAction = { ...approved, payload: { to: "IBAN123", amount: 5000000, currency: "USD" } };
    const signed = signPreVerdict(approved, { verdict: "approve", reviewer: "risk-engine" }, { keypair: reviewerKp, reviewedAt: at });
    const v = verifyPreVerdict(signed, swapped, { publicKeys: keys });
    expect(v.checks.binds_to_action).toBe(false);
    expect(v.valid).toBe(false);
    expect(() => assertActionCleared(signed, swapped, { publicKeys: keys })).toThrow(/blocked/);
    // the action hash genuinely differs
    expect(actionHash(approved)).not.toBe(actionHash(swapped));
  });

  it("catches a tampered verdict field", () => {
    const action = wire();
    const signed = signPreVerdict(action, { verdict: "reject", reviewer: "risk-engine" }, { keypair: reviewerKp, reviewedAt: at });
    // attacker flips reject -> approve without re-signing
    signed.pre_verdict.verdict = "approve";
    const v = verifyPreVerdict(signed, action, { publicKeys: keys });
    expect(v.valid).toBe(false); // hash and/or signature no longer match
    expect(() => assertActionCleared(signed, action, { publicKeys: keys })).toThrow();
  });

  it("links Layer 4 to Layer 1: the pre-verdict rides in the action receipt", async () => {
    const action = wire();
    const signed = signPreVerdict(action, { verdict: "approve", reviewer: "risk-engine" }, { keypair: reviewerKp, reviewedAt: at });
    const ref = preVerdictEvidenceRef(signed);
    expect(ref.kind).toBe("pre_execution_verdict");
    expect(ref.hash).toBe(signed.hash);
    expect(ref.status).toBe("approve");

    // attach it to the action's signed receipt and confirm the receipt still verifies
    const store = new MemoryChainStateStore();
    const evt: RawEvent = {
      schema_version: "1.0",
      tenant_id: "acme",
      event_type: "wire.transfer",
      source_system: "treasury",
      event_id: "e1",
      captured_at: at,
      subject: { ai_vendor: "openai", ai_model: "gpt-5" },
    };
    const receipt = await signReceiptWithStore({ event: evt, keypair: reviewerKp, evidenceRefs: [ref] }, store);
    expect(receipt.receipt.evidence_refs?.[0].hash).toBe(signed.hash);
    expect(verifyReceipt(receipt, { publicKeys: keys }).valid).toBe(true);
  });
});
