/**
 * End-to-end library tests for the SDK functions the new CLI commands drive.
 *
 * These exercise the LIBRARY layer directly (no shelling out) so the three
 * layers the CLI exposes are covered:
 *
 *   Integrity     — sign + verify a chained receipt.
 *   Traceability  — buildEvidenceBundle → verifyEvidenceBundleIntegrity →
 *                   verifyAllReceiptsInBundle, plus a tamper detection.
 *   Correctness   — sign a receipt WITH evidenceRefs and confirm it verifies,
 *                   and that tampering an evidence_ref breaks verification.
 *
 * The bundle aliases (buildEvidenceBundle / verifyEvidenceBundleIntegrity /
 * verifyAllReceiptsInBundle) are the pack functions under the site's "bundle"
 * wording — this file uses the alias names on purpose to prove they are wired.
 */

import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signReceipt,
  verifyReceipt,
  buildEvidenceBundle,
  verifyEvidenceBundleIntegrity,
  verifyAllReceiptsInBundle,
} from "../src/index.js";
import type { RawEvent, SignedReceipt, EvidenceRef, KeyPair } from "../src/types.js";

function evt(tenant: string, n: number): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: tenant,
    event_type: "ai.model_invocation",
    source_system: "e2e-cli-lib-test",
    event_id: `${tenant}-${n}`,
    captured_at: "2026-07-07T10:00:00.000Z",
    subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
    payload: { input_classification: "internal" },
  };
}

function buildChain(kp: KeyPair, tenant: string, count: number): SignedReceipt[] {
  const chain: SignedReceipt[] = [];
  for (let i = 0; i < count; i++) {
    chain.push(signReceipt({ event: evt(tenant, i + 1), keypair: kp }));
  }
  return chain;
}

function keyRecords(kp: KeyPair) {
  return [
    {
      kid: kp.kid,
      public_key: kp.public_key,
      algorithm: "EdDSA" as const,
      curve: "ed25519" as const,
      status: "active" as const,
      issued_at: kp.created_at,
    },
  ];
}

function meta(tenant: string, chain: SignedReceipt[]) {
  return {
    title: "e2e CLI evidence bundle",
    tenantId: tenant,
    purpose: "test",
    period: {
      from: chain[0].receipt.issued_at,
      to: chain[chain.length - 1].receipt.issued_at,
    },
    builtBy: "e2e-cli-lib-test",
    builtAt: new Date().toISOString(),
  };
}

describe("e2e CLI library — bundle (Traceability)", () => {
  it("builds a bundle whose integrity verifies and every receipt is included", () => {
    const kp = generateKeyPair();
    const tenant = "e2e-bundle-" + Math.random().toString(36).slice(2);
    const chain = buildChain(kp, tenant, 4);

    const bundle = buildEvidenceBundle(meta(tenant, chain), chain, keyRecords(kp));

    expect(bundle.integrity.receipts_count).toBe(4);
    expect(verifyEvidenceBundleIntegrity(bundle)).toBe(true);
    // Empty array => every receipt is included under the Merkle root.
    expect(verifyAllReceiptsInBundle(bundle)).toEqual([]);
  });

  it("detects a tampered receipt inside the bundle", () => {
    const kp = generateKeyPair();
    const tenant = "e2e-tamper-" + Math.random().toString(36).slice(2);
    const chain = buildChain(kp, tenant, 4);

    const bundle = buildEvidenceBundle(meta(tenant, chain), chain, keyRecords(kp));

    // Tamper a receipt's event AFTER the Merkle root/proofs were computed.
    // Its leaf no longer matches the recorded inclusion proof, so it must be
    // reported by verifyAllReceiptsInBundle.
    bundle.receipts[2].receipt.event.subject!.ai_model = "downgraded-model-7b";

    const failed = verifyAllReceiptsInBundle(bundle);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.map((r) => r.receipt.receipt_id)).toContain(
      bundle.receipts[2].receipt.receipt_id
    );
  });
});

describe("e2e CLI library — evidence_refs (Correctness binding)", () => {
  const sampleRefs: EvidenceRef[] = [
    {
      kind: "rule-check",
      hash: "3b1f9c0e5d2a7b4c6e8f0a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566",
      alg: "sha-256",
      uri: "https://evidence.example.com/proof.json",
      status: "pass",
    },
  ];

  it("a receipt signed WITH evidenceRefs verifies and carries the refs", () => {
    const kp = generateKeyPair();
    const tenant = "e2e-evref-" + Math.random().toString(36).slice(2);

    const signed = signReceipt({
      event: evt(tenant, 1),
      keypair: kp,
      evidenceRefs: sampleRefs,
    });

    expect(signed.receipt.evidence_refs).toEqual(sampleRefs);
    const result = verifyReceipt(signed, { publicKeys: { [kp.kid]: kp.public_key } });
    expect(result.valid).toBe(true);
  });

  it("tampering an evidence_ref breaks verification (it is part of the signed body)", () => {
    const kp = generateKeyPair();
    const tenant = "e2e-evref-tamper-" + Math.random().toString(36).slice(2);

    const signed = signReceipt({
      event: evt(tenant, 1),
      keypair: kp,
      evidenceRefs: sampleRefs,
    });
    expect(verifyReceipt(signed, { publicKeys: { [kp.kid]: kp.public_key } }).valid).toBe(
      true
    );

    const tampered = structuredClone(signed);
    tampered.receipt.evidence_refs![0].status = "fail";

    const result = verifyReceipt(tampered, { publicKeys: { [kp.kid]: kp.public_key } });
    expect(result.valid).toBe(false);
    expect(
      result.checks.canonical_hash_matches === false ||
        result.checks.signature_valid === false
    ).toBe(true);
  });

  it("evidence-ref-bearing receipts still bundle and verify end-to-end", () => {
    const kp = generateKeyPair();
    const tenant = "e2e-evref-bundle-" + Math.random().toString(36).slice(2);

    const chain: SignedReceipt[] = [
      signReceipt({ event: evt(tenant, 1), keypair: kp, evidenceRefs: sampleRefs }),
      signReceipt({ event: evt(tenant, 2), keypair: kp }),
    ];

    const bundle = buildEvidenceBundle(meta(tenant, chain), chain, keyRecords(kp));
    expect(verifyEvidenceBundleIntegrity(bundle)).toBe(true);
    expect(verifyAllReceiptsInBundle(bundle)).toEqual([]);
    for (const r of bundle.receipts) {
      expect(verifyReceipt(r, { publicKeys: { [kp.kid]: kp.public_key } }).valid).toBe(true);
    }
  });
});
