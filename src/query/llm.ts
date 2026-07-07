// Optional LLM-backed query parsing.
//
// The offline parser in ./index.ts handles common phrasing for free. This adds
// a "bring your own Claude API key" path for free-form questions: the model
// only translates the question into a StructuredQuery — it never sees or
// invents receipt data. The query then runs against your real, signed receipts
// exactly as the deterministic path does, so answers stay grounded and cited.
//
// @anthropic-ai/sdk is an OPTIONAL peer dependency, imported lazily so the core
// SDK never forces it on. If it's absent (or no API key is configured), this
// throws a clear, actionable error and callers can fall back to parseQuery().

import { parseQuery, type StructuredQuery, type QueryFilter, type GroupBy, type Metric, type Intent } from "./index.js";
import type { DecisionVerdict } from "../types.js";

export interface LLMQueryOptions {
  /** Anthropic API key. Omit to let the SDK resolve it from the environment. */
  apiKey?: string;
  /** Model id. Defaults to claude-opus-4-8. Use claude-haiku-4-5 for a cheaper parse. */
  model?: string;
  /** Inject a preconstructed Anthropic client (e.g. for tests or a custom base URL). */
  client?: { messages: { create: (args: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }> } };
  /** "Now" for relative-date resolution; defaults to new Date(). */
  now?: Date;
}

const INTENTS: Intent[] = ["list", "count", "aggregate"];
const METRICS: Metric[] = ["count", "cost", "tokens"];
const GROUPS: GroupBy[] = ["model", "app", "vendor", "decision", "environment", "day"];
const VERDICTS: DecisionVerdict[] = ["allow", "block", "flag", "require-approval"];

function systemPrompt(now: Date): string {
  return [
    "You translate a natural-language question about AI 'receipts' (signed records of AI calls) into a JSON query object.",
    "Output ONLY the JSON object — no prose, no markdown, no code fences.",
    "",
    "Shape:",
    '{ "intent": "list"|"count"|"aggregate", "metric": "count"|"cost"|"tokens", "groupBy"?: "model"|"app"|"vendor"|"decision"|"environment"|"day", "limit": number, "wantsAlerts"?: boolean,',
    '  "filter": { "model"?: string, "vendor"?: string, "app"?: string, "eventType"?: string, "decision"?: "allow"|"block"|"flag"|"require-approval", "environment"?: "production"|"staging"|"development", "since"?: ISO8601, "until"?: ISO8601, "minCost"?: number, "maxCost"?: number, "minTokens"?: number, "sensitive"?: boolean, "hasEvidence"?: boolean, "signed"?: boolean, "text"?: string } }',
    "",
    "Rules:",
    "- decision = \"block\" for denied / declined / rejected / blocked; \"flag\" for flagged; \"require-approval\" for pending/escalated.",
    "- sensitive = true when the question is about pii / pci / mnpi / confidential / personal data.",
    "- hasEvidence = false for 'missing/without evidence or proof'; signed = false for 'unsigned/unverified'.",
    "- cost words (spend, $, cost) → metric \"cost\"; token words → \"tokens\".",
    "- 'how many' → intent \"count\"; 'how much / total / by X / per X' → \"aggregate\" (+ groupBy); otherwise \"list\".",
    "- wantsAlerts = true when the question asks about issues / problems / anything wrong / risks.",
    "- Only include filter keys the question actually implies. Default limit 20 for list, 50 otherwise.",
    `- Today is ${now.toISOString()}. Resolve relative dates (last week, yesterday, last 30 days) to an ISO 'since'.`,
  ].join("\n");
}

