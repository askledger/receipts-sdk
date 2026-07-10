/**
 * Content-safety module, Plane 4 (Decision) Pillar 6 (Shadow AI).
 *
 * Real PII detection (regex + Luhn + IBAN MOD-97), classification-
 * deviation heuristics, and shadow-AI policy enforcement. Everything
 * runs locally, no LLM, no external call.
 *
 * Findings flow into the receipt's payload.metadata.safety so the
 * audit trail captures every flagged event.
 */

export {
  scanPii,
  type PiiScanResult,
  type PiiFinding,
  type PiiCategory,
} from "./pii-detector.js";

export {
  detectShadowAi,
  type ShadowAiPolicy,
  type ShadowAiCheckInput,
  type ShadowAiResult,
  type ShadowAiReason,
} from "./shadow-ai.js";

export {
  detectDeviation,
  type DeviationCheckInput,
  type DeviationResult,
  type DeviationFinding,
  type DeviationCategory,
} from "./deviation-detector.js";

export {
  evaluateContentSafety,
  type SafetyCheckInput,
  type SafetyVerdict,
  type SafetyVerdictResult,
  type SafetyPolicy,
} from "./content-safety.js";

export {
  scanPromptInjection,
  type InjectionCategory,
  type InjectionFinding,
  type InjectionResult,
} from "./prompt-injection.js";
