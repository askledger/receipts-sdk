// Alerts over signed receipts.
//
// A small, explainable rules engine that flags the receipts most worth a human
// look — blocked decisions, sensitive data, unsigned records, over-tiering,
// cost spikes, high-stakes decisions with no bound evidence. Ships with honest
// default rules; callers can add their own. Every alert names the exact
// receipt ids behind it, so it is checkable, not a black box.
//
// Free tier = these local rules over your own receipts. Real-time, hosted,
// cross-system alerting is the enterprise platform.

import { flattenReceipt, type ReceiptRow } from "./index.js";
import { summarizeReceipts } from "../cost/dashboard.js";
import type { SignedReceipt, Classification } from "../types.js";

export type Severity = "high" | "medium" | "low";

export interface Alert {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  count: number;
  receiptIds: string[]; // sample of the receipts behind this alert (capped)
}

/**
 * An alert rule. `evaluate` receives every flattened receipt and returns the
 * subset that trips the rule plus a human explanation, or null for "nothing to
 * flag". Aggregate rules (e.g. cost spikes) use the whole set; per-receipt
 * rules can be built with `perReceiptRule`.
 */
export interface AlertRule {
  id: string;
  severity: Severity;
  title: string;
  evaluate(rows: ReceiptRow[]): { matched: ReceiptRow[]; detail: string } | null;
}

const SENSITIVE: ReadonlySet<Classification> = new Set(["pii", "pci", "mnpi"]);
const ID_CAP = 20;

/** Build a simple per-receipt rule from a predicate. */
export function perReceiptRule(
  spec: { id: string; severity: Severity; title: string; test: (r: ReceiptRow) => boolean; detail: (n: number) => string }
): AlertRule {
  return {
    id: spec.id,
    severity: spec.severity,
    title: spec.title,
    evaluate(rows) {
      const matched = rows.filter(spec.test);
      return matched.length ? { matched, detail: spec.detail(matched.length) } : null;
    },
  };
}

export const DEFAULT_RULES: AlertRule[] = [
  perReceiptRule({
    id: "blocked-decisions",
    severity: "high",
    title: "Blocked / denied decisions",
    test: (r) => r.decision === "block",
    detail: (n) => `${n} decision(s) were blocked. Each is a high-stakes outcome someone may contest — confirm they were correct and defensible.`,
  }),
  perReceiptRule({
    id: "sensitive-data",
    severity: "high",
    title: "Sensitive data processed",
    test: (r) => (r.inputClass !== null && SENSITIVE.has(r.inputClass)) || (r.outputClass !== null && SENSITIVE.has(r.outputClass)),
    detail: (n) => `${n} receipt(s) handled sensitive data (pii / pci / mnpi). Verify handling matched policy and retention rules.`,
  }),
  perReceiptRule({
    id: "unsigned-receipts",
    severity: "high",
    title: "Unsigned receipts",
    test: (r) => !r.signed,
    detail: (n) => `${n} receipt(s) carry no signature — they can't be independently verified. Sign at capture or investigate the gap.`,
  }),
  perReceiptRule({
    id: "high-stakes-no-evidence",
    severity: "medium",
    title: "High-stakes decisions with no bound evidence",
    test: (r) => (r.decision === "block" || r.decision === "require-approval") && r.evidenceRefs === 0,
    detail: (n) => `${n} block/approval decision(s) have no evidence_refs bound. Bind the supporting proof so the decision is defensible later.`,
  }),
  perReceiptRule({
    id: "flagged-and-pending",
    severity: "medium",
    title: "Flagged or awaiting approval",
    test: (r) => r.decision === "flag" || r.decision === "require-approval",
    detail: (n) => `${n} decision(s) were flagged or require approval — make sure none are stuck unresolved.`,
  }),
  // Aggregate rule: over-tiering, reusing the dashboard's savings analysis.
  {
    id: "over-tiering",
    severity: "medium",
    title: "Over-tiered spend (a premium model on light work)",
    evaluate(rows) {
      const summary = summarizeReceipts(rows.map((r) => r.raw));
      if (!summary.suggestions.length) return null;
      const ids = new Set<string>();
      for (const s of summary.suggestions) {
        for (const r of rows) {
          if (r.model === s.fromModel.split(":")[1] && r.app === s.topApp) ids.add(r.id);
        }
      }
      const top = summary.suggestions[0];
      const matched = rows.filter((r) => ids.has(r.id));
      return {
        matched: matched.length ? matched : rows.filter((r) => r.model && s0(top).includes(r.model)),
        detail: `Roughly ${fmtUsd(summary.potentialSavings)} of estimated spend looks over-tiered. Biggest: ${top.fromModel} → ${top.toModel} in "${top.topApp}". See \`dashboard\` for the full breakdown.`,
      };
    },
  },
  // Aggregate rule: a day whose cost is well above the typical day.
  {
    id: "cost-spike",
    severity: "medium",
    title: "Cost spike",
    evaluate(rows) {
      const byDay = new Map<string, number>();
      for (const r of rows) {
        const d = r.capturedAt.slice(0, 10);
        byDay.set(d, (byDay.get(d) ?? 0) + r.costUsd);
      }
      const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      if (days.length < 3) return null;
      const costs = days.map((d) => d[1]).sort((a, b) => a - b);
      const median = costs[Math.floor(costs.length / 2)];
      const spike = days.find(([, c]) => c > 3 * median && c > 0.01 && median > 0);
      if (!spike) return null;
      const matched = rows.filter((r) => r.capturedAt.slice(0, 10) === spike[0]);
      return {
        matched,
        detail: `${spike[0]} cost ${fmtUsd(spike[1])} — about ${(spike[1] / (median || 1)).toFixed(1)}× a typical day (${fmtUsd(median)}). Check for a runaway job or a pricing change.`,
      };
    },
  },
];

function s0(top: { fromModel: string }): string { return top.fromModel; }
function fmtUsd(n: number): string {
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SEV_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/**
 * Run the alert rules over a set of receipts. Pass `extraRules` to add your
 * own on top of the defaults, or `rules` to replace them entirely.
 */
export function runAlerts(
  receipts: SignedReceipt[],
  opts: { extraRules?: AlertRule[]; rules?: AlertRule[] } = {}
): Alert[] {
  const rows = receipts.map(flattenReceipt);
  const rules = opts.rules ?? [...DEFAULT_RULES, ...(opts.extraRules ?? [])];
  const alerts: Alert[] = [];
  for (const rule of rules) {
    let out: { matched: ReceiptRow[]; detail: string } | null = null;
    try {
      out = rule.evaluate(rows);
    } catch {
      out = null; // a broken custom rule must never take the whole run down
    }
    if (out && out.matched.length) {
      alerts.push({
        id: rule.id,
        severity: rule.severity,
        title: rule.title,
        detail: out.detail,
        count: out.matched.length,
        receiptIds: out.matched.slice(0, ID_CAP).map((r) => r.id),
      });
    }
  }
  return alerts.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.count - a.count);
}
