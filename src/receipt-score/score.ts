/**
 * Receipt Score, public reputation signal for an AI deployment.
 *
 * Inspired by SSL Labs (A+ TLS rating), Lighthouse (web performance),
 * and Cloudflare Radar. Banks, auditors, regulators, and customers
 * reference a tenant's Receipt Score as a single-glance trust signal.
 *
 * The score is composed of five sub-scores (0..100 each), then weighted
 * into a final 0..100 with a letter grade.
 *
 *   1. Coverage          , what % of AI traffic produces receipts
 *   2. Verification      , what % of receipts pass third-party verify
 *   3. Safety hygiene    , what fraction had findings + were handled
 *   4. Regulatory align. , how many regulator templates the receipts cite
 *   5. Transparency log  , what % of batches reach the public log
 *
 * Recomputed daily. Embeddable as an SVG badge plus a JSON-LD blob.
 */

export type Grade = "A+" | "A" | "B" | "C" | "D" | "F";

export interface ScoreInput {
  /** How many AI calls happened in the period. */
  ai_invocations_total: number;
  /** How many produced a signed receipt. */
  ai_invocations_with_receipt: number;
  /** How many receipts were independently verified. */
  receipts_verified: number;
  /** How many failed verification (chain break, signature, hash). */
  receipts_verification_failures: number;
  /** How many receipts triggered a safety finding. */
  receipts_with_safety_findings: number;
  /** How many findings were correctly handled (blocked / flagged / approved). */
  safety_findings_handled: number;
  /** Regulator templates with at least one citing receipt. */
  regulators_cited: number;
  /** Receipts published into the public transparency log. */
  receipts_in_transparency_log: number;
}

export interface ScoreBreakdown {
  coverage: number;
  verification: number;
  safety: number;
  regulatory: number;
  transparency: number;
}

export interface ReceiptScore {
  /** Final 0..100. */
  score: number;
  grade: Grade;
  breakdown: ScoreBreakdown;
  /** Period the score was computed for. */
  period_start: string;
  period_end: string;
  /** When the score was published. */
  published_at: string;
}

function clamp(x: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, x));
}

export function computeBreakdown(input: ScoreInput): ScoreBreakdown {
  const coverage =
    input.ai_invocations_total === 0
      ? 0
      : (100 * input.ai_invocations_with_receipt) / input.ai_invocations_total;

  const verified = input.receipts_verified + input.receipts_verification_failures;
  const verification = verified === 0 ? 0 : (100 * input.receipts_verified) / verified;

  const safety =
    input.receipts_with_safety_findings === 0
      ? 100
      : (100 * input.safety_findings_handled) / input.receipts_with_safety_findings;

  // 5 frameworks: CBUAE, EU AI Act, SAMA, ISO 42001, NIST AI RMF
  const regulatory = clamp((100 * input.regulators_cited) / 5);

  const transparency =
    input.ai_invocations_with_receipt === 0
      ? 0
      : (100 * input.receipts_in_transparency_log) / input.ai_invocations_with_receipt;

  return {
    coverage: Number(clamp(coverage).toFixed(1)),
    verification: Number(clamp(verification).toFixed(1)),
    safety: Number(clamp(safety).toFixed(1)),
    regulatory: Number(regulatory.toFixed(1)),
    transparency: Number(clamp(transparency).toFixed(1)),
  };
}

function gradeFor(score: number): Grade {
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Weighted final score. Defaults match the v0.4 weighting recommended
 * in the spec.
 */
export function computeScore(
  input: ScoreInput,
  weights: { coverage: number; verification: number; safety: number; regulatory: number; transparency: number } = {
    coverage: 0.25,
    verification: 0.25,
    safety: 0.2,
    regulatory: 0.15,
    transparency: 0.15,
  },
  period?: { start: string; end: string }
): ReceiptScore {
  const b = computeBreakdown(input);
  const score =
    b.coverage * weights.coverage +
    b.verification * weights.verification +
    b.safety * weights.safety +
    b.regulatory * weights.regulatory +
    b.transparency * weights.transparency;
  const final = Number(clamp(score).toFixed(1));
  return {
    score: final,
    grade: gradeFor(final),
    breakdown: b,
    period_start: period?.start ?? new Date(Date.now() - 30 * 86_400_000).toISOString(),
    period_end: period?.end ?? new Date().toISOString(),
    published_at: new Date().toISOString(),
  };
}

/**
 * Render the Receipt Score as an embeddable SVG badge. Companies place
 * this in their AI product pages, annual reports, RFP responses.
 */
export function renderBadgeSvg(score: ReceiptScore, tenantName: string): string {
  const gradeColor: Record<Grade, string> = {
    "A+": "#1b7f55",
    A: "#1b7f55",
    B: "#4a8a3a",
    C: "#b97607",
    D: "#a32424",
    F: "#5a1414",
  };
  const color = gradeColor[score.grade];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="64" viewBox="0 0 220 64" role="img" aria-label="AskLedger Receipt Score ${score.grade} for ${tenantName}">
    <title>AskLedger Receipt Score ${score.grade} (${score.score}) for ${tenantName}</title>
    <rect width="220" height="64" rx="8" fill="#0a1530"/>
    <rect x="1" y="1" width="218" height="62" rx="7" fill="none" stroke="${color}" stroke-width="2"/>
    <g transform="translate(14,12)">
      <text x="0" y="14" font-family="Inter, system-ui, sans-serif" font-size="11" font-weight="700" fill="#c79b3c" letter-spacing="0.06em">PROJECT LEDGER</text>
      <text x="0" y="34" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="#eef1fa">Receipt Score</text>
    </g>
    <g transform="translate(138,16)">
      <text x="0" y="0" dy="22" font-family="Inter, system-ui, sans-serif" font-size="28" font-weight="800" fill="${color}">${score.grade}</text>
      <text x="46" y="0" dy="14" font-family="JetBrains Mono, monospace" font-size="11" fill="#a8b1cf">${score.score}</text>
      <text x="46" y="0" dy="28" font-family="Inter, system-ui, sans-serif" font-size="9" fill="#8a93b6">/100</text>
    </g>
  </svg>`;
}
