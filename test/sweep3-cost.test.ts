// Sweep-3 regressions: every test here reproduces a defect that either
// FABRICATED savings or UNDERSTATED spend. The product's central claim is
// "prove the savings against a signed baseline", so each of these attacked the
// claim directly. Every assertion below fails against the unpatched code.

import { describe, it, expect } from "vitest";
import { generateKeyPair } from "../src/crypto.js";
import { summarizeWorkloads, summarizeReceipts } from "../src/cost/dashboard.js";
import { buildBaseline, proveSavings, verifySavingsProof, toPeriodSummary } from "../src/cost/savings.js";
import { normalizeModel, receiptsFromWorkloads, type Workload } from "../src/cost/ingest.js";
import { rollupCarbon } from "../src/cost/carbon.js";
import { recommend, type ReceiptSample } from "../src/cost/recommendations.js";
import { score, renderHTML, type VendorSample } from "../src/benchmark/index.js";
import { answerQuery, parseQuery } from "../src/query/index.js";
import type { SignedReceipt, Classification } from "../src/types.js";

const NOW = "2026-07-20T00:00:00.000Z";

function wl(o: Partial<Workload> & { requests: number; inputTotal: number; outputTotal: number }): Workload {
  return {
    vendor: "openai", model: "gpt-5", app: "svc", at: "2026-06-01T00:00:00.000Z", ...o,
  } as Workload;
}

function rc(o: { id: string; vendor: string; model: string; input: number; output: number }): SignedReceipt {
  return {
    receipt: {
      schema_version: "1.0",
      receipt_id: o.id,
      tenant_id: "acme",
      issued_at: "2026-07-01T00:00:00Z",
      event: {
        schema_version: "1.0",
        tenant_id: "acme",
        event_type: "ai.generation",
        source_system: "app",
        event_id: "e-" + o.id,
        captured_at: "2026-07-01T00:00:00Z",
        context: { environment: "production" as const },
        subject: { ai_vendor: o.vendor, ai_model: o.model },
        payload: {
          input_token_count: o.input,
          output_token_count: o.output,
          input_classification: undefined as Classification | undefined,
        },
      },
      integrity: { previous_receipt_hash: "0".repeat(64), receipt_hash: "a".repeat(64), chain_height: 1 },
    },
    signatures: [{ alg: "EdDSA", kid: "k1", sig: "AA==" }],
  } as unknown as SignedReceipt;
}

// ---------------------------------------------------------------------------
// 1. CRITICAL - a token-mix shift was signed off as verified savings.
// ---------------------------------------------------------------------------

