/**
 * Role-specific dashboard view configuration.
 *
 * The same receipt data is sliced differently for each role. A
 * Compliance officer sees regulator coverage; a CFO sees cost
 * attribution; a Legal lead sees disclosure-ready records; an HR
 * director sees policy violations. Each view is filtered + grouped +
 * labeled differently based on what that role actually cares about.
 *
 * Role views are layered on top of the existing RBAC model. A user's
 * role determines which views are visible; a single user can have
 * multiple roles and see multiple view slices.
 */

import type { Role } from "./auth.js";

export type ViewId =
  | "dashboard.it"
  | "dashboard.compliance"
  | "dashboard.hr"
  | "dashboard.legal"
  | "dashboard.finance"
  | "dashboard.department";

export interface RoleView {
  id: ViewId;
  /** Human-readable label shown in the side navigation. */
  label: string;
  /** Persona description for empty states and onboarding. */
  persona: string;
  /** Path under which the view is mounted. */
  path: string;
  /** Roles that can access this view. */
  visible_to: Role[];
  /** KPI metrics displayed at the top of the view. */
  kpis: ViewKpi[];
  /** Default filters applied. */
  default_filters: ViewFilter[];
  /** Grouping dimension for the main chart. */
  primary_group_by: "user" | "team" | "vendor" | "regulator" | "decision" | "classification";
  /** Whether the view supports export. */
  exportable: boolean;
}

export interface ViewKpi {
  id: string;
  label: string;
  /** Field on the aggregated receipt summary the KPI reads from. */
  field: string;
  /** Visual style (good/warn/bad). */
  tone: "neutral" | "good" | "warn" | "bad";
  /** Short explanation visible on hover. */
  description?: string;
}

export interface ViewFilter {
  field: string;
  op: "eq" | "in" | "gte" | "lte";
  value: unknown;
}

