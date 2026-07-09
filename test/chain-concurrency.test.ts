import { describe, it, expect } from "vitest";
import { signReceiptWithStore, generateKeyPair, verifyReceipt } from "../src/index.js";
import {
  MemoryChainStateStore,
  ConcurrentChainWriteError,
  type ChainStateStore,
} from "../src/chain-store.js";
import type { ChainState, RawEvent } from "../src/types.js";

const kp = generateKeyPair();
const keys = { [kp.kid]: kp.public_key };
const evt = (): RawEvent => ({
  schema_version: "1.0",
  tenant_id: "acme",
  event_type: "ai.generation",
  source_system: "test",
  event_id: "e1",
  captured_at: "2026-06-01T00:00:00.000Z",
  subject: { ai_vendor: "openai", ai_model: "gpt-5" },
  payload: { input_token_count: 10, output_token_count: 20 },
});

describe("concurrency-safe signing (no chain forks)", () => {
  it("MemoryChainStateStore CAS rejects a stale advance", async () => {
    const store = new MemoryChainStateStore();
    const s0 = await store.load("acme");
    await store.advance(s0, "a".repeat(64), "id-a"); // height 1
    await expect(store.advance(s0, "b".repeat(64), "id-b")).rejects.toBeInstanceOf(
      ConcurrentChainWriteError
    );
  });

  it("sequential signReceiptWithStore builds an unbroken chain", async () => {
    const store = new MemoryChainStateStore();
    const r1 = await signReceiptWithStore({ event: evt(), keypair: kp }, store);
    const r2 = await signReceiptWithStore({ event: evt(), keypair: kp }, store);
    const r3 = await signReceiptWithStore({ event: evt(), keypair: kp }, store);
    expect(r1.receipt.integrity.chain_height).toBe(1);
    expect(r2.receipt.integrity.chain_height).toBe(2);
    expect(r3.receipt.integrity.chain_height).toBe(3);
    // each links to its predecessor and independently verifies
    expect(r2.receipt.integrity.previous_receipt_hash).toBe(r1.receipt.integrity.receipt_hash);
    expect(r3.receipt.integrity.previous_receipt_hash).toBe(r2.receipt.integrity.receipt_hash);
    expect(verifyReceipt(r1, { publicKeys: keys }).valid).toBe(true);
    expect(verifyReceipt(r3, { previousReceipt: r2, publicKeys: keys }).valid).toBe(true);
  });

  it("retries and re-signs when a writer loses the race", async () => {
    // A store that fails the first advance with a concurrency error, forcing
    // signReceiptWithStore to reload and re-sign at the new head.
    const mem = new MemoryChainStateStore();
    let advanceCalls = 0;
    const flaky: ChainStateStore = {
      load: (t) => mem.load(t),
      advance: async (prev, h, id) => {
        advanceCalls++;
        if (advanceCalls === 1) {
          // simulate someone else advancing first, then reject this one
          await mem.advance(prev, "z".repeat(64), "other");
          throw new ConcurrentChainWriteError(prev.tenant_id, prev.chain_height + 1);
        }
        return mem.advance(prev, h, id);
      },
    };
    const r = await signReceiptWithStore({ event: evt(), keypair: kp }, flaky);
    expect(advanceCalls).toBe(2); // one failure + one success
    expect(r.receipt.integrity.chain_height).toBe(2); // signed at the new head, not 1
    expect(verifyReceipt(r, { publicKeys: keys }).valid).toBe(true);
  });

  it("rejects an unsafe integer at sign time (hash-collision guard)", async () => {
    const store = new MemoryChainStateStore();
    const bad = evt();
    (bad.payload as any).output_token_count = 9007199254740993; // 2^53 + 1
    await expect(
      signReceiptWithStore({ event: bad, keypair: kp }, store)
    ).rejects.toThrow(/unsafe integer/);
  });
});
