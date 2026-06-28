// RFC 9457 Problem Details for HTTP APIs.
// One canonical error shape so clients can branch on `type` not `message`.

import { NextResponse } from "next/server";

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [ext: string]: unknown;
}

const BASE = "https://errors.github.com/askledger/receipts-sdk";

export const Problems = {
  unauthenticated: (instance?: string): Problem => ({
    type: `${BASE}/unauthenticated`,
    title: "Authentication required",
    status: 401,
    instance,
  }),
  forbidden: (detail: string, instance?: string): Problem => ({
    type: `${BASE}/forbidden`,
    title: "Forbidden",
    status: 403,
    detail,
    instance,
  }),
  crossTenant: (instance?: string): Problem => ({
    type: `${BASE}/cross-tenant`,
    title: "Cross-tenant access denied",
    status: 403,
    detail: "Session is bound to a different tenant than requested.",
    instance,
  }),
  rateLimited: (retryAfterSec: number, instance?: string): Problem => ({
    type: `${BASE}/rate-limited`,
    title: "Too Many Requests",
    status: 429,
    detail: `Rate limit exceeded. Retry after ${retryAfterSec}s.`,
    retry_after: retryAfterSec,
    instance,
  }),
  badRequest: (detail: string, instance?: string): Problem => ({
    type: `${BASE}/bad-request`,
    title: "Bad Request",
    status: 400,
    detail,
    instance,
  }),
  conflict: (detail: string, instance?: string): Problem => ({
    type: `${BASE}/conflict`,
    title: "Conflict",
    status: 409,
    detail,
    instance,
  }),
  precondition: (detail: string, instance?: string): Problem => ({
    type: `${BASE}/precondition-failed`,
    title: "Precondition Failed",
    status: 412,
    detail,
    instance,
  }),
  upgradeRequired: (plan: string, instance?: string): Problem => ({
    type: `${BASE}/upgrade-required`,
    title: "Plan upgrade required",
    status: 402,
    detail: `Feature requires plan: ${plan}`,
    required_plan: plan,
    instance,
  }),
  internal: (instance?: string): Problem => ({
    type: `${BASE}/internal`,
    title: "Internal Server Error",
    status: 500,
    instance,
  }),
  unavailable: (detail: string, retryAfterSec?: number, instance?: string): Problem => ({
    type: `${BASE}/unavailable`,
    title: "Service Unavailable",
    status: 503,
    detail,
    ...(retryAfterSec ? { retry_after: retryAfterSec } : {}),
    instance,
  }),
};

export function problemResponse(p: Problem, extraHeaders: Record<string, string> = {}): NextResponse {
  const headers: Record<string, string> = {
    "content-type": "application/problem+json",
    "cache-control": "no-store",
    ...extraHeaders,
  };
  const retryAfter = typeof p.retry_after === "number" ? p.retry_after : undefined;
  if (retryAfter) headers["retry-after"] = String(retryAfter);
  return NextResponse.json(p, { status: p.status, headers });
}
