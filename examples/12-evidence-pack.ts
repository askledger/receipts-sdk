/**
 * Example 12, evidence pack: bundle N receipts, then verify the whole pack.
 *
 * This is the "select N receipts, produce one signed evidence pack, verify it
 * as a unit" flow, end to end, over the shipped API. It also writes a sample
 * pack to examples/sample-evidence-pack.json that you can drop into a demo.
 *
 * Run:  npx tsx examples/12-evidence-pack.ts   (or: npm run demo:pack)
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  generateKeyPair,
  signReceipt,
  buildEvidencePack,
  verifyEvidencePack,
  KeyRegistry,
  type RawEvent,
} from "../src/index.js";

const kp = generateKeyPair();
const tenant = "acme-bank";

// 1) Sign a handful of receipts, as if the AI made five decisions.
const receipts = [];
for (let i = 1; i <= 5; i++) {
  const event: RawEvent = {
    schema_version: "1.0",
    tenant_id: tenant,
    event_type: "gateway.request",
    source_system: "loan-underwriting",
    event_id: `decision-${i}`,
    captured_at: new Date().toISOString(),
    subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
    payload: { input_classification: "internal", output_classification: "internal" },
  };
  receipts.push(signReceipt({ event, keypair: kp }));
}

// 2) Bundle them into one signed evidence pack (chain context, Merkle root,
//    inclusion proofs, and a manifest all come from buildEvidencePack).
const keys = new KeyRegistry();
keys.add({ kid: kp.kid, public_key: kp.public_key, algorithm: "EdDSA", curve: "ed25519" });

const pack = buildEvidencePack(
  {
    title: "Loan underwriting decisions, sample",
    tenantId: tenant,
    purpose: "demo evidence pack",
    period: { from: "2026-01-01", to: "2026-12-31" },
    builtBy: "example-12",
    builtAt: new Date().toISOString(),
  },
  receipts,
  keys.list(),
);

const outPath = join(dirname(fileURLToPath(import.meta.url)), "sample-evidence-pack.json");
writeFileSync(outPath, JSON.stringify(pack, null, 2));

// 3) Verify the whole pack as a unit, with only the public key.
const result = verifyEvidencePack(pack, { publicKeys: { [kp.kid]: kp.public_key } });

console.log("Evidence pack");
console.log(`  receipts:    ${pack.integrity.receipts_count}`);
console.log(`  merkle root: ${pack.merkle.root.slice(0, 16)}...`);
console.log(`  pack hash:   ${pack.integrity.pack_hash.slice(0, 16)}...`);
console.log(`  built at:    ${pack.meta.builtAt}`);
console.log("");
console.log(`  pack hash matches:     ${result.checks.pack_hash_matches}`);
console.log(`  all receipts included: ${result.checks.all_receipts_included}`);
console.log(`  all signatures valid:  ${result.checks.all_signatures_valid}`);
console.log("");
console.log(result.valid ? `VALID: all ${pack.integrity.receipts_count} receipts verified, chain intact.` : "INVALID");
console.log(`Wrote ${outPath}`);

if (!result.valid) process.exit(1);
