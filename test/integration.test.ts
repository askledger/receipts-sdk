import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  generateKeyPair,
  signReceipt,
  verifyReceipt,
  answerQuery,
  runAlerts,
  summarizeReceipts,
} from "../src/index.js";
import type { RawEvent, Classification, DecisionVerdict } from "../src/types.js";

// End-to-end: sign real receipts with real crypto, then drive the query, alerts
// and dashboard pipelines over them — the integration the unit tests don't
// cover (crypto → flatten → parse → run/alerts/summarize, and the CLI wiring).

let seq = 0;
function event(o: { model?: string; app?: string; in?: number; out?: number; cls?: Classification; type?: string }): RawEvent {
  seq += 1;
  return {
    schema_version: "1.0",
    tenant_id: "acme",
    event_type: o.type ?? "ai.generation",
    source_system: o.app ?? "app",
    event_id: `e-${seq}`,
    captured_at: "2026-07-01T10:00:00.000Z",
    context: { environment: "production" },
    subject: { ai_vendor: o.model?.startsWith("gpt") ? "openai" : "anthropic", ai_model: o.model ?? "gpt-5" },
    payload: { input_token_count: o.in ?? 100, output_token_count: o.out ?? 100, input_classification: o.cls },
  };
}
function decisionBlock(v: DecisionVerdict) {
  return { policy_bundle_hash: "pb", applied_policies: ["p1"], decision: v };
}

describe("integration: sign → verify → query / alerts / dashboard", () => {
  const kp = generateKeyPair();
  const receipts = [
    ...Array.from({ length: 3 }, () => signReceipt({ event: event({ model: "claude-opus-4-6", app: "support-bot", in: 900, out: 200 }), keypair: kp })),
    signReceipt({ event: event({ model: "gpt-5", app: "loan-bot", type: "loan.decision", in: 2000, out: 500 }), keypair: kp, decision: decisionBlock("block") }),
    signReceipt({ event: event({ model: "gpt-5", app: "loan-bot", type: "loan.decision", in: 2000, out: 500 }), keypair: kp, decision: decisionBlock("allow") }),
    signReceipt({ event: event({ model: "gpt-5", app: "chat", in: 500, out: 500, cls: "pii" }), keypair: kp }),
  ];
  const publicKeys = { [kp.kid]: kp.public_key };

  it("every signed receipt verifies (real crypto)", () => {
    for (const r of receipts) {
      const v = verifyReceipt(r, { publicKeys });
      expect(v.checks.signature_valid).toBe(true);
      expect(v.checks.canonical_hash_matches).toBe(true);
    }
  });

  it("query counts and aggregates over the real receipts, with citations", () => {
    expect(answerQuery(receipts, "how many gpt-5 calls?").aggregate).toEqual({ metric: "count", value: 3 });
    const byModel = answerQuery(receipts, "cost by model");
    expect(byModel.groups?.map((g) => g.key).sort()).toEqual(["claude-opus-4-6", "gpt-5"]);
    const blocked = answerQuery(receipts, "show blocked decisions");
    expect(blocked.matchedCount).toBe(1);
    expect(blocked.citations.length).toBe(1); // grounded + cited
  });

  it("alerts flag the blocked decision and the sensitive-data receipt", () => {
    const ids = runAlerts(receipts).map((a) => a.id);
    expect(ids).toContain("blocked-decisions");
    expect(ids).toContain("sensitive-data");
  });

  it("dashboard summary is coherent and excludes governed decisions from over-tiering", () => {
    const s = summarizeReceipts(receipts);
    expect(s.requests).toBe(6);
    expect(s.signedReceipts).toBe(6);
    // over-tiering should surface the support-bot workload, never the governed loan-bot
    expect(s.suggestions.some((x) => x.topApp === "loan-bot")).toBe(false);
  });

  // CLI wiring — only when the bin is built (CI builds before test; local `npm test`
  // after `npm run build`). Skips cleanly otherwise.
  const CLI = path.resolve("dist/cli.js");
  const hasCLI = fs.existsSync(CLI);
  (hasCLI ? it : it.skip)("the `query` and `alerts` CLI commands wire end-to-end (--json)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "al-int-"));
    try {
      fs.writeFileSync(path.join(dir, "receipts.json"), JSON.stringify(receipts));
      const q = JSON.parse(execFileSync("node", [CLI, "query", "how many gpt-5 calls?", "--paths", dir, "--json"], { encoding: "utf8" }));
      expect(q.aggregate).toEqual({ metric: "count", value: 3 });
      const a = JSON.parse(execFileSync("node", [CLI, "alerts", dir, "--json"], { encoding: "utf8" }));
      expect(a.map((x: { id: string }) => x.id)).toContain("blocked-decisions");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
