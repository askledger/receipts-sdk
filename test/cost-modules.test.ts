import { describe, it, expect } from "vitest";
import { InMemorySavings, recordCascade, rollup } from "../src/cost/savings-ledger.js";
import { recommend } from "../src/cost/recommendations.js";
import { InMemoryDedup, hashKey } from "../src/cost/dedup-cache.js";
import { fitScore } from "../src/cost/model-fit-score.js";
import { carbonOf, rollupCarbon } from "../src/cost/carbon.js";
import { toReceiptEvent } from "../src/cost/budget-receipts.js";
import type { CascadeRun } from "../src/cost/cascade.js";

describe("savings-ledger", () => {
  it("rolls up cascade entries by intent and overall", async () => {
    const store = new InMemorySavings();
    const run: CascadeRun = {
      rule: { estimated_input_tokens: 4000, intent: "analyze" },
      choice: { planner: { vendor: "anthropic", model: "claude-haiku-4-5" }, executor: { vendor: "anthropic", model: "claude-opus-4-6" }, reason: "" },
      planner_outcome: { vendor: "anthropic", model: "claude-haiku-4-5", usage: { input: 4000, output: 800 } },
      executor_outcome: { vendor: "anthropic", model: "claude-opus-4-6", usage: { input: 4000, output: 1500 } },
    };
    await recordCascade(store, { tenantId: "t", run, approved: true });
    await recordCascade(store, { tenantId: "t", run: { ...run, rule: { ...run.rule, intent: "summarize" } }, approved: false });
    const r = await rollup(store, 0);
    expect(r.count).toBe(2);
    expect(r.approved_count).toBe(1);
    expect(r.total_savings_usd).toBeGreaterThan(0);
    expect(r.by_intent.analyze.count).toBe(1);
    expect(r.by_intent.summarize.count).toBe(1);
  });
});

describe("recommendations", () => {
  it("suggests cheaper model when cascade approval rate is high", () => {
    const samples = Array.from({ length: 30 }, () => ({
      use_case: "doc-summary", vendor: "anthropic", model: "claude-opus-4-6",
      input_tokens: 3000, output_tokens: 800, cascade_approved: true,
    }));
    const recs = recommend(samples, 30);
    const r = recs.find((x) => x.kind === "use_cheaper_model");
    expect(r).toBeDefined();
    expect(r!.expected_savings_usd_month).toBeGreaterThan(0);
    expect(r!.action.to).toMatch(/sonnet|haiku/);
  });

  it("suggests enabling cascade on premium use cases that don't yet use it", () => {
    const samples = Array.from({ length: 60 }, () => ({
      use_case: "contract-review", vendor: "anthropic", model: "claude-opus-4-6",
      input_tokens: 4000, output_tokens: 1500,
    }));
    const recs = recommend(samples, 30);
    expect(recs.some((r) => r.kind === "enable_cascade")).toBe(true);
  });

  it("flags low dedup-cache hit rate", () => {
    const samples = Array.from({ length: 200 }, (_, i) => ({
      use_case: "code-completion", vendor: "anthropic", model: "claude-sonnet-4-6",
      input_tokens: 500, output_tokens: 200, cache_hit: i < 3,
    }));
    const recs = recommend(samples, 30);
    expect(recs.some((r) => r.kind === "enable_dedup_cache")).toBe(true);
  });

  it("returns no recommendations on empty input", () => {
    expect(recommend([], 30)).toEqual([]);
  });
});

