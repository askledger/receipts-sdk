// Natural-language query over signed receipts.
//
// Anyone can ask a plain-English question ("show me every blocked loan
// decision on opus last week", "how much did gpt-5 cost by app?") and get an
// answer that is ALWAYS grounded in real receipts, every result carries the
// receipt ids it came from, so the answer stays independently verifiable. The
// parser here is deterministic and offline (free, no API key); an optional
// LLM mode (see ./llm) handles free-form phrasing but still only produces a
// StructuredQuery, it never invents data.
//
// Honesty boundary: the NL layer decides WHICH receipts to show and how to
// summarize them. It does not assert anything the receipts don't already say,
// and it reports how it interpreted the question so a reader can check it.

import { priceFor, costUsd } from "../cost/pricing.js";
import type { SignedReceipt, DecisionVerdict, Classification } from "../types.js";

export interface ReceiptRow {
  id: string;
  tenant: string;
  capturedAt: string; // event.captured_at (falls back to issued_at)
  vendor: string | null;
  model: string | null;
  app: string; // event.source_system
  eventType: string;
  environment: string | null;
  decision: DecisionVerdict | null;
  reasonCodes: string[];
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number; // estimated; 0 when unpriced
  priced: boolean;
  inputClass: Classification | null;
  outputClass: Classification | null;
  evidenceRefs: number;
  chainHeight: number | null;
  signed: boolean;
  raw: SignedReceipt;
}

/** Flatten a signed receipt into a query-friendly row (same cost model as the dashboard). */
export function flattenReceipt(sr: SignedReceipt): ReceiptRow {
  const r = sr.receipt;
  const ev = r.event ?? ({} as NonNullable<typeof r.event>);
  const subject = ev.subject;
  const payload = ev.payload;
  const model = subject?.ai_model ?? null;
  const vendor = subject?.ai_vendor ?? null;
  const inputTokens = payload?.input_token_count ?? 0;
  const outputTokens = payload?.output_token_count ?? 0;
  const price = model ? priceFor(vendor ?? "unknown", model) : null;
  const cost = price ? costUsd(price, { input: inputTokens, output: outputTokens }) : 0;

  return {
    id: r.receipt_id,
    tenant: r.tenant_id,
    capturedAt: ev.captured_at ?? r.issued_at,
    vendor,
    model,
    app: ev.source_system || "unknown",
    eventType: ev.event_type || "unknown",
    environment: ev.context?.environment ?? null,
    decision: r.decision?.decision ?? null,
    reasonCodes: r.decision?.reason_codes ?? [],
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: cost,
    priced: price !== null,
    inputClass: payload?.input_classification ?? null,
    outputClass: payload?.output_classification ?? null,
    evidenceRefs: Array.isArray(r.evidence_refs) ? r.evidence_refs.length : 0,
    chainHeight: typeof r.integrity?.chain_height === "number" ? r.integrity.chain_height : null,
    signed: Array.isArray(sr.signatures) && sr.signatures.length > 0,
    raw: sr,
  };
}

// ---------- structured query ----------

export interface QueryFilter {
  model?: string; // substring match on ai_model
  vendor?: string;
  app?: string; // substring match on source_system
  eventType?: string; // substring match on event_type
  decision?: DecisionVerdict;
  environment?: string;
  since?: string; // ISO, capturedAt >= since
  until?: string; // ISO, capturedAt <= until
  minCost?: number;
  maxCost?: number;
  minTokens?: number;
  sensitive?: boolean; // inputClass/outputClass in {pii,pci,mnpi}
  hasEvidence?: boolean;
  signed?: boolean;
  text?: string; // free substring across model/app/eventType/reasonCodes/id
}

export type GroupBy = "model" | "app" | "vendor" | "decision" | "environment" | "day";
export type Metric = "count" | "cost" | "tokens";
export type Intent = "list" | "count" | "aggregate";

export interface StructuredQuery {
  intent: Intent;
  filter: QueryFilter;
  groupBy?: GroupBy;
  metric: Metric;
  limit: number;
  /** Whether the question is really asking for alerts/issues rather than a query. */
  wantsAlerts?: boolean;
}

export interface QueryGroup {
  key: string;
  count: number;
  costUsd: number;
  tokens: number;
  value: number; // the chosen metric
}

export interface QueryResult {
  query: StructuredQuery;
  interpretation: string; // human-readable "how I read your question"
  matched: ReceiptRow[]; // capped at limit for list intent
  matchedCount: number; // total matches before the cap
  scanned: number;
  groups?: QueryGroup[];
  aggregate?: { metric: Metric; value: number };
  citations: string[]; // receipt ids backing the answer (capped)
  answer: string; // one-paragraph plain answer
}

