// Ingest an EXISTING provider usage export (no instrumentation, no receipts)
// and turn it into the receipt shape the dashboard engine already understands.
// This is the "read the bill they already have" front door: a team that has
// never emitted an AskLedger receipt can still get a wasted-spend number from a
// file they can already download (OpenAI/Anthropic usage export, or any gateway
// log flattened to the same fields).
import type { SignedReceipt } from "../types.js";

// Only a DATED or VERSIONED tail may follow a recognized tier name. Digits,
// dots, dashes and underscores are version noise; letters are a different
// product.
const VERSION_TAIL = /^[\d._-]*$/;

// True when `s` contains `base` AND everything after it is version noise.
//
// The tests used to be unanchored substring matches, which quietly collapsed
// PREMIUM variants onto the base tier's price: "gpt-5-pro" was billed as
// "openai:gpt-5" and "claude-opus-4-6-thinking" as "anthropic:claude-opus-4-6",
// under-billing every downstream figure (spend, blended rate, savings) on
// exactly the workloads that cost the most. The module comment always claimed
// the collapse was for "dated snapshots and versioned names" only; this makes
// the behavior match the claim. An unrecognized variant now falls through to
// vendor "unknown", where it is reported as unpriced rather than mispriced.
function tierMatch(s: string, base: RegExp): boolean {
  const m = s.match(base);
  return m ? VERSION_TAIL.test(s.slice(m.index! + m[0].length)) : false;
}

// Map a provider's model / snapshot id onto a "vendor:model" the pricing table
// knows. Dated snapshots (gpt-5-2025-08-01) and versioned names collapse to the
// base model so the counterfactual cost is real; premium variants do not.
// Order matters: the most specific patterns (…-mini) are tested first.
export function normalizeModel(raw: string): { vendor: string; model: string } {
  const s = String(raw ?? "").toLowerCase();
  if (tierMatch(s, /gpt-5-nano/)) return { vendor: "openai", model: "gpt-5-nano" };
  if (tierMatch(s, /gpt-5-mini/)) return { vendor: "openai", model: "gpt-5-mini" };
  if (tierMatch(s, /gpt-5/)) return { vendor: "openai", model: "gpt-5" };
  if (tierMatch(s, /gpt-4o-mini/)) return { vendor: "openai", model: "gpt-4o-mini" };
  if (tierMatch(s, /gpt-4o/)) return { vendor: "openai", model: "gpt-4o" };
  if (tierMatch(s, /opus/)) return { vendor: "anthropic", model: "claude-opus-4-6" };
  if (tierMatch(s, /sonnet/)) return { vendor: "anthropic", model: "claude-sonnet-4-6" };
  if (tierMatch(s, /haiku/)) return { vendor: "anthropic", model: "claude-haiku-4-5" };
  // Google's tier word trails the version ("gemini-2.5-flash"), so the tier
  // word itself is part of the match rather than tail noise.
  if (tierMatch(s, /gemini[\w.-]*flash/)) return { vendor: "google", model: "gemini-2-5-flash" };
  if (tierMatch(s, /gemini[\w.-]*pro/)) return { vendor: "google", model: "gemini-2-5-pro" };
  if (tierMatch(s, /gemini/)) return { vendor: "google", model: "gemini-2-5-pro" };
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

// First candidate that is a non-empty string (numbers are stringified). Unlike
// `??`, this skips "" so an empty snapshot_id does not shadow a real model.
function firstStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim() !== "") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