describe("savings: normalization is per token class, not on a pooled rate", () => {
  const kp = generateKeyPair();
  const pub = { [kp.kid]: kp.public_key };

  // gpt-5: $0.005/1k in, $0.015/1k out. Output costs 3x input.
  //   baseline  1M in / 1M out = $5 + $15 = $20.00
  //   current   3M in / 1M out = $15 + $15 = $30.00
  // The bill ROSE 50% and the mix merely got more input-heavy. Nothing got
  // cheaper: a token of either class costs exactly what it did before.
  const baselineSummary = summarizeWorkloads([wl({ requests: 1000, inputTotal: 1_000_000, outputTotal: 1_000_000 })]);
  const currentSummary = summarizeWorkloads([wl({ requests: 1000, inputTotal: 3_000_000, outputTotal: 1_000_000 })]);

  it("reports $0.00 saved when only the input/output mix shifted", () => {
    expect(baselineSummary.costUsd).toBeCloseTo(20, 6);
    expect(currentSummary.costUsd).toBeCloseTo(30, 6);

    const b = buildBaseline(baselineSummary, { label: "june", issuedAt: NOW, keypair: kp });
    const proof = proveSavings(b, currentSummary, { issuedAt: NOW, keypair: kp });

    // The pooled formula this replaces: baseline blended rate $0.01/1k applied
    // to the current 4M tokens = $40, minus $30 actually spent = "$10.00 saved
    // (25%)", signed and verifying, on a period where spend went UP 50%.
    const pooledRate = (baselineSummary.costUsd / baselineSummary.pricedTokens) * 1000;
    const pooledSaving = (currentSummary.pricedTokens / 1000) * pooledRate - currentSummary.costUsd;
    expect(pooledSaving).toBeCloseTo(10, 6); // what the old code reported

    expect(proof.savings.normalizedSavingsUsd).toBe(0);
    expect(proof.savings.normalizedSavingsPct).toBe(0);
    // The honest signal that spend rose is still present and still negative.
    expect(proof.savings.absoluteSpendDeltaUsd).toBe(-10);
  });

  it("carries the per-class rates the counterfactual is built from", () => {
    const p = toPeriodSummary(baselineSummary);
    expect(p.pricedInputTokens).toBe(1_000_000);
    expect(p.pricedOutputTokens).toBe(1_000_000);
    expect(p.inputCostUsd).toBeCloseTo(5, 4);
    expect(p.outputCostUsd).toBeCloseTo(15, 4);
    expect(p.inputCostPer1k).toBeCloseTo(0.005, 9);
    expect(p.outputCostPer1k).toBeCloseTo(0.015, 9);
  });

  it("still proves a REAL saving when the per-class rates actually fall", () => {
    // Same volume and same mix, moved gpt-5 -> gpt-5-mini. Genuinely cheaper.
    const cheaper = summarizeWorkloads([
      wl({ model: "gpt-5-mini", requests: 1000, inputTotal: 1_000_000, outputTotal: 1_000_000 }),
    ]);
    const b = buildBaseline(baselineSummary, { label: "june", issuedAt: NOW, keypair: kp });
    const proof = proveSavings(b, cheaper, { issuedAt: NOW, keypair: kp });
    expect(proof.savings.normalizedSavingsUsd).toBeGreaterThan(0);
    expect(verifySavingsProof(proof, { publicKeys: pub }).valid).toBe(true);
  });

  it("bumps the signed artifact schema to 2.0 and fails closed on a 1.0 proof", () => {
    const b = buildBaseline(baselineSummary, { label: "june", issuedAt: NOW, keypair: kp });
    expect(b.schema_version).toBe("2.0");
    const proof = proveSavings(b, currentSummary, { issuedAt: NOW, keypair: kp });
    expect(proof.schema_version).toBe("2.0");

    // Strip the per-class fields, as a pre-2.0 artifact would have them. There
    // is no honest way to normalize it, so verification must NOT pass.
    const legacy = JSON.parse(JSON.stringify(proof));
    for (const p of [legacy.baseline.period, legacy.current]) {
      delete p.pricedInputTokens; delete p.pricedOutputTokens;
      delete p.inputCostUsd; delete p.outputCostUsd;
    }
    const v = verifySavingsProof(legacy, { publicKeys: pub });
    expect(v.valid).toBe(false);
    expect(v.checks.savings_math_matches).toBe(false);
    expect(v.reason).toMatch(/schema_version 2\.0/);
  });
});

// ---------------------------------------------------------------------------
// 2. HIGH - rate rounding fabricated savings on an unchanged workload.
// ---------------------------------------------------------------------------

