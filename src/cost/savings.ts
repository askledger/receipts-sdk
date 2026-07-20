// Verified savings, the paid differentiator.
//
// A dashboard can tell you your bill went down. It cannot prove WHY, and it
// cannot hand a skeptic (a CFO, a client) a number they can check without
// trusting the person who produced it. This module does that:
//
//   1. buildBaseline() , sign a tamper-evident "before" snapshot of your spend.
//   2. proveSavings()  , compare a later period to that baseline and sign a
//                         proof of the realized saving.
//   3. verifySavingsProof(), anyone re-checks the signature AND recomputes the
//                         math from the numbers in the proof. No trust required.
//
// The headline saving is EFFICIENCY-normalized: it isolates the drop in
// cost-per-token from changes in volume, so a team that simply ran more calls
// cannot show a "saving" it did not earn.
//
// Normalization is PER TOKEN CLASS (input vs output), not on a single pooled
// blended rate. Output tokens cost 3-5x input tokens at every vendor, so a
// pooled $/token rate falls whenever the workload merely becomes more
// input-heavy (longer prompts, a RAG rollout) with no efficiency gain at all.
// The pooled form signed off real fabrications: baseline 1M in / 1M out on
// gpt-5 = $20.00, current 3M in / 1M out = $30.00, and it reported
// normalizedSavingsUsd = $10.00 (25%) with a VERIFYING signature , a signed
// 25% "saving" on a period where the bill rose 50%. Applying the baseline's
// per-class rates to the current per-class volume reports $0.00, correctly.
import { canonicalize, canonicalizeBytes } from "../canonicalize.js";
import { sha256String, sign, verify } from "../crypto.js";
import type { KeyPair } from "../types.js";
import { priceFor } from "./pricing.js";
import type { DashboardSummary } from "./dashboard.js";

export interface PeriodSummary {
  from: string | null;
  to: string | null;
  requests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  pricedTokens: number; // priced-model tokens, the denominator for the blended rate
  // Per-class priced volume and per-class spend. These are what the
  // counterfactual is built from; the blended figures below are display only.
  pricedInputTokens: number;
  pricedOutputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  costUsd: number;
  costPer1kTokens: number; // blended rate = costUsd / (pricedTokens/1000), DISPLAY ONLY
  inputCostPer1k: number; // inputCostUsd / (pricedInputTokens/1000)
  outputCostPer1k: number; // outputCostUsd / (pricedOutputTokens/1000)
  costPerRequest: number;
  byModel: { key: string; requests: number; costUsd: number }[];
}

export interface Signature {
  alg: "EdDSA";
  kid: string;
  sig: string;
}

// Bumped 1.0 -> 2.0: PeriodSummary now carries per-token-class volume and
// spend, and the counterfactual is computed per class. A 1.0 baseline cannot be
// normalized correctly (it has no input/output split), so it is rejected rather
// than silently re-verified under the old, fabricating pooled formula.
export interface SignedBaseline {
  schema_version: "2.0";
  kind: "askledger.savings.baseline";
  label: string;
  issued_at: string;
  period: PeriodSummary;
  hash: string; // sha256 of canonical(period)
  signature: Signature;
}

export interface SavingsProof {
  schema_version: "2.0";
  kind: "askledger.savings.proof";
  baseline: { label: string; hash: string; period: PeriodSummary };
  current: PeriodSummary;
  savings: {
    baselineRatePer1k: number; // blended $/1k tokens, before (display only)
    currentRatePer1k: number; // blended $/1k tokens, after (display only)
    baselineInputRatePer1k: number; // the rates the counterfactual actually uses
    baselineOutputRatePer1k: number;
    currentInputRatePer1k: number;
    currentOutputRatePer1k: number;
    normalizedSavingsUsd: number; // current per-class volume at the baseline per-class rates, minus what it actually cost
    normalizedSavingsPct: number; // as a share of "current volume at baseline rates"
    absoluteSpendDeltaUsd: number; // baseline cost minus current cost (moves with volume)
  };
  method: string;
  issued_at: string;
  signature: Signature;
}

