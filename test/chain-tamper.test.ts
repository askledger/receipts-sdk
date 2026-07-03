/**
 * Chain-tamper regression tests.
 *
 * These guard against subtle mutations that a malicious or buggy
 * implementation could introduce, proving the SDK detects them with
 * structured failure reasons.
 */

import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signReceipt,
  verifyReceipt,
} from "../src/index.js";
import type { RawEvent } from "../src/types.js";

function evt(tenant: string, n: number): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: tenant,
    event_type: "gateway.request",
    source_system: "regression",
    event_id: `${tenant}-${n}`,
    captured_at: "2026-05-13T10:00:00.000Z",
    context: { environment: "production" },
    subject: { ai_vendor: "openai", ai_model: "gpt-5" },
    payload: {
      input_classification: "internal",
      output_classification: "internal",
    },
  };
}

describe("chain-tamper regressions", () => {
  it("detects chain_height mutation", () => {
    const tenant = "tt-" + Math.random().toString(36).slice(2);
    const k = generateKeyPair();
    const r = signReceipt({ event: evt(tenant, 1), keypair: k });
    r.receipt.integrity.chain_height = 999;
    const res = verifyReceipt(r, { publicKeys: { [k.kid]: k.public_key } });
    expect(res.valid).toBe(false);
  });

  it("detects previous_receipt_hash mutation", () => {
    const tenant = "tt-" + Math.random().toString(36).slice(2);
    const k = generateKeyPair();
    const r = signReceipt({ event: evt(tenant, 1), keypair: k });
    r.receipt.integrity.previous_receipt_hash = "f".repeat(64);
    const res = verifyReceipt(r, { publicKeys: { [k.kid]: k.public_key } });
    expect(res.valid).toBe(false);
  });

  it("detects deeply nested event field mutation (subject.ai_model)", () => {
    const tenant = "tt-" + Math.random().toString(36).slice(2);
    const k = generateKeyPair();
    const r = signReceipt({ event: evt(tenant, 1), keypair: k });
    r.receipt.event.subject!.ai_model = "downgraded-model";
    const res = verifyReceipt(r, { publicKeys: { [k.kid]: k.public_key } });
    expect(res.valid).toBe(false);
  });

  it("detects issued_at mutation", () => {
    const tenant = "tt-" + Math.random().toString(36).slice(2);
    const k = generateKeyPair();
    const r = signReceipt({ event: evt(tenant, 1), keypair: k });
    r.receipt.issued_at = "1970-01-01T00:00:00.000Z";
    const res = verifyReceipt(r, { publicKeys: { [k.kid]: k.public_key } });
    expect(res.valid).toBe(false);
  });

  it("detects unknown kid in signature", () => {
    const tenant = "tt-" + Math.random().toString(36).slice(2);
    const k = generateKeyPair();
    const r = signReceipt({ event: evt(tenant, 1), keypair: k });
    // pass a different key map
    const res = verifyReceipt(r, {
      publicKeys: { "kid-unknown": k.public_key },
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => /No public key/.test(e))).toBe(true);
  });

  it("detects inserting an extra receipt that doesn't link", () => {
    const tenant = "tt-" + Math.random().toString(36).slice(2);
    const k = generateKeyPair();
    const r1 = signReceipt({ event: evt(tenant, 1), keypair: k });
    const r2 = signReceipt({ event: evt(tenant, 2), keypair: k });
    // Insert r3 from a different tenant — should not link
    const otherTenant = "tt-" + Math.random().toString(36).slice(2);
    const rOther = signReceipt({ event: evt(otherTenant, 1), keypair: k });
    const res = verifyReceipt(rOther, {
      publicKeys: { [k.kid]: k.public_key },
      previousReceipt: r2,
    });
    expect(res.checks.chain_link_valid).toBe(false);
  });

  it("verifyReceipt returns structured errors (not bare booleans)", () => {
    const tenant = "tt-" + Math.random().toString(36).slice(2);
    const k = generateKeyPair();
    const r = signReceipt({ event: evt(tenant, 1), keypair: k });
    r.receipt.event.source_system = "wrong-source";
    const res = verifyReceipt(r, { publicKeys: { [k.kid]: k.public_key } });
    expect(res.valid).toBe(false);
    expect(Array.isArray(res.errors)).toBe(true);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
