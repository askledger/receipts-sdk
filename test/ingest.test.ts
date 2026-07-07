import { describe, it, expect } from "vitest";
import {
  normalizeModel,
  parseUsageExport,
  receiptsFromWorkloads,
} from "../src/cost/ingest.js";
import { summarizeReceipts } from "../src/cost/dashboard.js";

describe("ingest: normalizeModel", () => {
  it("collapses dated / versioned snapshots onto priceable model keys", () => {
    expect(normalizeModel("gpt-5-2025-08-01")).toEqual({ vendor: "openai", model: "gpt-5" });
    expect(normalizeModel("gpt-5-mini-2025")).toEqual({ vendor: "openai", model: "gpt-5-mini" });
    expect(normalizeModel("gpt-4o-2024-08-06")).toEqual({ vendor: "openai", model: "gpt-4o" });
    expect(normalizeModel("claude-opus-4-6-20260501")).toEqual({ vendor: "anthropic", model: "claude-opus-4-6" });
    expect(normalizeModel("gemini-2.5-flash")).toEqual({ vendor: "google", model: "gemini-2-5-flash" });
  });
});

describe("ingest: parseUsageExport", () => {
  it("reads the OpenAI usage shape", () => {
    const text = JSON.stringify([
      { snapshot_id: "gpt-5-2025-08-01", api_key_name: "bot", n_requests: 100, n_context_tokens_total: 200000, n_generated_tokens_total: 20000 },
    ]);
    const [w] = parseUsageExport(text);
    expect(w.vendor).toBe("openai");
    expect(w.model).toBe("gpt-5");
    expect(w.app).toBe("bot");
    expect(w.requests).toBe(100);
    expect(w.inputTotal).toBe(200000);
    expect(w.outputTotal).toBe(20000);
  });

  it("reads the Anthropic usage shape", () => {
    const text = JSON.stringify([
      { date: "2026-06-01", model: "claude-opus-4-6", workspace: "eng", requests: 40, input_tokens: 60000, output_tokens: 8000 },
    ]);
    const [w] = parseUsageExport(text);
    expect(w).toMatchObject({ vendor: "anthropic", model: "claude-opus-4-6", app: "eng", requests: 40 });
  });

  it("throws a clear error on non-JSON", () => {
    expect(() => parseUsageExport("not json")).toThrow(/not valid JSON/);
  });
});

describe("ingest: receiptsFromWorkloads", () => {
  it("expands a row into per-request receipts carrying the row's average tokens", () => {
    const { receipts, totalRequests, scale } = receiptsFromWorkloads([
      { vendor: "openai", model: "gpt-5", app: "bot", requests: 10, inputTotal: 5000, outputTotal: 1000, at: "2026-06-01T00:00:00Z" },
    ]);
    expect(scale).toBe(1);
    expect(totalRequests).toBe(10);
    expect(receipts).toHaveLength(10);
    const p = receipts[0].receipt.event.payload;
    expect(p.input_token_count).toBe(500); // 5000 / 10
    expect(p.output_token_count).toBe(100); // 1000 / 10
    expect(receipts[0].signatures).toEqual([]); // imported => unsigned
  });

  it("downsamples very large bills and reports a scale factor", () => {
    const { receipts, totalRequests, scale } = receiptsFromWorkloads(
      [{ vendor: "openai", model: "gpt-5", app: "bot", requests: 1000, inputTotal: 100000, outputTotal: 10000, at: "2026-06-01T00:00:00Z" }],
      { maxReceipts: 100 }
    );
    expect(totalRequests).toBe(1000);
    expect(scale).toBe(10);
    expect(receipts.length).toBeLessThanOrEqual(100);
    // per-receipt averages are preserved, so cost * scale recovers the truth
    expect(receipts[0].receipt.event.payload.output_token_count).toBe(10);
  });
});

describe("hardened over-tiering: confidence tiers", () => {
  // Build one imported bill with three over-tiered workloads and assert the
  // engine splits confident (headline) from review (quality-risk) correctly.
  const bill = JSON.stringify([
    // same-family, modest input, short output -> CONFIDENT
    { snapshot_id: "gpt-5", api_key_name: "support-bot", n_requests: 100, n_context_tokens_total: 250000, n_generated_tokens_total: 20000 },
    // same-family BUT heavy input context (RAG) -> REVIEW (this is the fix)
    { snapshot_id: "gpt-5", api_key_name: "prod-rag", n_requests: 100, n_context_tokens_total: 600000, n_generated_tokens_total: 70000 },
    // cross-family (gpt-4o -> gpt-5-mini) -> REVIEW
    { snapshot_id: "gpt-4o", api_key_name: "summarizer", n_requests: 100, n_context_tokens_total: 150000, n_generated_tokens_total: 40000 },
  ]);

  const { receipts } = receiptsFromWorkloads(parseUsageExport(bill));
  const s = summarizeReceipts(receipts);

  it("marks the modest-context same-family swap confident", () => {
    const conf = s.suggestions.filter((x) => x.confidence === "high").map((x) => x.topApp);
    expect(conf).toContain("support-bot");
  });

  it("demotes heavy-input-context and cross-family swaps to review", () => {
    const review = s.suggestions.filter((x) => x.confidence === "review").map((x) => x.topApp);
    expect(review).toContain("prod-rag"); // heavy 6k-token context
    expect(review).toContain("summarizer"); // gpt-4o -> gpt-5-mini crosses families
  });

  it("only counts confident savings in the headline number", () => {
    const confidentSum = s.suggestions
      .filter((x) => x.confidence === "high")
      .reduce((a, x) => a + x.estSavings, 0);
    expect(s.potentialSavings).toBeCloseTo(confidentSum, 6);
    expect(s.reviewSavings).toBeGreaterThan(0);
    // the review dollars must NOT be in the confident headline
    expect(s.potentialSavings).toBeLessThan(s.potentialSavings + s.reviewSavings);
  });
});
