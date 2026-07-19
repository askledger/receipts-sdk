/**
 * Evidence export, orchestration.
 *
 * Fans a batch of signed receipts out to one or more sinks (SIEM, log platform,
 * object storage). Delivery is best-effort per sink: one failing destination
 * never blocks the others, and every outcome is reported rather than thrown, so
 * an export loop cannot take down the caller's signing path.
 *
 * Export is always explicit. Nothing is configured by default and the SDK has
 * no endpoint of its own; the operator points these sinks at their own systems.
 */

import type { SignedReceipt } from "../types.js";
import { toExportEvent, type ExportEvent, type ToExportEventOptions } from "./event.js";
import type { ExportSink, SinkResult } from "./sinks.js";

export interface ExportOptions extends ToExportEventOptions {
  sinks: ExportSink[];
  /** Events per delivery. Default 100. */
  batchSize?: number;
  /** Retry attempts for a failing sink, per batch. Default 1. */
  retries?: number;
  /** Backoff between attempts. Default 250ms. */
  retryDelayMs?: number;
  /** Injectable sleep, for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface ExportReport {
  /** True when every sink delivered every batch. */
  ok: boolean;
  events: number;
  batches: number;
  /** Aggregate outcome per sink. */
  results: SinkResult[];
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

async function sendWithRetry(
  sink: ExportSink,
  batch: ExportEvent[],
  retries: number,
  delayMs: number,
  sleep: (ms: number) => Promise<void>
): Promise<SinkResult> {
  let last: SinkResult = { sink: sink.name, ok: false, delivered: 0, error: "not attempted" };
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(delayMs);
    try {
      last = await sink.send(batch);
    } catch (e) {
      // A sink that throws is treated as a failed delivery, never propagated.
      last = {
        sink: sink.name,
        ok: false,
        delivered: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    if (last.ok) return last;
  }
  return last;
}

/**
 * Project receipts into export events and deliver them to every configured
 * sink. Returns a per-sink report; it does not throw on delivery failure.
 */
export async function exportReceipts(
  receipts: SignedReceipt[],
  opts: ExportOptions
): Promise<ExportReport> {
  const batchSize = Math.max(1, opts.batchSize ?? 100);
  const retries = Math.max(0, opts.retries ?? 1);
  const delayMs = Math.max(0, opts.retryDelayMs ?? 250);
  const sleep = opts.sleep ?? defaultSleep;

  const events = receipts.map((r) => toExportEvent(r, opts));
  const totals = new Map<string, SinkResult>();
  let batches = 0;

  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    batches++;
    const results = await Promise.all(
      opts.sinks.map((s) => sendWithRetry(s, batch, retries, delayMs, sleep))
    );
    for (const r of results) {
      const prev = totals.get(r.sink);
      if (!prev) {
        totals.set(r.sink, { ...r });
      } else {
        prev.delivered += r.delivered;
        prev.ok = prev.ok && r.ok;
        if (!r.ok && r.error && !prev.error) prev.error = r.error;
      }
    }
  }

  const results = [...totals.values()];
  return {
    ok: results.length > 0 && results.every((r) => r.ok),
    events: events.length,
    batches,
    results,
  };
}

export { toExportEvent, formatCEF, formatSyslog5424 } from "./event.js";
export type { ExportEvent, ToExportEventOptions } from "./event.js";
export {
  SplunkHecSink,
  WebhookSink,
  FileSink,
  SyslogSink,
} from "./sinks.js";
export type {
  ExportSink,
  SinkResult,
  FetchLike,
  SplunkHecConfig,
  WebhookConfig,
  FileSinkConfig,
  SyslogConfig,
} from "./sinks.js";
