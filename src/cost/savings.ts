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
// The headline saving is EFFICIENCY-normalized: it isolates the drop in blended
// cost-per-token from changes in volume, so a team that simply ran more calls
// cannot show a "saving" it did not earn.
import { canonicalize, canonicalizeBytes } from "../canonicalize.js";
import { sha256String, sign, verify } from "../crypto.js";
import type { KeyPair } from "../types.js";
import type { DashboardSummary } from "./dashboard.js";

export interface PeriodSummary {
  from: string | null;
  to: string | null;
  requests: number;
  totalTokens: number;
  pricedTokens: number; // priced-model tokens, the denominator for the blended rate
  costUsd: number;
  costPer1kTokens: number; // blended rate = costUsd / (pricedTokens/1000)
  costPerRequest: number;
  byModel: { key: string; requests: number; costUsd: number }[];
}

export interface Signature {
  alg: "EdDSA";
  kid: string;
  sig: string;
}

export interface SignedBaseline {
  schema_version: "1.0";
  kind: "askledger.savings.baseline";
  label: string;
  issued_at: string;
  period: PeriodSummary;
  hash: string; // sha256 of canonical(period)
  signature: Signature;
}

export interface SavingsProof {
  schema_version: "1.0";
  kind: "askledger.savings.proof";
  baseline: { label: string; hash: string; period: PeriodSummary };
  current: PeriodSummary;
  savings: {
    baselineRatePer1k: number; // blended $/1k tokens, before
    currentRatePer1k: number; // blended $/1k tokens, after
    normalizedSavingsUsd: number; // current volume at the baseline rate, minus what it actually cost
    normalizedSavingsPct: number; // as a share of "current volume at baseline rate"
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

export function toPeriodSummary(s: DashboardSummary): PeriodSummary {
  // Blended rate uses PRICED tokens only: cost comes solely from priced models,
  // so dividing by ALL tokens would understate the rate and let volume routed to
  // an unpriced/unknown model manufacture "efficiency". Fall back to totalTokens
  // for older summaries that predate the pricedTokens field.
  const priced = s.pricedTokens ?? s.totalTokens;
  const rateTokens = priced > 0 ? priced : s.totalTokens;
  const costPer1kTokens = rateTokens > 0 ? (s.costUsd / rateTokens) * 1000 : 0;
  const costPerRequest = s.requests > 0 ? s.costUsd / s.requests : 0;
  return {
    from: s.period.from,
    to: s.period.to,
    requests: s.requests,
    totalTokens: s.totalTokens,
    pricedTokens: priced,
    costUsd: round(s.costUsd, 4),
    costPer1kTokens: round(costPer1kTokens),
    costPerRequest: round(costPerRequest),
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
    schema_version: "1.0" as const,
    kind: "askledger.savings.baseline" as const,
    label: opts.label,
    issued_at: opts.issuedAt,
    period,
    hash,
  };
  const sig = sign(canonicalizeBytes(unsigned), opts.keypair);
  return { ...unsigned, signature: { alg: "EdDSA", kid: opts.keypair.kid, sig } };
}

// The efficiency-normalized saving: what the current volume WOULD have cost at
// the baseline's blended rate, minus what it actually cost. Positive only when
// the blended cost per token fell.
function computeSavings(baseline: PeriodSummary, current: PeriodSummary) {
  const baselineRatePer1k = baseline.costPer1kTokens;
  const currentRatePer1k = current.costPer1kTokens;
  const currentPricedTokens = current.pricedTokens ?? current.totalTokens;
  const currentAtBaselineRate = (currentPricedTokens / 1000) * baselineRatePer1k;
  const normalizedSavingsUsd = currentAtBaselineRate - current.costUsd;
  const normalizedSavingsPct =
    currentAtBaselineRate > 0 ? (normalizedSavingsUsd / currentAtBaselineRate) * 100 : 0;
  return {
    baselineRatePer1k: round(baselineRatePer1k),
    currentRatePer1k: round(currentRatePer1k),
    normalizedSavingsUsd: round(normalizedSavingsUsd, 2),
    normalizedSavingsPct: round(normalizedSavingsPct, 1),
    absoluteSpendDeltaUsd: round(baseline.costUsd - current.costUsd, 2),
  };
}

const METHOD =
  "Efficiency-normalized: current-period tokens priced at the baseline blended rate, minus actual current cost. Isolates the change in blended cost-per-token from changes in volume. Costs are estimates repriced from usage exports.";

export function proveSavings(
  baseline: SignedBaseline,
  currentSummary: DashboardSummary,
  opts: { issuedAt: string; keypair: KeyPair }
): SavingsProof {
  const current = toPeriodSummary(currentSummary);
  const savings = computeSavings(baseline.period, current);
  const unsigned = {
    schema_version: "1.0" as const,
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
  const recomputed = computeSavings(p.baseline.period, p.current);
  // Every field a reader acts on must be recomputed, including the headline
  // percentage. Omitting it let a signed proof state "95% saved" while the
  // recomputation said 5% and still verify, and the percentage is the number a
  // CFO or auditor actually reads.
  const savings_math_matches =
    recomputed.normalizedSavingsUsd === p.savings.normalizedSavingsUsd &&
    recomputed.absoluteSpendDeltaUsd === p.savings.absoluteSpendDeltaUsd &&
    recomputed.baselineRatePer1k === p.savings.baselineRatePer1k &&
    recomputed.currentRatePer1k === p.savings.currentRatePer1k &&
    recomputed.normalizedSavingsPct === p.savings.normalizedSavingsPct;
  return {
    valid: signature_valid && baseline_hash_matches && savings_math_matches,
    checks: { signature_valid, baseline_hash_matches, savings_math_matches },
    reason: !opts.publicKeys[signature.kid] ? `no public key for kid ${signature.kid}` : undefined,
  };
}
