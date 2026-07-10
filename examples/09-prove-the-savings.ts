/**
 * Example 09 — Prove the savings (not just claim them)
 *
 * The homepage promise is "cut your AI spend, and prove the savings are real."
 * This script is that promise, end to end, on clearly-labeled sample data:
 *
 *   1. Two months of a SaaS company's AI usage (June = before, July = after
 *      moving two light, high-volume workloads onto cheaper same-family models).
 *   2. Sign a tamper-evident BASELINE of the "before" spend.
 *   3. PROVE the realized saving against it, efficiency-normalized so a change
 *      in volume cannot inflate the number.
 *   4. VERIFY both independently, with the public key alone.
 *   5. Show that tampering with the headline number breaks verification, which
 *      is the whole point: the figure is proven, not asserted.
 *
 * The numbers are estimates repriced from usage, exactly as a real bill would be.
 *
 * Run:  node --import tsx examples/09-prove-the-savings.ts
 */

import {
  generateKeyPair,
  receiptsFromWorkloads,
  summarizeReceipts,
  buildBaseline,
  proveSavings,
  verifyBaseline,
  verifySavingsProof,
  fmtUsd,
  type Workload,
} from "../src/index.js";

// --- Sample data (synthetic, illustrative) -------------------------------
// BEFORE: everything runs on premium models.
const JUNE: Workload[] = [
  { vendor: "openai", model: "gpt-5",  app: "support-bot",      requests: 30000, inputTotal: 24_000_000, outputTotal: 6_000_000, at: "2026-06-15" },
  { vendor: "openai", model: "gpt-5",  app: "doc-summarizer",   requests: 8000,  inputTotal: 24_000_000, outputTotal: 3_200_000, at: "2026-06-15" },
  { vendor: "openai", model: "gpt-4o", app: "internal-copilot", requests: 12000, inputTotal: 14_400_000, outputTotal: 6_000_000, at: "2026-06-15" },
];

// AFTER: the two light, high-volume workloads move to cheaper same-family
// models (gpt-5 -> gpt-5-nano, gpt-5 -> gpt-4o-mini). The copilot is unchanged.
// Volume is slightly HIGHER, so raw spend and the efficiency figure diverge.
const JULY: Workload[] = [
  { vendor: "openai", model: "gpt-5-nano",  app: "support-bot",      requests: 33000, inputTotal: 26_400_000, outputTotal: 6_600_000, at: "2026-07-15" },
  { vendor: "openai", model: "gpt-4o-mini", app: "doc-summarizer",   requests: 8500,  inputTotal: 25_500_000, outputTotal: 3_400_000, at: "2026-07-15" },
  { vendor: "openai", model: "gpt-4o",      app: "internal-copilot", requests: 12500, inputTotal: 15_000_000, outputTotal: 6_250_000, at: "2026-07-15" },
];

function banner(tag: string, title: string): void {
  const line = "=".repeat(72);
  console.log(`\n${line}\n  ${tag}   ${title}\n${line}`);
}

function summarize(workloads: Workload[]) {
  // Public path: reprice the usage into receipts, then summarize. For a bill
  // this size every request is kept, so the totals are exact.
  return summarizeReceipts(receiptsFromWorkloads(workloads).receipts);
}

function main(): void {
  const kp = generateKeyPair();
  const publicKeys = { [kp.kid]: kp.public_key };
  let ok = true;
  const check = (cond: boolean, label: string): void => {
    if (!cond) ok = false;
    console.log(`  [${cond ? "ok" : "XX"}] ${label}`);
  };

  const juneSummary = summarize(JUNE);
  const julySummary = summarize(JULY);

  // -------------------------------------------------------------------------
  banner("BASELINE", "Sign the 'before' spend (June)");
  // -------------------------------------------------------------------------
  const baseline = buildBaseline(juneSummary, {
    label: "june-2026",
    issuedAt: new Date().toISOString(),
    keypair: kp,
  });
  console.log(`  spend        ${fmtUsd(baseline.period.costUsd)}`);
  console.log(`  blended rate ${fmtUsd(baseline.period.costPer1kTokens)}/1k tokens`);
  console.log(`  requests     ${baseline.period.requests.toLocaleString()}`);
  console.log(`  signed       kid ${kp.kid}  ·  hash ${baseline.hash.slice(0, 16)}...`);

  // -------------------------------------------------------------------------
  banner("PROVE", "Prove the realized saving (July vs the signed baseline)");
  // -------------------------------------------------------------------------
  const proof = proveSavings(baseline, julySummary, {
    issuedAt: new Date().toISOString(),
    keypair: kp,
  });
  const s = proof.savings;
  console.log(`  blended rate   ${fmtUsd(s.baselineRatePer1k)}/1k  ->  ${fmtUsd(s.currentRatePer1k)}/1k`);
  console.log(`  raw spend      ${fmtUsd(proof.baseline.period.costUsd)}  ->  ${fmtUsd(proof.current.costUsd)}   (moves with volume)`);
  console.log("");
  console.log(`  >>  ${fmtUsd(s.normalizedSavingsUsd)} saved through efficiency  (${s.normalizedSavingsPct}% lower blended rate)`);
  console.log(`      ${fmtUsd(s.absoluteSpendDeltaUsd)} lower on the raw bill as well`);

  // -------------------------------------------------------------------------
  banner("VERIFY", "Independently, with the public key alone");
  // -------------------------------------------------------------------------
  const vb = verifyBaseline(baseline, { publicKeys });
  const vp = verifySavingsProof(proof, { publicKeys });
  check(vb.valid, "baseline signature + hash verify");
  check(vp.valid, "proof signature + baseline hash + savings math all verify");
  check(s.normalizedSavingsUsd > 0 && s.normalizedSavingsPct > 0, "the proven saving is real and positive");

  // -------------------------------------------------------------------------
  banner("TAMPER", "Change the headline number and watch verification fail");
  // -------------------------------------------------------------------------
  const forged = JSON.parse(JSON.stringify(proof)) as typeof proof;
  forged.savings.normalizedSavingsUsd = s.normalizedSavingsUsd * 3; // inflate the claim
  const vf = verifySavingsProof(forged, { publicKeys });
  check(!vf.valid, `a forged savings number is rejected (signature_valid=${vf.checks.signature_valid}, savings_math_matches=${vf.checks.savings_math_matches})`);

  banner("RESULT", ok ? "Savings proven and independently verifiable" : "Something did not verify");
  process.exitCode = ok ? 0 : 1;
}

main();
