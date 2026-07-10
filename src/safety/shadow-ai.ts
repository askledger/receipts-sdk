/**
 * Shadow-AI detector, Pillar 6.
 *
 * Identifies AI invocations that bypass the enterprise's approved
 * controls:
 *   - Unapproved vendor   (employee using a personal ChatGPT account)
 *   - Unapproved model    (older model version no longer on the allow-list)
 *   - Unapproved gateway  (direct API call instead of the corporate gateway)
 *   - Unapproved endpoint (calling a public consumer endpoint)
 *
 * Findings are appended to the receipt's payload.metadata so the audit
 * trail captures every shadow-AI event, even if it was allowed by
 * policy (e.g., during a controlled exception window).
 */

export interface ShadowAiPolicy {
  /** Approved AI vendors for this tenant. */
  approved_vendors: string[];
  /** Approved model identifiers, exact match. */
  approved_models: string[];
  /** Approved source systems (the corporate gateway, the official IDE plugin, etc.). */
  approved_source_systems: string[];
  /** Approved AI provider routes, e.g. "gateway:portkey", "direct:vpn-only". */
  approved_providers?: string[];
  /** Domains the platform considers consumer-grade endpoints. */
  consumer_endpoints?: string[];
}

export interface ShadowAiCheckInput {
  ai_vendor?: string;
  ai_model?: string;
  source_system?: string;
  ai_provider?: string;
  /** URL the request actually went to, if known. */
  endpoint_url?: string;
}

export type ShadowAiReason =
  | "vendor_not_approved"
  | "model_not_approved"
  | "source_not_approved"
  | "provider_not_approved"
  | "consumer_endpoint";

export interface ShadowAiResult {
  is_shadow: boolean;
  reasons: ShadowAiReason[];
  /** Cumulative severity 0..1. */
  severity: number;
}

const DEFAULT_CONSUMER_ENDPOINTS = [
  "chat.openai.com",
  "chatgpt.com",
  "claude.ai",
  "gemini.google.com",
  "perplexity.ai",
  "you.com",
  "copilot.microsoft.com",
];

export function detectShadowAi(
  input: ShadowAiCheckInput,
  policy: ShadowAiPolicy
): ShadowAiResult {
  const reasons: ShadowAiReason[] = [];
  if (input.ai_vendor && !policy.approved_vendors.includes(input.ai_vendor)) {
    reasons.push("vendor_not_approved");
  }
  if (input.ai_model && !policy.approved_models.includes(input.ai_model)) {
    reasons.push("model_not_approved");
  }
  if (input.source_system && !policy.approved_source_systems.includes(input.source_system)) {
    reasons.push("source_not_approved");
  }
  if (
    policy.approved_providers &&
    input.ai_provider &&
    !policy.approved_providers.includes(input.ai_provider)
  ) {
    reasons.push("provider_not_approved");
  }
  if (input.endpoint_url) {
    const consumer = policy.consumer_endpoints ?? DEFAULT_CONSUMER_ENDPOINTS;
    try {
      const host = new URL(input.endpoint_url).hostname;
      if (consumer.some((d) => host === d || host.endsWith("." + d))) {
        reasons.push("consumer_endpoint");
      }
    } catch {
      /* malformed URL, ignore */
    }
  }
  // Severity scoring: consumer endpoint is the most severe (PII leak vector),
  // then source not approved, then vendor/model.
  const weights: Record<ShadowAiReason, number> = {
    consumer_endpoint: 0.5,
    source_not_approved: 0.25,
    vendor_not_approved: 0.2,
    model_not_approved: 0.15,
    provider_not_approved: 0.15,
  };
  const severity = Math.min(1, reasons.reduce((s, r) => s + weights[r], 0));
  return { is_shadow: reasons.length > 0, reasons, severity };
}
