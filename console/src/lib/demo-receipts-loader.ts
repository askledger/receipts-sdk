// Load build-time-generated demo receipts. The console's prebuild step
// (console/scripts/generate-demo-receipts.mjs) writes real Ed25519-signed
// receipts to demo-receipts.json. This loader exposes them to fixture
// pages. If the file doesn't exist yet (fresh clone, npm run build not
// yet executed), the loader degrades gracefully to placeholder ids.

type Decision = "allow" | "block" | "flag" | "pending";

export interface DemoReceipt {
  receipt_id: string;
  chain_height: number;
  receipt_hash: string;
  previous_receipt_hash: string;
  kid: string;
  signature_b64: string;
  issued_at: string;
  user: string;
  team: string;
  vendor: string;
  model: string;
  decision: Decision;
  policy: string[];
  time_hhmm: string;
}

export interface DemoBundle {
  schema_version: string;
  generated_at: string;
  tenant_id: string;
  kid: string;
  public_key_b64: string;
  algorithm: string;
  curve: string;
  count: number;
  receipts: DemoReceipt[];
}

let cached: DemoBundle | null = null;

export function loadDemoReceipts(): DemoBundle {
  if (cached) return cached;
  try {
    // Synchronous JSON import via require so this works in the Next
    // build pipeline without needing import-assertions config.
    const bundle = (require("./demo-receipts.json") as DemoBundle);
    cached = bundle;
    return bundle;
  } catch {
    const placeholder: DemoBundle = {
      schema_version: "1.0",
      generated_at: new Date().toISOString(),
      tenant_id: "askledger-demo",
      kid: "demo-kid-not-yet-generated",
      public_key_b64: "",
      algorithm: "EdDSA",
      curve: "ed25519",
      count: 0,
      receipts: [],
    };
    cached = placeholder;
    return placeholder;
  }
}

export function getDemoReceipt(index: number): DemoReceipt | null {
  const bundle = loadDemoReceipts();
  return bundle.receipts[index] ?? null;
}
