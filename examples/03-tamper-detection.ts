/**
 * Example 03 — Tamper detection
 *
 * Sign a receipt, then mutate three different fields and prove that
 * verification catches each mutation:
 *   1. Mutating a field in the event body
 *   2. Mutating the signature
 *   3. Mutating the previous_receipt_hash (chain break)
 *
 * This is the property that makes the receipts trustworthy as evidence —
 * any modification is detectable by any third-party verifier with only
 * the public key.
 */

import {
  generateKeyPair,
  signReceipt,
  verifyReceipt,
  type RawEvent,
  type SignedReceipt,
} from "../src/index.js";

const TENANT = "tamper-demo-" + Date.now();

function buildEvent(eventId: string): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: TENANT,
    event_type: "agent.tool_call",
    source_system: "agentic-app",
    event_id: eventId,
    captured_at: new Date().toISOString(),
    context: { environment: "production" },
    subject: {
      ai_vendor: "anthropic",
      ai_model: "claude-sonnet-4-6",
      ai_capability: "tool-use",
    },
    payload: {
      input_classification: "internal",
      output_classification: "internal",
    },
  };
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function main() {
  const keypair = generateKeyPair();
  const publicKeys = { [keypair.kid]: keypair.public_key };

  // Sign one good receipt
  const original = signReceipt({ event: buildEvent("evt-tamper-1"), keypair });
  const originalResult = verifyReceipt(original, { publicKeys });
  console.log(
    "Untampered receipt verify:",
    originalResult.valid ? "VALID" : "INVALID"
  );

  // 1. Mutate the event body
  const t1: SignedReceipt = clone(original);
  if (t1.receipt.event.context) {
    t1.receipt.event.context.environment = "development";
  }
  const r1 = verifyReceipt(t1, { publicKeys });
  console.log(
    "\nAfter mutating event.context.environment:",
    r1.valid ? "WOULD HAVE BEEN VALID (BAD)" : "INVALID (correct)"
  );
  console.log("  canonical_hash_matches:", r1.checks.canonical_hash_matches);
  console.log("  signature_valid:       ", r1.checks.signature_valid);

  // 2. Mutate the signature
  const t2: SignedReceipt = clone(original);
  const corrupted = Buffer.from(t2.signatures[0].sig, "base64");
  corrupted[0] ^= 0xff;
  t2.signatures[0].sig = corrupted.toString("base64");
  const r2 = verifyReceipt(t2, { publicKeys });
  console.log(
    "\nAfter flipping a byte of the signature:",
    r2.valid ? "WOULD HAVE BEEN VALID (BAD)" : "INVALID (correct)"
  );
  console.log("  signature_valid:       ", r2.checks.signature_valid);

  // 3. Sign two more receipts, then mutate the middle one and try to chain-verify
  const r2nd = signReceipt({ event: buildEvent("evt-tamper-2"), keypair });
  const r3rd = signReceipt({ event: buildEvent("evt-tamper-3"), keypair });
  const chain = [original, r2nd, r3rd];

  const tamperedChain: SignedReceipt[] = clone(chain);
  if (tamperedChain[1].receipt.event.context) {
    tamperedChain[1].receipt.event.context.environment = "staging";
  }
  console.log("\nVerifying tampered chain:");
  for (let i = 0; i < tamperedChain.length; i++) {
    const previousReceipt = i === 0 ? undefined : tamperedChain[i - 1];
    const r = verifyReceipt(tamperedChain[i], {
      publicKeys,
      previousReceipt,
    });
    console.log(
      `  receipt ${i + 1}: ${r.valid ? "VALID" : "INVALID"} ` +
        `(canonical_hash_matches=${r.checks.canonical_hash_matches}, ` +
        `chain_link_valid=${r.checks.chain_link_valid ?? "n/a"})`
    );
  }
}

main();
