/**
 * Classification-deviation detector — Plane 4 (Decision).
 *
 * Catches the most common failure modes where a model's response
 * deviates from what the request justified:
 *
 *   - Request classification was `internal` but the response contains
 *     PII the request never had → potential prompt injection or
 *     unauthorized data lookup
 *   - Request classification was `public` but the response contains
 *     PII → information leak to a public-facing surface
 *   - Request asked for code but the response is prose, or vice versa
 *     (capability mismatch)
 *   - Response token count is wildly disproportionate to the request
 *     (potential prompt expansion / hallucination)
 *
 * This module is deliberately lightweight — heuristic only. The
 * platform layer can add LLM-based deviation grading later; the
 * heuristic catches the highest-frequency issues at zero latency cost.
 */

import { type PiiScanResult } from "./pii-detector.js";

export type DeviationCategory =
  | "pii_introduced_in_response"
  | "pii_leaked_to_public_surface"
  | "capability_mismatch"
  | "output_disproportionate"
  | "response_classification_lower_than_input";

export interface DeviationCheckInput {
  input_classification?:
    | "public" | "internal" | "pii_redacted" | "pii" | "pci" | "mnpi";
  output_classification?:
    | "public" | "internal" | "pii_redacted" | "pii" | "pci" | "mnpi";
  input_pii?: PiiScanResult;
  output_pii?: PiiScanResult;
  input_token_count?: number;
  output_token_count?: number;
  ai_capability?: string;
  /** Coarse content type the response looked like — set by the SDK adapter. */
  response_kind?: "code" | "prose" | "structured" | "binary" | "unknown";
}

export interface DeviationFinding {
  category: DeviationCategory;
  severity: "low" | "medium" | "high";
  detail: string;
}

export interface DeviationResult {
  findings: DeviationFinding[];
  /** Cumulative severity 0..1. */
  severity: number;
}

const SEV_SCORE: Record<"low" | "medium" | "high", number> = {
  low: 0.15,
  medium: 0.35,
  high: 0.6,
};

export function detectDeviation(input: DeviationCheckInput): DeviationResult {
  const findings: DeviationFinding[] = [];

  // 1. PII appeared in the response that the request did not justify. Compare
  // BY CATEGORY, not just by count: a substituted PII type (e.g. an SSN in the
  // response when the request only had an email) is a leak even when the total
  // count is unchanged. Also flag any net increase in count.
  {
    const inCats = new Set(Object.keys(input.input_pii?.categories ?? {}));
    const newCats = Object.keys(input.output_pii?.categories ?? {}).filter((c) => !inCats.has(c));
    const extraByCount = Math.max(0, (input.output_pii?.count ?? 0) - (input.input_pii?.count ?? 0));
    if (newCats.length > 0 || extraByCount > 0) {
      findings.push({
        category: "pii_introduced_in_response",
        // A brand-new PII category is high severity even at the same total count.
        severity: newCats.length > 0 || extraByCount >= 3 ? "high" : "medium",
        detail:
          newCats.length > 0
            ? `Response introduced PII categories not present in the request: ${newCats.join(", ")}. Possible unauthorized data lookup or prompt-injection-induced exfiltration.`
            : `Response contains ${extraByCount} more PII match(es) than the input. Possible unauthorized data lookup or prompt-injection-induced exfiltration.`,
      });
    }
  }

  // 2. PII leaked to a public-facing surface — ANY PII fires this rule
  if (
    input.output_classification === "public" &&
    (input.output_pii?.count ?? 0) > 0
  ) {
    findings.push({
      category: "pii_leaked_to_public_surface",
      severity: "high",
      detail: `Response is classified 'public' but contains ${input.output_pii?.count} PII match(es). This receipt would have been blocked by a default DLP policy.`,
    });
  }

  // 3. Capability mismatch — asked for code, got prose, etc.
  if (input.ai_capability === "code-completion" && input.response_kind === "prose") {
    findings.push({
      category: "capability_mismatch",
      severity: "medium",
      detail: "Capability declared as code-completion but the response shape is prose. Either the user misused the IDE plugin or the model returned an unexpected form.",
    });
  }

  // 4. Output disproportionate
  if (
    input.input_token_count != null &&
    input.output_token_count != null &&
    input.input_token_count > 0 &&
    input.output_token_count / input.input_token_count > 30
  ) {
    findings.push({
      category: "output_disproportionate",
      severity: "low",
      detail: `Output is ${Math.round(
        input.output_token_count / Math.max(1, input.input_token_count)
      )}x the input size. Worth a hallucination spot-check.`,
    });
  }

  // 5. Response classification lower than input — sensitive data has become looser
  const rank = (c?: string) =>
    ({ public: 0, internal: 1, pii_redacted: 2, pii: 3, pci: 3, mnpi: 4 }[c ?? "internal"] ?? 1);
  if (rank(input.output_classification) < rank(input.input_classification)) {
    findings.push({
      category: "response_classification_lower_than_input",
      severity: "medium",
      detail: `Input was classified '${input.input_classification}' but response is '${input.output_classification}' — sensitive data may have been declassified.`,
    });
  }

  const severity = Math.min(1, findings.reduce((s, f) => s + SEV_SCORE[f.severity], 0));
  return { findings, severity };
}
