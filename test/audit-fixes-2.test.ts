import { describe, it, expect } from "vitest";
import { receiptsFromWorkloads, type Workload } from "../src/cost/ingest.js";
import { summarizeReceipts } from "../src/cost/dashboard.js";
import { buildBaseline, proveSavings } from "../src/cost/savings.js";
import { generateKeyPair } from "../src/index.js";
import { detectDeviation } from "../src/safety/deviation-detector.js";
import { ApprovalWorkflow } from "../src/workflows/approval.js";

const kp = generateKeyPair();
const at = "2026-06-01T00:00:00.000Z";
const summ = (w: Workload[]) => summarizeReceipts(receiptsFromWorkloads(w).receipts);

describe("audit batch 2 fixes", () => {
  it("COST-2: routing volume to an unpriced model cannot fabricate savings", () => {
    const gpt5: Workload = { vendor: "openai", model: "gpt-5", app: "a", requests: 1000, inputTotal: 1_000_000, outputTotal: 200_000, at };
    const baseline = buildBaseline(summ([gpt5]), { label: "b", issuedAt: at, keypair: kp });
    // current period = same gpt-5 usage PLUS a pile of unpriced ($0) tokens
    const unpriced: Workload = { vendor: "unknown", model: "mystery-1", app: "b", requests: 1000, inputTotal: 1_000_000, outputTotal: 200_000, at };
    const proof = proveSavings(baseline, summ([gpt5, unpriced]), { issuedAt: at, keypair: kp });
    // efficiency is unchanged; the unpriced tokens must not create a "saving"
    expect(Math.abs(proof.savings.normalizedSavingsUsd)).toBeLessThan(0.01);
    expect(proof.savings.normalizedSavingsPct).toBeLessThan(0.1);
  });

  it("SAFETY-2: a substituted PII category is flagged even at equal total count", () => {
    const r = detectDeviation({
      input_classification: "internal",
      output_classification: "internal",
      input_pii: { count: 1, categories: { email: 1 }, findings: [], has_high_confidence: false },
      output_pii: { count: 1, categories: { us_ssn: 1 }, findings: [], has_high_confidence: false },
    });
    const f = r.findings.find((x) => x.category === "pii_introduced_in_response");
    expect(f).toBeTruthy();
    expect(f!.severity).toBe("high");
    expect(r.severity).toBeGreaterThan(0);
  });

  it("SAFETY-2: echoing the same PII category back is NOT flagged", () => {
    const r = detectDeviation({
      input_pii: { count: 1, categories: { email: 1 }, findings: [], has_high_confidence: false },
      output_pii: { count: 1, categories: { email: 1 }, findings: [], has_high_confidence: false },
    });
    expect(r.findings.find((x) => x.category === "pii_introduced_in_response")).toBeUndefined();
  });

  it("WORKFLOW-6: a decision after the deadline is rejected and expires the request", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const wf = new ApprovalWorkflow({
      id: "1", tenantId: "t", requestedBy: "u", requestedAt: past, context: {},
      approvers: ["a", "b"], threshold: 1, expiresAt: past,
    });
    await expect(
      wf.submit({ approver: "a", decision: "approve", at: new Date().toISOString() })
    ).rejects.toThrow(/expired/);
    expect(wf.state).toBe("done");
  });

  it("WORKFLOW-6: a valid approval before the deadline still works", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const wf = new ApprovalWorkflow({
      id: "1", tenantId: "t", requestedBy: "u", requestedAt: new Date().toISOString(), context: {},
      approvers: ["a"], threshold: 1, expiresAt: future,
    });
    const st = await wf.submit({ approver: "a", decision: "approve", at: new Date().toISOString() });
    expect(st).toBe("done");
  });
});
