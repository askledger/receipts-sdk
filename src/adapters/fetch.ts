/**
 * Generic fetch interceptor.
 *
 * Wraps any fetch implementation so that calls to known AI endpoints
 * automatically emit signed receipts. Works with:
 *   - OpenAI / Azure OpenAI / OpenAI-compatible providers (LiteLLM,
 *     Groq, Together, Mistral, DeepSeek, Fireworks, Anyscale)
 *   - Anthropic
 *   - Google Generative Language API (Gemini)
 *   - Amazon Bedrock (REST and Bedrock Runtime)
 *   - Cohere
 *   - Hugging Face Inference API
 *   - Vercel AI Gateway
 *   - Any custom endpoint matched by a user-supplied predicate
 *
 * Designed to be drop-in: `const fetch = withReceipts(globalThis.fetch, ctx);`
 *
 * The interceptor is conservative, if a request does not match a known
 * AI endpoint, it is passed through unchanged with zero overhead.
 */

import type { RawEvent, SignedReceipt } from "../types.js";
import {
  type AdapterContext,
  captureAndSign,
  envLabel,
  newEventId,
  sha256Hex,
} from "./common.js";

type FetchInput = string | URL | Request;
type FetchFn = (input: FetchInput, init?: RequestInit) => Promise<Response>;

interface EndpointPattern {
  vendor: string;
  match: (url: string) => boolean;
  /** Extract the model name from request body/headers if possible. */
  modelFrom?: (url: string, body: unknown) => string | undefined;
}

const DEFAULT_PATTERNS: EndpointPattern[] = [
  {
    vendor: "openai",
    match: (u) => /api\.openai\.com\/v1\/(chat\/completions|completions|embeddings|responses)/.test(u),
    modelFrom: (_u, body) => (body as { model?: string } | undefined)?.model,
  },
  {
    vendor: "azure-openai",
    match: (u) => /openai\.azure\.com\/.*\/(chat\/completions|completions|embeddings)/.test(u),
    modelFrom: (u) => {
      const m = u.match(/deployments\/([^\/]+)/);
      return m?.[1];
    },
  },
  {
    vendor: "anthropic",
    match: (u) => /api\.anthropic\.com\/v1\/messages/.test(u),
    modelFrom: (_u, body) => (body as { model?: string } | undefined)?.model,
  },
  {
    vendor: "google-generative-ai",
    match: (u) => /generativelanguage\.googleapis\.com\/.*\/models\//.test(u),
    modelFrom: (u) => {
      const m = u.match(/models\/([^:?]+)/);
      return m?.[1];
    },
  },
  {
    vendor: "bedrock",
    match: (u) => /bedrock(-runtime)?\.[a-z0-9-]+\.amazonaws\.com\/model\//.test(u),
    modelFrom: (u) => {
      const m = u.match(/model\/([^\/]+)/);
      return m?.[1] ? decodeURIComponent(m[1]) : undefined;
    },
  },
  {
    vendor: "cohere",
    match: (u) => /api\.cohere\.(com|ai)\/v(1|2)\/(chat|generate|embed)/.test(u),
    modelFrom: (_u, body) => (body as { model?: string } | undefined)?.model,
  },
  {
    vendor: "huggingface",
    match: (u) => /api-inference\.huggingface\.co\//.test(u),
    modelFrom: (u) => {
      const m = u.match(/api-inference\.huggingface\.co\/models\/([^\/?]+)/);
      return m?.[1];
    },
  },
  {
    vendor: "mistral",
    match: (u) => /api\.mistral\.ai\/v1\/(chat\/completions|embeddings)/.test(u),
    modelFrom: (_u, body) => (body as { model?: string } | undefined)?.model,
  },
  {
    vendor: "groq",
    match: (u) => /api\.groq\.com\/openai\/v1\//.test(u),
    modelFrom: (_u, body) => (body as { model?: string } | undefined)?.model,
  },
  {
    vendor: "together",
    match: (u) => /api\.together\.(ai|xyz)\/v1\//.test(u),
    modelFrom: (_u, body) => (body as { model?: string } | undefined)?.model,
  },
  {
    vendor: "vercel-ai-gateway",
    match: (u) => /gateway\.ai\.cloudflare\.com\//.test(u) || /ai-gateway\.vercel\.sh\//.test(u),
    modelFrom: (_u, body) => (body as { model?: string } | undefined)?.model,
  },
];

export interface FetchAdapterOptions extends AdapterContext {
  /** Add custom endpoint patterns (e.g. private LLM gateway). */
  extraPatterns?: EndpointPattern[];
  /** Disable specific built-in vendor patterns by name. */
  disableVendors?: string[];
  /** Underlying fetch to wrap. Defaults to globalThis.fetch. */
  baseFetch?: FetchFn;
}

