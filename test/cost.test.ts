import { describe, it, expect } from "vitest";
import { priceFor, costUsd } from "../src/cost/pricing.js";
import { decide } from "../src/cost/budget.js";
import { chooseCascade, runCost, type CascadeRun } from "../src/cost/cascade.js";

describe("pricing", () => {
  it("looks up known models", () => {
    const p = priceFor("anthropic", "claude-sonnet-4-6");
    expect(p).not.toBeNull();
    expect(p!.input_per_1k).toBeGreaterThan(0);
  });

  it("returns null for unknown models", () => {
    expect(priceFor("acme", "model-9000")).toBeNull();
  });

  it("computes cost across input + output + cache", () => {
    const p = priceFor("anthropic", "claude-sonnet-4-6")!;
    const cost = costUsd(p, { input: 10_000, output: 2_000, cache_read: 5_000 });
    expect(cost).toBeCloseTo(
      10_000 / 1000 * p.input_per_1k +
      2_000 / 1000 * p.output_per_1k +
      5_000 / 1000 * (p.cache_read_per_1k ?? 0),
      6
    );
  });
});

describe("budget decisions", () => {
  const limits = { monthly_usd: 100, warn_at: 0.75, throttle_at: 0.90, deny_at: 1.0 };
  it("allows under warn", () => {
    expect(decide(limits, { spent_usd: 50, pending_usd: 5 }).action).toBe("allow");
  });
  it("warns past 75%", () => {
    expect(decide(limits, { spent_usd: 76, pending_usd: 0 }).action).toBe("warn");
  });
  it("throttles past 90%", () => {
    expect(decide(limits, { spent_usd: 92, pending_usd: 0 }).action).toBe("throttle");
  });
  it("denies past 100%", () => {
    expect(decide(limits, { spent_usd: 100, pending_usd: 0.01 }).action).toBe("deny");
  });
  it("reports remaining headroom", () => {
    const d = decide(limits, { spent_usd: 30, pending_usd: 0 });
    expect(d.remaining_usd).toBe(70);
  });
});

describe("cascade chooser", () => {
  it("picks a cheap planner for normal tasks", () => {
    const c = chooseCascade({ estimated_input_tokens: 2000, intent: "analyze" });
    expect(c.planner.model).toBe("claude-haiku-4-5");
    expect(c.executor.model).toBe("claude-opus-4-6");
  });

  it("bypasses the planner for tiny inputs (overhead > savings)", () => {
    const c = chooseCascade({ estimated_input_tokens: 50, intent: "summarize" });
    expect(c.planner.model).toBe(c.executor.model);
    expect(c.reason).toMatch(/too small/);
  });

  it("bypasses the planner for high-risk regulated tasks", () => {
    const c = chooseCascade({ estimated_input_tokens: 5000, intent: "analyze", risk: "high" });
    expect(c.planner.model).toBe(c.executor.model);
    expect(c.reason).toMatch(/high-risk/);
  });

  it("computes cost + savings vs single-shot Opus baseline", () => {
    const run: CascadeRun = {
      rule: { estimated_input_tokens: 4000, intent: "analyze" },
      choice: chooseCascade({ estimated_input_tokens: 4000, intent: "analyze" }),
      planner_outcome: { vendor: "anthropic", model: "claude-haiku-4-5", usage: { input: 4000, output: 800 } },
      executor_outcome: { vendor: "anthropic", model: "claude-opus-4-6", usage: { input: 4000, output: 1500 } },
    };
    const c = runCost(run);
    expect(c.savings_pct).toBeGreaterThan(0);
    expect(c.total_usd).toBeLessThan(c.baseline_usd);
  });
});
