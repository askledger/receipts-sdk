// Cloudflare Worker that fronts any AI Gateway endpoint and emits a
// AskLedger receipt per call. Deploy with `wrangler publish`.
//
// Bindings expected:
//   PL_INGEST_URL   — ingest endpoint
//   PL_INGEST_TOKEN — bearer token
//   PL_TENANT       — tenant id

export interface Env {
  PL_INGEST_URL: string;
  PL_INGEST_TOKEN: string;
  PL_TENANT: string;
  UPSTREAM: string;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const upstreamUrl = new URL(url.pathname + url.search, env.UPSTREAM);

    const reqBody = await request.clone().text();
    const upstream = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : reqBody,
    });
    const respBody = await upstream.clone().text();

    ctx.waitUntil(emitReceipt(env, request, reqBody, upstream, respBody));
    return upstream;
  },
};

async function emitReceipt(env: Env, request: Request, reqBody: string, resp: Response, respBody: string): Promise<void> {
  try {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(reqBody); } catch { /* nothing */ }
    const model = String(parsed.model ?? "unknown");
    const promptText = JSON.stringify(parsed.messages ?? parsed.prompt ?? "");

    const event = {
      schema_version: "1.0",
      tenant_id: env.PL_TENANT,
      event_type: "gateway.request",
      source_system: "pl-cloudflare-worker",
      event_id: `cf-${Date.now()}-${(await sha256(promptText)).slice(0, 12)}`,
      captured_at: new Date().toISOString(),
      subject: { ai_vendor: model.toLowerCase().startsWith("claude") ? "anthropic" : model.toLowerCase().startsWith("gpt") ? "openai" : "openai-compatible", ai_model: model },
      payload: {
        input_hash: await sha256(promptText),
        output_hash: await sha256(respBody),
        http_status: resp.status,
        input_classification: "internal",
      },
    };
    await fetch(env.PL_INGEST_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.PL_INGEST_TOKEN}`, "x-pl-source": "cloudflare-worker" },
      body: JSON.stringify(event),
    });
  } catch { /* swallow */ }
}
