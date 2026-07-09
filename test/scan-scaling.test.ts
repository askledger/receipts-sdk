import { describe, it, expect } from "vitest";
import { receiptsFromWorkloads, type Workload } from "../src/cost/ingest.js";
import { summarizeReceipts, scaleSummary } from "../src/cost/dashboard.js";
import { buildBaseline } from "../src/cost/savings.js";
import { generateKeyPair } from "../src/index.js";

// A bill big enough to trip receiptsFromWorkloads' downsampling cap (200k).
function bigWorkloads(): Workload[] {
  return [
    { vendor: "openai", model: "gpt-5", app: "support", requests: 260000, inputTotal: 260000 * 1000, outputTotal: 260000 * 200, at: "2026-06-01T00:00:00.000Z" },
    { vendor: "anthropic", model: "claude-sonnet-4-6", app: "agents", requests: 140000, inputTotal: 140000 * 1500, outputTotal: 140000 * 300, at: "2026-06-01T00:00:00.000Z" },
  ];
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));

describe("big-bill scaling: scan and baseline/prove agree", () => {
  it("downsamples a large bill (scale > 1)", () => {
    const { scale } = receiptsFromWorkloads(bigWorkloads());
    expect(scale).toBeGreaterThan(1);
  });

  it("scaleSummary recovers full-volume totals from a downsampled summary", () => {
    const w = bigWorkloads();
    const sampled = receiptsFromWorkloads(w); // sampled (scale > 1)
    const scaled = scaleSummary(summarizeReceipts(sampled.receipts), sampled.scale);

    // ground truth: same bill with sampling effectively disabled
    const full = summarizeReceipts(receiptsFromWorkloads(w, { maxReceipts: 10_000_000 }).receipts);

    expect(rel(scaled.costUsd, full.costUsd)).toBeLessThan(0.01);
    expect(rel(scaled.requests, full.requests)).toBeLessThan(0.01);
    expect(rel(scaled.totalTokens, full.totalTokens)).toBeLessThan(0.01);
    // the headline: total real requests, not the sampled cap
    expect(scaled.requests).toBeGreaterThan(390000);
  });

  it("a signed baseline from the scaled summary reflects full spend, not the sample", () => {
    const w = bigWorkloads();
    const sampled = receiptsFromWorkloads(w);
    const scaledBaseline = buildBaseline(
      scaleSummary(summarizeReceipts(sampled.receipts), sampled.scale),
      { label: "big", issuedAt: "2026-06-01T00:00:00.000Z", keypair: generateKeyPair() }
    );
    const full = summarizeReceipts(receiptsFromWorkloads(w, { maxReceipts: 10_000_000 }).receipts);

    // baseline spend must track the full bill, and blended rate is unchanged by sampling
    expect(rel(scaledBaseline.period.costUsd, full.costUsd)).toBeLessThan(0.01);
    expect(scaledBaseline.period.requests).toBeGreaterThan(390000);
    const fullRate = (full.costUsd / full.totalTokens) * 1000;
    expect(rel(scaledBaseline.period.costPer1kTokens, fullRate)).toBeLessThan(0.02);
  });

  it("scaleSummary is a no-op for a small bill (scale === 1)", () => {
    const w: Workload[] = [
      { vendor: "openai", model: "gpt-5", app: "a", requests: 100, inputTotal: 100000, outputTotal: 20000, at: "2026-06-01T00:00:00.000Z" },
    ];
    const { receipts, scale } = receiptsFromWorkloads(w);
    expect(scale).toBe(1);
    const s = summarizeReceipts(receipts);
    expect(scaleSummary(s, scale)).toEqual(s);
  });
});
