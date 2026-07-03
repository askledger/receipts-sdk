// Turn a budget-guard decision into a signed receipt. The receipt names
// the org policy that fired, the actor whose call was throttled, and
// the threshold ratio. This is the artifact a developer points at when
// asked "why did the AI not run" — proof the policy did it, not them.

import type { BudgetAction } from "./budget.js";

export interface BudgetDecisionEvent {
  tenant_id: string;
  actor_sub: string;
  use_case: string;
  vendor: string;
  model: string;
  action: BudgetAction;
  ratio: number;
  remaining_usd: number;
  policy_id: string;
  at: string;
}

export function toReceiptEvent(d: BudgetDecisionEvent): {
  schema_version: "1.0";
  tenant_id: string;
  event_type: string;
  source_system: string;
  event_id: string;
  captured_at: string;
  context: { user_id: string };
  subject: { ai_vendor: string; ai_model: string };
  payload: { metadata: { budget_action: BudgetAction; ratio: number; remaining_usd: number; policy_id: string; use_case: string } };
} {
  return {
    schema_version: "1.0",
    tenant_id: d.tenant_id,
    event_type: d.action === "deny" ? "ai.invocation_denied_by_budget" : "ai.invocation_budget_warning",
    source_system: "pl-budget-guard",
    event_id: `bg-${d.tenant_id}-${Date.now().toString(36)}`,
    captured_at: d.at,
    context: { user_id: d.actor_sub },
    subject: { ai_vendor: d.vendor, ai_model: d.model },
    payload: {
      metadata: {
        budget_action: d.action,
        ratio: d.ratio,
        remaining_usd: d.remaining_usd,
        policy_id: d.policy_id,
        use_case: d.use_case,
      },
    },
  };
}
