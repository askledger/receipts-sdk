// Monthly insurance underwriting bundle. The artifact AI-liability
// carriers (Munich Re aiSure, Mosaic, Armilla) consume to price a
// policy. We publish the format as an open spec (PL-RFC-future);
// carriers integrate with the spec, not with us.

import { canonicalize } from "../canonicalize.js";
import { createHash } from "node:crypto";

export type Carrier = "MUNICH_RE_AISURE" | "MOSAIC" | "ARMILLA" | "GENERIC";

export interface UnderwritingInput {
  tenant_id: string;
  period_start: string;
  period_end: string;
  receipts_total: number;
  receipts_blocked: number;
  receipts_flagged: number;
  receipts_error: number;
  receipts_reviewed: number;
  high_severity_findings: number;
  models_in_production: number;
  regulators_covered: string[];           // ["EU_AI_ACT", "SR_11_7", ...]
  uptime_pct: number;                     // 0..1
  controls_passed: number;
  controls_total: number;
  prior_incidents: number;
  data_residency: string[];               // ["EU","US","UAE"]
}

export interface RiskScore {
  composite: number;                      // 0..100, lower is better
  components: { name: string; value: number; weight: number; band: "good" | "watch" | "elevated" }[];
  derived_at: string;
}

export interface UnderwritingBundle {
  schema_version: "1.0";
  carrier: Carrier;
  tenant_id: string;
  period: { start: string; end: string };
  exposure: {
    invocations: number;
    blocked: number;
    flagged: number;
    errors: number;
    error_rate: number;
    block_rate: number;
    high_severity_findings: number;
    models_in_production: number;
  };
  controls: {
    posture_pct: number;
    regulators_covered: string[];
    uptime_pct: number;
    prior_incidents: number;
  };
  risk_score: RiskScore;
  premium_inputs: Record<string, number | string | string[]>;
  attestation: { canonical_bytes_hash: string };
}

export function buildBundle(carrier: Carrier, input: UnderwritingInput): UnderwritingBundle {
  const total = Math.max(input.receipts_total, 1);
  const exposure = {
    invocations: input.receipts_total,
    blocked: input.receipts_blocked,
    flagged: input.receipts_flagged,
    errors: input.receipts_error,
    error_rate: round(input.receipts_error / total),
    block_rate: round(input.receipts_blocked / total),
    high_severity_findings: input.high_severity_findings,
    models_in_production: input.models_in_production,
  };

  const controls = {
    posture_pct: input.controls_total === 0 ? 0 : round(input.controls_passed / input.controls_total),
    regulators_covered: input.regulators_covered.slice().sort(),
    uptime_pct: round(input.uptime_pct),
    prior_incidents: input.prior_incidents,
  };

  const risk_score = scoreRisk(exposure, controls, input);

  const premium_inputs = mapCarrierPremiumInputs(carrier, exposure, controls, risk_score, input);

  const bundle = {
    schema_version: "1.0" as const,
    carrier,
    tenant_id: input.tenant_id,
    period: { start: input.period_start, end: input.period_end },
    exposure,
    controls,
    risk_score,
    premium_inputs,
  };

  const canonical = canonicalize(bundle);
  const hash = createHash("sha256").update(canonical).digest("hex");

  return { ...bundle, attestation: { canonical_bytes_hash: hash } };
}

function scoreRisk(
  ex: UnderwritingBundle["exposure"],
  ctl: UnderwritingBundle["controls"],
  input: UnderwritingInput,
): RiskScore {
  const components = [
    component("error_rate", ex.error_rate, 0.20, [0.005, 0.02]),
    component("block_rate", ex.block_rate, 0.10, [0.02, 0.10]),
    component("findings_density", input.high_severity_findings / Math.max(1, input.models_in_production), 0.15, [0.5, 2]),
    component("prior_incidents", input.prior_incidents, 0.15, [0, 1]),
    componentInverse("controls_posture", ctl.posture_pct, 0.15, [0.95, 0.80]),
    componentInverse("uptime", ctl.uptime_pct, 0.10, [0.999, 0.99]),
    componentInverse("regulator_breadth", ctl.regulators_covered.length / 6, 0.15, [0.6, 0.3]),
  ];
  const composite = round(components.reduce((acc, c) => acc + c.value * c.weight * 100, 0));
  // derived_at must be deterministic for the attestation hash to be reproducible.
  // The bundle reflects state as-of period_end, so we use that as the derivation
  // anchor. Wallclock "computed_at" stamps belong outside the hash boundary.
  return { composite: clamp(composite, 0, 100), components, derived_at: input.period_end };
}

function component(name: string, value: number, weight: number, thresholds: [number, number]): RiskScore["components"][number] {
  const band: "good" | "watch" | "elevated" = value <= thresholds[0] ? "good" : value <= thresholds[1] ? "watch" : "elevated";
  return { name, value: round(value), weight, band };
}

function componentInverse(name: string, value: number, weight: number, thresholds: [number, number]): RiskScore["components"][number] {
  const inverted = 1 - value;
  const band: "good" | "watch" | "elevated" = value >= thresholds[0] ? "good" : value >= thresholds[1] ? "watch" : "elevated";
  return { name, value: round(inverted), weight, band };
}

function mapCarrierPremiumInputs(
  carrier: Carrier,
  ex: UnderwritingBundle["exposure"],
  ctl: UnderwritingBundle["controls"],
  rs: RiskScore,
  input: UnderwritingInput,
): UnderwritingBundle["premium_inputs"] {
  const common = {
    annual_invocations_projected: ex.invocations * 12,
    error_rate: ex.error_rate,
    block_rate: ex.block_rate,
    uptime_pct: ctl.uptime_pct,
    controls_posture_pct: ctl.posture_pct,
    composite_risk: rs.composite,
    regulators_covered: ctl.regulators_covered,
    data_residency: input.data_residency,
    prior_incidents: input.prior_incidents,
  };

  switch (carrier) {
    case "MUNICH_RE_AISURE":
      return { ...common, ms_form: "aisure-v3.2", ms_class: bandToClass(rs.composite) };
    case "MOSAIC":
      return { ...common, msc_layer: "primary", msc_attachment_usd: 250_000 };
    case "ARMILLA":
      return { ...common, arm_tier: bandToClass(rs.composite), arm_loss_model: "freq-sev-2025" };
    case "GENERIC":
    default:
      return common;
  }
}

function bandToClass(composite: number): string {
  if (composite <= 20) return "A";
  if (composite <= 35) return "B";
  if (composite <= 55) return "C";
  if (composite <= 75) return "D";
  return "E";
}

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }
function round(n: number): number { return Math.round(n * 10000) / 10000; }
