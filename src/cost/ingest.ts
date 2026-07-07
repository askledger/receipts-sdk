// Ingest an EXISTING provider usage export (no instrumentation, no receipts)
// and turn it into the receipt shape the dashboard engine already understands.
// This is the "read the bill they already have" front door: a team that has
// never emitted an AskLedger receipt can still get a wasted-spend number from a
// file they can already download (OpenAI/Anthropic usage export, or any gateway
// log flattened to the same fields).
import type { SignedReceipt } from "../types.js";

// Map a provider's model / snapshot id onto a "vendor:model" the pricing table
// knows. Dated snapshots (gpt-5-2025-08-01) and versioned names all collapse to
// the base model so the counterfactual cost is real. Order matters: the most
// specific patterns (…-mini) are tested first.
export function normalizeModel(raw: string): { vendor: string; model: string } {
  const s = String(raw ?? "").toLowerCase();
  if (/gpt-5-mini/.test(s)) return { vendor: "openai", model: "gpt-5-mini" };
  if (/gpt-5/.test(s)) return { vendor: "openai", model: "gpt-5" };
  if (/gpt-4o/.test(s)) return { vendor: "openai", model: "gpt-4o" };
  if (/opus/.test(s)) return { vendor: "anthropic", model: "claude-opus-4-6" };
  if (/sonnet/.test(s)) return { vendor: "anthropic", model: "claude-sonnet-4-6" };
  if (/haiku/.test(s)) return { vendor: "anthropic", model: "claude-haiku-4-5" };
  if (/gemini.*flash/.test(s)) return { vendor: "google", model: "gemini-2-5-flash" };
  if (/gemini/.test(s)) return { vendor: "google", model: "gemini-2-5-pro" };
  return { vendor: "unknown", model: s.replace(/[^a-z0-9._-]/g, "") || "unknown" };
}

// A normalized usage row: one (model × app × period) bucket from an export.
export interface Workload {
  vendor: string;
  model: string;
  app: string;
  requests: number;
  inputTotal: number;
  outputTotal: number;
  at: string; // ISO
}

function iso(v: unknown): string {
  if (v == null) return "1970-01-01T00:00:00.000Z";
  if (typeof v === "number") {
    // epoch seconds (OpenAI) vs milliseconds
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  const s = String(v);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00Z` : s);
  return isNaN(d.getTime()) ? "1970-01-01T00:00:00.000Z" : d.toISOString();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Parse one export document (JSON text) into normalized workload rows. Accepts
// a top-level array, or an object wrapping the rows under data/usage/results.
// Recognizes OpenAI's usage shape (snapshot_id / n_requests / n_*_tokens_total)
// and Anthropic-style rows (model / requests / input_tokens / output_tokens).
export function parseUsageExport(text: string): Workload[] {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error("usage export is not valid JSON");
  }
  const rows: any[] = Array.isArray(doc)
    ? doc
    : ((doc as any)?.data ?? (doc as any)?.usage ?? (doc as any)?.results ?? []);
  const out: Workload[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const modelRaw = r.snapshot_id ?? r.model ?? r.model_id ?? "";
    const requests = num(r.n_requests ?? r.requests ?? r.count);
    if (requests <= 0) continue;
    const inputTotal = num(
      r.n_context_tokens_total ?? r.input_tokens ?? r.prompt_tokens ?? r.context_tokens
    );
    const outputTotal = num(
      r.n_generated_tokens_total ?? r.output_tokens ?? r.completion_tokens ?? r.generated_tokens
    );
    const { vendor, model } = normalizeModel(modelRaw);
    out.push({
      vendor,
      model,
      app: String(r.api_key_name ?? r.workspace ?? r.project ?? r.project_id ?? r.api_key ?? r.app ?? "unknown"),
      requests,
      inputTotal,
      outputTotal,
      at: iso(r.aggregation_timestamp ?? r.date ?? r.timestamp ?? r.bucket),
    });
  }
  return out;
}

export interface IngestResult {
  receipts: SignedReceipt[];
  totalRequests: number; // real request count from the export
  scale: number; // multiply displayed $ / counts by this to undo downsampling (>= 1)
}

// Expand normalized workloads into per-request receipts (unsigned — imported
// from a bill, not signed at capture; signing is the Pro upgrade). Each receipt
// carries the row's AVERAGE tokens so the over-tiering gate (avg output, avg
// input) sees the true shape. Very large bills are uniformly downsampled to
// `maxReceipts` to bound memory; the returned `scale` recovers the real totals
// (uniform sampling + per-receipt averages preserved => exact linear scaling).
export function receiptsFromWorkloads(
  workloads: Workload[],
  opts: { maxReceipts?: number } = {}
): IngestResult {
  const cap = opts.maxReceipts ?? 200_000;
  const totalRequests = workloads.reduce((s, w) => s + w.requests, 0);
  const scale = totalRequests > cap ? totalRequests / cap : 1;
  const receipts: SignedReceipt[] = [];
  let idx = 0;
  for (const w of workloads) {
    if (w.requests <= 0) continue;
    const inAvg = Math.round(w.inputTotal / w.requests);
    const outAvg = Math.round(w.outputTotal / w.requests);
    const n = Math.max(1, Math.round(w.requests / scale));
    for (let i = 0; i < n; i++) {
      receipts.push(mkReceipt(w, inAvg, outAvg, idx++));
    }
  }
  return { receipts, totalRequests, scale };
}

export function receiptsFromExport(
  text: string,
  opts?: { maxReceipts?: number }
): IngestResult {
  return receiptsFromWorkloads(parseUsageExport(text), opts);
}

function mkReceipt(w: Workload, inAvg: number, outAvg: number, i: number): SignedReceipt {
  const id = `imported-${w.app}-${w.model}-${i}`;
  return {
    receipt: {
      schema_version: "1.0",
      receipt_id: id,
      tenant_id: "imported",
      issued_at: w.at,
      event: {
        schema_version: "1.0",
        tenant_id: "imported",
        event_type: "ai.generation",
        source_system: w.app,
        event_id: `e-${id}`,
        captured_at: w.at,
        context: { environment: "production" },
        subject: { ai_vendor: w.vendor, ai_model: w.model },
        payload: { input_token_count: inAvg, output_token_count: outAvg },
      },
      integrity: {
        previous_receipt_hash: "0".repeat(64),
        receipt_hash: "0".repeat(64),
        chain_height: 1,
      },
    },
    signatures: [], // imported from a bill — unsigned. Signing at capture is Pro.
  } as SignedReceipt;
}
