import { describe, it, expect } from "vitest";
import { parseQuery, runQuery, answerQuery } from "../src/query/index.js";
import { runAlerts, perReceiptRule } from "../src/query/alerts.js";
import { parseQueryLLM } from "../src/query/llm.js";
import { summarizeReceipts } from "../src/cost/dashboard.js";
import type { SignedReceipt, DecisionVerdict, Classification } from "../src/types.js";

function rc(o: {
  id?: string;
  vendor?: string;
  model?: string;
  app?: string;
  input?: number;
  output?: number;
  env?: string;
  captured?: string;
  decision?: DecisionVerdict;
  inClass?: Classification;
  outClass?: Classification;
  evidence?: number;
  signed?: boolean;
  height?: number;
  eventType?: string;
}): SignedReceipt {
  const {
    id = "r-" + Math.round((o.input ?? 0) + (o.output ?? 0) + (o.height ?? 0)),
    vendor, model, app = "app", input = 0, output = 0, env = "production",
    captured = "2026-07-01T00:00:00Z", decision, inClass, outClass,
    evidence = 0, signed = true, height = 1, eventType = "ai.generation",
  } = o;
  return {
    receipt: {
      schema_version: "1.0",
      receipt_id: id,
      tenant_id: "acme",
      issued_at: captured,
      event: {
        schema_version: "1.0",
        tenant_id: "acme",
        event_type: eventType,
        source_system: app,
        event_id: "e-" + id,
        captured_at: captured,
        context: { environment: env as "production" | "staging" | "development" },
        subject: model ? { ai_vendor: vendor, ai_model: model } : undefined,
        payload: { input_token_count: input, output_token_count: output, input_classification: inClass, output_classification: outClass },
      },
      decision: decision ? { policy_bundle_hash: "h", applied_policies: [], decision } : undefined,
      evidence_refs: evidence > 0 ? Array.from({ length: evidence }, (_, i) => ({ kind: "rule-check", hash: "h" + i })) : undefined,
      integrity: { previous_receipt_hash: "0".repeat(64), receipt_hash: "a".repeat(64), chain_height: height },
    },
    signatures: signed ? [{ alg: "EdDSA", kid: "k1", sig: "AA==" }] : [],
  } as SignedReceipt;
}

const NOW = new Date("2026-07-10T00:00:00Z");

describe("parseQuery (deterministic)", () => {
  it("reads decision verdicts from denial words", () => {
    expect(parseQuery("show me denied loan decisions").filter.decision).toBe("block");
    expect(parseQuery("what was flagged?").filter.decision).toBe("flag");
  });
  it("detects cost aggregation grouped by model", () => {
    const q = parseQuery("how much did we spend by model?");
    expect(q.intent).toBe("aggregate");
    expect(q.metric).toBe("cost");
    expect(q.groupBy).toBe("model");
  });
  it("counts", () => {
    expect(parseQuery("how many gpt-5 calls?").intent).toBe("count");
    expect(parseQuery("how many gpt-5 calls?").filter.model).toBe("gpt-5");
  });
  it("parses model, cost thresholds, and relative time", () => {
    const q = parseQuery("opus calls over $0.05 in the last 7 days", NOW);
    expect(q.filter.model).toBe("opus");
    expect(q.filter.minCost).toBe(0.05);
    expect(q.filter.since).toBe(new Date(NOW.getTime() - 7 * 86400000).toISOString());
  });
  it("flags sensitive, unsigned, and missing-evidence filters", () => {
    expect(parseQuery("anything with pii").filter.sensitive).toBe(true);
    expect(parseQuery("unsigned receipts").filter.signed).toBe(false);
    expect(parseQuery("decisions missing evidence").filter.hasEvidence).toBe(false);
  });
  it("routes issue questions to alerts", () => {
    expect(parseQuery("anything wrong here?").wantsAlerts).toBe(true);
    expect(parseQuery("what are the critical issues?").wantsAlerts).toBe(true);
    expect(parseQuery("list opus calls").wantsAlerts).toBeFalsy();
  });
});