describe("savings: rate precision does not manufacture a headline", () => {
  const kp = generateKeyPair();

  // gpt-5-nano, 5.1B input / 100M output = $295.00. Blended rate is
  // $0.0000567307.../1k; quantized at 1e-6 that becomes $0.000057, and the
  // counterfactual at the rounded rate reported "$1.40 saved (0.47%)" for a
  // period IDENTICAL to the baseline. Proof verified, because the verifier
  // recomputed from the same rounded rate.
  const flat = () =>
    summarizeWorkloads([wl({ model: "gpt-5-nano", requests: 1_000_000, inputTotal: 5_100_000_000, outputTotal: 100_000_000 })]);

  it("reports exactly $0.00 when nothing changed at a nano-class blended rate", () => {
    const s = flat();
    expect(s.costUsd).toBeCloseTo(295, 4);

    // What 6dp quantization used to inject, for the record.
    const trueRate = (s.costUsd / s.pricedTokens) * 1000;
    const rounded6 = Math.round(trueRate * 1e6) / 1e6;
    const fabricated = (s.pricedTokens / 1000) * rounded6 - s.costUsd;
    expect(fabricated).toBeGreaterThan(1); // ~$1.40 of pure rounding error
    expect((fabricated / s.costUsd) * 100).toBeGreaterThan(0.4); // ~0.47% of the bill

    const b = buildBaseline(s, { label: "june", issuedAt: NOW, keypair: kp });
    const proof = proveSavings(b, flat(), { issuedAt: NOW, keypair: kp });
    expect(proof.savings.normalizedSavingsUsd).toBe(0);
    expect(proof.savings.normalizedSavingsPct).toBe(0);
  });

  it("stores rates at a precision that does not swallow nano-class digits", () => {
    const p = toPeriodSummary(flat());
    // At 6dp the input rate ($0.00005/1k) had one significant digit left.
    expect(p.inputCostPer1k).toBeCloseTo(0.00005, 12);
    expect(p.outputCostPer1k).toBeCloseTo(0.0004, 12);
  });
});

// ---------------------------------------------------------------------------
// 3. HIGH - unpriced models were scored $0 and ranked cheapest on a public page.
// ---------------------------------------------------------------------------

describe("benchmark: unknown cost is not zero cost", () => {
  const samples: VendorSample[] = [
    { vendor: "openai", model: "gpt-5", invocations: 9000, blocked: 90, flagged: 250, errors: 60,
      reviewed: 7000, input_tokens: 1_800_000, output_tokens: 600_000, high_severity_findings: 1 },
    // Not in the pricing table. It used to score $0.00000 cost/outcome and a
    // composite of 0.4 against gpt-5's 20.4, and RANKED FIRST on cost.
    { vendor: "acme", model: "giant-1", invocations: 9000, blocked: 90, flagged: 250, errors: 60,
      reviewed: 7000, input_tokens: 1_800_000, output_tokens: 600_000, high_severity_findings: 1 },
  ];

  it("excludes the unpriced model from the cost ranking", () => {
    const r = score(samples);
    expect(r.rankings.cost_per_outcome).not.toContain("acme:giant-1");
    expect(r.rankings.cost_per_outcome[0]).toBe("openai:gpt-5");
    expect(r.rankings.cost_unknown).toEqual(["acme:giant-1"]);
  });

  it("marks cost and composite as unknown rather than zero", () => {
    const v = score(samples).by_vendor.find((x) => x.model === "giant-1")!;
    expect(v.cost_known).toBe(false);
    expect(v.cost_per_outcome_usd).toBeNull();
    expect(v.composite).toBeNull();
  });

  it("keeps the priced model scored, and never sorts an unpriced model first in HTML", () => {
    const r = score(samples);
    const gpt = r.by_vendor.find((x) => x.model === "gpt-5")!;
    expect(gpt.cost_known).toBe(true);
    expect(gpt.composite).toBeGreaterThan(0);

    const html = renderHTML(r);
    expect(html).toContain("unknown");

    // Compare ROW order, not raw document offsets: the explanatory note above
    // the table names the unpriced models, so a plain indexOf finds "giant-1"
    // in the prose before it ever reaches the table body.
    const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
    const gptRow = rows.findIndex((t) => t.includes("gpt-5"));
    const unpricedRow = rows.findIndex((t) => t.includes("giant-1"));
    expect(gptRow).toBeGreaterThanOrEqual(0);
    expect(unpricedRow).toBeGreaterThanOrEqual(0);
    // A model nobody has priced must never sort above a scored one.
    expect(gptRow).toBeLessThan(unpricedRow);
    expect(rows[unpricedRow]).toContain("unknown");
  });
});

// ---------------------------------------------------------------------------
// 4. HIGH - a cost answer silently omitted every unpriced receipt.
// ---------------------------------------------------------------------------

