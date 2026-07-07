import { describe, it, expect } from "vitest";
import { generateKeyPair } from "../src/crypto.js";
import { receiptsFromWorkloads } from "../src/cost/ingest.js";
import { summarizeReceipts } from "../src/cost/dashboard.js";
import {
  buildBaseline,
  proveSavings,
  verifyBaseline,
  verifySavingsProof,
} from "../src/cost/savings.js";

// One workload -> a DashboardSummary, so tests read like real usage.
function summaryFor(model: string, requests: number, inPer: number, outPer: number) {
  const { receipts } = receiptsFromWorkloads([
    {
      vendor: model.startsWith("gpt") ? "openai" : "anthropic",
      model,
      app: "svc",
      requests,
      inputTotal: inPer * requests,
      outputTotal: outPer * requests,
      at: "2026-06-01T00:00:00Z",
    },
  ]);
  return summarizeReceipts(receipts);
}

const NOW = "2026-07-08T00:00:00.000Z";

describe("verified savings", () => {
  const kp = generateKeyPair();
  const pub = { [kp.kid]: kp.public_key };

  // Baseline: 10k gpt-5 calls. Current period: same volume moved to gpt-5-mini.
  const baselineSummary = summaryFor("gpt-5", 10000, 500, 200);
  const currentSummary = summaryFor("gpt-5-mini", 10000, 500, 200);

  it("signs a baseline that verifies", () => {
    const b = buildBaseline(baselineSummary, { label: "june", issuedAt: NOW, keypair: kp });
    const v = verifyBaseline(b, { publicKeys: pub });
    expect(v.valid).toBe(true);
    expect(v.checks.signature_valid).toBe(true);
    expect(v.checks.baseline_hash_matches).toBe(true);
    expect(b.period.costUsd).toBeGreaterThan(0);
  });

  it("proves a real efficiency saving when the blended rate drops", () => {
    const b = buildBaseline(baselineSummary, { label: "june", issuedAt: NOW, keypair: kp });
    const proof = proveSavings(b, currentSummary, { issuedAt: NOW, keypair: kp });
    // moving gpt-5 -> gpt-5-mini at the same volume must show positive savings
    expect(proof.savings.normalizedSavingsUsd).toBeGreaterThan(0);
    expect(proof.savings.currentRatePer1k).toBeLessThan(proof.savings.baselineRatePer1k);
    expect(proof.savings.normalizedSavingsPct).toBeGreaterThan(0);
  });

  it("a valid proof passes independent verification (signature + recomputed math)", () => {
    const b = buildBaseline(baselineSummary, { label: "june", issuedAt: NOW, keypair: kp });
    const proof = proveSavings(b, currentSummary, { issuedAt: NOW, keypair: kp });
    const v = verifySavingsProof(proof, { publicKeys: pub });
    expect(v.valid).toBe(true);
    expect(v.checks.signature_valid).toBe(true);
    expect(v.checks.baseline_hash_matches).toBe(true);
    expect(v.checks.savings_math_matches).toBe(true);
  });

  it("rejects a proof whose savings number was tampered with", () => {
    const b = buildBaseline(baselineSummary, { label: "june", issuedAt: NOW, keypair: kp });
    const proof = proveSavings(b, currentSummary, { issuedAt: NOW, keypair: kp });
    // inflate the claimed saving without re-signing
    const tampered = { ...proof, savings: { ...proof.savings, normalizedSavingsUsd: proof.savings.normalizedSavingsUsd * 5 } };
    const v = verifySavingsProof(tampered, { publicKeys: pub });
    expect(v.valid).toBe(false);
    expect(v.checks.signature_valid).toBe(false); // signature no longer matches the body
  });

  it("rejects a proof whose baseline period was altered", () => {
    const b = buildBaseline(baselineSummary, { label: "june", issuedAt: NOW, keypair: kp });
    const proof = proveSavings(b, currentSummary, { issuedAt: NOW, keypair: kp });
    const tampered = {
      ...proof,
      baseline: { ...proof.baseline, period: { ...proof.baseline.period, costUsd: proof.baseline.period.costUsd * 10 } },
    };
    const v = verifySavingsProof(tampered, { publicKeys: pub });
    expect(v.valid).toBe(false);
  });

  it("fails closed when the verifier has no matching public key", () => {
    const b = buildBaseline(baselineSummary, { label: "june", issuedAt: NOW, keypair: kp });
    const proof = proveSavings(b, currentSummary, { issuedAt: NOW, keypair: kp });
    const v = verifySavingsProof(proof, { publicKeys: {} });
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/no public key/);
  });

  it("does not invent savings when nothing changed", () => {
    const b = buildBaseline(baselineSummary, { label: "june", issuedAt: NOW, keypair: kp });
    const proof = proveSavings(b, baselineSummary, { issuedAt: NOW, keypair: kp });
    expect(proof.savings.normalizedSavingsUsd).toBe(0);
  });
});
