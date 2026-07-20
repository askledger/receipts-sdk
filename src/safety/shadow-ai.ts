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
  | "consumer_endpoint"
  | "vendor_metadata_missing"
  | "model_metadata_missing"
  | "source_metadata_missing"
  | "endpoint_unparseable";

/**
 * Reasons that mean "we could not determine what this invocation actually was",
 * as distinct from "we determined it and it is not approved".
 *
 * These exist because the control used to fail OPEN. Every check was gated on
 * truthiness (`if (input.ai_vendor && !approved.includes(...))`), so omitting
 * the fields, or sending empty strings, produced zero reasons, severity 0 and
 * an `allow` verdict, for a payload that produced `block` when the same caller
 * filled the fields in honestly. The party running shadow AI is precisely the
 * party who populates this metadata, so a truthiness gate only catches callers
 * who volunteer that they are violating the policy. Absent attribution is
 * treated as a finding, and consumers fail closed on it.
 */
export const SHADOW_METADATA_UNVERIFIABLE_REASONS: readonly ShadowAiReason[] = [
  "vendor_metadata_missing",
  "model_metadata_missing",
  "source_metadata_missing",
  "endpoint_unparseable",
];

/** Present and non-blank. An empty/whitespace string is absent metadata, not a value. */
function provided(v: string | undefined | null): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

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

  // Vendor / model / source_system are the three fields that make an AI
  // invocation attributable at all. Missing or blank means "unattributable",
  // which is a finding in its own right, NOT a pass. See
  // SHADOW_METADATA_UNVERIFIABLE_REASONS for why this is not a truthiness gate.
  if (!provided(input.ai_vendor)) {
    reasons.push("vendor_metadata_missing");
  } else if (!policy.approved_vendors.includes(input.ai_vendor)) {
    reasons.push("vendor_not_approved");
  }
  if (!provided(input.ai_model)) {
    reasons.push("model_metadata_missing");
  } else if (!policy.approved_models.includes(input.ai_model)) {
    reasons.push("model_not_approved");
  }
  if (!provided(input.source_system)) {
    reasons.push("source_metadata_missing");
  } else if (!policy.approved_source_systems.includes(input.source_system)) {
    reasons.push("source_not_approved");
  }
  // ai_provider stays optional: it is only meaningful when the tenant's policy
  // actually declares an approved provider route.
  if (
    policy.approved_providers &&
    provided(input.ai_provider) &&
    !policy.approved_providers.includes(input.ai_provider)
  ) {
    reasons.push("provider_not_approved");
  }
  if (provided(input.endpoint_url)) {
    const consumer = policy.consumer_endpoints ?? DEFAULT_CONSUMER_ENDPOINTS;
    let host: string | null = null;
    try {
      host = new URL(input.endpoint_url).hostname;
    } catch {
      // Swallowing this used to be a free bypass: an endpoint the parser cannot
      // read is an endpoint whose destination we cannot rule out, and a
      // deliberately malformed URL is the cheapest way to hide a consumer
      // endpoint from this check. Report it instead of dropping it.
      host = null;
    }
    if (host === null) {
      reasons.push("endpoint_unparseable");
    } else if (consumer.some((d) => host === d || host!.endsWith("." + d))) {
      reasons.push("consumer_endpoint");
    }
  }
  // Severity scoring: consumer endpoint is the most severe (PII leak vector),
  // then source not approved, then vendor/model. Unverifiable metadata is
  // scored alongside the corresponding "not approved" reason rather than below
  // it, because an unattributable invocation is at least as bad as a known-bad
  // one: it cannot even be investigated after the fact.
  const weights: Record<ShadowAiReason, number> = {
    consumer_endpoint: 0.5,
    endpoint_unparseable: 0.5,
    source_not_approved: 0.25,
    source_metadata_missing: 0.25,
    vendor_not_approved: 0.2,
    vendor_metadata_missing: 0.25,
    model_not_approved: 0.15,
    model_metadata_missing: 0.25,
    provider_not_approved: 0.15,
  };
  const severity = Math.min(1, reasons.reduce((s, r) => s + weights[r], 0));
  return { is_shadow: reasons.length > 0, reasons, severity };
}