// First candidate that parses to a positive finite number. Unlike `??`, this
// skips a present-but-zero field (e.g. n_requests: 0) that should fall through.
function firstNum(...vals: unknown[]): number {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
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
    const modelRaw = firstStr(r.snapshot_id, r.model, r.model_id);
    const requests = firstNum(r.n_requests, r.requests, r.count);
    if (requests <= 0) continue;
    const inputTotal = firstNum(
      r.n_context_tokens_total, r.input_tokens, r.prompt_tokens, r.context_tokens
    );
    const outputTotal = firstNum(
      r.n_generated_tokens_total, r.output_tokens, r.completion_tokens, r.generated_tokens
    );
    const { vendor, model } = normalizeModel(modelRaw);
    out.push({
      vendor,
      model,
      app: firstStr(r.api_key_name, r.workspace, r.project, r.project_id, r.api_key, r.app) || "unknown",
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
  /** true when the bill exceeded the cap and had to be downsampled */
  sampled: boolean;
  /**
   * Residual distortion this expansion still carries, as a fraction (0 = exact).
   *
   * Token totals are now split EXACTLY across the emitted receipts, so an
   * un-downsampled bill is exact and this is 0. When downsampling, the
   * max(1, …) floor keeps tiny rows alive and so over-weights them relative to
   * the single global `scale`; this reports how far the scaled request count
   * can drift, rather than leaving it silent.
   */
  requestCountResidual: number;
}

/**
 * Split `total` tokens across `n` receipts so the parts sum to EXACTLY `total`.
 *
 * The old code gave every receipt Math.round(total / requests). A row of 1,000
 * requests / 1,500 input / 1,500 output rounded 1.5 up to 2 on both classes and
 * reported 4,000 tokens and $0.0400 where the truth was 3,000 and $0.0300, a
 * 33% overstatement, and the error was one-directional for any row averaging
 * just above a half-token. Cumulative-floor differencing carries no residual at
 * all while keeping the per-receipt values within one token of the true mean,
 * so the over-tiering gate still sees the row's real shape.
 */
function splitEvenly(total: number, n: number, i: number): number {
  if (n <= 0) return 0;
  return Math.floor(((i + 1) * total) / n) - Math.floor((i * total) / n);
}

// Expand normalized workloads into per-request receipts (unsigned, imported
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
  const live = workloads.filter((w) => w.requests > 0);
  const totalRequests = live.reduce((s, w) => s + w.requests, 0);
  const sampled = totalRequests > cap;
  const targetScale = sampled ? totalRequests / cap : 1;

  // Pass 1: how many receipts each row emits, and the scale that recovers real
  // totals from them. The max(1, …) floor keeps a tiny row from vanishing.
  const counts = live.map((w) => Math.max(1, Math.round(w.requests / targetScale)));
  const emitted = counts.reduce((s, n) => s + n, 0);
  // Recovery factor = real requests / receipts ACTUALLY emitted. The max(1, …)
  // floor means a "wide" bill (many tiny rows) emits ~every row, so a fixed
  // totalRequests/cap would over-inflate scaled totals in a signed artifact.
  // Deriving scale from the real emitted count keeps total request scaling exact.
  const scale = emitted > 0 ? totalRequests / emitted : 1;

  // Pass 2: emit. Each row's token totals are divided down by `scale` and then
  // split exactly across its receipts, so summarize(receipts) * scale recovers
  // the row's real tokens and dollars regardless of the floor above. Only the
  // per-row REQUEST count can still drift, and that drift is reported.
  const receipts: SignedReceipt[] = [];
  let idx = 0;
  let requestDrift = 0;
  for (let k = 0; k < live.length; k++) {
    const w = live[k];
    const n = counts[k];
    const inShare = Math.round(w.inputTotal / scale);
    const outShare = Math.round(w.outputTotal / scale);
    requestDrift += Math.abs(n * scale - w.requests);
    for (let i = 0; i < n; i++) {
      receipts.push(mkReceipt(w, splitEvenly(inShare, n, i), splitEvenly(outShare, n, i), idx++));
    }
  }
  return {
    receipts,
    totalRequests,
    scale,
    sampled,
    requestCountResidual: totalRequests > 0 ? requestDrift / (2 * totalRequests) : 0,
  };
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
    signatures: [], // imported from a bill, unsigned. Signing at capture is Pro.
  } as SignedReceipt;
}
