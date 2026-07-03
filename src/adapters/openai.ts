/**
 * OpenAI auto-capture adapter.
 *
 * Wraps any object shaped like the official `openai` SDK's
 * `chat.completions.create` so every call emits a signed receipt.
 *
 * The adapter accepts the OpenAI client as `any` so it works against
 * the runtime shape of the official SDK without taking a hard dependency
 * on a specific @openai/openai version.
 *
 * Usage:
 *
 *   import OpenAI from "openai";
 *   import { wrapOpenAI } from "@askledger/receipts-sdk/adapters/openai";
 *
 *   const client = wrapOpenAI(new OpenAI({ apiKey }), {
 *     tenantId: "acme-corp",
 *     keypair,
 *     onReceipt: async (r) => store.append(r),
 *   });
 *
 *   const resp = await client.chat.completions.create({...});
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

/**
 * Minimal shape of an OpenAI client that we touch. Real `openai` SDK
 * matches this; so do most compatible clients (LiteLLM, Groq, Together,
 * Mistral OpenAI-compatible endpoints).
 */
interface OpenAILikeClient {
  chat?: {
    completions?: {
      create: (params: Record<string, unknown>) => Promise<unknown>;
    };
  };
  embeddings?: {
    create: (params: Record<string, unknown>) => Promise<unknown>;
  };
}

export interface OpenAIAdapterOptions extends AdapterContext {
  /**
   * Override the vendor label written into receipts.
   * Useful when wrapping OpenAI-compatible providers (Groq, Together,
   * Mistral, Anyscale, LiteLLM Proxy) so vendor attribution stays honest.
   */
  vendorLabel?: string;
}

interface ReceiptAttachedResponse {
  x_ledger_receipt_id?: string;
  x_ledger_receipt?: SignedReceipt | null;
}

function safeText(x: unknown): string {
  if (typeof x === "string") return x;
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

/**
 * Wrap an OpenAI-like client. Returns the same client object with
 * `chat.completions.create` and `embeddings.create` replaced by
 * receipt-emitting wrappers. The wrapper preserves all original
 * behavior and arguments.
 */
export function wrapOpenAI<T extends OpenAILikeClient>(
  client: T,
  opts: OpenAIAdapterOptions
): T {
  const source = opts.sourceSystem ?? "adapter:openai";
  const vendor = opts.vendorLabel ?? "openai";

  if (client.chat?.completions?.create) {
    const original = client.chat.completions.create.bind(client.chat.completions);
    client.chat.completions.create = async (params: Record<string, unknown>) => {
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

      const inputCanonical = JSON.stringify(params.messages ?? params.input ?? params);
      const outputText = response
        ? safeText(
            (response as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]
              ?.message?.content ?? response
          )
        : "";

      const event: RawEvent = {
        schema_version: "1.0",
        tenant_id: opts.tenantId,
        event_type: "gateway.request",
        source_system: source,
        event_id: newEventId("openai"),
        captured_at: startedAt,
        context: {
          user_id: opts.userIdResolver?.(),
          environment: envLabel(opts),
        },
        subject: {
          ai_vendor: vendor,
          ai_model: String(params.model ?? "unknown"),
          ai_capability: "text-generation",
        },
        payload: {
          input_hash: sha256Hex(inputCanonical),
          input_classification: "internal",
          input_size_bytes: inputCanonical.length,
          output_hash: outputText ? sha256Hex(outputText) : undefined,
          output_classification: "internal",
          output_size_bytes: outputText.length,
          metadata: {
            latency_ms: t1 - t0,
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
  }

  if (client.embeddings?.create) {
    const original = client.embeddings.create.bind(client.embeddings);
    client.embeddings.create = async (params: Record<string, unknown>) => {
      const startedAt = new Date().toISOString();
      const t0 = Date.now();
      const response = await original(params);
      const t1 = Date.now();

      const inputCanonical = JSON.stringify(params.input ?? "");
      const event: RawEvent = {
        schema_version: "1.0",
        tenant_id: opts.tenantId,
        event_type: "gateway.request",
        source_system: source,
        event_id: newEventId("openai_embed"),
        captured_at: startedAt,
        context: {
          user_id: opts.userIdResolver?.(),
          environment: envLabel(opts),
        },
        subject: {
          ai_vendor: vendor,
          ai_model: String(params.model ?? "unknown"),
          ai_capability: "embedding",
        },
        payload: {
          input_hash: sha256Hex(inputCanonical),
          input_classification: "internal",
          input_size_bytes: inputCanonical.length,
          output_classification: "internal",
          metadata: { latency_ms: t1 - t0 },
        },
      };

      const receipt = await captureAndSign(opts, event);
      if (response && typeof response === "object") {
        (response as ReceiptAttachedResponse).x_ledger_receipt_id =
          receipt?.receipt.receipt_id;
        (response as ReceiptAttachedResponse).x_ledger_receipt = receipt;
      }
      return response;
    };
  }

  return client;
}
