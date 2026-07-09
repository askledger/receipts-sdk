import { describe, it, expect } from "vitest";
import { normalizeModel, parseUsageExport, receiptsFromWorkloads, type Workload } from "../src/cost/ingest.js";
import { priceFor } from "../src/cost/pricing.js";

describe("cost fixes", () => {
  it("normalizeModel maps cheaper sub-tiers to themselves, not the premium sibling", () => {
    expect(normalizeModel("gpt-4o-mini-2024-07-18")).toEqual({ vendor: "openai", model: "gpt-4o-mini" });
    expect(normalizeModel("gpt-5-nano")).toEqual({ vendor: "openai", model: "gpt-5-nano" });
    expect(normalizeModel("gpt-5-mini")).toEqual({ vendor: "openai", model: "gpt-5-mini" });
    expect(normalizeModel("gpt-5")).toEqual({ vendor: "openai", model: "gpt-5" });
    expect(normalizeModel("gpt-4o")).toEqual({ vendor: "openai", model: "gpt-4o" });
  });

  it("gpt-4o-mini is priced far below gpt-4o (no ~16x overstatement)", () => {
    const mini = priceFor("openai", "gpt-4o-mini");
    const big = priceFor("openai", "gpt-4o");
    expect(mini).toBeTruthy();
    expect(big).toBeTruthy();
    expect(mini!.input_per_1k).toBeLessThan(big!.input_per_1k / 5);
  });

  it("parseUsageExport does not let an empty snapshot_id or a zero count shadow a real value", () => {
    const rows = parseUsageExport(
      JSON.stringify({
        data: [
          { snapshot_id: "", model: "gpt-4o", n_requests: 0, requests: 1000, input_tokens: 5_000_000, output_tokens: 1_000_000 },
        ],
      })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe("gpt-4o"); // not "unknown"
    expect(rows[0].requests).toBe(1000); // 0 fell through to `requests`
  });

  it("wide bills (many tiny rows) do not inflate the recovered scale", () => {
    // 300 one-request rows with a cap of 100 => downsampling can't shrink the
    // count (max(1,…) floor), so scale must be ~1, not 300/100 = 3.
    const wide: Workload[] = Array.from({ length: 300 }, () => ({
      vendor: "openai", model: "gpt-5", app: "a", requests: 1,
      inputTotal: 1000, outputTotal: 200, at: "2026-06-01T00:00:00.000Z",
    }));
    const r = receiptsFromWorkloads(wide, { maxReceipts: 100 });
    expect(r.receipts.length).toBe(300);
    expect(r.scale).toBeCloseTo(1, 6);
  });
});