describe("dedup-cache", () => {
  it("hits on identical prompt within ttl, misses outside", async () => {
    const c = new InMemoryDedup<string>(60_000);
    await c.put("t1", { prompt: "hi", model: "x" }, "world");
    const hit = await c.get("t1", { prompt: "hi", model: "x" });
    expect(hit?.value).toBe("world");
    const miss = await c.get("t1", { prompt: "different", model: "x" });
    expect(miss).toBeNull();
  });

  it("isolates per tenant", async () => {
    const c = new InMemoryDedup<string>();
    await c.put("t1", { prompt: "p", model: "m" }, "a");
    const cross = await c.get("t2", { prompt: "p", model: "m" });
    expect(cross).toBeNull();
  });

  it("hashKey is deterministic and ignores object-key order", () => {
    const a = hashKey({ prompt: "hello", model: "x", tools: ["t1", "t2"], temperature: 0.7 });
    const b = hashKey({ temperature: 0.7, model: "x", tools: ["t1", "t2"], prompt: "hello" });
    expect(a).toBe(b);
  });

  it("reports hit_rate", async () => {
    const c = new InMemoryDedup<number>();
    await c.put("t", { prompt: "p", model: "m" }, 1);
    await c.get("t", { prompt: "p", model: "m" });
    await c.get("t", { prompt: "miss", model: "m" });
    const s = await c.stats();
    expect(s.hit_rate).toBeCloseTo(0.5, 5);
  });
});

describe("model-fit-score", () => {
  it("ranks extraction as a cheap-model fit", () => {
    const v = fitScore({ prompt: "extract dates from this", has_tools: false, expected_output_tokens: 80, task_intent: "extract" });
    expect(v.score).toBeGreaterThan(0.7);
    expect(v.recommended_model).not.toBeNull();
  });

  it("rejects cheap model for creative+long-output tasks", () => {
    const v = fitScore({ prompt: "write a short story", has_tools: false, expected_output_tokens: 3000, task_intent: "creative" });
    expect(v.score).toBeLessThan(0.5);
  });

  it("penalises tool use", () => {
    const a = fitScore({ prompt: "p", has_tools: false, expected_output_tokens: 100, task_intent: "analyze" });
    const b = fitScore({ prompt: "p", has_tools: true,  expected_output_tokens: 100, task_intent: "analyze" });
    expect(b.score).toBeLessThan(a.score);
  });
});

describe("carbon", () => {
  it("computes per-call grams of CO2e", () => {
    const c = carbonOf("anthropic", "claude-sonnet-4-6", 10_000);
    expect(c).not.toBeNull();
    expect(c!.g_co2e).toBeGreaterThan(0);
  });

  it("rolls up by vendor", () => {
    const r = rollupCarbon([
      { vendor: "anthropic", model: "claude-sonnet-4-6", tokens: 10_000 },
      { vendor: "openai", model: "gpt-5", tokens: 5_000 },
      { vendor: "anthropic", model: "claude-haiku-4-5", tokens: 50_000 },
    ]);
    expect(r.total_g_co2e).toBeGreaterThan(0);
    expect(r.by_vendor.anthropic.g).toBeGreaterThan(0);
    expect(r.by_vendor.openai.g).toBeGreaterThan(0);
  });

  it("returns null for unknown model so rollup ignores it", () => {
    expect(carbonOf("acme", "model-9000", 1000)).toBeNull();
  });
});

describe("budget-receipts", () => {
  it("emits a deny event with the policy id and ratio", () => {
    const ev = toReceiptEvent({
      tenant_id: "t1", actor_sub: "u@x", use_case: "doc-summary",
      vendor: "anthropic", model: "claude-opus-4-6",
      action: "deny", ratio: 1.05, remaining_usd: 0, policy_id: "monthly_cap_marketing",
      at: "2026-06-13T12:00:00Z",
    });
    expect(ev.event_type).toBe("ai.invocation_denied_by_budget");
    expect(ev.payload.metadata.budget_action).toBe("deny");
    expect(ev.payload.metadata.policy_id).toBe("monthly_cap_marketing");
    expect(ev.subject.ai_model).toBe("claude-opus-4-6");
  });

  it("warn action emits a warning event type", () => {
    const ev = toReceiptEvent({
      tenant_id: "t", actor_sub: "u", use_case: "x", vendor: "openai", model: "gpt-5",
      action: "warn", ratio: 0.8, remaining_usd: 20, policy_id: "default", at: "2026-06-13T12:00:00Z",
    });
    expect(ev.event_type).toBe("ai.invocation_budget_warning");
  });
});
