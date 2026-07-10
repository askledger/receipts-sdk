// Budget guardrails. A tenant or a team has a monthly spend cap; the
// guard returns an action for the next call: allow, warn, throttle, or
// deny. Decisions are receipt-loggable so finance can see who got
// throttled and why.

import type { Usage, VendorPricing } from "./pricing.js";
import { costUsd } from "./pricing.js";

export type BudgetAction = "allow" | "warn" | "throttle" | "deny";

export interface BudgetLimits {
  monthly_usd: number;
  warn_at: number;        // 0..1, e.g. 0.75
  throttle_at: number;    // 0..1, e.g. 0.90, slow but allow
  deny_at: number;        // 0..1, e.g. 1.00, block
}

export interface BudgetState {
  /** spend so far in the current period, USD */
  spent_usd: number;
  /** how much we're about to spend on this call */
  pending_usd: number;
}

export function decide(limits: BudgetLimits, state: BudgetState): { action: BudgetAction; ratio: number; remaining_usd: number } {
  const total = state.spent_usd + state.pending_usd;
  const ratio = limits.monthly_usd === 0 ? 1 : total / limits.monthly_usd;
  const remaining_usd = Math.max(0, limits.monthly_usd - total);
  if (ratio >= limits.deny_at) return { action: "deny", ratio, remaining_usd };
  if (ratio >= limits.throttle_at) return { action: "throttle", ratio, remaining_usd };
  if (ratio >= limits.warn_at) return { action: "warn", ratio, remaining_usd };
  return { action: "allow", ratio, remaining_usd };
}

export function estimateCallCost(pricing: VendorPricing, usage: Usage): number {
  return costUsd(pricing, usage);
}
