#!/usr/bin/env node
/**
 * ledger-cli, command-line interface for the Receipts SDK.
 *
 * Commands:
 *   ledger-cli keygen [--out <path>]
 *       Generate a new Ed25519 keypair and write to JSON file.
 *
 *   ledger-cli sign <event.json> [--key <path>] [--out <path>]
 *       Read an event, hash-chain it, sign it, write the signed receipt.
 *
 *   ledger-cli verify <receipt.json> [--key <path>]
 *       Verify a signed receipt against a public key. Reports any
 *       attached evidence_refs (Layer 4 correctness bindings).
 *
 *   ledger-cli sign <event.json> [--evidence-ref <spec>]...
 *       Attach one or more external correctness/attestation proofs at
 *       sign time. Each --evidence-ref is a comma-separated spec, e.g.
 *       kind=rule-check,file=./proof.json,status=pass  (file is hashed)
 *       kind=external-proof,hash=<hex>,alg=sha-256,status=pass
 *
 *   ledger-cli bundle <receipt-or-chain files...> [--out <path>] [--title <t>] [--tenant <id>]
 *       Build an evidence bundle (Merkle root + inclusion proofs + pack
 *       hash) from many signed receipts, one verifiable artifact.
 *
 *   ledger-cli verify-bundle <bundle.json> [--key <keypair.json>]
 *       Verify an evidence bundle: pack integrity, receipt inclusion,
 *       and (with --key) per-receipt signatures.
 *
 *   ledger-cli query "<question>" [--paths ...] [--llm] [--json]
 *       Ask your receipts a question in plain English. The offline parser
 *       handles common questions for free; --llm (needs @anthropic-ai/sdk +
 *       ANTHROPIC_API_KEY) handles free-form phrasing. Every answer is grounded
 *       in real receipts and cites their ids, the NL layer never invents data.
 *
 *   ledger-cli alerts [paths...] [--json]
 *       Flag the receipts most worth a look: blocked/denied decisions, sensitive
 *       data (pii/pci/mnpi), unsigned records, over-tiering, and cost spikes.
 *       Each alert names the exact receipt ids behind it.
 *
 *   ledger-cli dashboard [paths...] [--html [path]]
 *       Local, single-tenant usage & cost dashboard built from your own
 *       signed receipts (scans .ledger/ by default). Shows estimated spend,
 *       tokens, per-model and per-app breakdowns, and integrity signals
 *       (signed count, chain height, correctness bindings). --html writes a
 *       self-contained report. Free tier: local only, no shadow-AI discovery.
 *
 *   ledger-cli demo
 *       Run a full keygen + sign + verify cycle end-to-end.
 *
 * Three layers, one CLI:
 *   Integrity    , keygen / sign / verify (hash chain + Ed25519)
 *   Traceability , bundle / verify-bundle (Merkle evidence bundle)
 *   Correctness  , sign --evidence-ref (binds an EXTERNAL proof; the SDK
 *                   binds it into the signed body, it does not itself verify).
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
  verifyAllReceiptsInPack,
  sha256String,
} from "./index.js";
import {
  summarizeReceipts,
  summarizeWorkloads,
  renderDashboardHtml,
  fmtUsd,
  fmtTokens,
  type DashboardSummary,
} from "./cost/dashboard.js";
import { parseUsageExport } from "./cost/ingest.js";
import {
  buildBaseline,
  proveSavings,
  verifySavingsProof,
  type SignedBaseline,
  type SavingsProof,
} from "./cost/savings.js";
import { parseQuery, runQuery, type QueryResult, type ReceiptRow } from "./query/index.js";
import { runAlerts, type Alert } from "./query/alerts.js";
import { parseQueryLLM } from "./query/llm.js";
import type { RawEvent, KeyPair, SignedReceipt, EvidenceRef } from "./types.js";
import type { EvidencePack } from "./evidence/index.js";

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
// Neutralize ANSI/control characters in receipt-authored strings before printing
// them to a terminal, a receipt from another party (e.g. inside an evidence
// bundle you received) could otherwise embed escape sequences to spoof output.
function clean(s: string): string { return String(s).replace(/[\u0000-\u001f\u007f-\u009f]/g, "\uFFFD"); }
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

/**
 * Parse a single `--evidence-ref` spec into an EvidenceRef.
 *
 * A spec is a comma-separated list of key=value pairs, e.g.
 *   kind=rule-check,file=./proof.json,status=pass,uri=https://…
 *   kind=external-proof,hash=<hexdigest>,alg=sha-256,status=pass
 *
 * When `file=` is given, the file is read, its SHA-256 is computed via the
 * SDK's `sha256String` helper, and `alg=sha-256` / `hash=<digest>` are set.
 * Collecting the specs and passing them to `signReceipt({ evidenceRefs })`
 * binds the external correctness proof into the signed receipt body (Layer 4).
 */
