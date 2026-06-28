/**
 * Content-safety orchestrator.
 *
 * Single entry point for the SDK: given an AI event's input + output +
 * context, runs PII detection, deviation analysis, and shadow-AI
 * checks. Returns a structured safety verdict the adapter writes into
 * `payload.metadata.safety` on the receipt — and that the platform's
 * Plane 4 (Decision) consumes to issue allow / block / flag verdicts.
 *
 * The whole pipeline is deterministic, in-process, < 5 ms for typical
 * BFSI prompts. No LLM. No external call.
 */

import { scanPii, type PiiScanResult } from "./pii-detector.js";
import {
  detectDeviation,
  type DeviationCheckInput,
  type DeviationResult,
} from "./deviation-detector.js";
import {
  detectShadowAi,
  type ShadowAiPolicy,
  type ShadowAiCheckInput,
  type ShadowAiResult,
} from "./shadow-ai.js";

export interface SafetyCheckInput {
  input_text?: string;
  output_text?: string;
  input_classification?: DeviationCheckInput["input_classification"];
  output_classification?: DeviationCheckInput["output_classification"];
  input_token_count?: number;
  output_token_count?: number;
  ai_capability?: string;
  response_kind?: DeviationCheckInput["response_kind"];
  shadow: ShadowAiCheckInput;
}

export type SafetyVerdict = "allow" | "flag" | "block";

export interface SafetyVerdictResult {
  verdict: SafetyVerdict;
  /** 0..1 — cumulative risk score across PII + deviation + shadow. */
  risk_score: number;
  input_pii: PiiScanResult;
  output_pii: PiiScanResult;
  deviation: DeviationResult;
  shadow_ai: ShadowAiResult;
  /** Human-readable reason codes that go into the decision receipt. */
  reason_codes: string[];
}

export interface SafetyPolicy {
  shadow_ai: ShadowAiPolicy;
  /** Risk threshold (0..1) above which the verdict is "block". Default 0.7. */
  block_threshold?: number;
  /** Risk threshold (0..1) above which the verdict is "flag". Default 0.3. */
  flag_threshold?: number;
  /** If true, any shadow-AI consumer-endpoint case auto-blocks. Default true. */
  block_on_consumer_endpoint?: boolean;
  /** If true, any high-confidence PII to a "public" surface auto-blocks. Default true. */
  block_on_pii_to_public?: boolean;
}

export function evaluateContentSafety(
  input: SafetyCheckInput,
  policy: SafetyPolicy
): SafetyVerdictResult {
  const inputPii = scanPii(input.input_text ?? "");
  const outputPii = scanPii(input.output_text ?? "");

  const shadowAi = detectShadowAi(input.shadow, policy.shadow_ai);

  const deviation = detectDeviation({
    input_classification: input.input_classification,
    output_classification: input.output_classification,
    input_pii: inputPii,
    output_pii: outputPii,
    input_token_count: input.input_token_count,
    output_token_count: input.output_token_count,
    ai_capability: input.ai_capability,
    response_kind: input.response_kind,
  });

  const reasonCodes: string[] = [];
  for (const r of shadowAi.reasons) reasonCodes.push(`shadow:${r}`);
  for (const d of deviation.findings) reasonCodes.push(`deviation:${d.category}`);
  if (inputPii.count > 0) reasonCodes.push(`pii_in_input:count=${inputPii.count}`);
  if (outputPii.count > 0) reasonCodes.push(`pii_in_output:count=${outputPii.count}`);

  const risk = Math.min(
    1,
    shadowAi.severity * 0.5 +
      deviation.severity * 0.35 +
      (outputPii.has_high_confidence ? 0.25 : 0) +
      (inputPii.has_high_confidence ? 0.1 : 0)
  );

  const blockOnConsumer = policy.block_on_consumer_endpoint ?? true;
  const blockOnPiiPublic = policy.block_on_pii_to_public ?? true;
  const blockTh = policy.block_threshold ?? 0.7;
  const flagTh = policy.flag_threshold ?? 0.3;

  let verdict: SafetyVerdict = "allow";
  if (blockOnConsumer && shadowAi.reasons.includes("consumer_endpoint")) verdict = "block";
  else if (
    blockOnPiiPublic &&
    deviation.findings.some((f) => f.category === "pii_leaked_to_public_surface")
  )
    verdict = "block";
  else if (risk >= blockTh) verdict = "block";
  else if (risk >= flagTh) verdict = "flag";

  return {
    verdict,
    risk_score: Number(risk.toFixed(3)),
    input_pii: inputPii,
    output_pii: outputPii,
    deviation,
    shadow_ai: shadowAi,
    reason_codes: reasonCodes,
  };
}
