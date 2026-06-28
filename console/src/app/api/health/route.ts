/**
 * GET /api/health
 *
 * Liveness probe. Returns 200 as long as the Next.js process is responsive.
 * Does NOT touch the database or downstream services — those checks belong
 * in /api/ready. This separation is intentional: if downstream is degraded,
 * we want the pod to stay alive (do not restart it) while traffic is
 * diverted by failing readiness.
 *
 * Public, no auth — load balancers, status pages, uptime checks consume it.
 *
 * For Kubernetes:
 *   livenessProbe:
 *     httpGet: { path: /api/health, port: 3000 }
 *     periodSeconds: 10
 *     failureThreshold: 3
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const START_TIME = Date.now();
const VERSION = process.env.PL_BUILD_SHA || process.env.npm_package_version || "0.1.0";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      version: VERSION,
      uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
        "x-content-type-options": "nosniff",
        "content-type": "application/json",
      },
    },
  );
}
