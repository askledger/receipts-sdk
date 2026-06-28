/**
 * Tests for evidence pack generation.
 */

import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signReceipt,
  buildEvidencePack,
  verifyPackIntegrity,
  verifyAllReceiptsInPack,
  KeyRegistry,
} from "../src/index.js";
import type { RawEvent } from "../src/types.js";

function evt(tenant: string, n: number): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: tenant,
    event_type: "gateway.request",
    source_system: "evidence-test",
    event_id: `${tenant}-${n}`,
    captured_at: "2026-05-13T10:00:00.000Z",
    context: { environment: "production" },
    subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
    payload: { input_classification: "internal", output_classification: "internal" },
  };
}

describe("buildEvidencePack", () => {
  it("builds a valid pack over 5 receipts", () => {
    const kp = generateKeyPair();
    const tenant = "evid-" + Math.random().toString(36).slice(2);
    const receipts = [];
    for (let i = 1; i <= 5; i++) {
      receipts.push(signReceipt({ event: evt(tenant, i), keypair: kp }));
    }
    const reg = new KeyRegistry();
    reg.add({ kid: kp.kid, public_key: kp.public_key, algorithm: "EdDSA", curve: "ed25519" });

    const pack = buildEvidencePack(
      {
        title: "Test Evidence Pack",
        tenantId: tenant,
        purpose: "unit test",
        period: { from: "2026-05-13", to: "2026-05-13" },
        builtBy: "test",
        builtAt: new Date().toISOString(),
      },
      receipts,
      reg.list()
    );

    expect(pack.receipts.length).toBe(5);
    expect(pack.merkle.tree_size).toBe(5);
    expect(pack.merkle.root).toMatch(/^[0-9a-f]{64}$/);
    expect(pack.integrity.receipts_count).toBe(5);
    expect(pack.integrity.pack_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("pack integrity verifies after build", () => {
    const kp = generateKeyPair();
    const tenant = "evid-int-" + Math.random().toString(36).slice(2);
    const receipts = [signReceipt({ event: evt(tenant, 1), keypair: kp })];
    const pack = buildEvidencePack(
      {
        title: "Test",
        tenantId: tenant,
        purpose: "test",
        period: { from: "2026-05-13", to: "2026-05-13" },
        builtBy: "test",
        builtAt: new Date().toISOString(),
      },
      receipts,
      []
    );
    expect(verifyPackIntegrity(pack)).toBe(true);
  });

  it("pack integrity fails after tamper", () => {
    const kp = generateKeyPair();
    const tenant = "evid-tamper-" + Math.random().toString(36).slice(2);
    const receipts = [signReceipt({ event: evt(tenant, 1), keypair: kp })];
    const pack = buildEvidencePack(
      {
        title: "Test",
        tenantId: tenant,
        purpose: "test",
        period: { from: "2026-05-13", to: "2026-05-13" },
        builtBy: "test",
        builtAt: new Date().toISOString(),
      },
      receipts,
      []
    );
    pack.meta.title = "TAMPERED";
    expect(verifyPackIntegrity(pack)).toBe(false);
  });

  it("rejects empty selection", () => {
    expect(() =>
      buildEvidencePack(
        {
          title: "Test",
          tenantId: "t",
          purpose: "test",
          period: { from: "x", to: "y" },
          builtBy: "test",
          builtAt: new Date().toISOString(),
        },
        [],
        []
      )
    ).toThrow();
  });

  it("every receipt is included in the Merkle root", () => {
    const kp = generateKeyPair();
    const tenant = "evid-incl-" + Math.random().toString(36).slice(2);
    const receipts = [];
    for (let i = 1; i <= 8; i++) {
      receipts.push(signReceipt({ event: evt(tenant, i), keypair: kp }));
    }
    const pack = buildEvidencePack(
      {
        title: "Test",
        tenantId: tenant,
        purpose: "test",
        period: { from: "x", to: "y" },
        builtBy: "test",
        builtAt: new Date().toISOString(),
      },
      receipts,
      []
    );
    const failed = verifyAllReceiptsInPack(pack);
    expect(failed.length).toBe(0);
  });
});
