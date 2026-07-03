// Append-only ledger of cascade savings. One entry per cascade run. The
// rollup powers the Finance dashboard cards "Cascade savings MTD" and
// "Avg savings per task". The ledger is itself appended through the chain
// so finance numbers are tamper-evident.

import type { CascadeRun } from "./cascade.js";
import { runCost } from "./cascade.js";

export interface SavingsEntry {
  ts: number;
  tenant_id: string;
  intent: string;
  approved: boolean;
  planner_usd: number;
  executor_usd: number;
  total_usd: number;
  baseline_usd: number;
  savings_usd: number;
}

export interface SavingsStore {
  append(e: SavingsEntry): Promise<void>;
  since(from: number): Promise<SavingsEntry[]>;
}

export class InMemorySavings implements SavingsStore {
  private readonly entries: SavingsEntry[] = [];
  async append(e: SavingsEntry) { this.entries.push(e); }
  async since(from: number) { return this.entries.filter((e) => e.ts >= from); }
}

export async function recordCascade(store: SavingsStore, opts: { tenantId: string; run: CascadeRun; approved: boolean }): Promise<SavingsEntry> {
  const c = runCost(opts.run);
  const entry: SavingsEntry = {
    ts: Date.now(),
    tenant_id: opts.tenantId,
    intent: opts.run.rule.intent ?? "unknown",
    approved: opts.approved,
    planner_usd: c.planner_usd,
    executor_usd: c.executor_usd,
    total_usd: c.total_usd,
    baseline_usd: c.baseline_usd,
    savings_usd: c.savings_usd,
  };
  await store.append(entry);
  return entry;
}

export interface SavingsRollup {
  count: number;
  approved_count: number;
  total_spent_usd: number;
  total_baseline_usd: number;
  total_savings_usd: number;
  savings_pct: number;
  avg_savings_per_task_usd: number;
  by_intent: Record<string, { count: number; savings_usd: number }>;
}

export async function rollup(store: SavingsStore, since: number): Promise<SavingsRollup> {
  const entries = await store.since(since);
  const out: SavingsRollup = {
    count: entries.length,
    approved_count: 0,
    total_spent_usd: 0,
    total_baseline_usd: 0,
    total_savings_usd: 0,
    savings_pct: 0,
    avg_savings_per_task_usd: 0,
    by_intent: {},
  };
  for (const e of entries) {
    if (e.approved) out.approved_count++;
    out.total_spent_usd += e.total_usd;
    out.total_baseline_usd += e.baseline_usd;
    out.total_savings_usd += e.savings_usd;
    const b = (out.by_intent[e.intent] ??= { count: 0, savings_usd: 0 });
    b.count++;
    b.savings_usd += e.savings_usd;
  }
  out.savings_pct = out.total_baseline_usd === 0 ? 0 : out.total_savings_usd / out.total_baseline_usd;
  out.avg_savings_per_task_usd = out.count === 0 ? 0 : out.total_savings_usd / out.count;
  return out;
}