describe("query: an incomplete cost figure says so", () => {
  // 10 gpt-5 + 10 unpriced o3-pro, identical usage. The total answer reported
  // only the priced half ($16.00) and understated the bill by half the fleet,
  // with nothing on screen to indicate anything was missing.
  const receipts = [
    ...Array.from({ length: 10 }, (_, i) => rc({ id: `p-${i}`, vendor: "openai", model: "gpt-5", input: 200_000, output: 40_000 })),
    ...Array.from({ length: 10 }, (_, i) => rc({ id: `u-${i}`, vendor: "openai", model: "o3-pro", input: 200_000, output: 40_000 })),
  ];

  it("surfaces the unpriced share on a total-spend answer", () => {
    const r = answerQuery(receipts, "how much did we spend in total");
    // 10 x (200k in @ $0.005/1k + 40k out @ $0.015/1k) = 10 x $1.60 = $16.00.
    expect(r.aggregate?.value).toBeCloseTo(16, 6); // the priced half, unchanged
    expect(r.unpricedMatched).toBe(10);
    expect(r.unpricedModels).toEqual(["openai:o3-pro"]);
    expect(r.costCaveat).toMatch(/INCOMPLETE/);
    expect(r.answer).toMatch(/INCOMPLETE/);
    expect(r.answer).toContain("o3-pro");
  });

  it("surfaces it on a grouped cost breakdown too", () => {
    const r = answerQuery(receipts, "cost by model");
    expect(r.unpricedMatched).toBe(10);
    expect(r.answer).toMatch(/INCOMPLETE/);
  });

  it("does not nag when every matched receipt is priced", () => {
    const priced = receipts.filter((x) => x.receipt.event!.subject!.ai_model === "gpt-5");
    const r = answerQuery(priced, "how much did we spend in total");
    expect(r.unpricedMatched).toBe(0);
    expect(r.costCaveat).toBeNull();
    expect(r.answer).not.toMatch(/INCOMPLETE/);
  });
});

// ---------------------------------------------------------------------------
// 5. MEDIUM - round-then-sum inflated the carbon total, one-directionally.
// ---------------------------------------------------------------------------

describe("carbon: sum then round", () => {
  it("does not inflate a large event count by rounding each event first", () => {
    // claude-haiku-4-5: 0.8 Wh/1k tokens at 320 gCO2e/kWh, so one token is
    // 2.56e-7 gCO2e. Rounding that to 4dp per event gives 3e-4, which is 17.2%
    // high, and the error compounds with every event: 1,000,000 single-token
    // events reported 300 g against a true 256 g. A sustainability figure that
    // only ever moves upward with the event count is not a measurement.
    // (gpt-5 happens to round exactly at 4dp, which is why the inflation has to
    // be demonstrated on a model whose per-event value is small.)
    const events = Array.from({ length: 1_000_000 }, () => ({
      vendor: "anthropic",
      model: "claude-haiku-4-5",
      tokens: 1,
    }));
    const r = rollupCarbon(events);

    const perEventG = (((1 / 1000) * 0.8) / 1000) * 320;
    const trueG = 1_000_000 * perEventG;
    expect(trueG).toBeCloseTo(256, 6);
    expect(r.total_g_co2e).toBeCloseTo(trueG, 4);

    // The old round-then-sum behavior, pinned so the regression is explicit.
    const roundThenSum = 1_000_000 * Number(perEventG.toFixed(4));
    expect(roundThenSum).toBeCloseTo(300, 6);
    expect(roundThenSum).toBeGreaterThan(trueG * 1.15);
    expect(r.total_g_co2e).toBeLessThan(roundThenSum);
  });

  it("keeps per-vendor subtotals consistent with the total", () => {
    const r = rollupCarbon([
      ...Array.from({ length: 50_000 }, () => ({ vendor: "openai", model: "gpt-5", tokens: 3 })),
      ...Array.from({ length: 50_000 }, () => ({ vendor: "anthropic", model: "claude-haiku-4-5", tokens: 3 })),
    ]);
    const sum = Object.values(r.by_vendor).reduce((s, b) => s + b.g, 0);
    expect(sum).toBeCloseTo(r.total_g_co2e, 3);
  });
});

// ---------------------------------------------------------------------------
// 6. MEDIUM - the "over N" cost regex swallowed token questions.
// ---------------------------------------------------------------------------