// ---------- deterministic parser ----------

const MODEL_HINTS: Array<[RegExp, string]> = [
  [/\bopus\b/, "opus"],
  [/\bsonnet\b/, "sonnet"],
  [/\bhaiku\b/, "haiku"],
  [/\bgpt-?5-?mini\b/, "gpt-5-mini"],
  [/\bgpt-?5\b/, "gpt-5"],
  [/\bgpt-?4o\b/, "gpt-4o"],
  [/\bgemini\b/, "gemini"],
  [/\bclaude\b/, "claude"],
  [/\bmistral\b/, "mistral"],
];
const VENDOR_HINTS: Array<[RegExp, string]> = [
  [/\banthropic\b/, "anthropic"],
  [/\bopenai\b/, "openai"],
  [/\bgoogle\b/, "google"],
  [/\bbedrock\b/, "aws-bedrock"],
];

function parseRelativeSince(q: string, now: Date): string | undefined {
  const day = 86400000;
  let m: RegExpMatchArray | null;
  if (/\btoday\b/.test(q)) return new Date(now.getTime() - day).toISOString();
  if (/\byesterday\b/.test(q)) return new Date(now.getTime() - 2 * day).toISOString();
  if (/\bthis week\b/.test(q) || /\blast week\b|\bpast week\b|\blast 7 days\b/.test(q))
    return new Date(now.getTime() - 7 * day).toISOString();
  if (/\bthis month\b|\blast month\b|\bpast month\b|\blast 30 days\b/.test(q))
    return new Date(now.getTime() - 30 * day).toISOString();
  if ((m = q.match(/\blast (\d+) days?\b/))) return new Date(now.getTime() - Number(m[1]) * day).toISOString();
  if ((m = q.match(/\blast (\d+) hours?\b/))) return new Date(now.getTime() - Number(m[1]) * 3600000).toISOString();
  return undefined;
}

/**
 * Parse a natural-language question into a StructuredQuery, deterministically
 * and offline. Unknown phrasing degrades to a text search rather than failing.
 * `now` is injectable for testability.
 */
export function parseQuery(nl: string, now: Date = new Date()): StructuredQuery {
  const q = " " + nl.toLowerCase().trim() + " ";
  const filter: QueryFilter = {};

  // intent + metric
  let intent: Intent = "list";
  let metric: Metric = "count";
  const costWords = /\b(cost|costs|spend|spent|spending|\$|dollar|bill|priced)\b/.test(q);
  const tokenWords = /\btokens?\b/.test(q);
  if (costWords) metric = "cost";
  else if (tokenWords) metric = "tokens";

  if (/\bhow many\b|\bnumber of\b|\bcount\b/.test(q)) intent = "count";
  if (/\bhow much\b|\btotal\b|\bsum\b|\baverage\b|\bbreak ?down\b|\bby model\b|\bby app\b|\bper /.test(q))
    intent = "aggregate";
  if (costWords && /\bhow much\b|\btotal\b|\bwhat did\b/.test(q)) intent = "aggregate";

  // groupBy
  let groupBy: GroupBy | undefined;
  if (/\bby model\b|\bper model\b|\beach model\b/.test(q)) groupBy = "model";
  else if (/\bby app\b|\bby application\b|\bby (source|system)\b|\bper app\b/.test(q)) groupBy = "app";
  else if (/\bby vendor\b|\bby provider\b/.test(q)) groupBy = "vendor";
  else if (/\bby decision\b|\bby verdict\b|\bby outcome\b/.test(q)) groupBy = "decision";
  else if (/\bby (environment|env)\b/.test(q)) groupBy = "environment";
  else if (/\bby day\b|\bdaily\b|\bper day\b|\bover time\b/.test(q)) groupBy = "day";
  if (groupBy && intent !== "aggregate") intent = "aggregate";

  // model / vendor
  for (const [re, name] of MODEL_HINTS) if (re.test(q)) { filter.model = name; break; }
  for (const [re, name] of VENDOR_HINTS) if (re.test(q)) { filter.vendor = name; break; }

  // decision verdict
  if (/\b(denied|declined|rejected|blocked|refused)\b/.test(q)) filter.decision = "block";
  else if (/\bflagged\b|\bflag\b/.test(q)) filter.decision = "flag";
  else if (/\b(approval|pending|escalat)\w*/.test(q)) filter.decision = "require-approval";
  else if (/\b(allowed|approved|passed)\b/.test(q)) filter.decision = "allow";

  // sensitive data
  if (/\bpii\b|\bsensitive\b|\bconfidential\b|\bpci\b|\bmnpi\b|\bpersonal data\b/.test(q)) filter.sensitive = true;

  // evidence / signatures
  if (/\b(missing|without|no) (evidence|proof|binding)\b|\bunbound\b/.test(q)) filter.hasEvidence = false;
  else if (/\bwith (evidence|proof)\b|\bhas evidence\b|\bbound proof\b/.test(q)) filter.hasEvidence = true;
  if (/\b(unsigned|unverified|no signature|missing signature)\b/.test(q)) filter.signed = false;

  // environment
  if (/\bproduction\b|\bprod\b/.test(q)) filter.environment = "production";
  else if (/\bstaging\b/.test(q)) filter.environment = "staging";
  else if (/\bdevelopment\b|\bdev\b/.test(q)) filter.environment = "development";

  // cost thresholds
  let m: RegExpMatchArray | null;
  if ((m = q.match(/(?:over|above|more than|greater than|>=?)\s*\$?\s*([\d,.]+)/)))
    filter.minCost = Number(m[1].replace(/,/g, ""));
  if ((m = q.match(/(?:under|below|less than|cheaper than|<=?)\s*\$?\s*([\d,.]+)/)))
    filter.maxCost = Number(m[1].replace(/,/g, ""));
  if ((m = q.match(/(?:over|more than|>=?)\s*([\d,]+)\s*tokens/)))
    filter.minTokens = Number(m[1].replace(/,/g, ""));

  // time window
  const since = parseRelativeSince(q, now);
  if (since) filter.since = since;

  // event type / domain nouns → text-ish filter on event_type
  if ((m = q.match(/\b(loan|payment|underwriting|claim|kyc|fraud|credit|eligibility|triage)\b/)))
    filter.eventType = m[1];

  // limit / top-N
  let limit = intent === "list" ? 20 : 50;
  if ((m = q.match(/\btop\s+(\d+)\b/))) limit = Math.max(1, Number(m[1]));
  if ((m = q.match(/\b(?:first|last|latest)\s+(\d+)\b/))) limit = Math.max(1, Number(m[1]));

  // alerts intent
  const wantsAlerts = /\b(issue|issues|wrong|problem|problems|critical|alert|alerts|risk|risks|anomal|red flag|what should i worry|anything bad)\b/.test(q);

  return { intent, filter, groupBy, metric, limit, wantsAlerts };
}

