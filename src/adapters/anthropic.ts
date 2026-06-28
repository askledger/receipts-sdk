/**
 * Anthropic auto-capture adapter.
 *
 * Wraps any object shaped like the official @anthropic-ai/sdk client so
 * every messages.create call emits a signed receipt automatically.
 *
 * Usage:
 *
 *   import Anthropic from "@anthropic-ai/sdk";
 *   import { wrapAnthropic } from "@projectledger/receipts-sdk/adapters/anthropic";
 *
 *   const client = wrapAnthropic(new Anthropic({ apiKey }), {
 *     tenantId: "acme-corp",
 *     keypair,
 *     onReceipt: async (r) => store.append(r),
 *   });
 *
 *   const resp = await client.messages.create({...});
 *   // resp.x_ledger_receipt_id contains the receipt_id for correlation
 */

import type { RawEvent, SignedReceipt } from "../types.js";
import {
  type AdapterContext,
  captureAndSign,
  envLabel,
  newEventId,
  sha256Hex,
} from "./common.js";

interface AnthropicLikeClient {
  messages?: {
    create: (params: Record<string, unknown>) => Promise<unknown>;
  };
}

interface ReceiptAttachedResponse {
  x_ledger_receipt_id?: string;
  x_ledger_receipt?: SignedReceipt | null;
}

function extractText(resp: unknown): string {
  if (!resp || typeof resp !== "object") return "";
  const r = resp as { content?: Array<{ type?: string; text?: string }> };
  if (!Array.isArray(r.content)) return "";
  return r.content
    .map((c) => (c.type === "text" && typeof c.text === "string" ? c.text : ""))
    .join("");
}

export function wrapAnthropic<T extends AnthropicLikeClient>(
  client: T,
  opts: AdapterContext
): T {
  const source = opts.sourceSystem ?? "adapter:anthropic";
  if (!client.messages?.create) return client;

  const original = client.messages.create.bind(client.messages);
  client.messages.create = async (params: Record<string, unknown>) => {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    let response: unknown;
    let error: unknown;
    try {
      response = await original(params);
    } catch (e) {
      error = e;
    }
    const t1 = Date.now();

    const inputCanonical = JSON.stringify(params.messages ?? params);
    const outputText = response ? extractText(response) : "";
    const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } })
      ?.usage;

    const event: RawEvent = {
      schema_version: "1.0",
      tenant_id: opts.tenantId,
      event_type: "gateway.request",
      source_system: source,
      event_id: newEventId("anthropic"),
      captured_at: startedAt,
      context: {
        user_id: opts.userIdResolver?.(),
        environment: envLabel(opts),
      },
      subject: {
        ai_vendor: "anthropic",
        ai_model: String(params.model ?? "unknown"),
        ai_capability: "text-generation",
      },
      payload: {
        input_hash: sha256Hex(inputCanonical),
        input_classification: "internal",
        input_size_bytes: inputCanonical.length,
        input_token_count: usage?.input_tokens,
        output_hash: outputText ? sha256Hex(outputText) : undefined,
        output_classification: "internal",
        output_size_bytes: outputText.length,
        output_token_count: usage?.output_tokens,
        metadata: {
          latency_ms: t1 - t0,
          stop_reason: (response as { stop_reason?: string })?.stop_reason,
          error_occurred: error != null,
          ...(error != null && { error_message: String(error).slice(0, 500) }),
        },
      },
    };

    const receipt = await captureAndSign(opts, event);
    if (error) throw error;
    if (response && typeof response === "object") {
      (response as ReceiptAttachedResponse).x_ledger_receipt_id =
        receipt?.receipt.receipt_id;
      (response as ReceiptAttachedResponse).x_ledger_receipt = receipt;
    }
    return response;
  };

  return client;
}