describe("runQuery (grounded results)", () => {
  const receipts = [
    rc({ id: "a", vendor: "anthropic", model: "claude-opus-4-6", app: "loan-bot", input: 1000, output: 800, decision: "block" }),
    rc({ id: "b", vendor: "openai", model: "gpt-5", app: "chat", input: 500, output: 500, decision: "allow" }),
    rc({ id: "c", vendor: "anthropic", model: "claude-opus-4-6", app: "loan-bot", input: 900, output: 700, decision: "allow" }),
  ];

  it("lists matches and cites their receipt ids", () => {
    const r = answerQuery(receipts, "show me opus calls");
    expect(r.matchedCount).toBe(2);
    expect(r.citations.sort()).toEqual(["a", "c"]);
  });
  it("filters by decision", () => {
    const r = answerQuery(receipts, "which decisions were blocked?");
    expect(r.matchedCount).toBe(1);
    expect(r.citations).toEqual(["a"]);
  });
  it("counts", () => {
    expect(answerQuery(receipts, "how many gpt-5 calls?").aggregate).toEqual({ metric: "count", value: 1 });
  });
  it("aggregates cost by model into sorted groups", () => {
    const r = answerQuery(receipts, "cost by model");
    expect(r.groups).toBeDefined();
    expect(r.groups![0].key).toBe("claude-opus-4-6"); // higher cost first
    expect(r.groups![0].count).toBe(2);
  });
  it("never returns receipts outside the filter", () => {
    const r = answerQuery(receipts, "gpt-5 in chat");
    expect(r.matched.every((row) => row.model === "gpt-5")).toBe(true);
  });
});

describe("alerts", () => {
  it("flags blocked decisions, sensitive data, unsigned, and missing evidence", () => {
    const receipts = [
      rc({ id: "blk", model: "gpt-5", decision: "block" }),
      rc({ id: "pii", model: "gpt-5", inClass: "pii" }),
      rc({ id: "uns", model: "gpt-5", signed: false }),
      rc({ id: "hs", model: "gpt-5", decision: "require-approval", evidence: 0 }),
      rc({ id: "ok", model: "gpt-5", decision: "allow", evidence: 1 }),
    ];
    const alerts = runAlerts(receipts);
    const ids = alerts.map((a) => a.id);
    expect(ids).toContain("blocked-decisions");
    expect(ids).toContain("sensitive-data");
    expect(ids).toContain("unsigned-receipts");
    expect(ids).toContain("high-stakes-no-evidence");
    // high severity sorts first
    expect(alerts[0].severity).toBe("high");
  });

  it("names the offending receipt ids", () => {
    const alerts = runAlerts([rc({ id: "blk1", model: "gpt-5", decision: "block" })]);
    const blocked = alerts.find((a) => a.id === "blocked-decisions")!;
    expect(blocked.count).toBe(1);
    expect(blocked.receiptIds).toContain("blk1");
  });

  it("detects a cost spike across days", () => {
    const receipts = [
      rc({ id: "d1", vendor: "anthropic", model: "claude-opus-4-6", input: 100, output: 100, captured: "2026-07-01T00:00:00Z" }),
      rc({ id: "d2", vendor: "anthropic", model: "claude-opus-4-6", input: 100, output: 100, captured: "2026-07-02T00:00:00Z" }),
      rc({ id: "d3", vendor: "anthropic", model: "claude-opus-4-6", input: 50000, output: 50000, captured: "2026-07-03T00:00:00Z" }),
    ];
    const alerts = runAlerts(receipts);
    expect(alerts.map((a) => a.id)).toContain("cost-spike");
  });

  it("returns nothing for clean receipts", () => {
    const clean = [rc({ id: "ok1", vendor: "openai", model: "gpt-5-mini", input: 100, output: 100, decision: "allow", signed: true })];
    expect(runAlerts(clean)).toEqual([]);
  });

  it("supports user-added rules and survives a throwing rule", () => {
    const receipts = [rc({ id: "x", model: "gpt-5", app: "risky" })];
    const custom = perReceiptRule({
      id: "risky-app", severity: "low", title: "Risky app", test: (r) => r.app === "risky", detail: (n) => `${n} in risky`,
    });
    const boom = { id: "boom", severity: "high" as const, title: "boom", evaluate() { throw new Error("nope"); } };
    const alerts = runAlerts(receipts, { extraRules: [custom, boom] });
    expect(alerts.map((a) => a.id)).toContain("risky-app");
    expect(alerts.map((a) => a.id)).not.toContain("boom"); // throwing rule is swallowed
  });
});

