/**
 * Example 01 — Basic sign and verify
 *
 * The simplest possible end-to-end usage:
 *   1. Generate a keypair
 *   2. Sign one event into a receipt
 *   3. Verify the receipt
 */

import {
  generateKeyPair,
  signReceipt,
  verifyReceipt,
  type RawEvent,
} from "../src/index.js";

function main() {
  // 1. Generate a keypair (in production, this lives in an HSM)
  const keypair = generateKeyPair();
  const publicKeys = { [keypair.kid]: keypair.public_key };

  // 2. Build an event describing what the AI system did
  const event: RawEvent = {
    schema_version: "1.0",
    tenant_id: "demo-tenant-01",
    event_type: "ide.completion",
    source_system: "vs-code-plugin",
    event_id: "evt-" + Date.now(),
    captured_at: new Date().toISOString(),
    context: {
      user_id: "user@example.com",
      environment: "development",
    },
    subject: {
      ai_vendor: "anthropic",
      ai_model: "claude-sonnet-4-6",
      ai_capability: "code-completion",
    },
    payload: {
      input_classification: "internal",
      output_classification: "internal",
    },
  };

  // 3. Sign the event into a receipt
  const receipt = signReceipt({ event, keypair });
  console.log(
    "Signed receipt with chain_height =",
    receipt.receipt.integrity.chain_height
  );

  // 4. Verify the receipt independently
  const result = verifyReceipt(receipt, { publicKeys });
  console.log("Verification:", result.valid ? "VALID" : "INVALID");
  console.log(
    "Checks passed:",
    Object.entries(result.checks)
      .filter(([_, v]) => v === true)
      .map(([k]) => k)
      .join(", ")
  );
}

main();
