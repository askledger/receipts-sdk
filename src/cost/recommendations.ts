// Recommendations engine. Given a stream of recent receipts (each with
// vendor, model, use_case, tokens, optional cascade outcome), surface
// concrete patterns the customer can act on. Each recommendation is
// shaped so the dashboard can render it without further reasoning.

import { priceFor, costUsd } from "./pricing.js";

export interface ReceiptSample {
  use_case: string;
  vendor: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_hit?: boolean;
  /** Set when the call ran through the cascade and the executor stage was approved by the user. */
  cascade_approved?: boolean;
}

export type RecommendationKind =
  | "use_cheaper_model"
  | "enable_cascade"
  | "enable_dedup_cache"
  | "right-size_max_tokens"
  | "rebalance_vendor";

export interface Recommendation {
  kind: RecommendationKind;
  use_case: string;
  evidence: string;
  expected_savings_usd_month: number;
  confidence: number;            // 0..1
  action: { from: string; to?: string; param?: Record<string, unknown> };
}

interface Aggregate {
  use_case: string;
  vendor: string;
  model: string;
  count: number;
  input: number;
  output: number;
  cascade_approvals: number;
  cascade_runs: number;
  cache_hits: number;
}

function key(s: ReceiptSample): string {
  return `${s.use_case}|${s.vendor}|${s.model}`;
}

function aggregate(samples: ReceiptSample[]): Map<string, Aggregate> {
  const map = new Map<string, Aggregate>();
  for (const s of samples) {
    const k = key(s);
    const a = map.get(k) ?? { use_case: s.use_case, vendor: s.vendor, model: s.model, count: 0, input: 0, output: 0, cascade_approvals: 0, cascade_runs: 0, cache_hits: 0 };
    a.count++;
    a.input += s.input_tokens;
    a.output += s.output_tokens;
    if (s.cascade_approved !== undefined) { a.cascade_runs++; if (s.cascade_approved) a.cascade_approvals++; }
    if (s.cache_hit) a.cache_hits++;
    map.set(k, a);
  }
  return map;
}

const PREMIUM = new Set([
  "anthropic:claude-opus-4-6",
  "openai:gpt-5",
  "google:gemini-2-5-pro",
]);

const CHEAPER_ALT: Record<string, { vendor: string; model: string }> = {
  "anthropic:claude-opus-4-6":   { vendor: "anthropic", model: "claude-sonnet-4-6" },
  "anthropic:claude-sonnet-4-6": { vendor: "anthropic", model: "claude-haiku-4-5" },
  "openai:gpt-5":                { vendor: "openai", model: "gpt-5-mini" },
  "google:gemini-2-5-pro":       { vendor: "google", model: "gemini-2-5-flash" },
};

export function recommend(samples: ReceiptSample[], days = 30): Recommendation[] {
  if (samples.length === 0) return [];
  const monthMultiplier = 30 / Math.max(1, days);
  const ags = aggregate(samples);
  const recs: Recommendation[] = [];

  for (const a of ags.values()) {
    const currentKey = `${a.vendor}:${a.model}`;
    const currentPrice = priceFor(a.vendor, a.model);
    const currentSpend = currentPrice ? costUsd(currentPrice, { input: a.input, output: a.output }) : 0;
    if (currentSpend === 0) continue;

    // (1) Cheaper model: customer using premium for a use case where
    //     cascade approvals are consistently high → recommend the cheap planner directly.
    if (PREMIUM.has(currentKey) && a.cascade_runs >= 20 && a.cascade_approvals / a.cascade_runs >= 0.80) {
      const alt = CHEAPER_ALT[currentKey];
      const altPrice = alt ? priceFor(alt.vendor, alt.model) : null;
      if (alt && altPrice) {
        const altSpend = costUsd(altPrice, { input: a.input, output: a.output });
        const monthlySavings = (currentSpend - altSpend) * monthMultiplier;
        recs.push({
          kind: "use_cheaper_model",
          use_case: a.use_case,
          evidence: `${a.cascade_approvals}/${a.cascade_runs} cascade previews on ${alt.vendor}:${alt.model} were accepted unchanged.`,
          expected_savings_usd_month: Number(monthlySavings.toFixed(2)),
          confidence: 0.85,
          action: { from: currentKey, to: `${alt.vendor}:${alt.model}` },
        });
      }
    }

    // (2) Enable cascade on premium use cases that don't yet use it.
    if (PREMIUM.has(currentKey) && a.cascade_runs === 0 && a.count >= 50) {
      const alt = CHEAPER_ALT[currentKey];
      const altPrice = alt ? priceFor(alt.vendor, alt.model) : null;
      if (alt && altPrice) {
        // Conservative estimate: 50% of calls accept the planner output.
        const altSpend = costUsd(altPrice, { input: a.input, output: a.output });
        const expectedTotal = 0.5 * altSpend + 0.5 * currentSpend;
        const monthlySavings = (currentSpend - expectedTotal) * monthMultiplier;
        recs.push({
          kind: "enable_cascade",
          use_case: a.use_case,
          evidence: `${a.count} calls hit ${currentKey} with no preview stage.`,
          expected_savings_usd_month: Number(monthlySavings.toFixed(2)),
          confidence: 0.65,
          action: { from: currentKey, to: `${alt.vendor}:${alt.model}`, param: { stage: "planner" } },
        });
      }
    }

    // (3) Dedup cache hit-rate is low → recommend enabling.
    if (a.count >= 100 && a.cache_hits / a.count < 0.05) {
      const optimistic = 0.15 * currentSpend * monthMultiplier;
      recs.push({
        kind: "enable_dedup_cache",
        use_case: a.use_case,
        evidence: `Only ${a.cache_hits}/${a.count} calls hit the dedup cache.`,
        expected_savings_usd_month: Number(optimistic.toFixed(2)),
        confidence: 0.50,
        action: { from: currentKey, param: { ttl_min: 60 } },
      });
    }
  }

  return recs.sort((a, b) => b.expected_savings_usd_month - a.expected_savings_usd_month);
}
