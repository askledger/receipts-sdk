#!/usr/bin/env node
// Generate a small chain of REAL signed receipts at build time. The output
// becomes the demo data the dashboards render — so even when the console
// runs in fixture mode, every receipt_id shown is a real Ed25519-signed
// receipt that a visitor can paste into the public verifier and see VALID.
//
// Run automatically on `npm run prebuild` in the console.
//
// Output: console/src/lib/demo-receipts.json — committed so anyone
// cloning the repo sees real receipts on first console load.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { generateKeyPair, signReceipt } from "../../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "src", "lib", "demo-receipts.json");

// Stable tenant for deterministic chain across runs.
const TENANT = "askledger-demo";

// Use a temp dir so the on-disk chain state from prior runs doesn't bleed in.
process.env.RECEIPTS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pl-demo-"));

const kp = generateKeyPair();

const SAMPLES = [
  { event_type: "ai.model_invocation", vendor: "anthropic", model: "claude-sonnet-4-6", user: "amir.h@askledger-demo", team: "Engineering · Core Payments", decision: "block", policy: ["POLICY_HIGH_RISK"], hour: 9, minute: 12 },
  { event_type: "ai.model_invocation", vendor: "openai",    model: "gpt-5",             user: "yana.r@askledger-demo", team: "Marketing", decision: "flag", policy: ["POLICY_REVIEW"], hour: 16, minute: 44 },
  { event_type: "ai.model_invocation", vendor: "anthropic", model: "claude-sonnet-4-6", user: "fahad.s@askledger-demo", team: "Engineering · Data Platform", decision: "flag", policy: ["POLICY_REVIEW"], hour: 11, minute: 8 },
  { event_type: "ai.model_invocation_blocked", vendor: "anthropic", model: "claude-opus-4-6",  user: "credit-bot@askledger-demo", team: "Risk", decision: "block", policy: ["GDPR_ARTICLE_22"], hour: 10, minute: 14 },
  { event_type: "ai.model_invocation_blocked", vendor: "openai",    model: "gpt-5",             user: "fraud-bot@askledger-demo", team: "Risk", decision: "block", policy: ["GDPR_ARTICLE_22"], hour: 9, minute: 58 },
];

const chain = [];
for (let i = 0; i < SAMPLES.length; i++) {
  const s = SAMPLES[i];
  const ts = new Date(Date.UTC(2026, 5, 13, s.hour, s.minute, i)).toISOString();
  const signed = signReceipt({
    event: {
      schema_version: "1.0",
      tenant_id: TENANT,
      event_type: s.event_type,
      source_system: "askledger-demo",
      event_id: `demo-${i.toString().padStart(4, "0")}`,
      captured_at: ts,
      context: { user_id: s.user, environment: "production" },
      subject: { ai_vendor: s.vendor, ai_model: s.model },
      payload: {
        input_token_count: 200 + i * 50,
        output_token_count: 80 + i * 20,
        input_classification: "internal",
        metadata: { team: s.team, applied_policies: s.policy, decision: s.decision },
      },
    },
    keypair: kp,
  });
  chain.push({
    receipt_id: signed.receipt.receipt_id,
    chain_height: signed.receipt.integrity.chain_height,
    receipt_hash: signed.receipt.integrity.receipt_hash,
    previous_receipt_hash: signed.receipt.integrity.previous_receipt_hash,
    kid: signed.signatures[0].kid,
    signature_b64: signed.signatures[0].sig,
    issued_at: signed.receipt.issued_at,
    user: s.user,
    team: s.team,
    vendor: s.vendor,
    model: s.model,
    decision: s.decision,
    policy: s.policy,
    time_hhmm: `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`,
  });
}

const bundle = {
  schema_version: "1.0",
  generated_at: new Date().toISOString(),
  tenant_id: TENANT,
  kid: kp.kid,
  public_key_b64: kp.public_key,
  algorithm: kp.algorithm,
  curve: kp.curve,
  count: chain.length,
  receipts: chain,
};

fs.writeFileSync(OUT, JSON.stringify(bundle, null, 2));
process.stdout.write(`generated ${chain.length} real signed receipts → ${OUT}\n`);
