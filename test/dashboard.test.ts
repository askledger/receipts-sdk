import { describe, it, expect } from "vitest";
import {
  summarizeReceipts,
  renderDashboardHtml,
  fmtUsd,
  fmtTokens,
} from "../src/cost/dashboard.js";
import { priceFor, costUsd } from "../src/cost/pricing.js";
import type { SignedReceipt } from "../src/types.js";

// Minimal SignedReceipt fixture — the summarizer only reads fields, never
// signatures, so we build just enough shape and cast.
function receipt(opts: {
  vendor?: string;
  model?: string;
  input?: number;
  output?: number;
  app?: string;
  env?: string;
  captured?: string;
  height?: number;
  signed?: boolean;
  evidenceRefs?: number;
  tenant?: string;
}): SignedReceipt {
  const {
    vendor,
    model,
    input = 0,
    output = 0,
    app = "app",
    env = "production",
    captured = "2026-07-01T00:00:00Z",
    height = 1,
    signed = true,
    evidenceRefs = 0,
    tenant = "acme",
  } = opts;
  return {
    receipt: {
      schema_version: "1.0",
      receipt_id: `r-${Math.round(input + output + height)}`,
      tenant_id: tenant,
      issued_at: captured,
      event: {
        schema_version: "1.0",
        tenant_id: tenant,
        event_type: "ai.generation",
        source_system: app,
        event_id: `e-${height}`,
        captured_at: captured,
        context: { environment: env as "production" | "staging" | "development" },
        subject: model ? { ai_vendor: vendor, ai_model: model } : undefined,
        payload: { input_token_count: input, output_token_count: output },
      },
      evidence_refs:
        evidenceRefs > 0
          ? Array.from({ length: evidenceRefs }, (_, i) => ({
              kind: "rule-check",
              hash: `h${i}`,
              status: "pass",
            }))
          : undefined,
      integrity: {
        previous_receipt_hash: "0".repeat(64),
        receipt_hash: "a".repeat(64),
        chain_height: height,
      },
    },
    signatures: signed ? [{ alg: "EdDSA", kid: "k1", sig: "AA==" }] : [],
  } as SignedReceipt;
}

