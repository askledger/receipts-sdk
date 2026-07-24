/**
 * Hardening tests for the LlamaIndex / Mastra / Vercel AI adapters.
 *
 * These are dependency-free (they duck-type each framework's callback shape),
 * so we drive the handler directly and assert it delivers a verifiable receipt
 * through ctx.onReceipt — the behavior that makes the adapter useful in a real
 * deployment (previously they signed and discarded).
 */
import { describe, it, expect } from "vitest";
import {
  plLlamaIndexHandler,
  plMastraListener,
  plReceiptsMiddleware,
} from "../src/adapters/index.js";
import { generateKeyPair, verifyReceipt } from "../src/index.js";
import type { AdapterContext } from "../src/adapters/common.js";
import type { SignedReceipt } from "../src/types.js";

function ctxCollecting(receipts: SignedReceipt[]): AdapterContext {
  return {
    tenantId: "acme",
    keypair: generateKeyPair(),
    onReceipt: (r) => { receipts.push(r); },
  };
}

const verifies = (r: SignedReceipt, ctx: AdapterContext) =>
  verifyReceipt(r, { publicKeys: { [ctx.keypair.kid]: ctx.keypair.public_key } }).valid;

describe("framework adapters deliver a verifiable receipt via onReceipt", () => {
  it("LlamaIndex handleLLMEnd", async () => {
    const receipts: SignedReceipt[] = [];
    const ctx = ctxCollecting(receipts);
    plLlamaIndexHandler(ctx).handleLLMEnd({
      input: "question",
      output: "answer",
      metadata: { vendor: "openai", model: "gpt-5", usage: { input_tokens: 10, output_tokens: 5 } },
      durationMs: 42,
    });
    await new Promise((r) => setTimeout(r, 15));
    expect(receipts.length).toBe(1);
    expect(receipts[0].receipt.event.subject?.ai_model).toBe("gpt-5");
    expect(verifies(receipts[0], ctx)).toBe(true);
  });

  it("Mastra onAgentStepComplete", async () => {
    const receipts: SignedReceipt[] = [];
    const ctx = ctxCollecting(receipts);
    plMastraListener(ctx).onAgentStepComplete({
      agentId: "agent-1",
      stepName: "plan",
      input: "x",
      output: "y",
      model: { provider: "anthropic", modelId: "claude-sonnet-4-6" },
      usage: { promptTokens: 3, completionTokens: 7 },
      latencyMs: 12,
    });
    await new Promise((r) => setTimeout(r, 15));
    expect(receipts.length).toBe(1);
    expect(receipts[0].receipt.event.subject?.ai_model).toBe("claude-sonnet-4-6");
    expect(verifies(receipts[0], ctx)).toBe(true);
  });

  it("Vercel AI wrapGenerate receipts the call and preserves the result", async () => {
    const receipts: SignedReceipt[] = [];
    const ctx = ctxCollecting(receipts);
    const result = await plReceiptsMiddleware(ctx).wrapGenerate({
      doGenerate: async () => ({ text: "hello", usage: { promptTokens: 4, completionTokens: 2 } }),
      params: { prompt: "hi" },
      model: { provider: "openai", modelId: "gpt-5" },
    });
    expect(result.text).toBe("hello"); // pass-through preserved
    await new Promise((r) => setTimeout(r, 15));
    expect(receipts.length).toBe(1);
    expect(receipts[0].receipt.event.subject?.ai_model).toBe("gpt-5");
    expect(verifies(receipts[0], ctx)).toBe(true);
  });
});
