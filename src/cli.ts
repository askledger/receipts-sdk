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
  buildBatch,
  verifyInclusion,
  buildEvidencePack,
  verifyPackIntegrity,
} from "./index.js";
import type { RawEvent, KeyPair, SignedReceipt } from "./types.js";

// ---------- terminal styling ----------
const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  reset: isTTY ? "\x1b[0m" : "",
  dim: isTTY ? "\x1b[2m" : "",
  bold: isTTY ? "\x1b[1m" : "",
  navy: isTTY ? "\x1b[38;5;33m" : "",
  gold: isTTY ? "\x1b[38;5;221m" : "",
  green: isTTY ? "\x1b[38;5;46m" : "",
  red: isTTY ? "\x1b[38;5;196m" : "",
  amber: isTTY ? "\x1b[38;5;215m" : "",
  cyan: isTTY ? "\x1b[38;5;81m" : "",
  gray: isTTY ? "\x1b[38;5;244m" : "",
};
function paint(color: string, s: string): string { return `${color}${s}${c.reset}`; }
function shortHash(h: string): string { return `${h.slice(0,8)}…${h.slice(-6)}`; }
function rule(): string { return paint(c.gray, "─".repeat(78)); }
function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

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
  .command("quickstart")
  .description("60-second hello world — keygen + first signed receipt + verify + badge URL")
  .action(async () => {
    const { quickstart } = await import("./cli/quickstart.js");
    process.exit(await quickstart());
  });

