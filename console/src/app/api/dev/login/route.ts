import { NextRequest, NextResponse } from "next/server";

/**
 * Dev-only login route.
 *
 * Issues a `pl_session` cookie that satisfies the middleware so the
 * admin console is browseable without a real OIDC IdP during demos.
 *
 * Disabled in production via NODE_ENV check — production deployments
 * must wire NextAuth / Clerk / WorkOS / Auth0 instead.
 *
 *   GET  /api/dev/login           → set tenant_admin session
 *   GET  /api/dev/login?role=…    → set the named role
 */

const ROLES = [
  "platform_super_admin",
  "support_admin",
  "billing_admin",
  "org_owner",
  "tenant_admin",
  "finance_manager",
  "hr_manager",
  "sales_manager",
  "approver",
  "auditor",
  "employee",
] as const;

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_LOGIN !== "true") {
    return NextResponse.json(
      { error: "dev login disabled in production" },
      { status: 403 }
    );
  }

  const role = (req.nextUrl.searchParams.get("role") ?? "tenant_admin") as typeof ROLES[number];
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "unknown role", valid: ROLES }, { status: 400 });
  }

  const session = {
    sub: "dev-user-001",
    email: "demo@projectledger.io",
    name: "Demo User",
    tenantId: "acme-bank",
    roles: [role],
    lastMfaAt: Date.now(),
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  };
  const value = Buffer.from(JSON.stringify(session)).toString("base64");

  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const res = NextResponse.redirect(new URL(next, req.url));
  res.cookies.set("pl_session", value, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return res;
}
