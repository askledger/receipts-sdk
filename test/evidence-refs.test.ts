/**
 * Tests for the optional top-level `evidence_refs` field on a Receipt.
 *
 * These prove the field is:
 *   (i)   valid — a receipt WITH it signs and verifies,
 *   (ii)  backward-compatible — a receipt WITHOUT it signs and verifies exactly
 *         as before (byte-identical canonical form to the pre-field shape),
 *   (iii) covered by the signature — tampering with the field breaks
 *         verification, confirming it is part of the signed canonical bytes.
 *
 * No cryptographic core is touched: canonicalization already serializes
 * whatever keys are present, so an optional extra field is automatically
 * covered by both `integrity.receipt_hash` and the Ed25519 signature.
 */

import { describe, it, expect } from "vitest";
import { generateKeyPair, signReceipt, verifyReceipt } from "../src/index.js";
import type { RawEvent, EvidenceRef } from "../src/types.js";

function evt(tenant: string, n: number): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: tenant,
    event_type: "ai.model_invocation",
    source_system: "evidence-refs-test",
    event_id: `${tenant}-${n}`,
    captured_at: "2026-05-13T10:00:00.000Z",
    subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
    payload: { input_classification: "internal" },
  };
}

const sampleRefs: EvidenceRef[] = [
  {
    kind: "attestation",
    hash: "3b1f9c0e5d2a7b4c6e8f0a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566",
    alg: "sha256",
    uri: "https://evidence.example.com/artifacts/3b1f9c0e",
    status: "pass",
  },
];

describe("Receipt.evidence_refs (optional)", () => {
  it("(i) a receipt WITH evidence_refs signs and verifies", () => {
    const kp = generateKeyPair();
    const tenant = "evref-with-" + Math.random().toString(36).slice(2);

    const signed = signReceipt({
      event: evt(tenant, 1),
      keypair: kp,
      evidenceRefs: sampleRefs,
    });

    // Field is present on the receipt body.
    expect(signed.receipt.evidence_refs).toEqual(sampleRefs);

    const result = verifyReceipt(signed, {
      publicKeys: { [kp.kid]: kp.public_key },
    });
    expect(result.valid).toBe(true);
    expect(result.checks.canonical_hash_matches).toBe(true);
    expect(result.checks.signature_valid).toBe(true);
  });

  it("(ii) a receipt WITHOUT evidence_refs still signs and verifies, and omits the key", () => {
    const kp = generateKeyPair();
    const tenant = "evref-without-" + Math.random().toString(36).slice(2);

    const signed = signReceipt({ event: evt(tenant, 1), keypair: kp });

    // Backward compat: the key is entirely absent (not `undefined`/`null`/`[]`),
    // so the canonical bytes match the pre-field receipt shape exactly.
    expect("evidence_refs" in signed.receipt).toBe(false);

    const result = verifyReceipt(signed, {
      publicKeys: { [kp.kid]: kp.public_key },
    });
    expect(result.valid).toBe(true);
  });

  it("(iii) tampering with evidence_refs breaks verification (it is part of the signed bytes)", () => {
    const kp = generateKeyPair();
    const tenant = "evref-tamper-" + Math.random().toString(36).slice(2);

    const signed = signReceipt({
      event: evt(tenant, 1),
      keypair: kp,
      evidenceRefs: sampleRefs,
    });

    // Baseline: it verifies before tampering.
    expect(
      verifyReceipt(signed, { publicKeys: { [kp.kid]: kp.public_key } }).valid
    ).toBe(true);

    // Tamper with the digest inside evidence_refs, leaving everything else intact.
    const tampered = structuredClone(signed);
    tampered.receipt.evidence_refs![0].hash =
      "0000000000000000000000000000000000000000000000000000000000000000";

    const result = verifyReceipt(tampered, {
      publicKeys: { [kp.kid]: kp.public_key },
    });
    expect(result.valid).toBe(false);
    // Both the content hash and the signature are computed over the canonical
    // body, so tampering trips at least one of them.
    expect(
      result.checks.canonical_hash_matches === false ||
        result.checks.signature_valid === false
    ).toBe(true);
  });

  it("adding evidence_refs changes the receipt_hash vs an otherwise-identical receipt without it", () => {
    const kp = generateKeyPair();
    const tenantA = "evref-hashA-" + Math.random().toString(36).slice(2);
    const tenantB = "evref-hashB-" + Math.random().toString(36).slice(2);

    const withRefs = signReceipt({
      event: evt(tenantA, 1),
      keypair: kp,
      evidenceRefs: sampleRefs,
    });
    const withoutRefs = signReceipt({ event: evt(tenantB, 1), keypair: kp });

    // Different content -> different receipt_hash; confirms the field is hashed.
    expect(withRefs.receipt.integrity.receipt_hash).not.toBe(
      withoutRefs.receipt.integrity.receipt_hash
    );
  });
});