function parseEvidenceRefSpec(spec: string): EvidenceRef {
  const fields: Record<string, string> = {};
  for (const part of spec.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      throw new Error(`Invalid --evidence-ref segment (expected key=value): "${trimmed}"`);
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    fields[key] = value;
  }

  const ref: EvidenceRef = {
    kind: fields.kind ?? "external-proof",
    hash: fields.hash ?? "",
  };

  if (fields.file) {
    const contents = fs.readFileSync(fields.file, "utf-8");
    ref.hash = sha256String(contents);
    ref.alg = "sha-256";
  } else if (fields.alg) {
    ref.alg = fields.alg;
  }

  if (!ref.hash) {
    throw new Error(
      `--evidence-ref must provide either file=<path> or hash=<digest>: "${spec}"`
    );
  }
  if (fields.uri) ref.uri = fields.uri;
  if (fields.status) ref.status = fields.status;

  return ref;
}

/** Collector for repeatable --evidence-ref options. */
function collectEvidenceRef(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

const program = new Command();
program
  .name("ledger-cli")
  .description("AskLedger · see your wasted AI spend, then prove and cut it")
  .version("0.11.0");

program.addHelpText(
  "after",
  `
Start here:
  $ ledger-cli scan <usage-export.json>   See your wasted AI spend from an existing
                                          OpenAI/Anthropic bill, no instrumentation.

Then, once you're emitting signed receipts:
  dashboard · query · alerts · verify · bundle
`
);

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
  .option(
    "-e, --evidence-ref <spec>",
    "Attach an external correctness/attestation proof (repeatable). " +
      "Spec: kind=…,file=./proof.json,status=pass OR kind=…,hash=<hex>,alg=sha-256,status=pass",
    collectEvidenceRef,
    [] as string[]
  )
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

    // Build evidence_refs (Layer 4) from repeatable --evidence-ref specs.
    const evidenceRefs: EvidenceRef[] = (opts.evidenceRef as string[]).map(
      parseEvidenceRefSpec
    );

    // Sign
    const signed = signReceipt(
      evidenceRefs.length > 0
        ? { event, keypair: kp, evidenceRefs }
        : { event, keypair: kp }
    );

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
    if (evidenceRefs.length > 0) {
      const kinds = evidenceRefs.map((r) => r.kind).join(", ");
      console.log(`  evidence_refs:        ${evidenceRefs.length} attached (${kinds})`);
      console.log(`                        bound into signed body (Layer 4 correctness binding)`);
    }
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
      const refs = signed.receipt.evidence_refs;
      if (refs && refs.length > 0) {
        const kinds = refs.map((r) => r.kind).join(", ");
        console.log(`  evidence refs: ${refs.length} (${kinds}), covered by this signature`);
      }
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

// ---------- bundle ----------
program
  .command("bundle <files...>")
  .description("Build an evidence bundle (Merkle pack) from many signed receipts")
  .option("-o, --out <path>", "Output path", `${RECEIPTS_DIR}/evidence-bundle.json`)
  .option("-t, --title <title>", "Human-readable bundle title")
  .option("--tenant <id>", "Tenant id (derived from receipts if omitted)")
  .action((files: string[], opts) => {
    // Accept either single-receipt JSON files OR a JSON file that is an ARRAY
    // of SignedReceipts (like the demo's demo-chain.json). Flatten to one list.
    const receipts: SignedReceipt[] = [];
    for (const file of files) {
      const parsed = readJSON<SignedReceipt | SignedReceipt[]>(file);
      if (Array.isArray(parsed)) {
        receipts.push(...parsed);
      } else {
        receipts.push(parsed);
      }
    }

    if (receipts.length === 0) {
      console.log(paint(c.red, "✗ No receipts found in the provided files."));
      process.exit(1);
    }

    // Derive tenant + period from the receipts when flags are not given.
    const tenantId: string =
      opts.tenant ?? receipts[0].receipt.tenant_id;
    const issuedTimes = receipts
      .map((r) => r.receipt.issued_at)
      .filter((t): t is string => typeof t === "string")
      .sort();
    const period = {
      from: issuedTimes[0] ?? new Date().toISOString(),
      to: issuedTimes[issuedTimes.length - 1] ?? new Date().toISOString(),
    };

    // Collect the trusted public keys referenced by the receipts' signatures.
    // The private key never appears in a receipt, so we can only include the
    // kids here; a --key on verify-bundle supplies the actual public key.
    const kids = Array.from(
      new Set(
        receipts.flatMap((r) => r.signatures.map((s) => s.kid))
      )
    );

    const meta = {
      title: opts.title ?? `Evidence bundle · ${tenantId}`,
      tenantId,
      purpose: "evidence bundle built from signed receipts",
      period,
      builtBy: "ledger-cli bundle",
      builtAt: new Date().toISOString(),
    };

    const pack = buildEvidencePack(
      meta,
      receipts,
      kids.map((kid) => ({
        kid,
        public_key: "",
        algorithm: "EdDSA" as const,
        curve: "ed25519" as const,
        status: "active" as const,
        issued_at: meta.builtAt,
      }))
    );

    writeJSON(opts.out, pack);

    console.log("");
    console.log(paint(c.cyan + c.bold, "Evidence bundle built"));
    console.log(`   ${paint(c.green, "✓")} merkle root         ${paint(c.gold, pack.merkle.root)}`);
    console.log(`   ${paint(c.green, "✓")} receipts included   ${paint(c.gold, String(pack.integrity.receipts_count))}`);
    console.log(`   ${paint(c.green, "✓")} pack_hash           ${paint(c.gold, pack.integrity.pack_hash)}`);
    console.log(`   ${paint(c.gray, "·")} tenant              ${paint(c.gray, tenantId)}`);
    console.log(`   ${paint(c.gray, "·")} period              ${paint(c.gray, `${period.from} → ${period.to}`)}`);
    console.log(`   ${paint(c.gray, "·")} written to          ${paint(c.gray, opts.out)}`);
    console.log("");
    console.log(paint(c.gray, `   Verify it:  ledger-cli verify-bundle ${opts.out} --key <keypair.json>`));
    console.log("");
  });

// ---------- verify-bundle ----------
program
  .command("verify-bundle <bundle>")
  .description("Verify an evidence bundle: pack integrity, inclusion, and (with --key) signatures")
  .option("-k, --key <path>", "Keypair JSON file (only public_key is read)")
  .action((bundlePath: string, opts) => {
    const pack = readJSON<EvidencePack>(bundlePath);

    let allOk = true;

    console.log("");
    console.log(paint(c.cyan + c.bold, "Verifying evidence bundle"));
    console.log(paint(c.gray, `   ${pack.meta?.title ?? "(untitled)"} · ${pack.integrity.receipts_count} receipts`));
    console.log("");

    // 1) Pack integrity (top-level pack_hash).
    const integrityOk = verifyPackIntegrity(pack);
    if (!integrityOk) allOk = false;
    console.log(`   ${paint(integrityOk ? c.green : c.red, integrityOk ? "✓" : "✕")} pack integrity      ${paint(integrityOk ? c.green : c.red, integrityOk ? "OK" : "FAILED")}`);

    // 2) Every receipt is included under the Merkle root.
    const failedInclusion = verifyAllReceiptsInPack(pack);
    if (failedInclusion.length > 0) allOk = false;
    console.log(`   ${paint(failedInclusion.length === 0 ? c.green : c.red, failedInclusion.length === 0 ? "✓" : "✕")} merkle inclusion    ${paint(c.gray, `${pack.integrity.receipts_count - failedInclusion.length}/${pack.integrity.receipts_count} receipts under root`)}`);
    for (const r of failedInclusion) {
      console.log(`       ${paint(c.red, "✕")} ${paint(c.gray, r.receipt.receipt_id + " not included")}`);
    }

    // 3) Optional: per-receipt Ed25519 signature verification with a key.
    if (opts.key) {
      const kp = readJSON<KeyPair>(opts.key);
      const publicKeys = { [kp.kid]: kp.public_key };
      let sigBad = 0;
      for (const r of pack.receipts) {
        const result = verifyReceipt(r, { publicKeys });
        if (!result.valid) sigBad++;
      }
      if (sigBad > 0) allOk = false;
      console.log(`   ${paint(sigBad === 0 ? c.green : c.red, sigBad === 0 ? "✓" : "✕")} signatures          ${paint(c.gray, `${pack.receipts.length - sigBad}/${pack.receipts.length} valid (kid=${kp.kid})`)}`);

      // Spot-check an inclusion proof end-to-end for the first receipt.
      const first = pack.receipts[0];
      const proof = pack.merkle.proofs[first.receipt.receipt_id];
      if (proof) {
        const inclOk = verifyInclusion(first, proof, pack.merkle.root);
        if (!inclOk) allOk = false;
        console.log(`   ${paint(inclOk ? c.green : c.red, inclOk ? "✓" : "✕")} inclusion proof     ${paint(c.gray, "(spot-check: first receipt ∈ root)")}`);
      }
    } else {
      console.log(`   ${paint(c.gray, "·")} signatures          ${paint(c.gray, "skipped (pass --key <keypair.json> to check)")}`);
    }

    console.log("");
    if (allOk) {
      console.log(`   ${paint(c.green + c.bold, "✓ BUNDLE VALID")}`);
      console.log("");
    } else {
      console.log(`   ${paint(c.red + c.bold, "✗ BUNDLE INVALID")}`);
      console.log("");
      process.exit(1);
    }
  });

// ---------- demo ----------
program
  .command("quickstart")
  .description("60-second hello world, keygen + first signed receipt + verify + badge URL")
  .action(async () => {
    const { quickstart } = await import("./cli/quickstart.js");
    process.exit(await quickstart());
  });

program
  .command("demo")
  .description("Run a full demo, keygen, chain of 5 receipts, verify, tamper, evidence pack")
  .option("--fast", "Skip the cinematic pauses", false)
  .action(async (opts) => {
    const pause = opts.fast ? 0 : 350;

    console.log("");
    console.log(rule());
    console.log(`  ${paint(c.gold + c.bold, "AskLedger")} ${paint(c.gray, "·")} ${paint(c.bold, "Receipts SDK Live Demo")}`);
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
    console.log(`   ${paint(c.gray, "  (private key never printed, stays at " + KEYS_DIR + "/demo.json)")}`);

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
    console.log(paint(c.cyan + c.bold, "④ Adversarial test, tamper with receipt #3"));
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

// ---------- dashboard ----------

/** True when a parsed value looks like a SignedReceipt (has receipt + signatures). */
function isSignedReceipt(v: unknown): v is SignedReceipt {
  return (
    typeof v === "object" &&
    v !== null &&
    "receipt" in v &&
    "signatures" in v &&
    typeof (v as { receipt?: unknown }).receipt === "object"
  );
}

/** Recursively collect *.json paths under a directory. */
function walkJson(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkJson(full, out);
    else if (e.isFile() && e.name.endsWith(".json")) out.push(full);
  }
}

/**
 * Load signed receipts from the given files/dirs, or scan `.ledger/` when no
 * paths are supplied. Non-receipt JSON (keypairs, bundles) is skipped quietly;
 * arrays of receipts (e.g. demo-chain.json) are flattened.
 */
function loadReceipts(paths: string[]): SignedReceipt[] {
  const files: string[] = [];
  const sources = paths.length > 0 ? paths : [RECEIPTS_DIR];
  for (const p of sources) {
    let stat: fs.Stats | null = null;
    try {
      stat = fs.statSync(p);
    } catch {
      console.log(paint(c.amber, `   ! skipped (not found): ${p}`));
      continue;
    }
    if (stat.isDirectory()) walkJson(p, files);
    else files.push(p);
  }

  const receipts: SignedReceipt[] = [];
  for (const f of files) {
    let parsed: unknown;
    try {
      parsed = readJSON<unknown>(f);
    } catch {
      continue; // unreadable / not JSON
    }
    if (Array.isArray(parsed)) {
      for (const item of parsed) if (isSignedReceipt(item)) receipts.push(item);
    } else if (isSignedReceipt(parsed)) {
      receipts.push(parsed);
    }
  }
  return receipts;
}

program
  .command("dashboard [paths...]")
  .description("Local usage & cost dashboard from your signed receipts (free, single-tenant)")
  .option("--html [path]", "Write a self-contained HTML report (default .ledger/dashboard.html)")
  .action((paths: string[], opts) => {
    const receipts = loadReceipts(paths ?? []);

    if (receipts.length === 0) {
      console.log("");
      console.log(paint(c.amber, "No signed receipts found."));
      console.log(
        paint(
          c.gray,
          `   Looked in: ${paths && paths.length ? paths.join(", ") : RECEIPTS_DIR + "/"}. ` +
            `Sign some events first (ledger-cli sign <event.json>), then re-run.`
        )
      );
      console.log("");
      process.exit(0);
    }

    const summary = summarizeReceipts(receipts);

    // ----- HTML output -----
    if (opts.html) {
      const outPath =
        typeof opts.html === "string" ? opts.html : `${RECEIPTS_DIR}/dashboard.html`;
      const html = renderDashboardHtml(summary, new Date().toISOString());
      ensureDir(path.dirname(outPath));
      fs.writeFileSync(outPath, html);
      console.log("");
      console.log(paint(c.cyan + c.bold, "Dashboard written"));
      console.log(`   ${paint(c.green, "✓")} ${paint(c.gold, outPath)}`);
      console.log(paint(c.gray, `   open ${outPath}`));
      console.log("");
      return;
    }

    // ----- terminal output -----
    const period =
      summary.period.from && summary.period.to
        ? `${summary.period.from} → ${summary.period.to}`
        : "—";

    console.log("");
    console.log(rule());
    console.log(
      `  ${paint(c.gold + c.bold, "AskLedger")} ${paint(c.gray, "·")} ${paint(c.bold, "Local usage & cost")}  ${paint(c.gray, `(${summary.receipts} receipts · ${period})`)}`
    );
    console.log(rule());
    console.log("");

    // KPIs
    console.log(
      `   ${paint(c.green + c.bold, fmtUsd(summary.costUsd))} ${paint(c.gray, "estimated spend")}   ` +
        `${paint(c.bold, summary.requests.toLocaleString())} ${paint(c.gray, "requests")}   ` +
        `${paint(c.bold, fmtTokens(summary.totalTokens))} ${paint(c.gray, "tokens")}   ` +
        `${paint(c.bold, String(summary.models.length))} ${paint(c.gray, "models")}`
    );
    console.log("");

    // Spend by model
    if (summary.models.length > 0) {
      console.log(paint(c.cyan + c.bold, "  Spend by model"));
      const maxCost = summary.models.reduce((m, x) => Math.max(m, x.costUsd), 0) || 1;
      for (const m of summary.models) {
        const barLen = Math.max(1, Math.round((m.costUsd / maxCost) * 24));
        const bar = paint(m.priced ? c.navy : c.gray, "█".repeat(barLen));
        const label = m.priced ? "" : paint(c.amber, " (unpriced)");
        console.log(
          `   ${clean(m.key).padEnd(34).slice(0, 34)} ${bar.padEnd(0)} ` +
            `${paint(c.gray, m.requests + " req · " + fmtTokens(m.inputTokens + m.outputTokens) + " tok")}  ` +
            `${paint(m.priced ? c.green : c.gray, m.priced ? fmtUsd(m.costUsd) : "—")}${label}`
        );
      }
      console.log("");
    }

    // Spend by app
    if (summary.apps.length > 0) {
      console.log(paint(c.cyan + c.bold, "  Spend by application"));
      for (const a of summary.apps.slice(0, 8)) {
        console.log(
          `   ${clean(a.name).padEnd(34).slice(0, 34)} ${paint(c.gray, a.requests + " req")}  ${paint(c.green, fmtUsd(a.costUsd))}`
        );
      }
      console.log("");
    }

    // Savings opportunities (free over-tiering heuristic, split by confidence)
    if (summary.suggestions.length > 0) {
      printSavings(summary, 1);
    }

    // Integrity strip
    console.log(paint(c.cyan + c.bold, "  Integrity"));
    console.log(
      `   ${paint(c.green, "✓")} ${paint(c.bold, summary.signedReceipts + "/" + summary.receipts)} signed & verifiable   ` +
        `${paint(c.gray, "chain height")} ${paint(c.bold, summary.chainHeight === null ? "—" : "#" + summary.chainHeight)}   ` +
        `${paint(c.gray, "correctness bindings")} ${paint(c.bold, String(summary.withEvidenceRefs))}`
    );
    if (summary.unpricedRequests > 0) {
      console.log(
        paint(
          c.gray,
          `   ! ${summary.unpricedRequests} request(s) used a model not in the pricing table, counted, excluded from the cost estimate.`
        )
      );
    }
    console.log("");
    console.log(
      paint(
        c.gray,
        "   Estimate from your local receipts only, not a bill, and blind to un-instrumented AI. HTML report: ledger-cli dashboard --html"
      )
    );
    console.log("");
  });

// ---------- scan (import an existing provider bill, the zero-instrumentation front door) ----------
program
  .command("scan [files...]")
  .description("Estimate wasted AI spend from an existing OpenAI/Anthropic usage export, no receipts, no instrumentation")
  .option("--json", "output the full summary as JSON")
  .option("--html [path]", "write a self-contained HTML report instead")
  .action((files: string[], opts) => {
    if (!files || files.length === 0) {
      console.log("");
      console.log(paint(c.bold, "  See your wasted AI spend, from a bill you already have."));
      console.log("");
      console.log(paint(c.gray, "  usage: ") + paint(c.bold, "ledger-cli scan <usage-export.json> [more.json ...]"));
      console.log("");
      console.log(paint(c.cyan + c.bold, "  Don't have the file? Export it (takes ~1 minute, no code):"));
      console.log(paint(c.gray, "   • OpenAI    → platform.openai.com/usage  → Export  (JSON)"));
      console.log(paint(c.gray, "   • Anthropic → console.anthropic.com/settings/usage → Export"));
      console.log(paint(c.gray, "   Then:  ") + paint(c.bold, "ledger-cli scan ~/Downloads/usage.json"));
      console.log("");
      console.log(paint(c.gray, "  No instrumentation, no signup, nothing leaves your machine."));
      console.log("");
      process.exit(1);
    }
    const workloads = [];
    for (const f of files) {
      let text: string;
      try {
        text = fs.readFileSync(f, "utf-8");
      } catch {
        console.log(paint(c.amber, `  cannot read ${clean(f)}`));
        process.exit(1);
      }
      try {
        workloads.push(...parseUsageExport(text));
      } catch (e) {
        console.log(paint(c.amber, `  ${clean(f)}: ${clean((e as Error).message)}`));
        process.exit(1);
      }
    }
    if (workloads.length === 0) {
      console.log(paint(c.amber, "  No usage rows recognized, expected an OpenAI or Anthropic usage export (JSON)."));
      process.exit(0);
    }
    // Exact aggregation from the bill rows, no sampling, so the numbers are
    // precise at any bill size and match the signed baseline/prove figures.
    const summary = summarizeWorkloads(workloads);
    const totalRequests = summary.requests;

    if (opts.html) {
      const outPath = typeof opts.html === "string" ? opts.html : "askledger-scan.html";
      fs.writeFileSync(outPath, renderDashboardHtml(summary, new Date().toISOString()));
      console.log(paint(c.green, `  ✓ ${clean(outPath)}`));
      return;
    }
    if (opts.json) {
      console.log(JSON.stringify({ totalRequests, scale: 1, summary }, null, 2));
      return;
    }
    printScan(summary, totalRequests, 1, files.length);
  });

// Shared savings printer (used by `dashboard` and `scan`). `scale` (>=1) undoes
// any downsampling applied to a very large imported bill.
function printSavings(summary: DashboardSummary, scale: number): void {
  const conf = summary.potentialSavings * scale;
  const rev = summary.reviewSavings * scale;
  console.log(
    `${paint(c.green + c.bold, "  Savings opportunities")}  ${paint(
      c.gray,
      `${fmtUsd(conf)} confident${rev > 0 ? ` · +${fmtUsd(rev)} to review` : ""}`
    )}`
  );
  for (const s of summary.suggestions) {
    const badge =
      s.confidence === "high" ? paint(c.green, "[confident]") : paint(c.amber, "[review]   ");
    console.log(
      `   ${badge} ${paint(c.navy, clean(s.fromModel))} ${paint(c.gray, "→")} ${paint(c.green, clean(s.toModel))}   ` +
        `${paint(c.green + c.bold, "save ~" + fmtUsd(s.estSavings * scale))}  ` +
        `${paint(c.gray, `(${s.shareOfSpendPct}% · ${Math.round(s.requests * scale).toLocaleString()} calls · avg ${s.avgInputTokens} in / ${s.avgOutputTokens} out${s.topApp ? ` · ${clean(s.topApp)}` : ""})`)}`
    );
  }
  console.log(
    paint(
      c.gray,
      "   Only [confident] flags count toward the headline. [review] = heavy input context or a cross-family swap, test a sample first."
    )
  );
  console.log("");
}

function printScan(summary: DashboardSummary, totalRequests: number, scale: number, sources: number): void {
  const S = scale;
  console.log("");
  console.log(rule());
  console.log(
    `  ${paint(c.gold + c.bold, "AskLedger")} ${paint(c.gray, "·")} ${paint(c.bold, "Wasted-spend scan")}  ` +
      `${paint(c.gray, `(imported from ${sources} export${sources > 1 ? "s" : ""} · ${Math.round(totalRequests).toLocaleString()} requests · no instrumentation)`)}`
  );
  console.log(rule());
  console.log("");
  console.log(
    `   ${paint(c.green + c.bold, fmtUsd(summary.costUsd * S))} ${paint(c.gray, "estimated spend")}   ` +
      `${paint(c.green + c.bold, fmtUsd(summary.potentialSavings * S))} ${paint(c.gray, "confidently recoverable")}   ` +
      `${paint(c.amber + c.bold, fmtUsd(summary.reviewSavings * S))} ${paint(c.gray, "to review")}`
  );
  console.log("");
  if (summary.models.length > 0) {
    console.log(paint(c.cyan + c.bold, "  Spend by model"));
    const maxCost = summary.models.reduce((m, x) => Math.max(m, x.costUsd), 0) || 1;
    for (const m of summary.models) {
      const barLen = Math.max(1, Math.round((m.costUsd / maxCost) * 24));
      console.log(
        `   ${clean(m.key).padEnd(30).slice(0, 30)} ${paint(m.priced ? c.navy : c.gray, "█".repeat(barLen))}  ${paint(m.priced ? c.green : c.gray, m.priced ? fmtUsd(m.costUsd * S) : "—")}`
      );
    }
    console.log("");
  }
  if (summary.suggestions.length > 0) printSavings(summary, S);
  if (scale > 1) {
    console.log(
      paint(c.gray, `   (Large bill, sampled 1:${scale.toFixed(1)} for speed; dollar figures scaled to full volume.)`)
    );
  }
  console.log(
    paint(
      c.gray,
      "   Estimate from your provider export, repriced on AskLedger's pricing table, not a promise. Sign at capture to make savings verifiable (Pro)."
    )
  );
  console.log("");
}

// ---------- query (natural language) ----------

const SEV_COLOR: Record<Alert["severity"], string> = { high: c.red, medium: c.amber, low: c.gray };

function printAlerts(alerts: Alert[], json: boolean): void {
  if (json) { console.log(JSON.stringify(alerts, null, 2)); return; }
  console.log("");
  if (alerts.length === 0) {
    console.log(paint(c.green, "  ✓ No alerts, nothing critical in these receipts."));
    console.log("");
    return;
  }
  console.log(paint(c.cyan + c.bold, `  Alerts (${alerts.length})`));
  console.log("");
  for (const a of alerts) {
    const sev = SEV_COLOR[a.severity];
    console.log(`  ${paint(sev + c.bold, "● " + a.severity.toUpperCase().padEnd(6))} ${paint(c.bold, clean(a.title))} ${paint(c.gray, "· " + a.count)}`);
    console.log(`    ${paint(c.gray, clean(a.detail))}`);
    console.log(`    ${paint(c.gray, "receipts: " + a.receiptIds.slice(0, 5).map((x) => shortHash(clean(x))).join(", ") + (a.count > 5 ? " …" : ""))}`);
    console.log("");
  }
}

function printQueryResult(r: QueryResult, json: boolean): void {
  if (json) { console.log(JSON.stringify({ answer: r.answer, interpretation: r.interpretation, matchedCount: r.matchedCount, scanned: r.scanned, groups: r.groups, aggregate: r.aggregate, citations: r.citations }, null, 2)); return; }
  console.log("");
  console.log(`  ${paint(c.bold, r.answer)}`);
  console.log(`  ${paint(c.gray, "interpreted as: " + r.interpretation)}`);
  console.log("");
  if (r.groups && r.groups.length) {
    const max = r.groups.reduce((m, g) => Math.max(m, g.value), 0) || 1;
    for (const g of r.groups) {
      const bar = paint(c.navy, "█".repeat(Math.max(1, Math.round((g.value / max) * 22))));
      const val = r.query.metric === "cost" ? fmtUsd(g.value) : r.query.metric === "tokens" ? fmtTokens(g.value) : String(g.value);
      console.log(`   ${clean(g.key).padEnd(22).slice(0, 22)} ${bar}  ${paint(c.bold, val)} ${paint(c.gray, "· " + g.count + " rec")}`);
    }
    console.log("");
  } else if (r.matched.length) {
    console.log(paint(c.cyan + c.bold, "  Matching receipts"));
    for (const row of r.matched as ReceiptRow[]) {
      const dec = row.decision ? paint(row.decision === "block" ? c.red : c.gray, row.decision) : paint(c.gray, "—");
      console.log(`   ${paint(c.gold, shortHash(clean(row.id)))} ${paint(c.gray, clean(row.model ?? "—").padEnd(20).slice(0, 20))} ${paint(c.gray, clean(row.app).padEnd(14).slice(0, 14))} ${dec}  ${paint(c.green, fmtUsd(row.costUsd))}`);
    }
    console.log("");
  }
  if (r.citations.length) {
    console.log(paint(c.gray, "  Every result is backed by a signed receipt, verify any id with: ledger-cli verify <receipt.json>"));
    console.log("");
  }
}

program
  .command("query <question...>")
  .description("Ask your receipts a question in plain English (local; --llm for free-form)")
  .option("--llm", "Use an LLM to parse free-form questions (default: Claude via @anthropic-ai/sdk + ANTHROPIC_API_KEY)")
  .option("--model <id>", "Model for --llm mode (default claude-opus-4-8)")
  .option("--paths <paths...>", "Receipt files/dirs to search (default: .ledger/)")
  .option("--json", "Emit JSON instead of a formatted view")
  .action(async (question: string[], opts) => {
    const nl = question.join(" ");
    const receipts = loadReceipts(opts.paths ?? []);
    if (receipts.length === 0) {
      console.log(paint(c.amber, "\nNo signed receipts found. Sign some events first, then ask again.\n"));
      process.exit(0);
    }

    // Route "any issues?"-style questions to the alerts engine.
    const probe = parseQuery(nl);
    if (probe.wantsAlerts) { printAlerts(runAlerts(receipts), Boolean(opts.json)); return; }

    let q;
    if (opts.llm) {
      try {
        q = await parseQueryLLM(nl, { model: opts.model });
      } catch (e) {
        console.log(paint(c.red, `\n${(e as Error).message}\n`));
        console.log(paint(c.gray, "Falling back to the offline parser.\n"));
        q = probe;
      }
    } else {
      q = probe;
    }
    printQueryResult(runQuery(receipts, q), Boolean(opts.json));
  });

// ---------- alerts ----------
program
  .command("alerts [paths...]")
  .description("Flag critical patterns in your receipts (blocked decisions, sensitive data, unsigned, over-tiering, cost spikes)")
  .option("--json", "Emit JSON instead of a formatted view")
  .action((paths: string[], opts) => {
    const receipts = loadReceipts(paths ?? []);
    if (receipts.length === 0) {
      console.log(paint(c.amber, "\nNo signed receipts found. Sign some events first, then re-run.\n"));
      process.exit(0);
    }
    printAlerts(runAlerts(receipts), Boolean(opts.json));
  });

// ---------- verified savings (baseline -> proof -> independent verify) ----------

function loadOrCreateKeypair(keyPath: string): KeyPair {
  if (!fs.existsSync(keyPath)) {
    const kp = generateKeyPair();
    writeJSON(keyPath, kp);
    console.log(paint(c.gray, `  (generated a signing key at ${keyPath})`));
    return kp;
  }
  return readJSON<KeyPair>(keyPath);
}

function summarizeExport(files: string[]): DashboardSummary {
  const workloads = files.flatMap((f) => parseUsageExport(fs.readFileSync(f, "utf-8")));
  // Exact, unsampled aggregation for the SIGNED baseline/prove artifacts.
  return summarizeWorkloads(workloads);
}

program
  .command("baseline [files...]")
  .description("Sign a tamper-evident baseline snapshot of your AI spend from a usage export")
  .option("-k, --key <path>", "Keypair JSON file", `${KEYS_DIR}/default.json`)
  .option("-o, --out <path>", "Output path", `${RECEIPTS_DIR}/baseline.json`)
  .option("-l, --label <label>", "A label for this baseline", "baseline")
  .action((files: string[], opts) => {
    if (!files || files.length === 0) {
      console.log(paint(c.amber, "  usage: ledger-cli baseline <usage-export.json> [-l \"june-2026\"]"));
      process.exit(1);
    }
    const kp = loadOrCreateKeypair(opts.key);
    const summary = summarizeExport(files);
    const baseline = buildBaseline(summary, { label: opts.label, issuedAt: new Date().toISOString(), keypair: kp });
    ensureDir(path.dirname(opts.out));
    writeJSON(opts.out, baseline);
    console.log("");
    console.log(`  ${paint(c.green, "✓")} ${paint(c.bold, "Baseline signed")}  ${paint(c.gray, `label "${clean(opts.label)}" · kid ${clean(kp.kid)}`)}`);
    console.log(`   ${paint(c.gray, "spend")} ${paint(c.bold, fmtUsd(baseline.period.costUsd))}   ${paint(c.gray, "blended rate")} ${paint(c.bold, fmtUsd(baseline.period.costPer1kTokens) + "/1k tok")}   ${paint(c.gray, "requests")} ${paint(c.bold, baseline.period.requests.toLocaleString())}`);
    console.log(`   ${paint(c.gray, "written to")} ${paint(c.gold, opts.out)}`);
    console.log(paint(c.gray, "   Next period, run:  ledger-cli prove <new-export.json> --baseline " + opts.out));
    console.log("");
  });

program
  .command("prove [files...]")
  .description("Prove the realized savings versus a signed baseline (efficiency-normalized, signed)")
  .requiredOption("-b, --baseline <path>", "Signed baseline file from `ledger-cli baseline`")
  .option("-k, --key <path>", "Keypair JSON file", `${KEYS_DIR}/default.json`)
  .option("-o, --out <path>", "Output path", `${RECEIPTS_DIR}/savings-proof.json`)
  .option("--json", "Emit the signed proof as JSON")
  .action((files: string[], opts) => {
    if (!files || files.length === 0) {
      console.log(paint(c.amber, "  usage: ledger-cli prove <new-export.json> --baseline .ledger/baseline.json"));
      process.exit(1);
    }
    const baseline = readJSON<SignedBaseline>(opts.baseline);
    const kp = loadOrCreateKeypair(opts.key);
    const summary = summarizeExport(files);
    const proof = proveSavings(baseline, summary, { issuedAt: new Date().toISOString(), keypair: kp });
    ensureDir(path.dirname(opts.out));
    writeJSON(opts.out, proof);
    if (opts.json) {
      console.log(JSON.stringify(proof, null, 2));
      return;
    }
    const s = proof.savings;
    console.log("");
    console.log(rule());
    console.log(`  ${paint(c.gold + c.bold, "AskLedger")} ${paint(c.gray, "·")} ${paint(c.bold, "Verified savings proof")}`);
    console.log(rule());
    console.log("");
    console.log(`   ${paint(c.green + c.bold, fmtUsd(s.normalizedSavingsUsd))} ${paint(c.gray, "saved through efficiency")}  ${paint(c.gray, "(" + s.normalizedSavingsPct + "% lower blended rate)")}`);
    console.log("");
    console.log(`   ${paint(c.gray, "blended rate")}   ${paint(c.bold, fmtUsd(s.baselineRatePer1k) + "/1k")} ${paint(c.gray, "→")} ${paint(c.bold, fmtUsd(s.currentRatePer1k) + "/1k")}`);
    console.log(`   ${paint(c.gray, "raw spend")}      ${paint(c.bold, fmtUsd(proof.baseline.period.costUsd))} ${paint(c.gray, "→")} ${paint(c.bold, fmtUsd(proof.current.costUsd))}  ${paint(c.gray, "(moves with volume)")}`);
    console.log("");
    console.log(`   ${paint(c.green, "✓")} ${paint(c.gray, "signed · kid")} ${paint(c.bold, clean(kp.kid))}   ${paint(c.gray, "written to")} ${paint(c.gold, opts.out)}`);
    console.log(paint(c.gray, "   Anyone verifies it:  ledger-cli verify-savings " + opts.out + " --key <keypair.json>"));
    console.log("");
  });

program
  .command("verify-savings <proof>")
  .description("Independently verify a signed savings proof (signature + recomputed math)")
  .option("-k, --key <path>", "Keypair or public-key JSON (public_key is read)", `${KEYS_DIR}/default.json`)
  .action((proofPath: string, opts) => {
    const proof = readJSON<SavingsProof>(proofPath);
    const pub = readJSON<{ kid: string; public_key: string }>(opts.key);
    const res = verifySavingsProof(proof, { publicKeys: { [pub.kid]: pub.public_key } });
    console.log("");
    const mark = (ok: boolean) => (ok ? paint(c.green, "✓") : paint(c.red, "✗"));
    console.log(`  ${res.valid ? paint(c.green + c.bold, "VERIFIED") : paint(c.red + c.bold, "NOT VERIFIED")}${res.reason ? paint(c.gray, "  · " + clean(res.reason)) : ""}`);
    console.log(`   ${mark(res.checks.signature_valid)} signature valid`);
    console.log(`   ${mark(res.checks.baseline_hash_matches)} baseline untampered`);
    console.log(`   ${mark(res.checks.savings_math_matches)} savings math recomputed and matches`);
    if (res.valid) {
      console.log(`   ${paint(c.gray, "claim:")} ${paint(c.green + c.bold, fmtUsd(proof.savings.normalizedSavingsUsd))} ${paint(c.gray, "saved (" + proof.savings.normalizedSavingsPct + "% lower blended rate)")}`);
    }
    console.log("");
    process.exit(res.valid ? 0 : 1);
  });

program.parse();