describe("dashboard summarizer", () => {
  it("aggregates requests, tokens, and cost from priced receipts", () => {
    const rs = [
      receipt({ vendor: "anthropic", model: "claude-opus-4-6", input: 1200, output: 800, app: "chat", height: 1 }),
      receipt({ vendor: "openai", model: "gpt-5", input: 2000, output: 500, app: "batch", height: 2 }),
    ];
    const s = summarizeReceipts(rs);

    expect(s.receipts).toBe(2);
    expect(s.requests).toBe(2);
    expect(s.inputTokens).toBe(3200);
    expect(s.outputTokens).toBe(1300);
    expect(s.totalTokens).toBe(4500);

    const expected =
      costUsd(priceFor("anthropic", "claude-opus-4-6")!, { input: 1200, output: 800 }) +
      costUsd(priceFor("openai", "gpt-5")!, { input: 2000, output: 500 });
    expect(s.costUsd).toBeCloseTo(expected, 8);
    expect(s.pricedRequests).toBe(2);
    expect(s.unpricedRequests).toBe(0);
  });

  it("counts unpriced models but excludes them from the cost total", () => {
    const rs = [
      receipt({ vendor: "anthropic", model: "claude-opus-4-6", input: 1000, output: 1000 }),
      receipt({ vendor: "mistral", model: "mistral-large", input: 1000, output: 1000 }),
    ];
    const s = summarizeReceipts(rs);

    expect(s.requests).toBe(2);
    expect(s.unpricedRequests).toBe(1);
    expect(s.pricedRequests).toBe(1);

    const priced = costUsd(priceFor("anthropic", "claude-opus-4-6")!, { input: 1000, output: 1000 });
    expect(s.costUsd).toBeCloseTo(priced, 8); // mistral contributes 0

    const unpriced = s.models.find((m) => m.model === "mistral-large");
    expect(unpriced).toBeDefined();
    expect(unpriced!.priced).toBe(false);
    expect(unpriced!.costUsd).toBe(0);
  });

  it("sorts models by cost descending", () => {
    const rs = [
      receipt({ vendor: "openai", model: "gpt-5-mini", input: 1000, output: 1000 }), // cheap
      receipt({ vendor: "anthropic", model: "claude-opus-4-6", input: 1000, output: 1000 }), // expensive
    ];
    const s = summarizeReceipts(rs);
    expect(s.models[0].model).toBe("claude-opus-4-6");
    expect(s.models[1].model).toBe("gpt-5-mini");
  });

  it("rolls up spend by application and lists environments", () => {
    const rs = [
      receipt({ vendor: "anthropic", model: "claude-opus-4-6", input: 1000, output: 1000, app: "chat", env: "production" }),
      receipt({ vendor: "anthropic", model: "claude-opus-4-6", input: 1000, output: 1000, app: "chat", env: "production" }),
      receipt({ vendor: "openai", model: "gpt-5-mini", input: 500, output: 500, app: "eval", env: "staging" }),
    ];
    const s = summarizeReceipts(rs);

    const chat = s.apps.find((a) => a.name === "chat");
    expect(chat!.requests).toBe(2);
    expect(s.apps[0].name).toBe("chat"); // higher cost first
    expect(s.environments.map((e) => e.name).sort()).toEqual(["production", "staging"]);
  });

  it("tracks integrity signals: signed count, chain height, and correctness bindings", () => {
    const rs = [
      receipt({ vendor: "anthropic", model: "claude-opus-4-6", input: 100, output: 100, height: 5, signed: true, evidenceRefs: 1 }),
      receipt({ vendor: "anthropic", model: "claude-opus-4-6", input: 100, output: 100, height: 7, signed: true, evidenceRefs: 0 }),
      receipt({ vendor: "anthropic", model: "claude-opus-4-6", input: 100, output: 100, height: 3, signed: false, evidenceRefs: 0 }),
    ];
    const s = summarizeReceipts(rs);
    expect(s.signedReceipts).toBe(2);
    expect(s.chainHeight).toBe(7); // max
    expect(s.withEvidenceRefs).toBe(1);
  });

  it("ignores receipts with no model (not counted as AI requests, still counted as receipts)", () => {
    const rs = [
      receipt({ app: "logger", height: 1 }), // no model
      receipt({ vendor: "openai", model: "gpt-5", input: 100, output: 100, height: 2 }),
    ];
    const s = summarizeReceipts(rs);
    expect(s.receipts).toBe(2);
    expect(s.requests).toBe(1);
    expect(s.models).toHaveLength(1);
  });

  it("derives the period from the earliest and latest captured_at", () => {
    const rs = [
      receipt({ vendor: "openai", model: "gpt-5", captured: "2026-07-03T00:00:00Z" }),
      receipt({ vendor: "openai", model: "gpt-5", captured: "2026-07-01T00:00:00Z" }),
      receipt({ vendor: "openai", model: "gpt-5", captured: "2026-07-02T00:00:00Z" }),
    ];
    const s = summarizeReceipts(rs);
    expect(s.period.from).toBe("2026-07-01T00:00:00Z");
    expect(s.period.to).toBe("2026-07-03T00:00:00Z");
  });

  it("handles an empty receipt list without throwing", () => {
    const s = summarizeReceipts([]);
    expect(s.receipts).toBe(0);
    expect(s.requests).toBe(0);
    expect(s.costUsd).toBe(0);
    expect(s.models).toEqual([]);
    expect(s.chainHeight).toBeNull();
    expect(s.period).toEqual({ from: null, to: null });
  });
});