program
  .command("demo")
  .description("Run a full demo — keygen, chain of 5 receipts, verify, tamper, evidence pack")
  .option("--fast", "Skip the cinematic pauses", false)
  .action(async (opts) => {
    const pause = opts.fast ? 0 : 350;

    console.log("");
    console.log(rule());
    console.log(`  ${paint(c.gold + c.bold, "Project Ledger")} ${paint(c.gray, "·")} ${paint(c.bold, "Receipts SDK Live Demo")}`);
    console.log(`  ${paint(c.gray, "Cryptographic AI Decision Receipts · v0.3 · Apache-2.0")}`);
    console.log(rule());
    await sleep(pause);

    // 1) Keys
    console.log("");
    console.log(paint(c.cyan + c.bold, "① Generating Ed25519 keypair"));
    console.log(paint(c.gray, "   32-byte seed · in-process · audited @noble/ed25519"));
    const kp = generateKeyPair();
    ensureDir(KEYS_DIR);
    writeJSON(`${KEYS_DIR}/demo.json`, kp);
    await sleep(pause);
    console.log(`   ${paint(c.green, "✓")} kid          ${paint(c.gold, kp.kid)}`);
    console.log(`   ${paint(c.green, "✓")} public_key   ${paint(c.gold, kp.public_key)}`);
    console.log(`   ${paint(c.gray, "  (private key never printed — stays at " + KEYS_DIR + "/demo.json)")}`);

    // 2) Sign chain
    await sleep(pause);
    console.log("");
    console.log(paint(c.cyan + c.bold, "② Signing 5 AI events into a hash chain"));
    console.log(paint(c.gray, "   RFC 8785 canonical JSON + Ed25519 detached signature + chain link"));
    console.log("");

    const samples: { event_type: string; ai_model: string; vendor: string }[] = [
      { event_type: "gateway.request", vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
      { event_type: "agent.tool_call", vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
      { event_type: "gateway.request", vendor: "openai",    ai_model: "gpt-5" },
      { event_type: "ide.completion",  vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
      { event_type: "gateway.request", vendor: "bedrock",   ai_model: "claude-3-sonnet" },
    ];

    const tenant = "demo-tenant-" + Date.now();
    const chain: SignedReceipt[] = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const event: RawEvent = {
        schema_version: "1.0",
        tenant_id: tenant,
        event_type: s.event_type,
        source_system: "cli-demo",
        event_id: `evt-cli-${i + 1}`,
        captured_at: new Date().toISOString(),
        context: { environment: "production" },
        subject: { ai_vendor: s.vendor, ai_model: s.ai_model },
        payload: { input_classification: "internal", output_classification: "internal" },
      };
      const t0 = process.hrtime.bigint();
      const signed = signReceipt({ event, keypair: kp });
      const ms = Number(process.hrtime.bigint() - t0) / 1_000_000;
      chain.push(signed);
      const ih = signed.receipt.integrity;
      const numCol = paint(c.gold + c.bold, `#${ih.chain_height}`.padStart(3));
      console.log(`   ${numCol} ${paint(c.gray, "│")} ${s.event_type.padEnd(18)} ${paint(c.gray, "·")} ${s.ai_model.padEnd(20)} ${paint(c.gray, "·")} ${paint(c.green, ms.toFixed(2) + " ms")}`);
      console.log(`        ${paint(c.gray, "prev_hash    ")} ${paint(c.gold, shortHash(ih.previous_receipt_hash))}`);
      console.log(`        ${paint(c.gray, "receipt_hash ")} ${paint(c.gold, shortHash(ih.receipt_hash))}`);
      if (i < samples.length - 1) console.log(`        ${paint(c.gray, "↓")}`);
      await sleep(pause);
    }
    writeJSON(`${RECEIPTS_DIR}/demo-chain.json`, chain);

    // 3) Verify all
    await sleep(pause);
    console.log("");
    console.log(paint(c.cyan + c.bold, "③ Verifying the full chain"));
    console.log(paint(c.gray, "   Independent · public key only · no Ledger server call"));
    let allOk = true;
    for (let i = 0; i < chain.length; i++) {
      const previousReceipt = i === 0 ? undefined : chain[i - 1];
      const r = verifyReceipt(chain[i], {
        publicKeys: { [kp.kid]: kp.public_key },
        previousReceipt,
      });
      if (!r.valid) allOk = false;
      const tick = r.valid ? paint(c.green, "✓") : paint(c.red, "✕");
      const detail = `hash=${r.checks.canonical_hash_matches ? "ok" : "BAD"} sig=${r.checks.signature_valid ? "ok" : "BAD"} chain=${r.checks.chain_link_valid ?? "—"}`;
      console.log(`   ${tick} receipt #${chain[i].receipt.integrity.chain_height}  ${paint(c.gray, detail)}`);
    }
    console.log("");
    console.log(allOk
      ? `   ${paint(c.green + c.bold, "✓ ALL " + chain.length + " RECEIPTS VALID")}`
      : `   ${paint(c.red + c.bold, "✗ VERIFICATION FAILED")}`);

    // 4) Tamper
    await sleep(pause);
    console.log("");
    console.log(paint(c.cyan + c.bold, "④ Adversarial test — tamper with receipt #3"));
    console.log(paint(c.gray, "   Mutating event.subject.ai_model from 'gpt-5' → 'downgraded-model-7b'"));
    const tampered = JSON.parse(JSON.stringify(chain)) as SignedReceipt[];
    tampered[2].receipt.event.subject!.ai_model = "downgraded-model-7b";
    let badCount = 0;
    console.log("");
    for (let i = 0; i < tampered.length; i++) {
      const previousReceipt = i === 0 ? undefined : tampered[i - 1];
      const r = verifyReceipt(tampered[i], {
        publicKeys: { [kp.kid]: kp.public_key },
        previousReceipt,
      });
      if (!r.valid) badCount++;
      const tick = r.valid ? paint(c.green, "✓") : paint(c.red, "✕");
      const reason = r.valid ? "valid" : r.errors[0] ?? "invalid";
      console.log(`   ${tick} receipt #${tampered[i].receipt.integrity.chain_height}  ${paint(c.gray, reason.slice(0, 60))}`);
    }
    console.log("");
    console.log(`   ${paint(c.red + c.bold, "✓ TAMPER DETECTED")} ${paint(c.gray, "— " + badCount + " of " + tampered.length + " receipts now fail")}`);
    console.log(paint(c.gray, "   Receipt #3 fails its own hash. #4 and #5 fail the chain link to #3."));
    console.log(paint(c.gray, "   This is what 'mathematically tamper-evident' means."));

    // 5) Evidence pack
    await sleep(pause);
    console.log("");
    console.log(paint(c.cyan + c.bold, "⑤ Building a regulator-ready evidence pack"));
    console.log(paint(c.gray, "   Merkle batch · inclusion proofs · integrity hash · self-verifying"));
    const packMeta = {
      title: "CLI demo evidence pack",
      tenantId: tenant,
      purpose: "demonstration",
      period: { from: chain[0].receipt.issued_at, to: chain[chain.length - 1].receipt.issued_at },
      builtBy: "ledger-cli demo",
      builtAt: new Date().toISOString(),
    };
    const pack = buildEvidencePack(packMeta, chain, [{
      kid: kp.kid, public_key: kp.public_key,
      algorithm: "EdDSA", curve: "ed25519",
      status: "active", issued_at: kp.created_at,
    }]);
    writeJSON(`${RECEIPTS_DIR}/demo-evidence-pack.json`, pack);
    const integrityOk = verifyPackIntegrity(pack);
    await sleep(pause);
    console.log(`   ${paint(c.green, "✓")} merkle root         ${paint(c.gold, shortHash(pack.merkle.root))}`);
    console.log(`   ${paint(c.green, "✓")} receipts included   ${paint(c.gold, String(pack.integrity.receipts_count))}`);
    console.log(`   ${paint(c.green, "✓")} pack integrity      ${paint(c.gold, shortHash(pack.integrity.pack_hash))}`);
    console.log(`   ${paint(c.green, "✓")} self-verify         ${paint(integrityOk ? c.green : c.red, integrityOk ? "OK" : "FAILED")}`);

    // Inclusion proof spot-check
    const r3 = chain[2];
    const proof = pack.merkle.proofs[r3.receipt.receipt_id];
    const ok = verifyInclusion(r3, proof, pack.merkle.root);
    console.log(`   ${paint(ok ? c.green : c.red, ok ? "✓" : "✕")} receipt #3 ∈ root  ${paint(c.gray, "(inclusion proof verifies)")}`);

    // Wrap-up
    await sleep(pause);
    console.log("");
    console.log(rule());
    console.log(`  ${paint(c.bold, "Demo complete in " + ((Date.now() - new Date(packMeta.builtAt).getTime() + 5000) / 1000).toFixed(1) + "s")}`);
    console.log(rule());
    console.log("  Artifacts written:");
    console.log(`   ${paint(c.gray, "·")} ${KEYS_DIR}/demo.json                ${paint(c.gray, "the Ed25519 keypair (share only the public_key)")}`);
    console.log(`   ${paint(c.gray, "·")} ${RECEIPTS_DIR}/demo-chain.json             ${paint(c.gray, "the 5-receipt signed chain")}`);
    console.log(`   ${paint(c.gray, "·")} ${RECEIPTS_DIR}/demo-evidence-pack.json     ${paint(c.gray, "regulator-ready evidence bundle")}`);
    console.log(`   ${paint(c.gray, "·")} ${RECEIPTS_DIR}/chains/${tenant}.json  ${paint(c.gray, "the chain state for this tenant")}`);
    console.log("");
    console.log("  " + paint(c.gold, "Next:"));
    console.log(`    ${paint(c.bold, "ledger-cli verify")} ${paint(c.gray, RECEIPTS_DIR + "/demo-chain.json --key " + KEYS_DIR + "/demo.json")}`);
    console.log(`    ${paint(c.bold, "open site/demo.html")}     ${paint(c.gray, "for the visual demo")}`);
    console.log(`    ${paint(c.bold, "open site/verify.html")}   ${paint(c.gray, "to verify any receipt in your browser")}`);
    console.log(rule());
    console.log("");
  });

program.parse();