interface ReceiptAttachedResponse extends Response {
  x_ledger_receipt_id?: string;
  x_ledger_receipt?: SignedReceipt | null;
}

async function readBody(init?: RequestInit): Promise<unknown> {
  const body = init?.body;
  if (!body) return undefined;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (body instanceof Uint8Array) {
    try {
      return JSON.parse(new TextDecoder().decode(body));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function bodyToCanonical(body: unknown): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function tryExtractOutputText(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return "";
  // OpenAI chat completions
  const choices = (parsed as { choices?: { message?: { content?: unknown } }[] }).choices;
  if (Array.isArray(choices) && choices[0]?.message?.content) {
    return String(choices[0].message.content);
  }
  // Anthropic
  const content = (parsed as { content?: Array<{ type?: string; text?: string }> }).content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c.type === "text" && typeof c.text === "string" ? c.text : ""))
      .join("");
  }
  // Generic single-string fields
  const single =
    (parsed as { output?: unknown; text?: unknown; generated_text?: unknown }).output ??
    (parsed as { text?: unknown }).text ??
    (parsed as { generated_text?: unknown }).generated_text;
  if (typeof single === "string") return single;
  return "";
}

/**
 * Wrap a fetch implementation. The returned function has the same
 * signature; non-AI calls pass through with no overhead.
 */
export function withReceipts(opts: FetchAdapterOptions): FetchFn {
  const base = opts.baseFetch ?? globalThis.fetch;
  if (!base) {
    throw new Error("No fetch available, pass baseFetch or run on Node >=18");
  }
  const patterns = [
    ...DEFAULT_PATTERNS.filter((p) => !opts.disableVendors?.includes(p.vendor)),
    ...(opts.extraPatterns ?? []),
  ];
  const source = opts.sourceSystem ?? "adapter:fetch";

  return async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    const pat = patterns.find((p) => p.match(url));
    if (!pat) {
      return base(input, init);
    }

    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const requestBody = await readBody(init);

    let response: Response;
    try {
      response = await base(input, init);
    } catch (e) {
      // Sign a "request errored" receipt for visibility
      const event: RawEvent = {
        schema_version: "1.0",
        tenant_id: opts.tenantId,
        event_type: "gateway.request",
        source_system: source,
        event_id: newEventId("fetch"),
        captured_at: startedAt,
        context: { environment: envLabel(opts), user_id: opts.userIdResolver?.() },
        subject: {
          ai_vendor: pat.vendor,
          ai_model: pat.modelFrom?.(url, requestBody) ?? "unknown",
          ai_capability: "text-generation",
        },
        payload: {
          input_hash: sha256Hex(bodyToCanonical(requestBody)),
          input_classification: "internal",
          input_size_bytes: bodyToCanonical(requestBody).length,
          metadata: {
            latency_ms: Date.now() - t0,
            error_occurred: true,
            error_message: String(e).slice(0, 500),
            url,
          },
        },
      };
      await captureAndSign(opts, event);
      throw e;
    }

    const t1 = Date.now();
    // Clone so consumers can still read the body
    const cloned = response.clone();
    let parsed: unknown = undefined;
    let outputText = "";
    try {
      const text = await cloned.text();
      try {
        parsed = JSON.parse(text);
        outputText = tryExtractOutputText(parsed);
      } catch {
        outputText = text;
      }
    } catch {
      // streaming response; we can still record the request
    }

    const event: RawEvent = {
      schema_version: "1.0",
      tenant_id: opts.tenantId,
      event_type: "gateway.request",
      source_system: source,
      event_id: newEventId("fetch"),
      captured_at: startedAt,
      context: { environment: envLabel(opts), user_id: opts.userIdResolver?.() },
      subject: {
        ai_vendor: pat.vendor,
        ai_model: pat.modelFrom?.(url, requestBody) ?? "unknown",
        ai_capability: "text-generation",
      },
      payload: {
        input_hash: sha256Hex(bodyToCanonical(requestBody)),
        input_classification: "internal",
        input_size_bytes: bodyToCanonical(requestBody).length,
        output_hash: outputText ? sha256Hex(outputText) : undefined,
        output_classification: "internal",
        output_size_bytes: outputText.length,
        metadata: {
          latency_ms: t1 - t0,
          status_code: response.status,
          url,
        },
      },
    };
    const receipt = await captureAndSign(opts, event);
    (response as ReceiptAttachedResponse).x_ledger_receipt_id =
      receipt?.receipt.receipt_id;
    (response as ReceiptAttachedResponse).x_ledger_receipt = receipt;
    return response;
  };
}
