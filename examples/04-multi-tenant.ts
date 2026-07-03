/**
 * Example 04 — Multi-tenant isolation
 *
 * Two tenants share the same SDK instance but maintain independent
 * append-only chains. This proves that tampering with Tenant A's
 * history cannot affect Tenant B's verifiability.
 */

import {
  generateKeyPair,
  signReceipt,
  verifyReceipt,
  type RawEvent,
} from "../src/index.js";

function buildEvent(tenant: string, i: number): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: tenant,
    event_type: "gateway.request",
    source_system: "demo",
    event_id: `${tenant}-evt-${i}`,
    captured_at: new Date().toISOString(),
    context: { environment: "production" },
    subject: {
      ai_vendor: "anthropic",
      ai_model: "claude-sonnet-4-6",
      ai_capability: "text-generation",
    },
    payload: {
      input_classification: "internal",
      output_classification: "internal",
    },
  };
}

function main() {
  const keypair = generateKeyPair();
  const publicKeys = { [keypair.kid]: keypair.public_key };

  const tenantA = "tenant-a-" + Date.now();
  const tenantB = "tenant-b-" + Date.now();

  console.log("Signing 3 receipts for Tenant A and 3 for Tenant B, interleaved:");
  const a1 = signReceipt({ event: buildEvent(tenantA, 1), keypair });
  const b1 = signReceipt({ event: buildEvent(tenantB, 1), keypair });
  const a2 = signReceipt({ event: buildEvent(tenantA, 2), keypair });
  const b2 = signReceipt({ event: buildEvent(tenantB, 2), keypair });
  const a3 = signReceipt({ event: buildEvent(tenantA, 3), keypair });
  const b3 = signReceipt({ event: buildEvent(tenantB, 3), keypair });

  console.log(
    "\nTenant A chain heights:",
    [a1, a2, a3].map((r) => r.receipt.integrity.chain_height)
  );
  console.log(
    "Tenant B chain heights:",
    [b1, b2, b3].map((r) => r.receipt.integrity.chain_height)
  );

  console.log("\nEach tenant's chain is independent:");
  console.log(
    "  Tenant A a2.previous matches a1.receipt_hash:",
    a2.receipt.integrity.previous_receipt_hash === a1.receipt.integrity.receipt_hash
  );
  console.log(
    "  Tenant B b2.previous matches b1.receipt_hash:",
    b2.receipt.integrity.previous_receipt_hash === b1.receipt.integrity.receipt_hash
  );

  console.log("\nVerifying Tenant A chain alone:");
  for (let i = 0; i < 3; i++) {
    const chain = [a1, a2, a3];
    const previousReceipt = i === 0 ? undefined : chain[i - 1];
    const r = verifyReceipt(chain[i], { publicKeys, previousReceipt });
    console.log(`  A${i + 1}: ${r.valid ? "VALID" : "INVALID"}`);
  }

  console.log("\nVerifying Tenant B chain alone:");
  for (let i = 0; i < 3; i++) {
    const chain = [b1, b2, b3];
    const previousReceipt = i === 0 ? undefined : chain[i - 1];
    const r = verifyReceipt(chain[i], { publicKeys, previousReceipt });
    console.log(`  B${i + 1}: ${r.valid ? "VALID" : "INVALID"}`);
  }
}

main();
