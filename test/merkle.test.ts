/**
 * Tests for Merkle batch commitments.
 */

import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signReceipt,
  buildBatch,
  verifyInclusion,
} from "../src/index.js";
import type { RawEvent } from "../src/types.js";

function evt(tenant: string, n: number): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: tenant,
    event_type: "gateway.request",
    source_system: "merkle-test",
    event_id: `${tenant}-${n}`,
    captured_at: "2026-05-13T10:00:00.000Z",
    context: { environment: "production" },
    subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
    payload: { input_classification: "internal", output_classification: "internal" },
  };
}

function signN(n: number) {
  const tenant = "merkle-" + Math.random().toString(36).slice(2);
  const kp = generateKeyPair();
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push(signReceipt({ event: evt(tenant, i), keypair: kp }));
  }
  return out;
}

describe("Merkle batch commitments", () => {
  it("produces a 64-char hex root for any non-empty batch", () => {
    for (const n of [1, 2, 3, 5, 8, 13, 32, 100]) {
      const receipts = signN(n);
      const batch = buildBatch(receipts);
      expect(batch.root).toMatch(/^[0-9a-f]{64}$/);
      expect(batch.tree_size).toBe(n);
      expect(Object.keys(batch.proofs).length).toBe(n);
    }
  });

  it("inclusion proofs verify against the root", () => {
    const receipts = signN(8);
    const batch = buildBatch(receipts);
    for (const r of receipts) {
      const proof = batch.proofs[r.receipt.receipt_id];
      expect(verifyInclusion(r, proof, batch.root)).toBe(true);
    }
  });

  it("inclusion proofs verify for odd tree sizes (promotion path)", () => {
    for (const n of [3, 5, 7, 9, 11, 13]) {
      const receipts = signN(n);
      const batch = buildBatch(receipts);
      for (const r of receipts) {
        const proof = batch.proofs[r.receipt.receipt_id];
        expect(verifyInclusion(r, proof, batch.root)).toBe(true);
      }
    }
  });

  it("rejects a proof against the wrong root", () => {
    const receipts = signN(4);
    const batch = buildBatch(receipts);
    const wrongRoot = "0".repeat(64);
    for (const r of receipts) {
      const proof = batch.proofs[r.receipt.receipt_id];
      expect(verifyInclusion(r, proof, wrongRoot)).toBe(false);
    }
  });

  it("rejects a tampered receipt against the original proof + root", () => {
    const receipts = signN(4);
    const batch = buildBatch(receipts);
    const r0 = receipts[0];
    const tampered = JSON.parse(JSON.stringify(r0));
    tampered.receipt.event.event_type = "tampered.event_type";
    const proof = batch.proofs[r0.receipt.receipt_id];
    expect(verifyInclusion(tampered, proof, batch.root)).toBe(false);
  });

  it("throws on empty batch", () => {
    expect(() => buildBatch([])).toThrow();
  });
});