describe("over-tiering excludes governed decisions", () => {
  it("flags a routine light workload but not a decision-bearing one", () => {
    // Both are opus with short outputs; only the one WITHOUT a policy decision
    // block should be flagged as over-tiered (a loan approval on opus is a
    // considered choice, not waste).
    const routine = Array.from({ length: 6 }, () =>
      rc({ vendor: "anthropic", model: "claude-opus-4-6", app: "support-bot", input: 900, output: 200 })
    );
    const governed = Array.from({ length: 6 }, () =>
      rc({ vendor: "anthropic", model: "claude-opus-4-6", app: "loan-bot", input: 900, output: 200, decision: "allow" })
    );
    const s = summarizeReceipts([...routine, ...governed]);
    const apps = s.suggestions.map((x) => x.topApp);
    expect(apps).toContain("support-bot");
    expect(apps).not.toContain("loan-bot");
  });
});

describe("parseQueryLLM (grounded parse via injected client)", () => {
  it("coerces the model's JSON into a StructuredQuery", async () => {
    const fakeClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: '```json\n{"intent":"aggregate","metric":"cost","groupBy":"app","limit":10,"filter":{"decision":"block","sensitive":true}}\n```' }],
        }),
      },
    };
    const q = await parseQueryLLM("break down blocked pii spend by app", { client: fakeClient, now: NOW });
    expect(q.intent).toBe("aggregate");
    expect(q.metric).toBe("cost");
    expect(q.groupBy).toBe("app");
    expect(q.limit).toBe(10);
    expect(q.filter.decision).toBe("block");
    expect(q.filter.sensitive).toBe(true);
  });

  it("falls back to the deterministic parse when the model output is unusable", async () => {
    const fakeClient = { messages: { create: async () => ({ content: [{ type: "text", text: "sorry, no idea" }] }) } };
    const q = await parseQueryLLM("how many gpt-5 calls?", { client: fakeClient, now: NOW });
    expect(q.intent).toBe("count"); // came from the deterministic base
    expect(q.filter.model).toBe("gpt-5");
  });

  it("supports a provider-neutral complete() hook (bring your own model)", async () => {
    let sawSystem = "";
    const complete = async (input: { system: string; prompt: string }) => {
      sawSystem = input.system;
      return '{"intent":"count","metric":"count","filter":{"model":"gpt-5"}}';
    };
    const q = await parseQueryLLM("count gpt-5 calls", { complete, now: NOW });
    expect(q.intent).toBe("count");
    expect(q.filter.model).toBe("gpt-5");
    expect(sawSystem).toContain("JSON query object"); // the hook received the system prompt
  });

  it("drops invalid enum values from the model", async () => {
    const fakeClient = { messages: { create: async () => ({ content: [{ type: "text", text: '{"intent":"nonsense","metric":"cost","filter":{"decision":"bogus"}}' }] }) } };
    const q = await parseQueryLLM("spend", { client: fakeClient, now: NOW });
    expect(q.intent).not.toBe("nonsense"); // invalid enum ignored → base intent kept
    expect(q.filter.decision).toBeUndefined(); // invalid verdict dropped
  });
});