// ---------- execution ----------

const SENSITIVE: ReadonlySet<Classification> = new Set(["pii", "pci", "mnpi"]);

function matches(row: ReceiptRow, f: QueryFilter): boolean {
  if (f.model && !(row.model ?? "").toLowerCase().includes(f.model)) return false;
  if (f.vendor && (row.vendor ?? "").toLowerCase() !== f.vendor) return false;
  if (f.app && !row.app.toLowerCase().includes(f.app)) return false;
  if (f.eventType && !row.eventType.toLowerCase().includes(f.eventType)) return false;
  if (f.decision && row.decision !== f.decision) return false;
  if (f.environment && row.environment !== f.environment) return false;
  if (f.since && row.capturedAt < f.since) return false;
  if (f.until && row.capturedAt > f.until) return false;
  if (f.minCost !== undefined && row.costUsd < f.minCost) return false;
  if (f.maxCost !== undefined && row.costUsd > f.maxCost) return false;
  if (f.minTokens !== undefined && row.totalTokens < f.minTokens) return false;
  if (f.hasEvidence !== undefined && f.hasEvidence !== row.evidenceRefs > 0) return false;
  if (f.signed !== undefined && row.signed !== f.signed) return false;
  if (f.sensitive) {
    const s = (row.inputClass && SENSITIVE.has(row.inputClass)) || (row.outputClass && SENSITIVE.has(row.outputClass));
    if (!s) return false;
  }
  if (f.text) {
    const hay = [row.model, row.app, row.eventType, row.id, row.reasonCodes.join(" ")].join(" ").toLowerCase();
    if (!hay.includes(f.text.toLowerCase())) return false;
  }
  return true;
}

function groupKey(row: ReceiptRow, g: GroupBy): string {
  switch (g) {
    case "model": return row.model ?? "(none)";
    case "app": return row.app;
    case "vendor": return row.vendor ?? "(none)";
    case "decision": return row.decision ?? "(none)";
    case "environment": return row.environment ?? "(unspecified)";
    case "day": return row.capturedAt.slice(0, 10);
  }
}

