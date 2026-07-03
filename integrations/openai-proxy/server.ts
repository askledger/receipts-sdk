// Universal OpenAI-compatible receipts proxy.
//
//   pl proxy start --listen 0.0.0.0:4000 --upstream https://api.openai.com
//
// Any tool that respects HTTPS_PROXY or has a configurable base URL —
// Aider, Cline, Windsurf, Codeium, Tabnine, Sourcegraph Cody, Zed,
// Continue, the OpenAI SDK itself — can be routed through this proxy
// and immediately produces signed receipts for every call.
//
// One install covers the entire OpenAI-compatible IDE surface. The
// proxy preserves streaming, request headers, request bodies, and
// response codes unchanged.

import * as http from "node:http";
import * as https from "node:https";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { URL } from "node:url";
import { signReceipt } from "../../src/receipt.js";
import { sha256String, generateKeyPair } from "../../src/crypto.js";
import type { KeyPair, RawEvent, SignedReceipt } from "../../src/types.js";

interface ProxyOptions {
  listen: { host: string; port: number };
  upstream: string;
  tenantId: string;
  ingestUrl?: string;
  ingestToken?: string;
  keypair?: KeyPair;
}

export function startProxy(opts: ProxyOptions): http.Server {
  const upstream = new URL(opts.upstream);
  const kp = opts.keypair ?? loadOrCreateKey();

  const server = http.createServer((req, res) => handle(req, res, opts, upstream, kp));
  server.listen(opts.listen.port, opts.listen.host, () => {
    // eslint-disable-next-line no-console
    console.log(`[pl-proxy] :${opts.listen.port} -> ${opts.upstream}  tenant=${opts.tenantId}  kid=${kp.kid}`);
  });
  return server;
}

function loadOrCreateKey(): KeyPair {
  const home = process.env.PL_HOME ?? path.join(os.homedir(), ".askledger");
  const file = path.join(home, "keys", "openai-proxy.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8")) as KeyPair;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const kp = generateKeyPair();
  fs.writeFileSync(file, JSON.stringify(kp, null, 2), { mode: 0o600 });
  return kp;
}

function handle(req: http.IncomingMessage, res: http.ServerResponse, opts: ProxyOptions, upstream: URL, kp: KeyPair): void {
  const reqChunks: Buffer[] = [];
  req.on("data", (c: Buffer) => reqChunks.push(c));
  req.on("end", () => {
    const reqBody = Buffer.concat(reqChunks);
    const t0 = performance.now();

    const upstreamReq = (upstream.protocol === "https:" ? https : http).request({
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === "https:" ? 443 : 80),
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: upstream.host },
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      const resChunks: Buffer[] = [];
      upstreamRes.on("data", (c: Buffer) => { res.write(c); resChunks.push(c); });
      upstreamRes.on("end", async () => {
        res.end();
        const latencyMs = Math.round(performance.now() - t0);
        const event = buildEvent({
          method: req.method ?? "GET",
          url: req.url ?? "/",
          requestBody: reqBody,
          responseBody: Buffer.concat(resChunks),
          statusCode: upstreamRes.statusCode ?? 0,
          latencyMs,
          tenantId: opts.tenantId,
          requestId: String(upstreamRes.headers["x-request-id"] ?? upstreamRes.headers["openai-request-id"] ?? ""),
        });
        if (!event) return; // not a chat/completions/embedding call
        try {
          const receipt = signReceipt({ event, keypair: kp });
          await ship(receipt, opts);
        } catch {
          // never break the proxied response on a receipt failure
        }
      });
    });

    upstreamReq.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    upstreamReq.write(reqBody);
    upstreamReq.end();
  });
}

function buildEvent(args: {
  method: string;
  url: string;
  requestBody: Buffer;
  responseBody: Buffer;
  statusCode: number;
  latencyMs: number;
  tenantId: string;
  requestId: string;
}): RawEvent | null {
  if (!args.url.includes("/chat/completions") && !args.url.includes("/completions") && !args.url.includes("/embeddings")) return null;

  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(args.requestBody.toString("utf-8")) as Record<string, unknown>; } catch { /* allow */ }

  const model = String(parsed.model ?? "unknown");
  const vendor = guessVendor(model);
  const inputText = pickPromptText(parsed);
  const outputText = extractCompletion(args.responseBody);

  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const r = JSON.parse(args.responseBody.toString("utf-8")) as { usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number } };
    inputTokens = Number(r.usage?.prompt_tokens ?? r.usage?.input_tokens ?? 0);
    outputTokens = Number(r.usage?.completion_tokens ?? r.usage?.output_tokens ?? 0);
  } catch { /* streaming or non-JSON */ }

  return {
    schema_version: "1.0",
    tenant_id: args.tenantId,
    event_type: args.url.includes("/embeddings") ? "ai.embedding"
              : args.statusCode >= 400 ? "ai.invocation_error"
              : "ai.model_invocation",
    source_system: "pl-openai-proxy",
    event_id: `proxy-${Date.now()}-${args.requestId || sha256String(inputText).slice(0, 12)}`,
    captured_at: new Date().toISOString(),
    subject: { ai_vendor: vendor, ai_model: model },
    payload: {
      input_hash: sha256String(inputText),
      output_hash: sha256String(outputText),
      input_token_count: inputTokens,
      output_token_count: outputTokens,
      latency_ms: args.latencyMs,
      http_status: args.statusCode,
      input_classification: "internal",
    },
  };
}

function pickPromptText(req: Record<string, unknown>): string {
  if (Array.isArray(req.messages)) {
    return (req.messages as Array<{ content?: string }>).map((m) => m.content ?? "").join("\n");
  }
  if (typeof req.prompt === "string") return req.prompt;
  if (typeof req.input === "string") return req.input;
  if (Array.isArray(req.input)) return (req.input as unknown[]).map(String).join("\n");
  return "";
}

function extractCompletion(body: Buffer): string {
  try {
    const r = JSON.parse(body.toString("utf-8")) as { choices?: Array<{ message?: { content?: string }; text?: string }> };
    return r.choices?.[0]?.message?.content ?? r.choices?.[0]?.text ?? "";
  } catch {
    // Streaming SSE — concatenate `data:` lines.
    return body.toString("utf-8").split("\n")
      .filter((l) => l.startsWith("data:") && !l.includes("[DONE]"))
      .map((l) => { try { const j = JSON.parse(l.slice(5).trim()) as { choices?: Array<{ delta?: { content?: string } }> }; return j.choices?.[0]?.delta?.content ?? ""; } catch { return ""; } })
      .join("");
  }
}

function guessVendor(model: string): string {
  const m = model.toLowerCase();
  if (m.startsWith("claude") || m.includes("anthropic")) return "anthropic";
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return "openai";
  if (m.includes("gemini")) return "google";
  if (m.includes("bedrock")) return "aws-bedrock";
  if (m.includes("llama")) return "meta";
  if (m.includes("mistral")) return "mistral";
  return "openai-compatible";
}

async function ship(receipt: SignedReceipt, opts: ProxyOptions): Promise<void> {
  if (!opts.ingestUrl) return;
  try {
    await fetch(opts.ingestUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(opts.ingestToken ? { authorization: `Bearer ${opts.ingestToken}` } : {}),
        "x-pl-source": "openai-proxy",
      },
      body: JSON.stringify(receipt),
    });
  } catch { /* queue would go here */ }
}
