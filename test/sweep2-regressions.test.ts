/**
 * Regression tests for the second end-to-end sweep.
 *
 * Every test here failed before its fix. The theme: a control that only holds
 * on the honest path is not a control, and an artifact that certifies itself
 * is not evidence.
 */

import { describe, it, expect } from "vitest";
import { generateKeyPair } from "../src/crypto.js";
import { actionHash, signPreVerdict, verifyPreVerdict, assertActionCleared, reviewNofM } from "../src/guardian.js";
import { SoftwareSigningProvider } from "../src/signing-provider.js";
import { buildBatch, verifyInclusion } from "../src/merkle.js";
import { TransparencyLog } from "../src/transparency-log/log.js";
import { buildWorkpaper, type ReceiptSummary } from "../src/mrm/index.js";
import { signReceipt } from "../src/index.js";
import type { RawEvent } from "../src/types.js";

const NOW = "2026-07-20T00:00:00.000Z";

function evt(tenant: string, n: number): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: tenant,
    event_type: "gateway.request",
    source_system: "sweep2",
    event_id: `${tenant}-${n}`,
    captured_at: "2026-05-13T10:00:00.000Z",
    context: { environment: "production" },
    subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
    payload: { input_classification: "internal", output_classification: "internal" },
  };
}

describe("guardian separation of duty cannot be dropped", () => {
  const action = {
    tenant_id: "acme",
    action_type: "wire.transfer",
    actor: "agent-x",
    payload: { amount_usd: 900_000, to: "offshore-ltd" },
  };

  it("omitting actor no longer produces a verdict that binds to the real action", () => {
    // The bypass: actionHash excluded `actor`, and the independence check only
    // fires when action.actor is set. So the proposer stripped `actor`, self
    // approved, and the verdict still bound byte-for-byte to the real action.
    const stripped = { ...action, actor: undefined };
    expect(actionHash(stripped)).not.toBe(actionHash(action));
  });

  it("a self-approved verdict is rejected at the gate", () => {
    const kp = generateKeyPair();
    const stripped = { ...action, actor: undefined };
    // Signing succeeds, because with no actor there is nobody to be equal to.
    const self = signPreVerdict(stripped, { verdict: "approve", reviewer: "agent-x" }, { keypair: kp, reviewedAt: NOW });

    const v = verifyPreVerdict(self, action, { publicKeys: { [kp.kid]: kp.public_key }, now: NOW });
    expect(v.valid).toBe(false);
    expect(v.checks.binds_to_action).toBe(false);
    expect(() =>
      assertActionCleared(self, action, { publicKeys: { [kp.kid]: kp.public_key }, now: NOW })
    ).toThrow(/blocked/);
  });

  it("independence is enforced at verification, not only at signing", () => {
    const kp = generateKeyPair();
    // A verdict correctly bound to the action, but the reviewer IS the actor.
    // signPreVerdict is under the proposer's control, so the gate must re-check.
    const v = signPreVerdict(
      { ...action, actor: undefined },
      { verdict: "approve", reviewer: "agent-x" },
      { keypair: kp, reviewedAt: NOW }
    );
    const forged = {
      ...v,
      pre_verdict: { ...v.pre_verdict, action_hash: actionHash(action) },
    };
    const res = verifyPreVerdict(forged, action, { publicKeys: { [kp.kid]: kp.public_key }, now: NOW });
    expect(res.checks.reviewer_independent).toBe(false);
    expect(res.valid).toBe(false);
  });

  it("N-of-M cannot be cleared by the actor approving itself", () => {
    const kp = generateKeyPair();
    const self = signPreVerdict(
      { ...action, actor: undefined },
      { verdict: "approve", reviewer: "agent-x" },
      { keypair: kp, reviewedAt: NOW }
    );
    const r = reviewNofM(action, [self], {
      publicKeys: { [kp.kid]: kp.public_key },
      threshold: 1,
      now: NOW,
    });
    expect(r.cleared).toBe(false);
  });
});

describe("key material never serializes", () => {
  it("a software signing provider does not leak its private key", async () => {
    const p = await SoftwareSigningProvider.generate({ kid: "prod-signer" });
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/"privateKey":\s*\{/); // no byte map
    expect(json).toContain("[redacted]");
    // Object.keys / spread must not expose it either.
    expect(Object.keys({ ...p })).not.toContain("privateKey");
    expect(JSON.stringify({ provider: p })).not.toMatch(/"\d+":\d+/);
  });
});

describe("merkle and log proofs bind to a real position", () => {
  it("a batch inclusion proof cannot be replayed at an aliased leaf_index", () => {
    const kp = generateKeyPair();
    // 4 receipts => power-of-two tree, where idx was only used as idx % 2.
    const receipts = [1, 2, 3, 4].map((i) => signReceipt({ event: evt("t-merkle", i), keypair: kp }));
    const batch = buildBatch(receipts);
    const victim = receipts[0];
    const proof = batch.proofs[victim.receipt.receipt_id];
    expect(verifyInclusion(victim, proof, batch.root)).toBe(true);

    for (const bad of [4, 8, -4, 1000]) {
      expect(verifyInclusion(victim, { ...proof, leaf_index: bad }, batch.root)).toBe(false);
    }
  });

  it("a transparency-log inclusion proof cannot claim an out-of-range log_index", async () => {
    const leafHex = (i: number) => (i + 1).toString(16).padStart(64, "0");
    const log = new TransparencyLog({ log_id: "test-log", signer: {} as never });
    for (let i = 0; i < 5; i++) await log.append(leafHex(i), `r${i}`, "tenant");

    const root = log.currentRoot();
    const proof = log.proveInclusion(4, 5);
    expect(TransparencyLog.verifyInclusion(leafHex(4), proof, root)).toBe(true);

    // log_index is the log's ordering claim, the only positional binding the
    // proof carries. Out-of-range indices used to collapse onto the last (or
    // first) leaf's path and verify against the genuine root.
    for (const bad of [5, 9, 1000, -1, -100]) {
      expect(TransparencyLog.verifyInclusion(leafHex(4), { ...proof, log_index: bad }, root)).toBe(false);
    }
  });
});

describe("MRM workpapers report what the receipts show", () => {
  it("citation completeness is derived, not asserted", () => {
    const receipts: ReceiptSummary[] = [1, 2].map((i) => ({
      receipt_id: `r${i}`,
      issued_at: NOW,
      tenant_id: "t1",
      model_id: "openai:gpt-5",
      use_case_id: "uc1",
      event_type: "gateway.request",
      applied_policies: [], // NO policies on any receipt
    }));
    const w = buildWorkpaper({
      tenant_id: "t1",
      regulator: "SR_11_7",
      period_start: "2026-06-01",
      period_end: "2026-06-30",
      receipts,
    });
    expect(w.sections.ongoing_monitoring.coverage_pct).toBe(0);
    const citation = w.sections.validation_activities.find((a) => a.activity.includes("citation completeness"));
    // It used to assert "All in-scope receipts carry policy_bundle_hash +
    // applied_policies" unconditionally, contradicting coverage_pct: 0 in the
    // same signed document.
    expect(citation!.finding).not.toMatch(/^All /);
    expect(citation!.finding).toMatch(/2 of 2 in-scope receipts carry NO applied_policies/);
  });
});
