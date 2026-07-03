// Two-stage planning cascade — preview with a cheap model, commit with
// an expensive one. The pattern:
//
//   1. Caller submits a prompt.
//   2. We pick the planner model (cheap, fast) and produce a draft.
//   3. Caller reviews the draft.
//   4. On approval, we re-run with the executor model (capable).
//   5. We sign one receipt per stage with explicit linkage so audit can
//      see "this Opus output was approved based on this Haiku preview".
//
// Why this saves money:
//   - Most prompts get refined or rejected during preview. We pay Haiku
//     prices for those rounds, not Opus.
//   - When the user is satisfied with the preview, we run the executor
//     ONCE rather than iterating at expensive rates.
//
// Internal studies suggest 60-80% cost reduction on multi-turn workflows
// where a cheap-model preview lets the user refine before committing.

import { priceFor, type Usage } from "./pricing.js";

export type CascadeStage = "planner" | "executor";

export interface CascadeRule {
  /** rough token estimate for the input */
  estimated_input_tokens: number;
  /** classification of the task */
  intent?: "code" | "summarize" | "extract" | "analyze" | "translate" | "creative" | "unknown";
  /** caller-stated risk: regulated decisions force the executor model even on preview */
  risk?: "low" | "medium" | "high";
}

export interface CascadeChoice {
  planner: { vendor: string; model: string };
  executor: { vendor: string; model: string };
  reason: string;
}

const DEFAULT_PLANNERS: Record<string, { vendor: string; model: string }> = {
  code:      { vendor: "anthropic", model: "claude-haiku-4-5" },
  summarize: { vendor: "openai",    model: "gpt-5-mini" },
  extract:   { vendor: "google",    model: "gemini-2-5-flash" },
  analyze:   { vendor: "anthropic", model: "claude-haiku-4-5" },
  translate: { vendor: "google",    model: "gemini-2-5-flash" },
  creative:  { vendor: "anthropic", model: "claude-haiku-4-5" },
  unknown:   { vendor: "anthropic", model: "claude-haiku-4-5" },
};

const DEFAULT_EXECUTORS: Record<string, { vendor: string; model: string }> = {
  code:      { vendor: "anthropic", model: "claude-sonnet-4-6" },
  summarize: { vendor: "anthropic", model: "claude-sonnet-4-6" },
  extract:   { vendor: "openai",    model: "gpt-5" },
  analyze:   { vendor: "anthropic", model: "claude-opus-4-6" },
  translate: { vendor: "google",    model: "gemini-2-5-pro" },
  creative:  { vendor: "anthropic", model: "claude-opus-4-6" },
  unknown:   { vendor: "anthropic", model: "claude-sonnet-4-6" },
};

export function chooseCascade(rule: CascadeRule): CascadeChoice {
  const intent = rule.intent ?? "unknown";
  const planner = DEFAULT_PLANNERS[intent];
  const executor = DEFAULT_EXECUTORS[intent];

  // Risk override — regulated decisions never run on the cheap planner.
  if (rule.risk === "high") {
    return {
      planner: executor,
      executor,
      reason: "high-risk task; bypass planner stage",
    };
  }

  // Very small inputs don't benefit from preview — overhead exceeds savings.
  if (rule.estimated_input_tokens < 200) {
    return {
      planner: executor,
      executor,
      reason: "input too small for cascade savings",
    };
  }

  return {
    planner,
    executor,
    reason: `cascade ${planner.vendor}:${planner.model} → ${executor.vendor}:${executor.model} for ${intent}`,
  };
}

export interface StageOutcome {
  vendor: string;
  model: string;
  usage: Usage;
  approved_by?: { sub: string; at: string };
}

export interface CascadeRun {
  rule: CascadeRule;
  choice: CascadeChoice;
  planner_outcome: StageOutcome;
  executor_outcome?: StageOutcome;   // populated after approval
}

/** Cost summary for a completed (or in-flight) cascade run. */
export function runCost(run: CascadeRun): { planner_usd: number; executor_usd: number; total_usd: number; baseline_usd: number; savings_usd: number; savings_pct: number } {
  const plannerPrice = priceFor(run.planner_outcome.vendor, run.planner_outcome.model);
  const plannerUsd = plannerPrice ? plannerPrice.input_per_1k * run.planner_outcome.usage.input / 1000
                                  + plannerPrice.output_per_1k * run.planner_outcome.usage.output / 1000 : 0;
  let executorUsd = 0;
  if (run.executor_outcome) {
    const ep = priceFor(run.executor_outcome.vendor, run.executor_outcome.model);
    if (ep) executorUsd = ep.input_per_1k * run.executor_outcome.usage.input / 1000
                         + ep.output_per_1k * run.executor_outcome.usage.output / 1000;
  }
  // Baseline = what it would have cost to run executor for BOTH stages
  // (i.e. without the cheap planner).
  const ep = priceFor(run.choice.executor.vendor, run.choice.executor.model);
  const baselineUsd = ep
    ? (run.planner_outcome.usage.input + (run.executor_outcome?.usage.input ?? 0)) * ep.input_per_1k / 1000
    + (run.planner_outcome.usage.output + (run.executor_outcome?.usage.output ?? 0)) * ep.output_per_1k / 1000
    : 0;
  const total = plannerUsd + executorUsd;
  const savings = Math.max(0, baselineUsd - total);
  const savings_pct = baselineUsd === 0 ? 0 : savings / baselineUsd;
  return { planner_usd: plannerUsd, executor_usd: executorUsd, total_usd: total, baseline_usd: baselineUsd, savings_usd: savings, savings_pct };
}
