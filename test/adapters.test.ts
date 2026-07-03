/**
 * Tests for the auto-capture adapters.
 *
 * We use fake clients shaped like the real ones (OpenAI, Anthropic) and
 * a mocked fetch. The tests verify:
 *   - a receipt is signed per AI call
 *   - the receipt carries correct vendor/model/event_type
 *   - the response object is augmented with x_ledger_receipt_id
 *   - errors from the wrapped client propagate unchanged
 */

import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  verifyReceipt,
  wrapOpenAI,
  wrapAnthropic,
  withReceipts,
  ReceiptsCallbackHandler,
  type SignedReceipt,
} from "../src/index.js";

describe("wrapOpenAI", () => {
  it("signs a receipt per chat.completions.create call", async () => {
    const kp = generateKeyPair();
    const signedReceipts: SignedReceipt[] = [];
    const fakeClient = {
      chat: {
        completions: {
          create: async (params: Record<string, unknown>) => ({
            choices: [{ message: { content: `Echo: ${params.model}` } }],
          }),
        },
      },
    };
    const wrapped = wrapOpenAI(fakeClient, {
      tenantId: "openai-test-" + Math.random().toString(36).slice(2),
      keypair: kp,
      onReceipt: (r) => {
        signedReceipts.push(r);
      },
    });
    const resp = await wrapped.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: "ping" }],
    });
    expect((resp as { x_ledger_receipt_id?: string }).x_ledger_receipt_id).toBeTruthy();
    expect(signedReceipts.length).toBe(1);
    const r = signedReceipts[0];
    expect(r.receipt.event.subject?.ai_vendor).toBe("openai");
    expect(r.receipt.event.subject?.ai_model).toBe("gpt-5");
    expect(
      verifyReceipt(r, { publicKeys: { [kp.kid]: kp.public_key } }).valid
    ).toBe(true);
  });

  it("propagates errors from the wrapped client", async () => {
    const kp = generateKeyPair();
    const fakeClient = {
      chat: {
        completions: {
          create: async () => {
            throw new Error("rate-limited");
          },
        },
      },
    };
    const wrapped = wrapOpenAI(fakeClient, {
      tenantId: "openai-err-" + Math.random().toString(36).slice(2),
      keypair: kp,
    });
    await expect(
      wrapped.chat.completions.create({ model: "gpt-5", messages: [] })
    ).rejects.toThrow("rate-limited");
  });
});

describe("wrapAnthropic", () => {
  it("signs a receipt per messages.create call", async () => {
    const kp = generateKeyPair();
    const signedReceipts: SignedReceipt[] = [];
    const fakeClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: "hi" }],
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: "end_turn",
        }),
      },
    };
    const wrapped = wrapAnthropic(fakeClient, {
      tenantId: "anth-test-" + Math.random().toString(36).slice(2),
      keypair: kp,
      onReceipt: (r) => signedReceipts.push(r),
    });
    await wrapped.messages.create({ model: "claude-sonnet-4-6", messages: [] });
    expect(signedReceipts.length).toBe(1);
    const r = signedReceipts[0];
    expect(r.receipt.event.subject?.ai_vendor).toBe("anthropic");
    expect(r.receipt.event.subject?.ai_model).toBe("claude-sonnet-4-6");
    expect(r.receipt.event.payload?.input_token_count).toBe(10);
    expect(r.receipt.event.payload?.output_token_count).toBe(5);
    expect(
      verifyReceipt(r, { publicKeys: { [kp.kid]: kp.public_key } }).valid
    ).toBe(true);
  });
});

describe("withReceipts fetch interceptor", () => {
  it("intercepts an OpenAI URL and emits a receipt", async () => {
    const kp = generateKeyPair();
    const signedReceipts: SignedReceipt[] = [];
    const upstream: typeof fetch = async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "hi" } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    const wrapped = withReceipts({
      tenantId: "fetch-" + Math.random().toString(36).slice(2),
      keypair: kp,
      baseFetch: upstream,
      onReceipt: (r) => signedReceipts.push(r),
    });
    const res = await wrapped("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-5", messages: [] }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    expect(signedReceipts.length).toBe(1);
    expect(signedReceipts[0].receipt.event.subject?.ai_vendor).toBe("openai");
    expect(signedReceipts[0].receipt.event.subject?.ai_model).toBe("gpt-5");
  });

  it("passes non-AI URLs through with no receipt", async () => {
    const kp = generateKeyPair();
    const signedReceipts: SignedReceipt[] = [];
    const upstream: typeof fetch = async () => new Response("hello", { status: 200 });
    const wrapped = withReceipts({
      tenantId: "fetch-pass-" + Math.random().toString(36).slice(2),
      keypair: kp,
      baseFetch: upstream,
      onReceipt: (r) => signedReceipts.push(r),
    });
    const res = await wrapped("https://example.com/index.html");
    expect(res.status).toBe(200);
    expect(signedReceipts.length).toBe(0);
  });

  it("matches Anthropic, Google, Bedrock URLs out-of-the-box", async () => {
    const kp = generateKeyPair();
    const upstream: typeof fetch = async () =>
      new Response(JSON.stringify({}), { status: 200 });
    const got: string[] = [];
    const wrapped = withReceipts({
      tenantId: "fetch-multi-" + Math.random().toString(36).slice(2),
      keypair: kp,
      baseFetch: upstream,
      onReceipt: (r) => {
        got.push(r.receipt.event.subject?.ai_vendor ?? "?");
      },
    });
    await wrapped("https://api.anthropic.com/v1/messages", {
      method: "POST",
      body: JSON.stringify({ model: "claude-sonnet-4-6" }),
    });
    await wrapped(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent",
      { method: "POST", body: JSON.stringify({}) }
    );
    await wrapped(
      "https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-sonnet/invoke",
      { method: "POST", body: JSON.stringify({}) }
    );
    expect(got).toEqual(["anthropic", "google-generative-ai", "bedrock"]);
  });
});

describe("ReceiptsCallbackHandler (LangChain)", () => {
  it("emits a receipt on handleLLMEnd", async () => {
    const kp = generateKeyPair();
    const signedReceipts: SignedReceipt[] = [];
    const h = new ReceiptsCallbackHandler({
      tenantId: "lc-" + Math.random().toString(36).slice(2),
      keypair: kp,
      onReceipt: (r) => signedReceipts.push(r),
    });
    await h.handleLLMStart({ id: ["x"] }, ["hello"], "run-1");
    await h.handleLLMEnd(
      { generations: [[{ text: "world" }]], llmOutput: { tokenUsage: { promptTokens: 3, completionTokens: 1 } } },
      "run-1"
    );
    expect(signedReceipts.length).toBe(1);
    expect(signedReceipts[0].receipt.event.payload?.output_token_count).toBe(1);
  });

  it("emits a receipt on handleToolEnd", async () => {
    const kp = generateKeyPair();
    const signedReceipts: SignedReceipt[] = [];
    const h = new ReceiptsCallbackHandler({
      tenantId: "lc-tool-" + Math.random().toString(36).slice(2),
      keypair: kp,
      onReceipt: (r) => signedReceipts.push(r),
    });
    await h.handleToolStart({ id: ["calculator"] }, "1+1", "run-2");
    await h.handleToolEnd("2", "run-2");
    expect(signedReceipts.length).toBe(1);
    expect(signedReceipts[0].receipt.event.event_type).toBe("agent.tool_call");
    expect(signedReceipts[0].receipt.event.payload?.metadata?.tool_name).toBe(
      "calculator"
    );
  });
});
