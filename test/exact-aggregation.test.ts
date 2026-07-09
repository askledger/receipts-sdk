import { describe, it, expect } from "vitest";
import { summarizeWorkloads } from "../src/cost/dashboard.js";
import { priceFor, costUsd } from "../src/cost/pricing.js";
import type { Workload } from "../src/cost/ingest.js";

const at = "2026-06-01T00:00:00.000Z";

describe("exact aggregation (no sampling skew)", () => {
  it("aggregates a pathological mixed bill exactly", () => {
    // one huge cheap row + several tiny expensive rows: the shape where the old
    // sample-then-scale path over-weighted the tiny rows.
    const w: Workload[] = [
      { vendor: "anthropic", model: "claude-haiku-4-5", app: "mod", requests: 1_000_000, inputTotal: 300_000_000, outputTotal: 20_000_000, at },
      ...Array.from({ length: 5 }, (_, i) => ({
        vendor: "anthropic", model: "claude-opus-4-6", app: `x${i}`, requests: 2, inputTotal: 3000, outputTotal: 1000, at,
      })),
    ];
    const s = summarizeWorkloads(w);

    let expected = 0;
    for (const r of w) {
      const p = priceFor(r.vendor, r.model)!;
      expected += costUsd(p, { input: r.inputTotal, output: r.outputTotal });
    }
    expect(s.costUsd).toBeCloseTo(expected, 6);
    expect(s.requests).toBe(1_000_010);
    expect(s.pricedTokens).toBe(s.totalTokens); // all models priced
  });

  it("excludes unpriced-model tokens from pricedTokens but keeps them in totalTokens", () => {
    const w: Workload[] = [
      { vendor: "openai", model: "gpt-5", app: "a", requests: 1000, inputTotal: 1_000_000, outputTotal: 200_000, at },
      { vendor: "unknown", model: "mystery", app: "b", requests: 1000, inputTotal: 1_000_000, outputTotal: 200_000, at },
    ];
    const s = summarizeWorkloads(w);
    expect(s.totalTokens).toBe(2_400_000);
    expect(s.pricedTokens).toBe(1_200_000);
    expect(s.unpricedRequests).toBe(1000);
  });
});
