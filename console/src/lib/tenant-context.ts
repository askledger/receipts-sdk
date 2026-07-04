import { headers } from "next/headers";
import { getSession, type Session } from "./auth.js";

// Cross-tenant access is the highest-severity security event we have.
// Detection lives here; the page + audit-log side effects live in the
// caller so this stays a pure predicate.

export class CrossTenantAttempt extends Error {
  constructor(
    public readonly sessionTenant: string,
    public readonly requestedTenant: string,
    public readonly sub: string,
  ) {
    super(`cross-tenant: ${sessionTenant} != ${requestedTenant} (sub=${sub})`);
    this.name = "CrossTenantAttempt";
  }
}

export class Unauthenticated extends Error {
  constructor() {
    super("UNAUTHENTICATED");
    this.name = "Unauthenticated";
  }
}

export interface TenantContext {
  readonly session: Session;
  readonly tenantId: string;
  readonly traceId: string;
}

const TRACE_ID_BYTES = 16;

function newTraceId(): string {
  const bytes = new Uint8Array(TRACE_ID_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function requireTenantContext(): Promise<TenantContext> {
  const session = await getSession();
  if (!session) throw new Unauthenticated();

  const hdrs = await headers();
  const requested = hdrs.get("x-tenant-id");
  if (requested && requested !== session.tenantId) {
    logCrossTenant(session, requested);
    throw new CrossTenantAttempt(session.tenantId, requested, session.sub);
  }

  const traceparent = hdrs.get("traceparent");
  const traceId = traceparent?.split("-")[1] ?? newTraceId();

  return { session, tenantId: session.tenantId, traceId };
}

function logCrossTenant(session: Session, requested: string): void {
  // Structured stderr — the log collector parses [SECURITY] lines and
  // forwards them to PagerDuty as P0 (see monitoring/alerts.yml).
  console.error("[SECURITY]", JSON.stringify({
    severity: "P0",
    type: "cross_tenant_attempt",
    sub: session.sub,
    session_tenant: session.tenantId,
    requested_tenant: requested,
    ts: new Date().toISOString(),
  }));
}
