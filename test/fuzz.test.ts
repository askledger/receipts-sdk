/**
 * Property-based / fuzz tests.
 *
 * Adversarial corpus aimed at proving the verifier is robust against
 * randomized byte-level mutations.
 */

import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signReceipt,
  verifyReceipt,
} from "../src/index.js";
import type { RawEvent, SignedReceipt } from "../src/types.js";

function evt(tenant: string, n: number): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: tenant,
    event_type: "gateway.request",
    source_system: "fuzz",
    event_id: `${tenant}-${n}`,
    captured_at: "2026-05-13T10:00:00.000Z",
    context: { environment: "production" },
    subject: { ai_vendor: "openai", ai_model: "gpt-5" },
    payload: { input_classification: "internal", output_classification: "internal" },
  };
}

function randomMutate(receipt: SignedReceipt): SignedReceipt {
  const cloned: SignedReceipt = JSON.parse(JSON.stringify(receipt));
  const kind = Math.floor(Math.random() * 4);
  switch (kind) {
    case 0: {
      // mutate event.event_type
      const orig = cloned.receipt.event.event_type;
      cloned.receipt.event.event_type = orig + "_mut";
      break;
    }
    case 1: {
      // mutate signature
      const buf = Buffer.from(cloned.signatures[0].sig, "base64");
      buf[Math.floor(Math.random() * buf.length)] ^= 0xff;
      cloned.signatures[0].sig = buf.toString("base64");
      break;
    }
    case 2: {
      // mutate receipt_hash — guaranteed change (flip last hex char)
      const orig = cloned.receipt.integrity.receipt_hash;
      const last = orig.slice(-1);
      const flipped = last === "f" ? "0" : "f";
      cloned.receipt.integrity.receipt_hash = orig.slice(0, -1) + flipped;
      break;
    }
    case 3: {
      // mutate chain_height
      cloned.receipt.integrity.chain_height = 9999;
      break;
    }
  }
  return cloned;
}

describe("fuzz: random mutations always fail verification", () => {
  it("100 random mutations are detected", () => {
    const kp = generateKeyPair();
    const trusted = { [kp.kid]: kp.public_key };
    let mutationsCaught = 0;
    for (let i = 0; i < 100; i++) {
      const tenant = "fuzz-" + Math.random().toString(36).slice(2);
      const r = signReceipt({ event: evt(tenant, i), keypair: kp });
      const mutated = randomMutate(r);
      const res = verifyReceipt(mutated, { publicKeys: trusted });
      if (!res.valid) mutationsCaught++;
    }
    expect(mutationsCaught).toBe(100);
  });

  it("untampered receipts always verify (negative control)", () => {
    const kp = generateKeyPair();
    const trusted = { [kp.kid]: kp.public_key };
    for (let i = 0; i < 100; i++) {
      const tenant = "fuzz-clean-" + Math.random().toString(36).slice(2);
      const r = signReceipt({ event: evt(tenant, i), keypair: kp });
      const res = verifyReceipt(r, { publicKeys: trusted });
      expect(res.valid).toBe(true);
    }
  });
});

describe("fuzz: malformed receipt structure handled safely", () => {
  it("missing integrity block is rejected without throwing", () => {
    const kp = generateKeyPair();
    const r = signReceipt({
      event: evt("fuzz-missing", 1),
      keypair: kp,
    });
    const cloned: SignedReceipt = JSON.parse(JSON.stringify(r));
    // @ts-expect-error simulate corruption
    delete cloned.receipt.integrity.receipt_hash;
    const res = verifyReceipt(cloned, { publicKeys: { [kp.kid]: kp.public_key } });
    expect(res.valid).toBe(false);
  });

  it("oversize random bytes in signature do not crash", () => {
    const kp = generateKeyPair();
    const r = signReceipt({ event: evt("fuzz-oversize", 1), keypair: kp });
    r.signatures[0].sig = Buffer.from(new Uint8Array(1024)).toString("base64");
    const res = verifyReceipt(r, { publicKeys: { [kp.kid]: kp.public_key } });
    expect(res.valid).toBe(false);
  });
});