export const ROLE_VIEWS: Record<ViewId, RoleView> = {
  "dashboard.it": {
    id: "dashboard.it",
    label: "IT / Platform",
    persona:
      "You're the platform admin. You care about ingestion health, AI vendor coverage, source-system attribution, and signature integrity.",
    path: "/",
    visible_to: ["platform_super_admin", "tenant_admin", "support_admin"],
    kpis: [
      { id: "receipts_signed_today", label: "Receipts signed (24h)", field: "count", tone: "neutral" },
      { id: "verification_failure_rate", label: "Verification failures (24h)", field: "failure_rate", tone: "bad" },
      { id: "vendors_active", label: "Active AI vendors", field: "distinct_vendors", tone: "neutral" },
      { id: "chain_health", label: "Chain breaks (7d)", field: "chain_breaks", tone: "good" },
    ],
    default_filters: [],
    primary_group_by: "vendor",
    exportable: true,
  },

  "dashboard.compliance": {
    id: "dashboard.compliance",
    label: "Compliance",
    persona:
      "You're the Chief Compliance Officer. You care about which regulator articles your AI traffic satisfies, where evidence is incomplete, and whether your inspection pack would be ready today.",
    path: "/compliance",
    visible_to: ["org_owner", "tenant_admin", "auditor"],
    kpis: [
      { id: "cbuae_coverage", label: "CBUAE coverage", field: "regulators.CBUAE.confidence", tone: "good", description: "Average confidence of CBUAE article citations across receipts in the period" },
      { id: "eu_aiact_coverage", label: "EU AI Act coverage", field: "regulators.EU_AI_ACT.confidence", tone: "good" },
      { id: "gdpr_coverage", label: "GDPR coverage", field: "regulators.GDPR.confidence", tone: "good" },
      { id: "uncovered_events", label: "Uncovered events", field: "uncovered_count", tone: "warn", description: "Receipts not citing any regulator article — usually means missing event fields" },
    ],
    default_filters: [],
    primary_group_by: "regulator",
    exportable: true,
  },

  "dashboard.hr": {
    id: "dashboard.hr",
    label: "HR / People",
    persona:
      "You're the HR director. You care about policy violations by employees (especially PII leaks to consumer AI), training completion, and which teams need refresher courses.",
    path: "/hr",
    visible_to: ["org_owner", "tenant_admin", "hr_manager"],
    kpis: [
      { id: "policy_violations_today", label: "Policy violations (24h)", field: "violation_count", tone: "bad" },
      { id: "users_with_violations_week", label: "Employees with violations (7d)", field: "violator_count", tone: "warn" },
      { id: "shadow_ai_usage_week", label: "Shadow-AI attempts (7d)", field: "shadow_count", tone: "warn", description: "Employees attempting AI calls outside the corporate gateway" },
      { id: "training_needed", label: "Teams needing AI training", field: "teams_below_threshold", tone: "warn" },
    ],
    default_filters: [
      { field: "safety.findings.severity", op: "in", value: ["medium", "high"] },
    ],
    primary_group_by: "team",
    exportable: true,
  },

  "dashboard.legal": {
    id: "dashboard.legal",
    label: "Legal",
    persona:
      "You're the General Counsel. You care about disclosure-ready records, litigation hold integrity, what AI was used in customer-facing decisions, and what the receipt chain can prove if challenged.",
    path: "/legal",
    visible_to: ["org_owner", "tenant_admin"],
    kpis: [
      { id: "customer_facing_ai_decisions", label: "Customer-facing AI decisions (30d)", field: "customer_decision_count", tone: "neutral", description: "Receipts where AI output directly affected a customer" },
      { id: "automated_decisions_under_gdpr_22", label: "GDPR Art. 22 events (30d)", field: "gdpr_22_count", tone: "warn", description: "Automated decisions with legal/significant effect; require human-review evidence" },
      { id: "litigation_holds_active", label: "Active litigation holds", field: "hold_count", tone: "neutral" },
      { id: "chain_integrity_status", label: "Chain integrity", field: "chain_intact", tone: "good", description: "Whether every receipt in scope still verifies" },
    ],
    default_filters: [],
    primary_group_by: "decision",
    exportable: true,
  },

  "dashboard.finance": {
    id: "dashboard.finance",
    label: "Finance / FinOps",
    persona:
      "You're the CFO or Finance Director. You care about AI spend per team, per vendor, per use case — and whether spend correlates with measurable productivity output.",
    path: "/finance",
    visible_to: ["org_owner", "tenant_admin", "finance_manager", "billing_admin"],
    kpis: [
      { id: "ai_spend_mtd", label: "AI spend MTD", field: "spend_mtd", tone: "neutral" },
      { id: "ai_spend_mom_growth", label: "Month-over-month growth", field: "spend_mom_pct", tone: "warn" },
      { id: "top_spending_team", label: "Top spending team", field: "top_team_name", tone: "neutral" },
      { id: "highest_unit_cost", label: "Highest unit cost vendor", field: "expensive_vendor", tone: "neutral" },
    ],
    default_filters: [],
    primary_group_by: "team",
    exportable: true,
  },

  "dashboard.department": {
    id: "dashboard.department",
    label: "My Team",
    persona:
      "You're a department head (Marketing, Sales, Engineering, etc.). You care about what AI your team is using, whether they're following policy, and which use cases are productive vs. wasteful.",
    path: "/department",
    visible_to: [
      "org_owner",
      "tenant_admin",
      "hr_manager",
      "finance_manager",
      "sales_manager",
      "approver",
    ],
    kpis: [
      { id: "team_ai_calls_week", label: "Team AI calls (7d)", field: "team_count", tone: "neutral" },
      { id: "team_top_use_case", label: "Top use case", field: "top_use_case", tone: "neutral" },
      { id: "team_policy_compliance", label: "Policy compliance rate", field: "compliance_pct", tone: "good" },
      { id: "team_shadow_ai_alerts", label: "Shadow-AI alerts (7d)", field: "shadow_alerts", tone: "warn" },
    ],
    default_filters: [
      // The view's runtime will inject the team filter based on the logged-in user
    ],
    primary_group_by: "user",
    exportable: false,
  },
};

/**
 * Return the views accessible to a user with the given roles.
 */
export function viewsFor(roles: Role[]): RoleView[] {
  const out: RoleView[] = [];
  for (const view of Object.values(ROLE_VIEWS)) {
    if (roles.some((r) => view.visible_to.includes(r))) out.push(view);
  }
  return out;
}
