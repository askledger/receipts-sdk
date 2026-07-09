import { describe, it, expect } from "vitest";
import { signReceiptWithStore, verifyChain, generateKeyPair } from "../src/index.js";
import { MemoryChainStateStore } from "../src/chain-store.js";
import type { RawEvent, SignedReceipt } from "../src/types.js";

const kp = generateKeyPair();
const keys = { [kp.kid]: kp.public_key };
const at = "2026-06-01T00:00:00.000Z";

const evt = (tenant = "acme"): RawEvent => ({
  schema_version: "1.0",
  tenant_id: tenant,
  event_type: "ai.generation",
  source_system: "test",
  event_id: "e",
  captured_at: at,
  subject: { ai_vendor: "openai", ai_model: "gpt-5" },
  payload: { input_token_count: 10, output_token_count: 20 },
});

async function chainOf(n: number, tenant = "acme", store = new MemoryChainStateStore()): Promise<SignedReceipt[]> {
  const out: SignedReceipt[] = [];
  for (let i = 0; i < n; i++) out.push(await signReceiptWithStore({ event: evt(tenant), keypair: kp }, store));
  return out;
}

describe("Layer 1 — whole-chain verification", () => {
  it("verifies a full genesis-to-head chain", async () => {
    const chain = await chainOf(4);
    const r = verifyChain(chain, { publicKeys: keys });
    expect(r.valid).toBe(true);
    expect(r.completeFromGenesis).toBe(true);
    expect(r.length).toBe(4);
    expect(r.brokenAt).toBeNull();
  });

  it("verifies regardless of input order", async () => {
    const chain = await chainOf(4);
    const shuffled = [chain[2], chain[0], chain[3], chain[1]];
    expect(verifyChain(shuffled, { publicKeys: keys }).valid).toBe(true);
  });

  it("flags a tampered receipt and where the chain breaks", async () => {
    const chain = await chainOf(4);
    (chain[2].receipt.event.payload as Record<string, unknown>).output_token_count = 999999;
    const r = verifyChain(chain, { publicKeys: keys });
    expect(r.valid).toBe(false);
    expect(r.brokenAt).not.toBeNull();
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("detects a missing (dropped) receipt as a broken link", async () => {
    const chain = await chainOf(4);
    const withGap = [chain[0], chain[1], chain[3]]; // height 3 removed
    const r = verifyChain(withGap, { publicKeys: keys });
    expect(r.valid).toBe(false); // height 4 no longer contiguous with height 2
  });

  it("treats a partial slice as valid but not complete-from-genesis", async () => {
    const chain = await chainOf(4);
    const slice = [chain[1], chain[2], chain[3]]; // heights 2,3,4
    const r = verifyChain(slice, { publicKeys: keys });
    expect(r.valid).toBe(true);
    expect(r.completeFromGenesis).toBe(false);
  });

  it("rejects a chain that mixes tenants", async () => {
    const a = await chainOf(2, "acme");
    const b = await chainOf(1, "other");
    const r = verifyChain([...a, ...b], { publicKeys: keys });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/tenant/);
  });
});