function round(n: number, dp = 6): number {
  const f = 10 ** dp;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r; // avoid a stray -0 in the signed artifact
}

// Rates are stored at 12dp, not 6dp. A blended/input rate for a nano- or
// flash-class model is around 6e-5 $/1k tokens, so quantizing at 1e-6 carried
// up to ~0.8% error , and that error landed directly on the headline. With
// identical workloads in both periods (true saving $0.00) the 6dp rate reported
// "$1.45 saved (0.6%)" and the proof VERIFIED, because the verifier recomputed
// from the same rounded rate. On a $2.6M annual bill that signs off roughly
// $14,500 of savings that never happened.
const RATE_DP = 12;

// The counterfactual multiplier is derived from stored COST and TOKEN COUNTS,
// never from a stored (and therefore rounded) rate, so no display rounding can
// reach the headline number at all.
function ratePerToken(costUsd: number, tokens: number): number {
  return tokens > 0 ? costUsd / tokens : 0;
}

/**
 * Split a period's spend into the input-token and output-token components.
 *
 * The dashboard records only a total cost per model, but normalization needs
 * per-class dollars. Each model's RECORDED cost is apportioned across the two
 * classes by their priced weight (tokens x per-1k list price), so the split
 * always re-sums to the recorded total even if the pricing table has moved
 * since the receipts were produced.
 */
function splitCostByClass(s: DashboardSummary): { input: number; output: number } {
  let input = 0;
  let output = 0;
  for (const m of s.models) {
    const p = priceFor(m.vendor, m.model);
    if (!p) continue; // unpriced: contributes no cost and no priced tokens
    const wIn = (m.inputTokens / 1000) * p.input_per_1k;
    const wOut = (m.outputTokens / 1000) * p.output_per_1k;
    const w = wIn + wOut;
    if (w <= 0) continue;
    input += m.costUsd * (wIn / w);
    output += m.costUsd * (wOut / w);
  }
  return { input, output };
}

export function toPeriodSummary(s: DashboardSummary): PeriodSummary {
  // Rates use PRICED tokens only: cost comes solely from priced models, so
  // dividing by ALL tokens would understate the rate and let volume routed to
  // an unpriced/unknown model manufacture "efficiency".
  const priced = s.pricedTokens ?? s.totalTokens;
  const rateTokens = priced > 0 ? priced : s.totalTokens;
  const costPer1kTokens = rateTokens > 0 ? (s.costUsd / rateTokens) * 1000 : 0;
  const costPerRequest = s.requests > 0 ? s.costUsd / s.requests : 0;

  // Per-class priced volume. summarizeReceipts/summarizeWorkloads track only the
  // priced TOTAL, so recover the per-class split from the priced model rows.
  let pricedInputTokens = 0;
  let pricedOutputTokens = 0;
  for (const m of s.models) {
    if (!priceFor(m.vendor, m.model)) continue;
    pricedInputTokens += m.inputTokens;
    pricedOutputTokens += m.outputTokens;
  }
  const split = splitCostByClass(s);
  // Store the two class costs so they re-sum EXACTLY to the stored costUsd:
  // "no change at all" must recompute to a saving of precisely $0.00, and a
  // residual from independent rounding would reintroduce a phantom headline.
  const costUsd = round(s.costUsd, 4);
  const inputCostUsd = round(split.input, 4);
  const outputCostUsd = round(costUsd - inputCostUsd, 4);

  return {
    from: s.period.from,
    to: s.period.to,
    requests: s.requests,
    totalTokens: s.totalTokens,
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    pricedTokens: priced,
    pricedInputTokens,
    pricedOutputTokens,
    inputCostUsd,
    outputCostUsd,
    costUsd,
    costPer1kTokens: round(costPer1kTokens, RATE_DP),
    inputCostPer1k: round(ratePerToken(inputCostUsd, pricedInputTokens) * 1000, RATE_DP),
    outputCostPer1k: round(ratePerToken(outputCostUsd, pricedOutputTokens) * 1000, RATE_DP),
    costPerRequest: round(costPerRequest, RATE_DP),
    byModel: s.models.map((m) => ({ key: m.key, requests: m.requests, costUsd: round(m.costUsd, 4) })),
  };
}

