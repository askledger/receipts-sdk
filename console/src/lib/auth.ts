/**
 * Authentication scaffolding for the admin console.
 *
 * This file intentionally does not bundle a specific OIDC library — production
 * deployments wire NextAuth (Auth.js), Clerk, WorkOS, Auth0, or their own
 * SSO. The shape of `Session` and the helpers below are what the rest of
 * the console depends on.
 */

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

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
 * HMAC secret for session cookies. Refuses to operate if unset/too short,
 * so a misconfigured deployment fails closed rather than accepting forgeries.
 */
function sessionSecret(): string {
  const s = process.env.SESSION_SECRET || process.env.CSRF_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "SESSION_SECRET is not set (or too short) — refusing to sign/verify session cookies"
    );
  }
  return s;
}

/**
 * Produce a tamper-evident cookie value: `base64url(payload).base64url(HMAC-SHA256)`.
 * Without the server secret an attacker cannot forge a valid cookie.
 */
export function signSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const sig = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** Verify + parse a signed cookie. Returns null on any tampering, bad signature, or expiry. */
function verifySignedCookie(raw: string): Session | null {
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = raw.slice(0, dot);
  const providedSig = raw.slice(dot + 1);
  let expectedSig: string;
  try {
    expectedSig = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  } catch {
    return null; // secret unset → fail closed
  }
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as Session;
    if (typeof session.expiresAt !== "number" || Date.now() > session.expiresAt) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * Resolve the current session from a server component / route handler.
 * Returns null when unauthenticated, when the cookie's HMAC signature is
 * invalid (forgery/tampering), or when the session has expired. Production
 * wires this to the IdP's session validation; the HMAC ensures the cookie
 * cannot be hand-crafted to escalate roles.
 */
export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return verifySignedCookie(raw);
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) {
    // Server components signal the redirect via the framework's redirect()
    throw new Error("UNAUTHENTICATED");
  }
  return s;
}