function extractJson(text: string): unknown {
  const fenced = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON object in model output");
  return JSON.parse(fenced.slice(start, end + 1));
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && isFinite(v) ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

/** Merge validated LLM output onto the deterministic base, dropping anything malformed. */
function coerce(base: StructuredQuery, raw: unknown): StructuredQuery {
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const rf = (o.filter && typeof o.filter === "object" ? o.filter : {}) as Record<string, unknown>;

  const filter: QueryFilter = {};
  const model = str(rf.model); if (model) filter.model = model.toLowerCase();
  const vendor = str(rf.vendor); if (vendor) filter.vendor = vendor.toLowerCase();
  const app = str(rf.app); if (app) filter.app = app;
  const eventType = str(rf.eventType); if (eventType) filter.eventType = eventType;
  const decision = str(rf.decision); if (decision && (VERDICTS as string[]).includes(decision)) filter.decision = decision as DecisionVerdict;
  const env = str(rf.environment); if (env) filter.environment = env;
  const since = str(rf.since); if (since) filter.since = since;
  const until = str(rf.until); if (until) filter.until = until;
  const minCost = num(rf.minCost); if (minCost !== undefined) filter.minCost = minCost;
  const maxCost = num(rf.maxCost); if (maxCost !== undefined) filter.maxCost = maxCost;
  const minTokens = num(rf.minTokens); if (minTokens !== undefined) filter.minTokens = minTokens;
  const sensitive = bool(rf.sensitive); if (sensitive !== undefined) filter.sensitive = sensitive;
  const hasEvidence = bool(rf.hasEvidence); if (hasEvidence !== undefined) filter.hasEvidence = hasEvidence;
  const signed = bool(rf.signed); if (signed !== undefined) filter.signed = signed;
  const text = str(rf.text); if (text) filter.text = text;

  const intent = str(o.intent);
  const metric = str(o.metric);
  const groupBy = str(o.groupBy);
  const limit = num(o.limit);

  return {
    intent: intent && (INTENTS as string[]).includes(intent) ? (intent as Intent) : base.intent,
    metric: metric && (METRICS as string[]).includes(metric) ? (metric as Metric) : base.metric,
    groupBy: groupBy && (GROUPS as string[]).includes(groupBy) ? (groupBy as GroupBy) : base.groupBy,
    limit: limit !== undefined ? Math.max(1, Math.min(500, Math.round(limit))) : base.limit,
    wantsAlerts: bool(o.wantsAlerts) ?? base.wantsAlerts,
    // Prefer the LLM's filter, but keep deterministic filter keys it omitted.
    filter: { ...base.filter, ...filter },
  };
}

/**
 * Parse a natural-language question via Claude, falling back to (and merged
 * with) the deterministic parser. Requires @anthropic-ai/sdk and an API key.
 */
export async function parseQueryLLM(nl: string, opts: LLMQueryOptions = {}): Promise<StructuredQuery> {
  const now = opts.now ?? new Date();
  const base = parseQuery(nl, now);

  let client = opts.client;
  if (!client) {
    // Optional peer dep. The indirect import keeps the module specifier out of
    // tsc's static resolution, so the core SDK builds without the package.
    const dynImport = new Function("spec", "return import(spec)") as (s: string) => Promise<Record<string, unknown>>;
    let mod: Record<string, unknown>;
    try {
      mod = await dynImport("@anthropic-ai/sdk");
    } catch {
      throw new Error(
        "LLM query mode needs the optional '@anthropic-ai/sdk' package. Install it (npm i @anthropic-ai/sdk) and set ANTHROPIC_API_KEY, or use the default offline parser."
      );
    }
    const Anthropic = (mod.default ?? mod) as new (a: { apiKey?: string }) => NonNullable<typeof client>;
    client = new Anthropic({ apiKey: opts.apiKey });
  }

  const resp = await client.messages.create({
    model: opts.model ?? "claude-opus-4-8",
    max_tokens: 600,
    system: systemPrompt(now),
    messages: [{ role: "user", content: nl }],
  });

  const text = (resp.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();

  try {
    return coerce(base, extractJson(text));
  } catch {
    return base; // model returned something unparseable — degrade to offline parse
  }
}
