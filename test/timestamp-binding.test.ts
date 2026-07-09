import { describe, it, expect } from "vitest";
import {
  signReceiptWithStore,
  generateKeyPair,
  verifyReceipt,
  timestampReceipt,
  verifyReceiptTimestamps,
  StubTSAClient,
} from "../src/index.js";
import { MemoryChainStateStore } from "../src/chain-store.js";
import type { RawEvent } from "../src/types.js";

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

describe("timestamp binding", () => {
  it("attaches a token that binds to the receipt and verifies", async () => {
    const store = new MemoryChainStateStore();
    const signed = await signReceiptWithStore({ event: evt(), keypair: kp }, store);
    const stamped = await timestampReceipt(signed, new StubTSAClient("test-tsa"));

    const verdicts = verifyReceiptTimestamps(stamped);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].format).toBe("local");
    expect(verdicts[0].imprintMatches).toBe(true);

    const v = verifyReceipt(stamped, { publicKeys: keys });
    expect(v.checks.timestamp_imprint_matches).toBe(true);
    expect(v.valid).toBe(true);
  });

  it("catches a tampered receipt via the timestamp binding", async () => {
    const store = new MemoryChainStateStore();
    const signed = await signReceiptWithStore({ event: evt(), keypair: kp }, store);
    const stamped = await timestampReceipt(signed, new StubTSAClient());

    // tamper a payload field after stamping
    (stamped.receipt.event.payload as Record<string, unknown>).output_token_count = 99999;

    const verdicts = verifyReceiptTimestamps(stamped);
    expect(verdicts[0].imprintMatches).toBe(false);

    const v = verifyReceipt(stamped, { publicKeys: keys });
    expect(v.checks.timestamp_imprint_matches).toBe(false);
    expect(v.valid).toBe(false);
  });

  it("a receipt with no timestamps is unaffected (check stays undefined)", async () => {
    const store = new MemoryChainStateStore();
    const signed = await signReceiptWithStore({ event: evt(), keypair: kp }, store);
    const v = verifyReceipt(signed, { publicKeys: keys });
    expect(v.checks.timestamp_imprint_matches).toBeUndefined();
    expect(v.valid).toBe(true);
  });
});
