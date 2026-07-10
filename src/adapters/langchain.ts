/**
 * LangChain.js callback handler.
 *
 * Drop into any LangChain chain or agent to emit a signed receipt on
 * every LLM call and every tool invocation:
 *
 *   import { ChatAnthropic } from "@langchain/anthropic";
 *   import { ReceiptsCallbackHandler } from "@askledger/receipts-sdk/adapters/langchain";
 *
 *   const handler = new ReceiptsCallbackHandler({ tenantId, keypair, onReceipt });
 *   const llm = new ChatAnthropic({ model, callbacks: [handler] });
 *
 * The handler implements the subset of LangChain's BaseCallbackHandler
 * interface most chains use. We do not import @langchain/core to keep
 * this adapter dependency-free; we duck-type the surface we need.
 */

import type { RawEvent } from "../types.js";
import {
  type AdapterContext,
  captureAndSign,
  envLabel,
  newEventId,
  sha256Hex,
} from "./common.js";

// Minimal LangChain types we touch, duck-typed to avoid coupling.
type Serialized = { id?: string[]; kwargs?: { model?: string; model_name?: string } };

export class ReceiptsCallbackHandler {
  // LangChain checks `name` and `awaitHandlers`.
  readonly name = "ReceiptsCallbackHandler";
  readonly awaitHandlers = true;

  private readonly llmStarts = new Map<string, { startedAt: string; t0: number }>();
  private readonly toolStarts = new Map<string, { startedAt: string; t0: number; name: string }>();

  constructor(private readonly ctx: AdapterContext) {}

  async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, unknown>,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _runName?: string
  ): Promise<void> {
    this.llmStarts.set(runId, { startedAt: new Date().toISOString(), t0: Date.now() });
    void llm;
    void prompts;
    void extraParams;
  }

  async handleChatModelStart(
    llm: Serialized,
    messages: unknown,
    runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, unknown>
  ): Promise<void> {
    this.llmStarts.set(runId, { startedAt: new Date().toISOString(), t0: Date.now() });
    void llm;
    void messages;
    void extraParams;
  }

  async handleLLMEnd(output: unknown, runId: string): Promise<void> {
    const start = this.llmStarts.get(runId);
    this.llmStarts.delete(runId);
    if (!start) return;

    const generations = (output as { generations?: Array<Array<{ text?: string }>> })
      .generations;
    const outputText = Array.isArray(generations)
      ? generations
          .flat()
          .map((g) => g?.text ?? "")
          .join("")
      : "";
    const llmOutput =
      (output as { llmOutput?: { tokenUsage?: { promptTokens?: number; completionTokens?: number } } })
        .llmOutput?.tokenUsage;

    const event: RawEvent = {
      schema_version: "1.0",
      tenant_id: this.ctx.tenantId,
      event_type: "gateway.request",
      source_system: this.ctx.sourceSystem ?? "adapter:langchain",
      event_id: newEventId("langchain_llm"),
      captured_at: start.startedAt,
      context: {
        user_id: this.ctx.userIdResolver?.(),
        environment: envLabel(this.ctx),
        correlation_id: runId,
      },
      subject: {
        ai_vendor: "langchain",
        ai_model: "via-langchain",
        ai_capability: "text-generation",
      },
      payload: {
        input_classification: "internal",
        output_hash: outputText ? sha256Hex(outputText) : undefined,
        output_classification: "internal",
        output_size_bytes: outputText.length,
        input_token_count: llmOutput?.promptTokens,
        output_token_count: llmOutput?.completionTokens,
        metadata: { latency_ms: Date.now() - start.t0 },
      },
    };

    await captureAndSign(this.ctx, event);
  }

  async handleToolStart(
    tool: Serialized,
    input: string,
    runId: string
  ): Promise<void> {
    const name = tool.id?.join(".") ?? "tool";
    this.toolStarts.set(runId, { startedAt: new Date().toISOString(), t0: Date.now(), name });
    void input;
  }

  async handleToolEnd(output: string, runId: string): Promise<void> {
    const start = this.toolStarts.get(runId);
    this.toolStarts.delete(runId);
    if (!start) return;
    const event: RawEvent = {
      schema_version: "1.0",
      tenant_id: this.ctx.tenantId,
      event_type: "agent.tool_call",
      source_system: this.ctx.sourceSystem ?? "adapter:langchain",
      event_id: newEventId("langchain_tool"),
      captured_at: start.startedAt,
      context: {
        user_id: this.ctx.userIdResolver?.(),
        environment: envLabel(this.ctx),
        correlation_id: runId,
      },
      subject: {
        ai_vendor: "langchain",
        ai_capability: "tool-use",
      },
      payload: {
        output_hash: output ? sha256Hex(output) : undefined,
        output_classification: "internal",
        output_size_bytes: output?.length ?? 0,
        metadata: { latency_ms: Date.now() - start.t0, tool_name: start.name },
      },
    };
    await captureAndSign(this.ctx, event);
  }
}
