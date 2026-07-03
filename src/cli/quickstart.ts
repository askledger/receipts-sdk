// Interactive 60-second flow — first run of `pl quickstart` after
// install.sh finishes. The goal is one outcome: by the end the user
// has signed a real receipt, verified it, and has a public badge URL
// they can paste somewhere.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { generateKeyPair, signReceipt, verifyReceipt } from "../index.js";
import type { RawEvent } from "../types.js";

const HOME = process.env.PL_HOME ?? path.join(os.homedir(), ".askledger");
const KEYS_DIR = path.join(HOME, "keys");
const KEY_FILE = path.join(KEYS_DIR, "default.json");
const RECEIPT_FILE = path.join(HOME, "first-receipt.json");

function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }

function color(c: number, s: string): string { return `\x1b[${c}m${s}\x1b[0m`; }
const green = (s: string) => color(32, s);
const dim   = (s: string) => color(2, s);
const bold  = (s: string) => color(1, s);

export async function quickstart(): Promise<number> {
  process.stdout.write(`\n${bold("AskLedger · quickstart")}\n`);
  process.stdout.write(`${dim("────────────────────────────────")}\n\n`);

  ensureDir(KEYS_DIR);

  // 1. Key. Reuse if present, otherwise generate.
  let kp;
  if (fs.existsSync(KEY_FILE)) {
    kp = JSON.parse(fs.readFileSync(KEY_FILE, "utf-8"));
    process.stdout.write(`${green("✓")} key  kid=${kp.kid} (reused)\n`);
  } else {
    kp = generateKeyPair();
    fs.writeFileSync(KEY_FILE, JSON.stringify(kp, null, 2), { mode: 0o600 });
    process.stdout.write(`${green("✓")} key  kid=${kp.kid} written to ${dim(KEY_FILE)}\n`);
  }

  // 2. Sample event.
  const sample: RawEvent = {
    schema_version: "1.0",
    tenant_id: `quickstart-${Math.random().toString(36).slice(2, 8)}`,
    event_type: "ai.model_invocation",
    source_system: "pl-quickstart",
    event_id: `qs-${Date.now()}`,
    captured_at: new Date().toISOString(),
    subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
    payload: { input_token_count: 42, output_token_count: 128, input_classification: "internal" },
  };

  const signed = signReceipt({ event: sample, keypair: kp });
  fs.writeFileSync(RECEIPT_FILE, JSON.stringify(signed, null, 2));
  process.stdout.write(`${green("✓")} sign signed receipt_id=${signed.receipt.receipt_id}\n`);
  process.stdout.write(`         hash=${signed.receipt.integrity.receipt_hash.slice(0, 16)}...\n`);

  // 3. Verify locally.
  const v = verifyReceipt(signed, { publicKeys: { [kp.kid]: kp.public_key } });
  if (!v.valid) {
    process.stdout.write(`${color(31, "✗")} verify failed: ${v.errors.join(", ")}\n`);
    return 1;
  }
  process.stdout.write(`${green("✓")} verify locally · OK\n`);

  // 4. Badge URL.
  const badge = `https://askledger.github.io/receipts-sdk/verify.html/?receipt_id=${encodeURIComponent(signed.receipt.receipt_id)}`;
  process.stdout.write(`\n${bold("Receipt saved at")} ${dim(RECEIPT_FILE)}\n`);
  process.stdout.write(`${bold("Badge URL")}        ${badge}\n\n`);

  process.stdout.write(`Try it next: ${dim("pl sign --event your-events.json")}\n`);
  return 0;
}