// Build and sign a baseline snapshot. `issuedAt` is passed in so the function
// stays pure and testable; the CLI supplies the wall-clock time.
export function buildBaseline(
  summary: DashboardSummary,
  opts: { label: string; issuedAt: string; keypair: KeyPair }
): SignedBaseline {
  const period = toPeriodSummary(summary);
  const hash = sha256String(canonicalize(period));
  const unsigned = {
    schema_version: "2.0" as const,
    kind: "askledger.savings.baseline" as const,
    label: opts.label,
    issued_at: opts.issuedAt,
    period,
    hash,
  };
  const sig = sign(canonicalizeBytes(unsigned), opts.keypair);
  return { ...unsigned, signature: { alg: "EdDSA", kid: opts.keypair.kid, sig } };
}

// A 1.0 period summary has no input/output split, so there is no honest way to
// normalize it. Reject rather than fall back to the pooled formula: the whole
// point of the 2.0 bump is that the pooled formula fabricated savings.
function hasClassFields(p: PeriodSummary): boolean {
  return (
    typeof p?.pricedInputTokens === "number" &&
    typeof p?.pricedOutputTokens === "number" &&
    typeof p?.inputCostUsd === "number" &&
    typeof p?.outputCostUsd === "number"
  );
}

// The efficiency-normalized saving: what the CURRENT period's input and output
// volumes would each have cost at the BASELINE's own per-class rate, minus what
// the current period actually cost. Positive only when the cost of a token of a
// given class actually fell , not when the workload merely shifted toward the
// cheaper class.
function computeSavings(baseline: PeriodSummary, current: PeriodSummary) {
  const bInRate = ratePerToken(baseline.inputCostUsd, baseline.pricedInputTokens);
  const bOutRate = ratePerToken(baseline.outputCostUsd, baseline.pricedOutputTokens);
  const cInRate = ratePerToken(current.inputCostUsd, current.pricedInputTokens);
  const cOutRate = ratePerToken(current.outputCostUsd, current.pricedOutputTokens);

  const currentAtBaselineRate =
    current.pricedInputTokens * bInRate + current.pricedOutputTokens * bOutRate;
  const normalizedSavingsUsd = currentAtBaselineRate - current.costUsd;
  const normalizedSavingsPct =
    currentAtBaselineRate > 0 ? (normalizedSavingsUsd / currentAtBaselineRate) * 100 : 0;
  return {
    baselineRatePer1k: round(baseline.costPer1kTokens, RATE_DP),
    currentRatePer1k: round(current.costPer1kTokens, RATE_DP),
    baselineInputRatePer1k: round(bInRate * 1000, RATE_DP),
    baselineOutputRatePer1k: round(bOutRate * 1000, RATE_DP),
    currentInputRatePer1k: round(cInRate * 1000, RATE_DP),
    currentOutputRatePer1k: round(cOutRate * 1000, RATE_DP),
    normalizedSavingsUsd: round(normalizedSavingsUsd, 2),
    normalizedSavingsPct: round(normalizedSavingsPct, 1),
    absoluteSpendDeltaUsd: round(baseline.costUsd - current.costUsd, 2),
  };
}

const METHOD =
  "Efficiency-normalized per token class: the current period's input and output token volumes are each repriced at the baseline period's own per-class rate, and actual current cost is subtracted. Isolates a real fall in cost-per-token from both volume growth and a shift in the input/output mix (output tokens cost 3-5x input, so a pooled blended rate would report a saving for a merely more input-heavy workload). Costs are estimates repriced from usage exports.";

export function proveSavings(
  baseline: SignedBaseline,
  currentSummary: DashboardSummary,
  opts: { issuedAt: string; keypair: KeyPair }
): SavingsProof {
  const current = toPeriodSummary(currentSummary);
  if (!hasClassFields(baseline.period)) {
    throw new Error(
      "baseline is schema_version 1.0 (no input/output token split): it cannot be normalized per token class. Re-run `baseline` to issue a 2.0 baseline."
    );
  }
  const savings = computeSavings(baseline.period, current);
  const unsigned = {
    schema_version: "2.0" as const,
    kind: "askledger.savings.proof" as const,
    baseline: { label: baseline.label, hash: baseline.hash, period: baseline.period },
    current,
    savings,
    method: METHOD,
    issued_at: opts.issuedAt,
  };
  const sig = sign(canonicalizeBytes(unsigned), opts.keypair);
  return { ...unsigned, signature: { alg: "EdDSA", kid: opts.keypair.kid, sig } };
}