function usd(n: number): string {
  if (n === 0) return "$0.00";
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function describeFilter(f: QueryFilter): string {
  const parts: string[] = [];
  if (f.model) parts.push(`model ~ "${f.model}"`);
  if (f.vendor) parts.push(`vendor = ${f.vendor}`);
  if (f.app) parts.push(`app ~ "${f.app}"`);
  if (f.eventType) parts.push(`event ~ "${f.eventType}"`);
  if (f.decision) parts.push(`decision = ${f.decision}`);
  if (f.environment) parts.push(`env = ${f.environment}`);
  if (f.sensitive) parts.push("sensitive data (pii/pci/mnpi)");
  if (f.hasEvidence === false) parts.push("no bound evidence");
  if (f.hasEvidence === true) parts.push("has bound evidence");
  if (f.signed === false) parts.push("unsigned");
  if (f.minCost !== undefined) parts.push(`cost ≥ ${usd(f.minCost)}`);
  if (f.maxCost !== undefined) parts.push(`cost ≤ ${usd(f.maxCost)}`);
  if (f.minTokens !== undefined) parts.push(`tokens ≥ ${f.minTokens.toLocaleString()}`);
  if (f.since) parts.push(`since ${f.since.slice(0, 10)}`);
  return parts.length ? parts.join(", ") : "all receipts";
}

/** Execute a StructuredQuery over receipts. Always returns cited receipt ids. */
export function runQuery(receipts: SignedReceipt[], q: StructuredQuery): QueryResult {
  const rows = receipts.map(flattenReceipt);
  const hits = rows.filter((r) => matches(r, q.filter));

  const metricOf = (r: ReceiptRow) => (q.metric === "cost" ? r.costUsd : q.metric === "tokens" ? r.totalTokens : 1);
  const fmtMetric = (v: number) => (q.metric === "cost" ? usd(v) : q.metric === "tokens" ? v.toLocaleString() : String(v));

  const interpretation = `${q.intent}${q.groupBy ? ` by ${q.groupBy}` : ""} · ${q.metric} · where ${describeFilter(q.filter)}`;
  let groups: QueryGroup[] | undefined;
  let aggregate: { metric: Metric; value: number } | undefined;
  let answer: string;

  if (q.intent === "aggregate" && q.groupBy) {
    const map = new Map<string, QueryGroup>();
    for (const r of hits) {
      const k = groupKey(r, q.groupBy);
      const g = map.get(k) ?? { key: k, count: 0, costUsd: 0, tokens: 0, value: 0 };
      g.count += 1; g.costUsd += r.costUsd; g.tokens += r.totalTokens;
      map.set(k, g);
    }
    groups = Array.from(map.values())
      .map((g) => ({ ...g, value: q.metric === "cost" ? g.costUsd : q.metric === "tokens" ? g.tokens : g.count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, q.limit);
    const top = groups[0];
    answer = groups.length
      ? `${hits.length} matching receipt(s), grouped by ${q.groupBy}. Top: ${top.key} at ${fmtMetric(top.value)}.`
      : `No receipts matched (${describeFilter(q.filter)}).`;
  } else if (q.intent === "aggregate" || q.intent === "count") {
    const value = q.intent === "count" ? hits.length : hits.reduce((s, r) => s + metricOf(r), 0);
    aggregate = { metric: q.intent === "count" ? "count" : q.metric, value };
    answer = q.intent === "count"
      ? `${hits.length} receipt(s) match ${describeFilter(q.filter)}.`
      : `${fmtMetric(value)} across ${hits.length} matching receipt(s) (${describeFilter(q.filter)}).`;
  } else {
    const sorted = [...hits].sort((a, b) => b.costUsd - a.costUsd || (a.capturedAt < b.capturedAt ? 1 : -1));
    answer = hits.length
      ? `${hits.length} receipt(s) match ${describeFilter(q.filter)}${hits.length > q.limit ? ` (showing ${q.limit})` : ""}.`
      : `No receipts matched ${describeFilter(q.filter)}.`;
    return {
      query: q, interpretation, matched: sorted.slice(0, q.limit), matchedCount: hits.length,
      scanned: rows.length, citations: sorted.slice(0, q.limit).map((r) => r.id), answer,
    };
  }

  return {
    query: q, interpretation, matched: hits.slice(0, q.limit), matchedCount: hits.length,
    scanned: rows.length, groups, aggregate,
    citations: hits.slice(0, Math.min(q.limit, 25)).map((r) => r.id), answer,
  };
}

/** Convenience: parse a natural-language question and run it in one call. */
export function answerQuery(receipts: SignedReceipt[], nl: string, now?: Date): QueryResult {
  return runQuery(receipts, parseQuery(nl, now));
}
