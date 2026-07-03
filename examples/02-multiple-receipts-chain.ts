/**
 * Example 02 — Multiple receipts and chain verification
 *
 * Sign five sequential events and verify the chain links between them.
 * This is the property that gives "tamper-evident audit log" its meaning:
 * if any receipt in the middle is modified, every subsequent receipt's
 * previous_receipt_hash will fail.
 */

import {
  generateKeyPair,
  signReceipt,
  verifyReceipt,
  type RawEvent,
  type SignedReceipt,
} from "../src/index.js";

const TENANT = "demo-chain-" + Date.now();

function buildEvent(i: number): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: TENANT,
    event_type: "gateway.request",
    source_system: "portkey-gateway",
    event_id: `evt-${TENANT}-${i}`,
    captured_at: new Date().toISOString(),
    context: { user_id: `user${i}@example.com`, environment: "production" },
    subject: {
      ai_vendor: "openai",
      ai_model: "gpt-5",
      ai_capability: "text-generation",
    },
    payload: {
      input_classification: "pii_redacted",
      output_classification: "internal",
      input_token_count: 100 + i * 10,
    },
  };
}

function main() {
  const keypair = generateKeyPair();
  const publicKeys = { [keypair.kid]: keypair.public_key };
  const chain: SignedReceipt[] = [];

  console.log("Signing 5 sequential receipts...");
  for (let i = 1; i <= 5; i++) {
    const r = signReceipt({ event: buildEvent(i), keypair });
    chain.push(r);
    console.log(
      `  receipt ${i}: chain_height=${r.receipt.integrity.chain_height} ` +
        `prev=${r.receipt.integrity.previous_receipt_hash.slice(0, 12)}...`
    );
  }

  console.log("\nVerifying the full chain...");
  let allValid = true;
  for (let i = 0; i < chain.length; i++) {
    const previousReceipt = i === 0 ? undefined : chain[i - 1];
    const r = verifyReceipt(chain[i], { publicKeys, previousReceipt });
    if (!r.valid) allValid = false;
    console.log(
      `  receipt ${i + 1}: ${r.valid ? "VALID" : "INVALID"} ` +
        `(chain_link_valid=${r.checks.chain_link_valid ?? "n/a"})`
    );
  }

  console.log("\nFull chain valid:", allValid ? "YES" : "NO");
}

main();
