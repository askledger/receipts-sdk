/**
 * Authentication scaffolding for the admin console.
 *
 * This file intentionally does not bundle a specific OIDC library — production
 * deployments wire NextAuth (Auth.js), Clerk, WorkOS, Auth0, or their own
 * SSO. The shape of `Session` and the helpers below are what the rest of
 * the console depends on.
 */

import { cookies } from "next/headers";

export type Role =
  | "platform_super_admin"
  | "support_admin"
  | "billing_admin"
  | "org_owner"
  | "tenant_admin"
  | "finance_manager"
  | "hr_manager"
  | "sales_manager"
  | "approver"
  | "auditor"
  | "employee";

export interface Session {
  /** OIDC subject — the stable identifier for the human. */
  sub: string;
  email: string;
  name: string;
  /** Tenant currently being administered. */
  tenantId: string;
  /** All roles the user holds in the current tenant. */
  roles: Role[];
  /** Just-in-time elevated role currently active (if any). */
  jitRole?: Role;
  /** UTC ms at which the session was last MFA-verified. */
  lastMfaAt: number;
  /** UTC ms at which the session expires. */
  expiresAt: number;
  /** SPIFFE-style workload ID for the browser session, if upgraded. */
  spiffeId?: string;
}

const SESSION_COOKIE = "pl_session";

/**
 * Resolve the current session from a server component / route handler.
 * Returns null when unauthenticated; the page is responsible for
 * redirecting to /login (or showing public content).
 *
 * Production wires this to the IdP's session validation. The stub here
 * parses a signed cookie; the contract is the only thing pages depend on.
 */
export async function getSession(): Promise<Session | null> {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const session = JSON.parse(Buffer.from(raw, "base64").toString("utf-8")) as Session;
    if (Date.now() > session.expiresAt) return null;
    return session;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) {
    // Server components signal the redirect via the framework's redirect()
    throw new Error("UNAUTHENTICATED");
  }
  return s;
}