describe("query: a token threshold is not a dollar threshold", () => {
  const receipts = Array.from({ length: 20 }, (_, i) =>
    rc({ id: `t-${i}`, vendor: "openai", model: "gpt-5", input: 8_000, output: 2_000 })
  );

  it("does not set a $5,000 cost floor on a token question", () => {
    const q = parseQuery("how many receipts used more than 5000 tokens");
    expect(q.filter.minTokens).toBe(5000);
    expect(q.filter.minCost).toBeUndefined(); // was 5000 -> nothing could match
  });

  it("answers the token question correctly", () => {
    const r = answerQuery(receipts, "how many receipts used more than 5000 tokens");
    expect(r.matchedCount).toBe(20); // was 0
    expect(r.answer).toMatch(/^20 receipt\(s\) match/);
  });

  it("still honours a genuine cost floor", () => {
    expect(parseQuery("opus calls over $0.05 in the last 7 days").filter.minCost).toBe(0.05);
    expect(parseQuery("which calls cost more than 0.10").filter.minCost).toBe(0.1);
  });

  it("does not let a mixed question bleed the token number into the cost floor", () => {
    const q = parseQuery("how much did we spend on receipts over 5000 tokens");
    expect(q.filter.minTokens).toBe(5000);
    expect(q.filter.minCost).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. MEDIUM - premium variants collapsed onto the base tier's price.
// ---------------------------------------------------------------------------

describe("ingest: normalizeModel only collapses dated/versioned names", () => {
  it("does not bill a premium variant at the base tier's price", () => {
    // gpt-5-pro and *-thinking are separate, more expensive products. Mapping
    // them to the base tier under-billed every downstream figure.
    expect(normalizeModel("gpt-5-pro").vendor).toBe("unknown");
    expect(normalizeModel("claude-opus-4-6-thinking").vendor).toBe("unknown");
    expect(normalizeModel("gpt-5-chat-latest").vendor).toBe("unknown");
  });

  it("still collapses dated snapshots and versioned names, as documented", () => {
    expect(normalizeModel("gpt-5-2025-08-01")).toEqual({ vendor: "openai", model: "gpt-5" });
    expect(normalizeModel("gpt-5-mini-2025")).toEqual({ vendor: "openai", model: "gpt-5-mini" });
    expect(normalizeModel("gpt-4o-mini-2024-07-18")).toEqual({ vendor: "openai", model: "gpt-4o-mini" });
    expect(normalizeModel("claude-opus-4-6-20260501")).toEqual({ vendor: "anthropic", model: "claude-opus-4-6" });
    expect(normalizeModel("claude-sonnet-4-6")).toEqual({ vendor: "anthropic", model: "claude-sonnet-4-6" });
    expect(normalizeModel("gemini-2.5-flash")).toEqual({ vendor: "google", model: "gemini-2-5-flash" });
    expect(normalizeModel("gemini-2.5-pro")).toEqual({ vendor: "google", model: "gemini-2-5-pro" });
  });

  it("reports an unrecognized variant as unpriced rather than mispriced", () => {
    const { receipts } = receiptsFromWorkloads([
      { ...normalizeModel("gpt-5-pro"), app: "a", requests: 100, inputTotal: 1_000_000, outputTotal: 200_000, at: "2026-06-01T00:00:00.000Z" },
    ]);
    const s = summarizeReceipts(receipts);
    expect(s.unpricedRequests).toBe(100);
    expect(s.costUsd).toBe(0); // honestly zero-and-flagged, not silently under-billed
  });
});

// ---------------------------------------------------------------------------
// 8. MEDIUM - per-request rounding distorted imported bills.
// ---------------------------------------------------------------------------

describe("ingest: expansion preserves a row's token totals exactly", () => {
  it("does not inflate a fractional-average row by 33%", () => {
    // 1,000 requests / 1,500 input / 1,500 output. Averages are 1.5 tokens;
    // Math.round pushed both to 2, reporting 4,000 tokens and $0.0400 against
    // a true 3,000 and $0.0300.
    const { receipts } = receiptsFromWorkloads([
      wl({ requests: 1000, inputTotal: 1500, outputTotal: 1500 }),
    ]);
    const s = summarizeReceipts(receipts);
    expect(s.inputTokens).toBe(1500);
    expect(s.outputTokens).toBe(1500);
    expect(s.totalTokens).toBe(3000);
    expect(s.costUsd).toBeCloseTo(0.03, 10);
  });

  it("is exact for a whole spread of awkward ratios", () => {
    for (const [requests, input, output] of [
      [7, 100, 3], [999, 1_000_000, 1], [13, 5, 5], [1000, 1499, 2501],
    ] as const) {
      const { receipts } = receiptsFromWorkloads([wl({ requests, inputTotal: input, outputTotal: output })]);
      const s = summarizeReceipts(receipts);
      expect(s.inputTokens).toBe(input);
      expect(s.outputTokens).toBe(output);
    }
  });

  it("reports whether the expansion was sampled and what residual remains", () => {
    const exact = receiptsFromWorkloads([wl({ requests: 10, inputTotal: 5000, outputTotal: 1000 })]);
    expect(exact.sampled).toBe(false);
    expect(exact.requestCountResidual).toBe(0);

    // A skewed bill: one huge row plus many tiny ones, over the cap. The
    // max(1, …) floor over-weights the tiny rows against a single global
    // scale; that residual is now reported instead of being silent.
    const skewed: Workload[] = [
      wl({ requests: 500_000, inputTotal: 500_000_000, outputTotal: 100_000_000 }),
      ...Array.from({ length: 500 }, () => wl({ model: "gpt-5-mini", requests: 2, inputTotal: 2000, outputTotal: 400 })),
    ];
    const r = receiptsFromWorkloads(skewed, { maxReceipts: 1000 });
    expect(r.sampled).toBe(true);
    expect(r.requestCountResidual).toBeGreaterThan(0);

    // Tokens and dollars, however, are now recovered by `scale` to within a
    // rounding tick, which is what the headline number depends on.
    const s = summarizeReceipts(r.receipts);
    const trueTokens = skewed.reduce((n, w) => n + w.inputTotal + w.outputTotal, 0);
    expect(Math.abs(s.totalTokens * r.scale - trueTokens) / trueTokens).toBeLessThan(0.001);
  });
});

// ---------------------------------------------------------------------------
// 9. LOW-MED - a hardcoded 15% guess was presented as an expected dollar saving.
// ---------------------------------------------------------------------------

describe("recommendations: enable_dedup_cache claims no dollar figure", () => {
  const samples: ReceiptSample[] = Array.from({ length: 200 }, (_, i) => ({
    use_case: "code-completion", vendor: "anthropic", model: "claude-sonnet-4-6",
    input_tokens: 500, output_tokens: 200, cache_hit: i < 3,
  }));

  it("still flags the unused cache", () => {
    const rec = recommend(samples, 30).find((r) => r.kind === "enable_dedup_cache");
    expect(rec).toBeTruthy();
  });

  it("does not assert 15% of spend as an expected saving", () => {
    const rec = recommend(samples, 30).find((r) => r.kind === "enable_dedup_cache")!;
    // The engine never sees prompt hashes, so it cannot know the achievable
    // hit rate. The old code asserted 0.15 * spend regardless.
    const currentSpend = (200 * 500 / 1000) * 0.003 + (200 * 200 / 1000) * 0.015;
    const oldGuess = Number((0.15 * currentSpend).toFixed(2));
    expect(oldGuess).toBeGreaterThan(0);
    expect(rec.expected_savings_usd_month).toBe(0);
    expect(rec.expected_savings_usd_month).not.toBe(oldGuess);
  });

  it("explains what the saving actually depends on and how to size it", () => {
    const rec = recommend(samples, 30).find((r) => r.kind === "enable_dedup_cache")!;
    expect(rec.evidence).toMatch(/no dollar figure is claimed/);
    expect(rec.evidence).toMatch(/prompt hashes/);
    expect(rec.action.param).toMatchObject({ measure_repeat_rate_first: true });
  });
});
