/**
 * End-to-end tests for the Receipts SDK.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  generateKeyPair,
  signReceipt,
  verifyReceipt,
  canonicalize,
  sha256,
  sha256String,
} from "../src/index.js";
import type { RawEvent } from "../src/types.js";

const TEST_TENANT = "test-tenant-" + Math.random().toString(36).slice(2, 8);

function sampleEvent(eventId: string = "evt-test-001"): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: TEST_TENANT,
    event_type: "ide.completion",
    source_system: "test-runner",
    event_id: eventId,
    captured_at: "2026-05-13T10:00:00.000Z",
    subject: {
      ai_vendor: "anthropic",
      ai_model: "claude-sonnet-4-6",
    },
    payload: {
      input_classification: "internal",
      input_token_count: 100,
    },
  };
}

describe("canonicalize (RFC 8785)", () => {
  it("produces identical output for differently-ordered objects", () => {
    const a = canonicalize({ b: 2, a: 1, c: 3 });
    const b = canonicalize({ a: 1, b: 2, c: 3 });
    const c = canonicalize({ c: 3, a: 1, b: 2 });
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("produces identical output regardless of whitespace", () => {
    const a = canonicalize(JSON.parse('{"a":1,"b":2}'));
    const b = canonicalize(JSON.parse('{ "a" : 1 , "b" : 2 }'));
    expect(a).toBe(b);
  });

  it("escapes strings consistently", () => {
    const a = canonicalize({ s: 'hello\nworld' });
    const b = canonicalize({ s: 'hello\nworld' });
    expect(a).toBe(b);
    expect(a).toContain('\\n');
  });
});

describe("crypto", () => {
  it("sha256 produces 64-char hex string", () => {
    const h = sha256String("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("generates distinct keypairs", () => {
    const k1 = generateKeyPair();
    const k2 = generateKeyPair();
    expect(k1.kid).not.toBe(k2.kid);
    expect(k1.public_key).not.toBe(k2.public_key);
  });

  it("public + private key are correct lengths", () => {
    const k = generateKeyPair();
    expect(Buffer.from(k.public_key, "base64").length).toBe(32);
    expect(Buffer.from(k.private_key, "base64").length).toBe(32);
  });
});

describe("sign + verify roundtrip", () => {
  beforeEach(() => {
    // Clear any previous chain state for the test tenant. Some sandboxed
    // environments forbid unlink on mounted filesystems; ignore those errors
    // since each test uses a fresh random tenant ID anyway.
    const chainsDir = ".ledger/chains";
    if (fs.existsSync(chainsDir)) {
      for (const f of fs.readdirSync(chainsDir)) {
        if (f.startsWith("test-tenant-")) {
          try {
            fs.unlinkSync(path.join(chainsDir, f));
          } catch {
            /* ignore — test uses random tenant ID so collision impossible */
          }
        }
      }
    }
  });

  it("produces a verifiable receipt", () => {
    const kp = generateKeyPair();
    const signed = signReceipt({ event: sampleEvent(), keypair: kp });

    const result = verifyReceipt(signed, {
      publicKeys: { [kp.kid]: kp.public_key },
    });

    expect(result.valid).toBe(true);
    expect(result.checks.canonical_hash_matches).toBe(true);
    expect(result.checks.signature_valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects a signature whose alg is not EdDSA (algorithm-confusion)", () => {
    const kp = generateKeyPair();
    const signed = signReceipt({ event: sampleEvent(), keypair: kp });

    // Rewrite the algorithm label; the signature bytes are unchanged and would
    // still pass raw Ed25519 verification, but the verifier must refuse it.
    signed.signatures[0].alg = "RS256" as typeof signed.signatures[0].alg;

    const result = verifyReceipt(signed, {
      publicKeys: { [kp.kid]: kp.public_key },
    });

    expect(result.valid).toBe(false);
    expect(result.checks.signature_valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Unsupported signature alg"))).toBe(true);
  });

  it("detects tampered receipt body", () => {
    const kp = generateKeyPair();
    const signed = signReceipt({ event: sampleEvent(), keypair: kp });

    // Tamper with the event_type
    signed.receipt.event.event_type = "tampered.event_type";

    const result = verifyReceipt(signed, {
      publicKeys: { [kp.kid]: kp.public_key },
    });

    expect(result.valid).toBe(false);
    // Either canonical hash mismatch OR signature invalid will trigger.
    expect(
      !result.checks.canonical_hash_matches || !result.checks.signature_valid
    ).toBe(true);
  });

  it("detects tampered signature", () => {
    const kp = generateKeyPair();
    const signed = signReceipt({ event: sampleEvent(), keypair: kp });

    // Flip a byte in the signature
    const sigBytes = Buffer.from(signed.signatures[0]!.sig, "base64");
    sigBytes[0] = sigBytes[0] ^ 0x01;
    signed.signatures[0]!.sig = sigBytes.toString("base64");

    const result = verifyReceipt(signed, {
      publicKeys: { [kp.kid]: kp.public_key },
    });

    expect(result.valid).toBe(false);
    expect(result.checks.signature_valid).toBe(false);
  });

  it("rejects verification with wrong public key", () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const signed = signReceipt({ event: sampleEvent(), keypair: kp1 });

    const result = verifyReceipt(signed, {
      publicKeys: { [kp1.kid]: kp2.public_key }, // wrong public key
    });

    expect(result.valid).toBe(false);
    expect(result.checks.signature_valid).toBe(false);
  });

  it("chains receipts so each previous_receipt_hash links correctly", () => {
    // Use a fresh tenant to ensure chain_height starts at 1 even if
    // sandbox prevents cleanup of prior state.
    const tenant = "test-tenant-chain-" + Math.random().toString(36).slice(2, 10);
    const freshEvent = (id: string): RawEvent => ({
      ...sampleEvent(id),
      tenant_id: tenant,
    });
    const kp = generateKeyPair();
    const r1 = signReceipt({ event: freshEvent("evt-001"), keypair: kp });
    const r2 = signReceipt({ event: freshEvent("evt-002"), keypair: kp });
    const r3 = signReceipt({ event: freshEvent("evt-003"), keypair: kp });

    expect(r1.receipt.integrity.chain_height).toBe(1);
    expect(r2.receipt.integrity.chain_height).toBe(2);
    expect(r3.receipt.integrity.chain_height).toBe(3);

    expect(r2.receipt.integrity.previous_receipt_hash).toBe(
      r1.receipt.integrity.receipt_hash
    );
    expect(r3.receipt.integrity.previous_receipt_hash).toBe(
      r2.receipt.integrity.receipt_hash
    );
  });

  it("verifies chain link when prev receipt is supplied", () => {
    const kp = generateKeyPair();
    const r1 = signReceipt({ event: sampleEvent("evt-001"), keypair: kp });
    const r2 = signReceipt({ event: sampleEvent("evt-002"), keypair: kp });

    const result = verifyReceipt(r2, {
      publicKeys: { [kp.kid]: kp.public_key },
      previousReceipt: r1,
    });

    expect(result.valid).toBe(true);
    expect(result.checks.chain_link_valid).toBe(true);
  });

  it("rejects a receipt presented out of chain order (reorder detection)", () => {
    const kp = generateKeyPair();
    const r1 = signReceipt({ event: sampleEvent("evt-001"), keypair: kp });
    const r2 = signReceipt({ event: sampleEvent("evt-002"), keypair: kp });

    // Present r1 (height 1) as if it followed r2 (height 2): the height is not
    // contiguous and the hash link doesn't match, so it must be rejected.
    const result = verifyReceipt(r1, {
      publicKeys: { [kp.kid]: kp.public_key },
      previousReceipt: r2,
    });

    expect(result.valid).toBe(false);
    expect(result.checks.chain_link_valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not contiguous"))).toBe(true);
  });

  it("verifies a mid-chain receipt's signature without its predecessor, but does not attest position", () => {
    const kp = generateKeyPair();
    signReceipt({ event: sampleEvent("evt-001"), keypair: kp });
    const r2 = signReceipt({ event: sampleEvent("evt-002"), keypair: kp });

    // No previousReceipt supplied: signature + hash are valid, so the receipt
    // verifies, but chain position (height > 1) is intentionally not attested.
    const result = verifyReceipt(r2, {
      publicKeys: { [kp.kid]: kp.public_key },
    });

    expect(result.valid).toBe(true);
    expect(result.checks.chain_link_valid).toBeUndefined();
  });

  it("detects broken chain link when wrong prev receipt is supplied", () => {
    const kp = generateKeyPair();
    const r1 = signReceipt({ event: sampleEvent("evt-001"), keypair: kp });
    const r2 = signReceipt({ event: sampleEvent("evt-002"), keypair: kp });
    const r3 = signReceipt({ event: sampleEvent("evt-003"), keypair: kp });

    // Supply r1 as the "previous" of r3 — wrong, should detect.
    const result = verifyReceipt(r3, {
      publicKeys: { [kp.kid]: kp.public_key },
      previousReceipt: r1,
    });

    expect(result.valid).toBe(false);
    expect(result.checks.chain_link_valid).toBe(false);
  });
});
