#!/usr/bin/env node
/**
 * ledger-cli — command-line interface for the Receipts SDK.
 *
 * Commands:
 *   ledger-cli keygen [--out <path>]
 *       Generate a new Ed25519 keypair and write to JSON file.
 *
 *   ledger-cli sign <event.json> [--key <path>] [--out <path>]
 *       Read an event, hash-chain it, sign it, write the signed receipt.
 *
 *   ledger-cli verify <receipt.json> [--key <path>]
 *       Verify a signed receipt against a public key.
 *
 *   ledger-cli demo
 *       Run a full keygen + sign + verify cycle end-to-end.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Command } from "commander";
import {
  generateKeyPair,
  signReceipt,
  verifyReceipt,
  prettySignedReceipt,
} from "./index.js";
import type { RawEvent, KeyPair, SignedReceipt } from "./types.js";

const KEYS_DIR = ".ledger/keys";
const RECEIPTS_DIR = ".ledger";

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function readJSON<T>(filepath: string): T {
  const raw = fs.readFileSync(filepath, "utf-8");
  return JSON.parse(raw) as T;
}

function writeJSON(filepath: string, value: unknown): void {
  ensureDir(path.dirname(filepath));
  fs.writeFileSync(filepath, JSON.stringify(value, null, 2));
}

const program = new Command();
program
  .name("ledger-cli")
  .description("Project Ledger Receipts SDK · cryptographic AI decision receipts")
  .version("0.1.0");

// ---------- keygen ----------
program
  .command("keygen")
  .description("Generate a new Ed25519 keypair")
  .option("-o, --out <path>", "Output path", `${KEYS_DIR}/default.json`)
  .action((opts) => {
    const kp = generateKeyPair();
    writeJSON(opts.out, kp);
    console.log(`Generated keypair · kid=${kp.kid}`);
    console.log(`Public key:  ${kp.public_key}`);
    console.log(`Private key: ${kp.private_key.substring(0, 20)}...`);
    console.log(`Written to:  ${opts.out}`);
  });

// ---------- sign ----------
program
  .command("sign <event>")
  .description("Sign an event and produce a chained, signed receipt")
  .option("-k, --key <path>", "Keypair JSON file", `${KEYS_DIR}/default.json`)
  .option("-o, --out <path>", "Output path", `${RECEIPTS_DIR}/last-receipt.json`)
  .action((eventPath, opts) => {
    // Load keypair (generate if missing)
    let kp: KeyPair;
    if (!fs.existsSync(opts.key)) {
      console.log(`No keypair at ${opts.key}, generating a new one...`);
      kp = generateKeyPair();
      writeJSON(opts.key, kp);
    } else {
      kp = readJSON<KeyPair>(opts.key);
    }

    // Load event
    const event = readJSON<RawEvent>(eventPath);

    // Sign
    const signed = signReceipt({ event, keypair: kp });

    // Write
    writeJSON(opts.out, signed);

    // Report
    console.log("\x1b[32m✓\x1b[0m Signed receipt");
    console.log(`  receipt_id:           ${signed.receipt.receipt_id}`);
    console.log(`  tenant_id:            ${signed.receipt.tenant_id}`);
    console.log(`  chain_height:         ${signed.receipt.integrity.chain_height}`);
    console.log(`  receipt_hash:         ${signed.receipt.integrity.receipt_hash}`);
    console.log(`  previous_hash:        ${signed.receipt.integrity.previous_receipt_hash}`);
    console.log(`  signature (kid=${kp.kid}): ${signed.signatures[0]?.sig.substring(0, 32)}...`);
    console.log(`  written to:           ${opts.out}\n`);
  });

// ---------- verify ----------
program
  .command("verify <receipt>")
  .description("Verify a signed receipt against a public key")
  .option("-k, --key <path>", "Keypair JSON file (only public_key is read)", `${KEYS_DIR}/default.json`)
  .option("--prev <path>", "Previous SignedReceipt JSON file (for chain check)")
  .action((receiptPath, opts) => {
    const signed = readJSON<SignedReceipt>(receiptPath);
    const kp = readJSON<KeyPair>(opts.key);

    const previousReceipt = opts.prev
      ? readJSON<SignedReceipt>(opts.prev)
      : undefined;

    const result = verifyReceipt(signed, {
      publicKeys: { [kp.kid]: kp.public_key },
      previousReceipt,
    });

    if (result.valid) {
      console.log("\x1b[32m✓ RECEIPT VALID\x1b[0m");
      console.log(`  ✓ canonical hash matches`);
      console.log(`  ✓ Ed25519 signature valid`);
      if (result.checks.chain_link_valid !== undefined) {
        const tick = result.checks.chain_link_valid ? "✓" : "✗";
        console.log(`  ${tick} chain link valid`);
      }
      console.log(`  receipt_id: ${signed.receipt.receipt_id}`);
      console.log(`  chain_height: ${signed.receipt.integrity.chain_height}`);
    } else {
      console.log("\x1b[31m✗ RECEIPT INVALID\x1b[0m");
      console.log(`  canonical hash matches: ${result.checks.canonical_hash_matches}`);
      console.log(`  signature valid:        ${result.checks.signature_valid}`);
      if (result.checks.chain_link_valid !== undefined) {
        console.log(`  chain link valid:       ${result.checks.chain_link_valid}`);
      }
      console.log(`  errors:`);
      for (const err of result.errors) console.log(`    - ${err}`);
      process.exit(1);
    }
  });

// ---------- demo ----------
program
  .command("demo")
  .description("Run a full keygen + sign + verify cycle (idempotent)")
  .action(() => {
    console.log("─".repeat(72));
    console.log("Project Ledger — Receipts SDK · Demo");
    console.log("─".repeat(72));

    // 1. keygen
    console.log("\n1. Generating Ed25519 keypair…");
    const kp = generateKeyPair();
    ensureDir(KEYS_DIR);
    writeJSON(`${KEYS_DIR}/demo.json`, kp);
    console.log(`   kid: ${kp.kid}`);

    // 2. sign
    console.log("\n2. Signing a sample AI event…");
    const event: RawEvent = {
      schema_version: "1.0",
      tenant_id: "demo-tenant",
      event_type: "ide.completion",
      source_system: "vs-code-plugin",
      event_id: "evt-demo-001",
      captured_at: new Date().toISOString(),
      context: {
        user_id: "user-001",
        environment: "production",
        region: "us-east-1",
      },
      subject: {
        ai_vendor: "anthropic",
        ai_model: "claude-sonnet-4-6",
        ai_provider: "direct",
        ai_capability: "code-completion",
      },
      payload: {
        input_classification: "internal",
        input_token_count: 245,
        output_token_count: 380,
      },
    };
    const signed = signReceipt({ event, keypair: kp });
    writeJSON(`${RECEIPTS_DIR}/demo-receipt.json`, signed);
    console.log(`   receipt_id:   ${signed.receipt.receipt_id}`);
    console.log(`   receipt_hash: ${signed.receipt.integrity.receipt_hash}`);
    console.log(`   chain_height: ${signed.receipt.integrity.chain_height}`);

    // 3. verify
    console.log("\n3. Verifying receipt independently (no Ledger server needed)…");
    const result = verifyReceipt(signed, {
      publicKeys: { [kp.kid]: kp.public_key },
    });
    if (result.valid) {
      console.log("   \x1b[32m✓ canonical hash matches\x1b[0m");
      console.log("   \x1b[32m✓ Ed25519 signature valid\x1b[0m");
      console.log("\n\x1b[32m✓ RECEIPT VALID\x1b[0m");
    } else {
      console.log("   \x1b[31m✗ Verification failed:\x1b[0m");
      for (const err of result.errors) console.log(`     ${err}`);
      process.exit(1);
    }

    console.log("\n─".repeat(72));
    console.log("Demo complete. Files written:");
    console.log(`  ${KEYS_DIR}/demo.json     · the Ed25519 keypair`);
    console.log(`  ${RECEIPTS_DIR}/demo-receipt.json · the signed receipt`);
    console.log(`  ${RECEIPTS_DIR}/chains/demo-tenant.json · the chain state`);
    console.log("─".repeat(72));
  });

program.parse();
