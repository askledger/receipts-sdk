/**
 * GET /api/metrics
 *
 * Prometheus-format text metrics for scraping. Process-level only — receipt
 * counters live in the SDK and surface via the backend's own /metrics, not
 * the console.
 *
 * Auth: this endpoint MUST be IP-allowlisted to the Prometheus scraper
 * subnet at the ingress. The handler itself does not authenticate.
 *
 * Format: https://prometheus.io/docs/instrumenting/exposition_formats/
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const START_TIME = Date.now();
const VERSION = process.env.PL_BUILD_SHA || "dev";

export function GET() {
  const mem = process.memoryUsage();
  const uptime = (Date.now() - START_TIME) / 1000;

  const lines = [
    `# HELP pl_console_uptime_seconds Process uptime in seconds`,
    `# TYPE pl_console_uptime_seconds gauge`,
    `pl_console_uptime_seconds ${uptime}`,
    ``,
    `# HELP pl_console_memory_rss_bytes Resident set size`,
    `# TYPE pl_console_memory_rss_bytes gauge`,
    `pl_console_memory_rss_bytes ${mem.rss}`,
    ``,
    `# HELP pl_console_memory_heap_used_bytes Heap used`,
    `# TYPE pl_console_memory_heap_used_bytes gauge`,
    `pl_console_memory_heap_used_bytes ${mem.heapUsed}`,
    ``,
    `# HELP pl_console_build_info Build metadata`,
    `# TYPE pl_console_build_info gauge`,
    `pl_console_build_info{version="${VERSION}"} 1`,
    ``,
  ].join("\n");

  return new NextResponse(lines, {
    status: 200,
    headers: {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