describe("dashboard savings suggestions", () => {
  it("flags an over-tiered light workload with an exact counterfactual saving", () => {
    // 6 opus calls with short completions in one app.
    const rs = Array.from({ length: 6 }, () =>
      receipt({ vendor: "anthropic", model: "claude-opus-4-6", input: 900, output: 200, app: "support-bot" })
    );
    const s = summarizeReceipts(rs);
    expect(s.suggestions).toHaveLength(1);
    const g = s.suggestions[0];
    expect(g.fromModel).toBe("anthropic:claude-opus-4-6");
    expect(g.toModel).toBe("anthropic:claude-sonnet-4-6");
    expect(g.requests).toBe(6);
    expect(g.topApp).toBe("support-bot");

    const current = 6 * costUsd(priceFor("anthropic", "claude-opus-4-6")!, { input: 900, output: 200 });
    const projected = 6 * costUsd(priceFor("anthropic", "claude-sonnet-4-6")!, { input: 900, output: 200 });
    expect(g.currentCost).toBeCloseTo(current, 8);
    expect(g.projectedCost).toBeCloseTo(projected, 8);
    expect(g.estSavings).toBeCloseTo(current - projected, 8);
    expect(s.potentialSavings).toBeCloseTo(current - projected, 8);
  });

  it("does NOT flag a heavy workload (long completions) on a premium model", () => {
    const rs = Array.from({ length: 6 }, () =>
      receipt({ vendor: "anthropic", model: "claude-opus-4-6", input: 2000, output: 4000, app: "report-writer" })
    );
    const s = summarizeReceipts(rs);
    expect(s.suggestions).toHaveLength(0);
  });

  it("groups by (model × app) so a heavy workload cannot mask a light one on the same model", () => {
    const light = Array.from({ length: 8 }, () =>
      receipt({ vendor: "anthropic", model: "claude-opus-4-6", input: 900, output: 220, app: "support-bot" })
    );
    const heavy = Array.from({ length: 3 }, () =>
      receipt({ vendor: "anthropic", model: "claude-opus-4-6", input: 2000, output: 4000, app: "report-writer" })
    );
    const s = summarizeReceipts([...light, ...heavy]);
    // The model-level average output (~1251) is > threshold, but the light app
    // workload must still be surfaced on its own.
    expect(s.suggestions).toHaveLength(1);
    expect(s.suggestions[0].topApp).toBe("support-bot");
    expect(s.suggestions[0].requests).toBe(8);
  });

  it("requires at least a few calls before suggesting a switch", () => {
    const rs = Array.from({ length: 2 }, () =>
      receipt({ vendor: "anthropic", model: "claude-opus-4-6", input: 900, output: 200, app: "rare" })
    );
    expect(summarizeReceipts(rs).suggestions).toHaveLength(0);
  });

  it("makes no suggestion when the model has no cheaper same-vendor tier", () => {
    const rs = Array.from({ length: 6 }, () =>
      receipt({ vendor: "anthropic", model: "claude-haiku-4-5", input: 500, output: 100, app: "cheap" })
    );
    expect(summarizeReceipts(rs).suggestions).toHaveLength(0);
  });
});

describe("dashboard formatting", () => {
  it("formats USD with sensible precision", () => {
    expect(fmtUsd(0)).toBe("$0.00");
    expect(fmtUsd(0.0005)).toBe("$0.0005");
    expect(fmtUsd(1234.5)).toBe("$1,234.50");
  });

  it("formats token counts compactly", () => {
    expect(fmtTokens(500)).toBe("500");
    expect(fmtTokens(3200)).toBe("3.2K");
    expect(fmtTokens(3_200_000)).toBe("3.2M");
  });
});

describe("dashboard HTML report", () => {
  it("renders a self-contained page with the key numbers and no external assets", () => {
    const rs = [
      receipt({ vendor: "anthropic", model: "claude-opus-4-6", input: 1000, output: 1000, app: "chat" }),
      receipt({ vendor: "mistral", model: "mistral-large", input: 1000, output: 1000, app: "chat" }),
    ];
    const html = renderDashboardHtml(summarizeReceipts(rs), "2026-07-06T00:00:00Z");

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Estimated spend");
    expect(html).toContain("anthropic:claude-opus-4-6");
    expect(html).toContain("unpriced"); // mistral flagged
    expect(html).toContain("not a bill"); // honesty footer
    // No external network dependencies.
    expect(html).not.toMatch(/https?:\/\/[^"']*\.(css|js|png|woff)/);
    expect(html).not.toContain("<script");
  });

  it("escapes untrusted field values to prevent HTML injection", () => {
    const rs = [
      receipt({ vendor: "openai", model: "gpt-5", app: "<img src=x onerror=alert(1)>", input: 10, output: 10 }),
    ];
    const html = renderDashboardHtml(summarizeReceipts(rs), "2026-07-06T00:00:00Z");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});
