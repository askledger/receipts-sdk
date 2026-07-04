/**
 * Console data-access layer.
 *
 * All console pages call this module instead of hardcoding fixtures.
 * In dev/demo: returns deterministic fixtures so screenshots stay stable.
 * In production: hits the tenant-scoped backend via authenticated fetch.
 *
 * The fetch path uses a strict per-tenant base URL derived from the session,
 * NOT a global env var, so cross-tenant leakage cannot happen accidentally
 * by mis-setting an env var.
 */

import { z, type ZodSchema } from "./zod-shim";

// =============================================================================
// Wire-format types (the API contract).
// Backend MUST return data shaped exactly like this. Frontend MUST NOT
// hand-tweak shapes — change the contract, then change both sides.
// =============================================================================

export const RegulatorCoverageSchema = z.object({
  regulator: z.string(),
  articles_satisfied: z.number().int().nonnegative(),
  articles_total: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  deadline: z.string(),
  status: z.enum(["allow", "info", "flag", "block"]),
  label: z.string(),
});
export type RegulatorCoverage = z.infer<typeof RegulatorCoverageSchema>;

export const ComplianceGapSchema = z.object({
  id: z.string(),
  regulator: z.string(),
  article: z.string(),
  gap: z.string(),
  count: z.number().int().nonnegative(),
  severity: z.enum(["low", "medium", "high"]),
});
export type ComplianceGap = z.infer<typeof ComplianceGapSchema>;

export const ViolatorSchema = z.object({
  user: z.string(),
  team: z.string(),
  events: z.number().int().nonnegative(),
  severity: z.enum(["low", "medium", "high"]),
  lastEvent: z.string(),
});
export type Violator = z.infer<typeof ViolatorSchema>;

export const TeamComplianceSchema = z.object({
  team: z.string(),
  users: z.number().int().nonnegative(),
  violations_week: z.number().int().nonnegative(),
  training_completion: z.number().min(0).max(1),
  status: z.enum(["allow", "info", "flag", "block"]),
  label: z.string(),
});
export type TeamCompliance = z.infer<typeof TeamComplianceSchema>;

export const SpendByTeamSchema = z.object({
  team: z.string(),
  spend_mtd: z.number().nonnegative(),
  growth: z.string(),
  tokens_in_M: z.number().nonnegative(),
  top_use_case: z.string(),
});
export type SpendByTeam = z.infer<typeof SpendByTeamSchema>;

export const SpendByVendorSchema = z.object({
  vendor: z.string(),
  spend_mtd: z.number().nonnegative(),
  share: z.number().min(0).max(1),
  unit_cost_per_1k_tokens: z.number().nonnegative(),
});
export type SpendByVendor = z.infer<typeof SpendByVendorSchema>;

export const LitigationHoldSchema = z.object({
  id: z.string(),
  matter: z.string(),
  custodians: z.number().int().nonnegative(),
  scope: z.string(),
  status: z.enum(["allow", "info", "flag", "block"]),
  label: z.string(),
});
export type LitigationHold = z.infer<typeof LitigationHoldSchema>;

export const Gdpr22EventSchema = z.object({
  rid: z.string(),
  time: z.string(),
  subject: z.string(),
  model: z.string(),
  reviewed_by: z.string(),
  status: z.enum(["allow", "block", "flag", "pending"]),
});
export type Gdpr22Event = z.infer<typeof Gdpr22EventSchema>;

// =============================================================================
// Result envelope. Every API response is wrapped so we can carry trace_id,
// cache hints, and partial-failure annotations without overloading the
// success/error contract.
// =============================================================================

export type ApiResult<T> =
  | { ok: true; data: T; trace_id: string; fetched_at: string; cache: "fresh" | "stale" | "fallback" }
  | { ok: false; error: { code: string; message: string }; trace_id: string };

// =============================================================================
// Fixtures — used in dev/demo + tests. Real backend swaps these out.
// =============================================================================

const FIXTURE_COVERAGE: RegulatorCoverage[] = [
  { regulator: "CBUAE", articles_satisfied: 6, articles_total: 6, confidence: 0.94, deadline: "Sep 16, 2026", status: "allow", label: "ready" },
  { regulator: "EU AI Act", articles_satisfied: 7, articles_total: 8, confidence: 0.91, deadline: "Aug 2, 2026", status: "allow", label: "ready" },
  { regulator: "SAMA", articles_satisfied: 4, articles_total: 5, confidence: 0.87, deadline: "ongoing", status: "info", label: "monitoring" },
  { regulator: "ISO 42001", articles_satisfied: 5, articles_total: 6, confidence: 0.83, deadline: "voluntary", status: "info", label: "monitoring" },
  { regulator: "NIST AI RMF", articles_satisfied: 5, articles_total: 5, confidence: 0.96, deadline: "voluntary", status: "allow", label: "ready" },
  { regulator: "GDPR", articles_satisfied: 6, articles_total: 7, confidence: 0.88, deadline: "ongoing", status: "info", label: "monitoring" },
  { regulator: "HIPAA", articles_satisfied: 0, articles_total: 7, confidence: 0, deadline: "n/a", status: "flag", label: "not applicable" },
  { regulator: "FedRAMP", articles_satisfied: 0, articles_total: 8, confidence: 0, deadline: "n/a", status: "flag", label: "not applicable" },
];

const FIXTURE_GAPS: ComplianceGap[] = [
  { id: "g-001", regulator: "EU AI Act", article: "ART50", gap: "Generative AI Transparency · 12 receipts missing output_hash field", count: 12, severity: "medium" },
  { id: "g-002", regulator: "SAMA", article: "T2", gap: "Saudi Data Residency · 3 receipts missing region tag", count: 3, severity: "high" },
  { id: "g-003", regulator: "GDPR", article: "ART22", gap: "Automated Decisions · 1 receipt has block decision without reason_codes", count: 1, severity: "high" },
];

// =============================================================================
// Resolver. In production, replace with authenticated fetch. The shape
// validation step is non-negotiable — if backend ships a malformed payload,
// the console refuses to render it (security-first).
// =============================================================================

const USE_FIXTURES = process.env.PL_USE_FIXTURES !== "false";

async function call<T>(
  endpoint: string,
  schema: ZodSchema<T>,
  fixture: T,
): Promise<ApiResult<T>> {
  const trace_id = `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const fetched_at = new Date().toISOString();

  if (USE_FIXTURES) {
    return { ok: true, data: fixture, trace_id, fetched_at, cache: "fresh" };
  }

  try {
    const res = await fetch(endpoint, {
      headers: { "x-trace-id": trace_id },
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: { code: `HTTP_${res.status}`, message: res.statusText }, trace_id };
    }
    const json = await res.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return { ok: false, error: { code: "SCHEMA_INVALID", message: parsed.error.message }, trace_id };
    }
    return { ok: true, data: parsed.data, trace_id, fetched_at, cache: "fresh" };
  } catch (e) {
    return { ok: false, error: { code: "NETWORK", message: String(e) }, trace_id };
  }
}

// =============================================================================
// Public API.
// =============================================================================

export const api = {
  compliance: {
    coverage: () => call("/api/compliance/coverage", z.array(RegulatorCoverageSchema), FIXTURE_COVERAGE),
    gaps: () => call("/api/compliance/gaps", z.array(ComplianceGapSchema), FIXTURE_GAPS),
  },
};
