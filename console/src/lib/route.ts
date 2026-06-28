import { NextResponse } from "next/server";
import { requireTenantContext, CrossTenantAttempt, Unauthenticated, type TenantContext } from "./tenant-context.js";
import { requirePermission, type Permission } from "./rbac.js";
import { Problems, problemResponse } from "./problem.js";
import { defaultLimits } from "./rate-limit.js";
import { log } from "./logger.js";

type Handler<T> = (ctx: TenantContext) => Promise<T> | T;

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate",
  "x-content-type-options": "nosniff",
};

type Tier = "read" | "write" | "sensitive";

export interface RouteOptions {
  tier?: Tier;
}

export function withRoute<T>(perm: Permission, handler: Handler<T>, opts: RouteOptions = {}) {
  const tier: Tier = opts.tier ?? "read";

  return async function GET() {
    let ctx: TenantContext;
    try {
      ctx = await requireTenantContext();
      requirePermission(ctx.session, perm);
    } catch (e) {
      if (e instanceof Unauthenticated) return problemResponse(Problems.unauthenticated());
      if (e instanceof CrossTenantAttempt) {
        log.security("cross_tenant_attempt", {
          session_tenant: e.sessionTenant,
          requested_tenant: e.requestedTenant,
          sub: e.sub,
        });
        return problemResponse(Problems.crossTenant());
      }
      if (e instanceof Error && e.message === "FORBIDDEN") {
        return problemResponse(Problems.forbidden(`Missing permission: ${perm}`));
      }
      return problemResponse(Problems.internal());
    }

    const key = `${tier}:${ctx.tenantId}:${ctx.session.sub}`;
    const limit = defaultLimits[tier];
    const decision = await limit.allow(key);
    if (!decision.allowed) {
      return problemResponse(Problems.rateLimited(decision.retryAfterSec), {
        "x-trace-id": ctx.traceId,
        "x-ratelimit-remaining": "0",
      });
    }

    try {
      const body = await handler(ctx);
      return NextResponse.json(body, {
        headers: {
          ...NO_STORE,
          "x-trace-id": ctx.traceId,
          "x-tenant-id": ctx.tenantId,
          "x-ratelimit-remaining": String(decision.remaining),
        },
      });
    } catch (err) {
      log.with({ trace_id: ctx.traceId, tenant_id: ctx.tenantId, sub: ctx.session.sub })
        .error("route handler failed", { err: String((err as Error).message ?? err), perm });
      return problemResponse(Problems.internal(ctx.traceId));
    }
  };
}