export interface VerifyResult {
  valid: boolean;
  checks: {
    signature_valid: boolean;
    baseline_hash_matches: boolean; // proof only
    savings_math_matches: boolean; // proof only
  };
  reason?: string;
}

function checkSig(unsigned: unknown, signature: Signature, publicKeys: Record<string, string>): boolean {
  const pk = publicKeys[signature.kid];
  if (!pk) return false;
  return verify(canonicalizeBytes(unsigned), signature.sig, pk);
}

export function verifyBaseline(
  b: SignedBaseline,
  opts: { publicKeys: Record<string, string> }
): VerifyResult {
  const { signature, ...unsigned } = b;
  const signature_valid = checkSig(unsigned, signature, opts.publicKeys);
  const baseline_hash_matches = b.hash === sha256String(canonicalize(b.period));
  return {
    valid: signature_valid && baseline_hash_matches,
    checks: { signature_valid, baseline_hash_matches, savings_math_matches: true },
    reason: !opts.publicKeys[signature.kid] ? `no public key for kid ${signature.kid}` : undefined,
  };
}

// Independently verify a savings proof: the signature must be valid AND the
// stated savings must equal a fresh recomputation from the baseline and current
// figures embedded in the proof. This is what lets a skeptic trust the number
// without trusting whoever handed it to them.
export function verifySavingsProof(
  p: SavingsProof,
  opts: { publicKeys: Record<string, string> }
): VerifyResult {
  const { signature, ...unsigned } = p;
  const signature_valid = checkSig(unsigned, signature, opts.publicKeys);
  const baseline_hash_matches = p.baseline.hash === sha256String(canonicalize(p.baseline.period));
  // Fail closed on a pre-2.0 proof: without the per-class split the only
  // available recomputation is the pooled one that manufactured savings from a
  // token-mix shift, so "verified" would mean nothing.
  const classFieldsPresent = hasClassFields(p.baseline.period) && hasClassFields(p.current);
  const recomputed = classFieldsPresent ? computeSavings(p.baseline.period, p.current) : null;
  // Every field a reader acts on must be recomputed, including the headline
  // percentage and the per-class rates the counterfactual is built from.
  // Omitting the percentage let a signed proof state "95% saved" while the
  // recomputation said 5% and still verify, and the percentage is the number a
  // CFO or auditor actually reads.
  const savings_math_matches =
    recomputed !== null &&
    recomputed.normalizedSavingsUsd === p.savings.normalizedSavingsUsd &&
    recomputed.absoluteSpendDeltaUsd === p.savings.absoluteSpendDeltaUsd &&
    recomputed.baselineRatePer1k === p.savings.baselineRatePer1k &&
    recomputed.currentRatePer1k === p.savings.currentRatePer1k &&
    recomputed.baselineInputRatePer1k === p.savings.baselineInputRatePer1k &&
    recomputed.baselineOutputRatePer1k === p.savings.baselineOutputRatePer1k &&
    recomputed.currentInputRatePer1k === p.savings.currentInputRatePer1k &&
    recomputed.currentOutputRatePer1k === p.savings.currentOutputRatePer1k &&
    recomputed.normalizedSavingsPct === p.savings.normalizedSavingsPct;
  const reason = !opts.publicKeys[signature.kid]
    ? `no public key for kid ${signature.kid}`
    : !classFieldsPresent
      ? "proof predates schema_version 2.0 (no input/output token split): its savings figure was computed on a pooled blended rate and cannot be verified"
      : undefined;
  return {
    valid: signature_valid && baseline_hash_matches && savings_math_matches,
    checks: { signature_valid, baseline_hash_matches, savings_math_matches },
    reason,
  };
}
